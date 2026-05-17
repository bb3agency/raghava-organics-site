import multipart from '@fastify/multipart';
import { FastifyInstance } from 'fastify';

export async function registerMultipartPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024
    }
  });
}

