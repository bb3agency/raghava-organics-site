import { standardErrorResponseSchema } from '@common/errors/error-response.schema';

export const healthRouteSchema = {
  tags: ['Health'],
  params: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {}
  },
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'timestamp', 'version', 'database', 'redis'],
      properties: {
        status: { type: 'string', maxLength: 20 },
        timestamp: { type: 'string', maxLength: 64 },
        version: { type: 'string', maxLength: 20 },
        database: { type: 'string', maxLength: 20 },
        redis: { type: 'string', maxLength: 20 }
      }
    },
    503: standardErrorResponseSchema
  }
} as const;

export const healthLivenessSchema = {
  tags: ['Health'],
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'timestamp', 'version'],
      properties: {
        status: { type: 'string', maxLength: 20 },
        timestamp: { type: 'string', maxLength: 64 },
        version: { type: 'string', maxLength: 20 }
      }
    }
  }
} as const;

export const healthReadinessSchema = {
  tags: ['Health'],
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'timestamp', 'version', 'database', 'redis', 'degradationMode', 'queues', 'runtimeConfigMissingKeys'],
      properties: {
        status: { type: 'string', maxLength: 20 },
        timestamp: { type: 'string', maxLength: 64 },
        version: { type: 'string', maxLength: 20 },
        database: { type: 'string', maxLength: 20 },
        redis: { type: 'string', maxLength: 20 },
        degradationMode: { type: 'string', maxLength: 32 },
        queues: {
          type: 'object',
          additionalProperties: false,
          required: ['waiting', 'active', 'oldestWaitingAgeSeconds', 'workerFreshness'],
          properties: {
            waiting: { type: 'number', minimum: 0, maximum: 10000000 },
            active: { type: 'number', minimum: 0, maximum: 10000000 },
            oldestWaitingAgeSeconds: { type: 'number', minimum: 0, maximum: 10000000 },
            workerFreshness: { type: 'string', maxLength: 20 }
          }
        },
        runtimeConfigMissingKeys: {
          type: 'array',
          maxItems: 200,
          items: { type: 'string', maxLength: 128 }
        }
      }
    },
    503: healthRouteSchema.response[503]
  }
} as const;

