import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';

export async function jwtAuthGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  let payload: { sub: string; role: 'CUSTOMER' | 'ADMIN'; sid?: string; permissions?: string[] } | undefined;
  try {
    payload = await request.jwtVerify<{ sub: string; role: 'CUSTOMER' | 'ADMIN'; sid?: string; permissions?: string[] }>();
  } catch {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Authentication required', 401);
  }

  if (!payload || !payload.sub || !payload.role) {
    payload = (request as FastifyRequest & {
      user?: { sub?: string; role?: 'CUSTOMER' | 'ADMIN'; sid?: string; permissions?: string[] };
    }).user as { sub: string; role: 'CUSTOMER' | 'ADMIN'; sid?: string; permissions?: string[] } | undefined;
  }

  if (!payload || !payload.sub || !payload.role) {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Authentication required', 401);
  }

  if (payload.role !== 'ADMIN') {
    return;
  }

  const prisma = (request.server as FastifyRequest['server'] & {
    prisma?: {
      user?: {
        findUnique: (args: {
          where: { id: string };
          select: { id: true; role: true; isBanned: true };
        }) => Promise<{ id: string; role: 'CUSTOMER' | 'ADMIN'; isBanned: boolean } | null>;
      };
    };
  }).prisma;

  if (!prisma?.user?.findUnique) {
    return;
  }

  const adminUser = await prisma?.user?.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, isBanned: true }
  });

  if (!adminUser || adminUser.role !== 'ADMIN' || adminUser.isBanned) {
    throw new AppError(ERROR_CODES.UNAUTHORISED, 'Admin account not found or inactive', 401);
  }
}

