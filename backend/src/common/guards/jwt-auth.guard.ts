import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';

export async function jwtAuthGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify<{ sub: string; role: 'CUSTOMER' | 'ADMIN'; sid?: string; permissions?: string[] }>();
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Authentication required', 401);
  }
}

