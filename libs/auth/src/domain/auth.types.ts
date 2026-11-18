import { PublicUser } from '@synapse/users';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}

export interface AuthResponse {
  accessToken: string;
  user: PublicUser;
}

export interface SessionResult extends AuthResponse {
  refreshToken: string;
}
