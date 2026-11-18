import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@synapse/database';
import { PublicUser, UsersService } from '@synapse/users';
import { BUS_EVENTS, synapseBus } from '@synapse/platform';
import {
  AccessTokenPayload,
  RefreshTokenPayload,
  SessionResult,
} from '../domain/auth.types';

const missingUserHash =
  '$argon2id$v=19$m=65536,p=4,t=3$3T7Qpf19FXb9cOFGl3frwg$p2A0Y4YHmdGLUlMk9bCxbuhd+0eZm0yP3rudxGsSAWw';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async register(input: {
    email: string;
    username: string;
    password: string;
  }): Promise<SessionResult> {
    const user = await this.usersService.create({
      email: input.email.trim().toLowerCase(),
      username: input.username,
      passwordHash: await argon2.hash(input.password, {
        type: argon2.argon2id,
      }),
    });

    return this.createSession(user);
  }

  async login(email: string, password: string): Promise<SessionResult> {
    const user = await this.usersService.findByEmailWithPassword(
      email.trim().toLowerCase(),
    );
    const matches = await argon2.verify(
      user?.passwordHash ?? missingUserHash,
      password,
    );
    if (!user || !matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.createSession(user);
  }

  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid session');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !(await argon2.verify(session.tokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Invalid session');
    }

    return this.createSession(session.user, session);
  }

  async authenticateAccessToken(
    token: string,
  ): Promise<{ user: PublicUser; sessionId: string }> {
    const payload = await this.jwtService
      .verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
      })
      .catch(() => null);
    if (
      payload?.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !payload.sub ||
      !payload.sid
    ) {
      throw new UnauthorizedException('Authentication required');
    }
    const session = await this.prisma.refreshSession.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!session?.user)
      throw new UnauthorizedException('Authentication required');
    return { user: session.user, sessionId: payload.sid };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const payload = await this.verifyRefreshToken(refreshToken).catch(
      () => null,
    );
    if (!payload) return;
    const revoked = await this.prisma.refreshSession.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count > 0) {
      synapseBus.publish(BUS_EVENTS.sessionLogout, {
        userId: payload.sub,
        sessionId: payload.sid,
      });
    }
  }

  private async createSession(
    user: PublicUser,
    previousSession?: { id: string; tokenHash: string },
  ): Promise<SessionResult> {
    const publicUser: PublicUser = {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
    const sessionId = previousSession?.id ?? randomUUID();
    const refreshDays = this.configService.getOrThrow<number>(
      'JWT_REFRESH_TTL_DAYS',
    );
    const expiresAt = new Date(Date.now() + refreshDays * 86_400_000);

    const accessPayload: AccessTokenPayload = {
      sub: publicUser.id,
      sid: sessionId,
      type: 'access',
    };
    const refreshPayload: RefreshTokenPayload = {
      sub: publicUser.id,
      sid: sessionId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow<number>(
          'JWT_ACCESS_TTL_SECONDS',
        ),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshDays * 86_400,
        jwtid: randomUUID(),
      }),
    ]);

    const tokenHash = await argon2.hash(refreshToken, {
      type: argon2.argon2id,
    });
    if (previousSession) {
      const rotated = await this.prisma.refreshSession.updateMany({
        where: {
          id: sessionId,
          userId: user.id,
          tokenHash: previousSession.tokenHash,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { tokenHash, expiresAt },
      });
      if (rotated.count !== 1)
        throw new UnauthorizedException('Invalid session');
    } else {
      await this.prisma.refreshSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash,
          expiresAt,
          revokedAt: null,
        },
      });
    }

    return { accessToken, refreshToken, user: publicUser };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          algorithms: ['HS256'],
        },
      );
      if (
        payload.type !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        !payload.sub ||
        !payload.sid
      ) {
        throw new Error('Invalid refresh payload');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
  }
}
