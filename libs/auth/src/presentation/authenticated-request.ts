import { Request } from 'express';
import { PublicUser } from '@synapse/users';

export interface AuthenticatedRequest extends Request {
  user: PublicUser;
}
