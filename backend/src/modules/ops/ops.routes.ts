import { FastifyInstance } from 'fastify';
import { standardAdminErrorResponses } from '@common/errors/error-response.schema';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { getLoadShedMode } from '@common/reliability/load-shed.guard';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import { opsAuthGuard } from '@common/guards/ops-auth.guard';
import { opsPermissionGuard } from '@common/guards/ops-permissions.guard';
import { OpsService } from './ops.service';

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
    async () => opsService.getConfigOverview()
  );

  fastify.post(
    '/api/v1/ops/config/validate',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:write')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
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
              additionalProperties: true
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
          required: ['domain', 'values', 'challengeId', 'otpCode'],
          properties: {
            domain: { type: 'string', enum: ['core', 'payments', 'shipping', 'notifications', 'opsSecurity'], maxLength: 24 },
            values: { type: 'object', additionalProperties: true },
            challengeId: { type: 'string', minLength: 1, maxLength: 80 },
            otpCode: { type: 'string', minLength: 4, maxLength: 10 }
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
        domain: 'core' | 'payments' | 'shipping' | 'notifications' | 'opsSecurity';
        values: Record<string, string | number | boolean | null | undefined>;
        challengeId: string;
        otpCode: string;
      };
      return opsService.saveConfigDraft({
        opsUserId: opsUser.id,
        domain: body.domain,
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
            action: { type: 'string', minLength: 4, maxLength: 120 }
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
            code: { type: 'string', minLength: 4, maxLength: 10 }
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
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:approve')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: emptyObjectSchema,
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'name', 'permissions', 'ipAllowlist', 'setupBaseUrl'],
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 160 },
            name: { type: 'string', minLength: 1, maxLength: 160 },
            permissions: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', enum: ['OPS_READ', 'OPS_WRITE', 'OPS_APPROVE'], maxLength: 20 }
            },
            ipAllowlist: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', minLength: 3, maxLength: 120 }
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
        permissions: Array<'OPS_READ' | 'OPS_WRITE' | 'OPS_APPROVE'>;
        ipAllowlist: string[];
        setupBaseUrl: string;
      };
      return opsService.createOpsInvite({
        createdByOpsUserId: opsUser.id,
        inviteEmail: body.email,
        inviteName: body.name,
        permissions: body.permissions,
        ipAllowlist: body.ipAllowlist,
        setupBaseUrl: body.setupBaseUrl,
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
          required: ['token', 'name', 'phone'],
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
      const body = request.body as { token: string; name: string; phone: string };
      return opsService.sendInviteSetupOtp({
        inviteToken: body.token,
        name: body.name,
        phone: body.phone
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
            otp: { type: 'string', minLength: 6, maxLength: 6 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['opsUserId', 'email', 'name', 'keyId', 'apiKey', 'permissions', 'ipAllowlist'],
            properties: {
              opsUserId: { type: 'string', maxLength: 80 },
              email: { type: 'string', maxLength: 160 },
              name: { type: 'string', maxLength: 160 },
              keyId: { type: 'string', maxLength: 120 },
              apiKey: { type: 'string', maxLength: 200 },
              permissions: { type: 'array', items: { type: 'string', maxLength: 20 } },
              ipAllowlist: { type: 'array', items: { type: 'string', maxLength: 120 } }
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
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:approve')],
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
    async (request) => opsService.cleanupExpiredInvites({
      requestIp: request.ip,
      requestPath: request.url,
      method: request.method
    })
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
          required: ['mode', 'reason'],
          properties: {
            mode: { type: 'string', enum: ['normal', 'reduced', 'emergency'], maxLength: 20 },
            reason: { type: 'string', minLength: 10, maxLength: 500 }
          }
        },
        response: {
          202: {
            type: 'object',
            additionalProperties: false,
            required: ['requestId', 'status', 'expiresAt'],
            properties: {
              requestId: { type: 'string', maxLength: 80 },
              status: { type: 'string', enum: ['PENDING_APPROVAL'], maxLength: 40 },
              expiresAt: { type: 'string', maxLength: 40 }
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
      const body = request.body as { mode: 'normal' | 'reduced' | 'emergency'; reason: string };
      const result = await opsService.requestLoadShedChange({
        requesterId: opsUser.id,
        mode: body.mode,
        reason: body.reason,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
      reply.code(202);
      return result;
    }
  );

  fastify.post(
    '/api/v1/ops/approvals/:requestId/confirm',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:approve')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['requestId'],
          properties: {
            requestId: { type: 'string', minLength: 1, maxLength: 80 }
          }
        },
        querystring: emptyObjectSchema,
        body: emptyObjectSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['mode', 'updated', 'requestId'],
            properties: {
              mode: { type: 'string', enum: ['normal', 'reduced', 'emergency'], maxLength: 20 },
              updated: { type: 'boolean' },
              requestId: { type: 'string', maxLength: 80 }
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
      const params = request.params as { requestId: string };
      return opsService.confirmLoadShedChange({
        request,
        requestId: params.requestId,
        confirmerId: opsUser.id,
        requestIp: request.ip,
        requestPath: request.url,
        method: request.method
      });
    }
  );

  fastify.get(
    '/api/v1/ops/approvals',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:read')],
      config: { rateLimit: routeRateLimitProfiles.opsRead },
      schema: {
        params: emptyObjectSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED'], maxLength: 32 },
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
                  required: ['requestId', 'requesterId', 'status', 'payload', 'expiresAt', 'createdAt', 'confirmerId', 'confirmedAt'],
                  properties: {
                    requestId: { type: 'string', maxLength: 80 },
                    requesterId: { type: 'string', maxLength: 80 },
                    status: { type: 'string', maxLength: 32 },
                    payload: { type: 'object' },
                    expiresAt: { type: 'string', maxLength: 40 },
                    createdAt: { type: 'string', maxLength: 40 },
                    confirmerId: { anyOf: [{ type: 'string', maxLength: 80 }, { type: 'null' }] },
                    confirmedAt: { anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }] }
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
        status?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
        page?: number;
        limit?: number;
      };
      return opsService.listApprovalRequests(query);
    }
  );

  fastify.post(
    '/api/v1/ops/approvals/:requestId/reject',
    {
      preHandler: [opsAuthGuard, opsPermissionGuard('ops:approve')],
      config: { rateLimit: routeRateLimitProfiles.opsCritical },
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['requestId'],
          properties: {
            requestId: { type: 'string', minLength: 1, maxLength: 80 }
          }
        },
        querystring: emptyObjectSchema,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 10, maxLength: 500 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['requestId', 'status', 'rejected'],
            properties: {
              requestId: { type: 'string', maxLength: 80 },
              status: { type: 'string', enum: ['REJECTED'], maxLength: 32 },
              rejected: { type: 'boolean' }
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
      const params = request.params as { requestId: string };
      const body = request.body as { reason: string };
      return opsService.rejectLoadShedChange({
        requestId: params.requestId,
        rejectorId: opsUser.id,
        reason: body.reason,
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
            actionStatus: { type: 'string', enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED'], maxLength: 32 },
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
                  required: ['id', 'requestId', 'actionStatus', 'requestPath', 'method', 'summary', 'createdAt'],
                  properties: {
                    id: { type: 'string', maxLength: 80 },
                    requestId: { type: 'string', maxLength: 80 },
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
        actionStatus?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED';
        page?: number;
        limit?: number;
      };
      return opsService.listAuditLogs(query);
    }
  );
}
