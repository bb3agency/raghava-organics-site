import { FastifyInstance } from 'fastify';
import { standardAdminErrorResponses } from '@common/errors/error-response.schema';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { getLoadShedMode } from '@common/reliability/load-shed.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import { opsAuthGuard } from '@common/guards/ops-auth.guard';
import { opsPermissionGuard } from '@common/guards/ops-permissions.guard';
import { OpsService, OPS_BROWSER_SESSION_COOKIE_NAME } from './ops.service';

export async function registerOpsRoutes(fastify: FastifyInstance): Promise<void> {
  const opsService = new OpsService(fastify);
  const emptyObjectSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {}
  } as const;

  fastify.get(
    '/api/v1/ops/config/overview',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['generatedAt', 'runtimeProfile', 'domains', 'strictProfileHealth'],
            properties: {
              generatedAt: { type: 'string', maxLength: 40 },
              runtimeProfile: { type: 'string', enum: ['development-like', 'production-like'], maxLength: 20 },
              domains: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['domain', 'label', 'items'],
                  properties: {
                    domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 },
                    label: { type: 'string', maxLength: 64 },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['key', 'present', 'placeholder', 'mutableViaOps', 'requiresRestart'],
                        properties: {
                          key: { type: 'string', maxLength: 120 },
                          present: { type: 'boolean' },
                          placeholder: { type: 'boolean' },
                          mutableViaOps: { type: 'boolean' },
                          requiresRestart: { type: 'boolean' },
                          runtimeSource: { type: 'string', enum: ['env-bootstrap', 'db-overlay'], maxLength: 24 },
                          note: { type: 'string', maxLength: 300 }
                        }
                      }
                    }
                  }
                }
              },
              strictProfileHealth: {
                type: 'object',
                additionalProperties: false,
                required: ['noPlaceholdersInStrict', 'missingRequiredKeysInStrict'],
                properties: {
                  noPlaceholdersInStrict: { type: 'boolean' },
                  missingRequiredKeysInStrict: {
                    type: 'array',
                    items: { type: 'string', maxLength: 120 }
                  }
                }
              }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      return opsService.getConfigOverview({
        opsUserId: opsUser.id,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.post(
    '/api/v1/ops/config/validate',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['values'],
          properties: {
            domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 },
            values: {
              type: 'object',
              additionalProperties: true,
              maxProperties: 50
            }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['valid', 'domain', 'checkedKeys', 'errors', 'warnings', 'requiresRestart'],
            properties: {
              valid: { type: 'boolean' },
              domain: {
                anyOf: [
                  { type: 'null' },
                  { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 }
                ]
              },
              checkedKeys: { type: 'array', items: { type: 'string', maxLength: 120 } },
              errors: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['key', 'code', 'message'],
                  properties: {
                    key: { type: 'string', maxLength: 120 },
                    code: { type: 'string', maxLength: 64 },
                    message: { type: 'string', maxLength: 300 }
                  }
                }
              },
              warnings: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['key', 'code', 'message'],
                  properties: {
                    key: { type: 'string', maxLength: 120 },
                    code: { type: 'string', maxLength: 64 },
                    message: { type: 'string', maxLength: 300 }
                  }
                }
              },
              requiresRestart: { type: 'boolean' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as {
        domain?: 'core' | 'payments' | 'shipping' | 'notifications' | 'opsSecurity';
        values: Record<string, string | number | boolean | null | undefined>;
      };
      return opsService.validateConfigDraft({
        opsUserId: opsUser.id,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method,
        ...(body.domain ? { domain: body.domain } : {}),
        values: body.values
      });
    }
  );

  fastify.get(
    '/api/v1/ops/config/stored',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['items'],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['domain', 'key', 'maskedValue', 'keyVersion', 'requiresRestart', 'updatedAt'],
                  properties: {
                    domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 },
                    key: { type: 'string', maxLength: 120 },
                    maskedValue: { type: 'string', maxLength: 300 },
                    // Optional plaintext value — present only for non-secret keys
                    // (provider selectors, URLs, pincodes, CIDRs, boolean flags,
                    // numeric thresholds, public IDs, sender addresses, login
                    // emails). Real cryptographic secrets never appear here —
                    // only `maskedValue`. Classification is performed by
                    // `isOpsConfigSecretKey()` in `ops-config-contract.ts`.
                    plaintextValue: { type: 'string', maxLength: 4096 },
                    keyVersion: { type: 'number' },
                    requiresRestart: { type: 'boolean' },
                    updatedAt: { type: 'string', maxLength: 40 }
                  }
                }
              }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const query = request.query as {
        domain?: 'core' | 'payments' | 'shipping' | 'notifications' | 'opsSecurity';
      };
      const items = await opsService.getStoredConfigSecrets(query.domain);
      return { items };
    }
  );

  fastify.post(
    '/api/v1/ops/config/save',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['values', 'challengeId', 'otpCode'],
          properties: {
            domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 },
            values: { type: 'object', additionalProperties: true, maxProperties: 50 },
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            otpCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['valid', 'savedKeys', 'domain', 'requiresRestart', 'masked'],
            properties: {
              valid: { type: 'boolean' },
              savedKeys: { type: 'array', items: { type: 'string', maxLength: 120 } },
              domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 },
              requiresRestart: { type: 'boolean' },
              masked: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['key', 'maskedValue'],
                  properties: {
                    key: { type: 'string', maxLength: 120 },
                    maskedValue: { type: 'string', maxLength: 300 }
                  }
                }
              }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as {
        domain?: 'core' | 'payments' | 'shipping' | 'notifications' | 'opsSecurity';
        values: Record<string, string | number | boolean | null | undefined>;
        challengeId: string;
        otpCode: string;
      };
      return opsService.saveConfigDraft({
        opsUserId: opsUser.id,
        ...(body.domain ? { domain: body.domain } : {}),
        values: body.values,
        challengeId: body.challengeId,
        otpCode: body.otpCode,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.post(
    '/api/v1/ops/otp/request',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['action'],
          properties: {
            action: {
              type: 'string',
              enum: [
                'config-save',
                'load-shed-change',
                'user-deactivate',
                'system-restart',
                'invite-revoke'
              ],
              maxLength: 40
            }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['challengeId', 'expiresAt'],
            properties: {
              challengeId: { type: 'string', maxLength: 80 },
              expiresAt: { type: 'string', maxLength: 40 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as { action: string };
      return opsService.requestEmailOtp({
        opsUserId: opsUser.id,
        action: body.action,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.post(
    '/api/v1/ops/otp/verify',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['challengeId', 'code'],
          properties: {
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            code: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['verified'],
            properties: {
              verified: { type: 'boolean' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as { challengeId: string; code: string };
      return opsService.verifyEmailOtp({
        opsUserId: opsUser.id,
        challengeId: body.challengeId,
        code: body.code,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.post(
    '/api/v1/ops/invites',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'name', 'setupBaseUrl'],
          properties: {
            email: { type: 'string', format: 'email', minLength: 3, maxLength: 160 },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            permissions: {
              type: 'array',
              minItems: 0,
              items: { type: 'string', enum: ['OPS_READ', 'OPS_WRITE'], maxLength: 20 }
            },
            ipAllowlist: {
              type: 'array',
              minItems: 0,
              items: { type: 'string', minLength: 3, maxLength: 120 },
              default: []
            },
            setupBaseUrl: { type: 'string', minLength: 8, maxLength: 300 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['inviteId', 'expiresAt', 'setupUrl'],
            properties: {
              inviteId: { type: 'string', maxLength: 80 },
              expiresAt: { type: 'string', maxLength: 40 },
              setupUrl: { type: 'string', maxLength: 500 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as {
        email: string;
        name: string;
        permissions?: Array<'OPS_READ' | 'OPS_WRITE'>;
        ipAllowlist?: string[];
        setupBaseUrl: string;
      };
      return opsService.createOpsInvite({
        createdByOpsUserId: opsUser.id,
        inviteEmail: body.email,
        inviteName: body.name,
        ...(body.permissions ? { permissions: body.permissions } : {}),
        ipAllowlist: body.ipAllowlist ?? [],
        setupBaseUrl: body.setupBaseUrl,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.get(
    '/api/v1/ops/invites',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['CREATED', 'EMAIL_SENT', 'CONSUMED', 'CANCELLED', 'EXPIRED_CLEANED'], maxLength: 24 },
            page: { type: 'number', minimum: 1, maximum: 100000 },
            limit: { type: 'number', minimum: 1, maximum: 100 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['items', 'page', 'limit', 'total'],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'inviteEmail', 'inviteName', 'status', 'permissions', 'ipAllowlist', 'expiresAt', 'createdAt', 'createdByOpsUserId'],
                  properties: {
                    id: { type: 'string', maxLength: 80 },
                    inviteEmail: { type: 'string', maxLength: 160 },
                    inviteName: { type: 'string', maxLength: 160 },
                    status: { type: 'string', maxLength: 24 },
                    permissions: { type: 'array', items: { type: 'string', maxLength: 20 } },
                    ipAllowlist: { type: 'array', items: { type: 'string', maxLength: 120 } },
                    expiresAt: { type: 'string', maxLength: 40 },
                    createdAt: { type: 'string', maxLength: 40 },
                    createdByOpsUserId: { anyOf: [{ type: 'string', maxLength: 80 }, { type: 'null' }] }
                  }
                }
              },
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const query = request.query as {
        status?: 'CREATED' | 'EMAIL_SENT' | 'CONSUMED' | 'CANCELLED' | 'EXPIRED_CLEANED';
        page?: number;
        limit?: number;
      };
      return opsService.listOpsInvites(query);
    }
  );

  fastify.post(
    '/api/v1/ops/invites/:inviteId/revoke',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['inviteId'],
          properties: {
            inviteId: { type: 'string', minLength: 1, maxLength: 80 }
          }
        },
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['challengeId', 'otpCode'],
          properties: {
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            otpCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['inviteId', 'revoked'],
            properties: {
              inviteId: { type: 'string', maxLength: 80 },
              revoked: { type: 'boolean' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const params = request.params as { inviteId: string };
      const body = request.body as { challengeId: string; otpCode: string };
      return opsService.revokeOpsInvite({
        inviteId: params.inviteId,
        revokerOpsUserId: opsUser.id,
        challengeId: body.challengeId,
        otpCode: body.otpCode,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.post(
    '/api/v1/ops/invites/setup/send-otp',
    {
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'name'],
          properties: {
            token: { type: 'string', minLength: 10, maxLength: 500 },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            phone: { type: 'string', minLength: 6, maxLength: 20 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['message', 'expiresAt'],
            properties: {
              message: { type: 'string', maxLength: 200 },
              expiresAt: { type: 'string', maxLength: 40 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const body = request.body as { token: string; name: string; phone?: string };
      return opsService.sendInviteSetupOtp({
        inviteToken: body.token,
        name: body.name,
        ...(body.phone ? { phone: body.phone } : {})
      });
    }
  );

  fastify.post(
    '/api/v1/ops/invites/consume',
    {
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'otp'],
          properties: {
            token: { type: 'string', minLength: 10, maxLength: 500 },
            otp: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['opsUserId', 'email', 'name', 'permissions'],
            properties: {
              opsUserId: { type: 'string', maxLength: 80 },
              email: { type: 'string', maxLength: 160 },
              name: { type: 'string', maxLength: 160 },
              permissions: { type: 'array', items: { type: 'string', maxLength: 20 } }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const body = request.body as { token: string; otp: string };
      return opsService.consumeOpsInvite({
        inviteToken: body.token,
        otp: body.otp,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.post(
    '/api/v1/ops/invites/cleanup-expired',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['cleaned'],
            properties: {
              cleaned: { type: 'number' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      return opsService.cleanupExpiredInvites({
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method,
        actorOpsUserId: opsUser.id
      });
    }
  );

  fastify.get(
    '/api/v1/ops/users',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            isActive: { type: 'boolean' },
            page: { type: 'number', minimum: 1, maximum: 100000 },
            limit: { type: 'number', minimum: 1, maximum: 100 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['items', 'page', 'limit', 'total'],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'email', 'name', 'permissions', 'mfaEnabled', 'isActive', 'ipAllowlist', 'lastLoginAt', 'createdAt'],
                  properties: {
                    id: { type: 'string', maxLength: 80 },
                    email: { type: 'string', maxLength: 160 },
                    name: { type: 'string', maxLength: 160 },
                    permissions: { type: 'array', items: { type: 'string', maxLength: 32 } },
                    mfaEnabled: { type: 'boolean' },
                    isActive: { type: 'boolean' },
                    ipAllowlist: { type: 'array', items: { type: 'string', maxLength: 120 } },
                    lastLoginAt: { anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }] },
                    createdAt: { type: 'string', maxLength: 40 }
                  }
                }
              },
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const query = request.query as { isActive?: boolean; page?: number; limit?: number };
      return opsService.listOpsUsers(query);
    }
  );

  fastify.get(
    '/api/v1/ops/users/:opsUserId',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['opsUserId'],
          properties: {
            opsUserId: { type: 'string', minLength: 1, maxLength: 80 }
          }
        },
        querystring: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'email', 'name', 'phone', 'permissions', 'mfaEnabled', 'isActive', 'ipAllowlist', 'lastLoginAt', 'createdAt'],
            properties: {
              id: { type: 'string', maxLength: 80 },
              email: { type: 'string', maxLength: 160 },
              name: { type: 'string', maxLength: 160 },
              phone: { anyOf: [{ type: 'string', maxLength: 20 }, { type: 'null' }] },
              permissions: { type: 'array', items: { type: 'string', maxLength: 32 } },
              mfaEnabled: { type: 'boolean' },
              isActive: { type: 'boolean' },
              ipAllowlist: { type: 'array', items: { type: 'string', maxLength: 120 } },
              lastLoginAt: { anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }] },
              createdAt: { type: 'string', maxLength: 40 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const params = request.params as { opsUserId: string };
      return opsService.getOpsUserById(params.opsUserId);
    }
  );

  fastify.post(
    '/api/v1/ops/users/:opsUserId/deactivate',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['opsUserId'],
          properties: {
            opsUserId: { type: 'string', minLength: 1, maxLength: 80 }
          }
        },
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reason', 'challengeId', 'otpCode'],
          properties: {
            reason: { type: 'string', minLength: 5, maxLength: 500 },
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            otpCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['opsUserId', 'deactivated'],
            properties: {
              opsUserId: { type: 'string', maxLength: 80 },
              deactivated: { type: 'boolean' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const params = request.params as { opsUserId: string };
      const body = request.body as { reason: string; challengeId: string; otpCode: string };
      return opsService.deactivateOpsUser({
        targetOpsUserId: params.opsUserId,
        requestorOpsUserId: opsUser.id,
        reason: body.reason,
        challengeId: body.challengeId,
        otpCode: body.otpCode,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.get(
    '/api/v1/ops/otp/pending',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['items'],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'action', 'expiresAt'],
                  properties: {
                    id: { type: 'string', maxLength: 80 },
                    action: { type: 'string', maxLength: 120 },
                    expiresAt: { type: 'string', maxLength: 40 }
                  }
                }
              }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      return opsService.listPendingOtpChallenges(opsUser.id);
    }
  );

  fastify.get(
    '/api/v1/ops/session',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'email', 'name', 'permissions', 'mfaEnabled', 'ipAllowlist', 'lastLoginAt'],
            properties: {
              id: { type: 'string', maxLength: 80 },
              email: { type: 'string', maxLength: 160 },
              name: { type: 'string', maxLength: 160 },
              permissions: { type: 'array', items: { type: 'string', maxLength: 32 } },
              mfaEnabled: { type: 'boolean' },
              ipAllowlist: { type: 'array', items: { type: 'string', maxLength: 120 } },
              lastLoginAt: { anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }] }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      return opsService.getOpsSessionProfile(opsUser.id);
    }
  );

  fastify.get(
    '/api/v1/ops/load-shed',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['mode'],
            properties: {
              mode: { type: 'string', enum: ['normal', 'reduced', 'emergency'], maxLength: 20 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const mode = await getLoadShedMode(request);
      return { mode };
    }
  );

  fastify.post(
    '/api/v1/ops/load-shed',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['mode', 'reason', 'challengeId', 'otpCode'],
          properties: {
            mode: { type: 'string', enum: ['normal', 'reduced', 'emergency'], maxLength: 20 },
            reason: { type: 'string', minLength: 10, maxLength: 500 },
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            otpCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['mode', 'updated'],
            properties: {
              mode: { type: 'string', enum: ['normal', 'reduced', 'emergency'], maxLength: 20 },
              updated: { type: 'boolean' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as { mode: 'normal' | 'reduced' | 'emergency'; reason: string; challengeId: string; otpCode: string };
      return opsService.setLoadShedModeDirect({
        request,
        requesterId: opsUser.id,
        mode: body.mode,
        reason: body.reason,
        challengeId: body.challengeId,
        otpCode: body.otpCode,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.get(
    '/api/v1/ops/audit/logs',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            actionStatus: { type: 'string', enum: ['EXECUTED', 'FAILED'], maxLength: 32 },
            actionType: { type: 'string', maxLength: 64 },
            opsUserId: { type: 'string', maxLength: 80 },
            page: { type: 'number', minimum: 1, maximum: 100000 },
            limit: { type: 'number', minimum: 1, maximum: 100 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['items', 'page', 'limit', 'total'],
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'requestId', 'actionType', 'actionStatus', 'requestPath', 'method', 'summary', 'createdAt'],
                  properties: {
                    id: { type: 'string', maxLength: 80 },
                    requestId: { type: 'string', maxLength: 80 },
                    actionType: { type: 'string', maxLength: 64 },
                    actionStatus: { type: 'string', maxLength: 32 },
                    requestPath: { type: 'string', maxLength: 300 },
                    method: { type: 'string', maxLength: 16 },
                    summary: { anyOf: [{ type: 'object' }, { type: 'null' }] },
                    createdAt: { type: 'string', maxLength: 40 }
                  }
                }
              },
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const query = request.query as {
        actionStatus?: 'EXECUTED' | 'FAILED';
        actionType?: string;
        opsUserId?: string;
        page?: number;
        limit?: number;
      };
      return opsService.listAuditLogs(query);
    }
  );

  // ── System restart ────────────────────────────────────────────────────────

  fastify.post(
    '/api/v1/ops/system/restart',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['delayMinutes', 'challengeId', 'otpCode'],
          properties: {
            delayMinutes: { type: 'number', minimum: 0, maximum: 1440 },
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            otpCode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['jobId', 'scheduledFor'],
            properties: {
              jobId: { type: 'string', maxLength: 80 },
              scheduledFor: { type: 'string', maxLength: 40 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }
      const body = request.body as { delayMinutes: number; challengeId: string; otpCode: string };
      return opsService.scheduleRestart({
        opsUserId: opsUser.id,
        delayMinutes: body.delayMinutes,
        challengeId: body.challengeId,
        otpCode: body.otpCode,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  // ── Browser login flow (public — no opsAuthGuard) ─────────────────────────

  fastify.post(
    '/api/v1/ops/auth/login/request-otp',
    {
      config: { rateLimit: routeRateLimitProfiles.authSensitive },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['message'],
            properties: {
              message: { type: 'string', maxLength: 200 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request) => {
      const { email } = request.body as { email: string };
      return opsService.requestLoginOtp({ email, requestIp: request.ip });
    }
  );

  fastify.post(
    '/api/v1/ops/auth/login/verify-otp',
    {
      config: { rateLimit: routeRateLimitProfiles.authSensitive },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'otp'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            otp: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['opsUserId', 'name', 'email', 'permissions', 'expiresAt'],
            properties: {
              opsUserId: { type: 'string', maxLength: 80 },
              name: { type: 'string', maxLength: 120 },
              email: { type: 'string', maxLength: 254 },
              permissions: { type: 'array', items: { type: 'string', maxLength: 32 } },
              expiresAt: { type: 'string', maxLength: 40 }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request, reply) => {
      const { email, otp } = request.body as { email: string; otp: string };
      const result = await opsService.verifyLoginOtp({
        email,
        otp,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });

      const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
      const isProduction = nodeEnv !== 'development' && nodeEnv !== 'test';

      // Session cookie — no maxAge/expires so it is destroyed when the browser
      // session ends (tab/window close). The server-side Redis TTL
      // (OPS_BROWSER_SESSION_TTL_SECONDS) still enforces the absolute time limit.
      void reply.setCookie(OPS_BROWSER_SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
        path: '/api/v1/ops'
      });

      return {
        opsUserId: result.opsUserId,
        name: result.name,
        email: result.email,
        permissions: result.permissions,
        expiresAt: result.expiresAt
      };
    }
  );

  fastify.post(
    '/api/v1/ops/auth/logout',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['loggedOut'],
            properties: {
              loggedOut: { type: 'boolean' }
            }
          },
          ...standardAdminErrorResponses
        }
      }
    },
    async (request, reply) => {
      const opsUser = request.opsUser;
      if (!opsUser) {
        throw new AppError(ERROR_CODES.UNAUTHORISED, 'Ops authentication required', 401);
      }

      const rawCookies = request.headers.cookie ?? '';
      const sessionToken = rawCookies
        .split(';')
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${OPS_BROWSER_SESSION_COOKIE_NAME}=`))
        ?.replace(`${OPS_BROWSER_SESSION_COOKIE_NAME}=`, '')
        .trim();

      if (sessionToken) {
        await opsService.logoutBrowserSession(
          sessionToken,
          request.ip,
          request.url,
          request.method,
          opsUser.id
        );
      }

      void reply.clearCookie(OPS_BROWSER_SESSION_COOKIE_NAME, {
        path: '/api/v1/ops',
        httpOnly: true,
        sameSite: 'strict'
      });

      return { loggedOut: true };
    }
  );
}
