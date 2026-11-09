import { PublicUser } from '@synapse/users';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  username: string;
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
