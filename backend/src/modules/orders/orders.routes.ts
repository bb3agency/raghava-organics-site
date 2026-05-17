import { Role } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { getCurrentUser } from '@common/decorators/current-user';
import { adminPermissionGuard } from '@common/guards/admin-permissions.guard';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { jwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { rolesGuard } from '@common/guards/roles.guard';
import { idempotencyOnSend, idempotencyPreHandler } from '@common/idempotency/idempotency';
import { routeRateLimitProfiles } from '@common/rate-limit/rate-limit-policies';
import { loadShedGuard } from '@common/reliability/load-shed.guard';
import { hasAdminPermission } from '@common/auth/admin-permissions';
import {
  adminCancelOrderSchema,
  adminExportOrdersCsvSchema,
  adminGetInvoicePdfSchema,
  adminGetOrderByIdSchema,
  adminListOrdersSchema,
  adminOrderBoardSchema,
  adminShipOrderSchema,
  adminSchedulePickupSchema,
  adminPrintLabelSchema,
  adminRetriggerNotificationSchema,
  adminUpdateOrderStatusSchema,
  cancelMyOrderSchema,
  createOrderSchema,
  getMyInvoicePdfSchema,
  getMyOrderByIdSchema,
  initiatePaymentSchema,
  paymentWebhookSchema,
  shippingTrackSchema,
  shippingWebhookSchema,
  verifyPaymentSchema
} from './orders.schemas';
import { CheckoutRiskService } from './checkout-risk.service';
import { OrdersService } from './orders.service';
import { CancelOrderInput, ReturnRequestStatus } from './orders.types';
import { assertWebhookAllowlistConfigured, isIpAllowlisted, parseWebhookIpAllowlist, resolveSecurityClientIp } from '@common/security/webhook-allowlist';

function requireWebhookRawPayload(body: unknown): string | Buffer {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return body;
  }
  throw new AppError(
    ERROR_CODES.VALIDATION_ERROR,
    'Webhook payload must be raw string or buffer for signature verification',
    400
  );
}

function assertWebhookAllowlist(
  request: { ip: string; raw: { socket: { remoteAddress: string | undefined } } },
  trustedProxyRules: ReturnType<typeof parseWebhookIpAllowlist>,
  rules: ReturnType<typeof parseWebhookIpAllowlist>,
  providerName: string
): void {
  if (rules.length === 0) {
    return;
  }
  const resolvedClientIp = resolveSecurityClientIp({
    directRemoteIp: request.raw.socket.remoteAddress ?? null,
    derivedRequestIp: request.ip,
    trustedProxyRules
  });
  if (!resolvedClientIp || !isIpAllowlisted(resolvedClientIp, rules)) {
    throw new AppError(
      ERROR_CODES.UNAUTHORISED,
      `${providerName} webhook request source is not allowlisted`,
      401
    );
  }
}

export async function registerOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  let razorpayAllowlistRules: ReturnType<typeof parseWebhookIpAllowlist> = [];
  let shippingWebhookAllowlistRules: ReturnType<typeof parseWebhookIpAllowlist> = [];
  let trustedProxyRules: ReturnType<typeof parseWebhookIpAllowlist> = [];
  try {
    razorpayAllowlistRules = parseWebhookIpAllowlist(process.env.RAZORPAY_WEBHOOK_ALLOWLIST_CIDR);
    const shippingAllowlistCidr =
      process.env.SHIPPING_WEBHOOK_ALLOWLIST_CIDR ?? process.env.DELHIVERY_WEBHOOK_ALLOWLIST_CIDR;
    shippingWebhookAllowlistRules = parseWebhookIpAllowlist(shippingAllowlistCidr);
    trustedProxyRules = parseWebhookIpAllowlist(process.env.TRUSTED_PROXY_ALLOWLIST_CIDR);
  } catch (error) {
    throw new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      `Invalid webhook allowlist CIDR configuration: ${
        error instanceof Error ? error.message : 'unknown parse error'
      }`,
      500
    );
  }

  assertWebhookAllowlistConfigured('Razorpay', razorpayAllowlistRules);
  assertWebhookAllowlistConfigured('Shipping', shippingWebhookAllowlistRules);

  if (!fastify.hasDecorator('checkoutRisk')) {
    fastify.decorate('checkoutRisk', new CheckoutRiskService(fastify));
  }
  const ordersService = new OrdersService(fastify);
  const adminGuard = [jwtAuthGuard, rolesGuard(Role.ADMIN)];
  const customerGuard = [jwtAuthGuard, rolesGuard(Role.CUSTOMER)];
  fastify.addHook('onSend', async (request, reply, payload) => {
    await idempotencyOnSend(request, reply, payload);
    return payload;
  });

  fastify.post(
    '/api/v1/orders',
    {
      schema: createOrderSchema,
      preHandler: [...customerGuard, idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.checkoutMutation
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return ordersService.createOrder(user.sub, request.body as never);
    }
  );

  fastify.get(
    '/api/v1/orders/:id',
    {
      schema: getMyOrderByIdSchema,
      preHandler: customerGuard
    },
    async (request) => {
      const user = getCurrentUser(request);
      const params = request.params as { id: string };
      return ordersService.getMyOrderById(user.sub, params.id);
    }
  );

  fastify.get(
    '/api/v1/orders/:id/invoice.pdf',
    {
      schema: getMyInvoicePdfSchema,
      preHandler: customerGuard
    },
    async (request, reply) => {
      const user = getCurrentUser(request);
      const params = request.params as { id: string };
      const invoice = await ordersService.getMyInvoicePdf(user.sub, params.id);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      reply.header('cache-control', 'private, no-store');
      return reply.send(invoice.content);
    }
  );

  fastify.post(
    '/api/v1/orders/:id/cancel',
    {
      schema: cancelMyOrderSchema,
      preHandler: [...customerGuard, idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.checkoutMutation
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      const params = request.params as { id: string };
      return ordersService.cancelMyOrder(user.sub, params.id, request.body as CancelOrderInput | undefined);
    }
  );

  fastify.post(
    '/api/v1/payments/initiate',
    {
      schema: initiatePaymentSchema,
      preHandler: [...customerGuard, idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.checkoutMutation
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return ordersService.initiatePayment(user.sub, request.body as never, { clientIp: request.ip });
    }
  );

  fastify.post(
    '/api/v1/payments/verify',
    {
      schema: verifyPaymentSchema,
      preHandler: [...customerGuard, idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.checkoutMutation
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      return ordersService.verifyPayment(user.sub, request.body as never);
    }
  );

  fastify.post(
    '/api/v1/payments/webhook',
    {
      schema: paymentWebhookSchema,
      config: {
        rateLimit: routeRateLimitProfiles.webhookIngress
      }
    },
    async (request) => {
      assertWebhookAllowlist(request, trustedProxyRules, razorpayAllowlistRules, 'Razorpay');
      const signatureHeader = request.headers['x-razorpay-signature'];
      const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
      const eventIdHeader = request.headers['x-razorpay-event-id'];
      const eventId = Array.isArray(eventIdHeader) ? eventIdHeader[0] : eventIdHeader;
      const payload = requireWebhookRawPayload(request.body);
      const traceContext = request as { correlationId?: string; traceId?: string };
      return ordersService.processPaymentWebhook(signature, payload, eventId, {
        ...(traceContext.correlationId ? { correlationId: traceContext.correlationId } : {}),
        ...(traceContext.traceId ? { traceId: traceContext.traceId } : {})
      });
    }
  );

  fastify.get(
    '/api/v1/shipping/track/:awb',
    {
      schema: shippingTrackSchema,
      preHandler: customerGuard
    },
    async (request) => {
      const user = getCurrentUser(request);
      const params = request.params as { awb: string };
      return ordersService.getShippingTracking(user.sub, params.awb);
    }
  );

  fastify.post(
    '/api/v1/shipping/webhook',
    {
      schema: shippingWebhookSchema,
      config: {
        rateLimit: routeRateLimitProfiles.webhookIngress
      }
    },
    async (request) => {
      assertWebhookAllowlist(request, trustedProxyRules, shippingWebhookAllowlistRules, 'Shipping');
      const rawAuthHeader =
        request.headers['x-shiprocket-token'] ?? request.headers.authorization;
      const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
      const payload = requireWebhookRawPayload(request.body);
      const traceContext = request as { correlationId?: string; traceId?: string };
      return ordersService.processShippingWebhook(authHeader, payload, {
        ...(traceContext.correlationId ? { correlationId: traceContext.correlationId } : {}),
        ...(traceContext.traceId ? { traceId: traceContext.traceId } : {})
      });
    }
  );

  fastify.get(
    '/api/v1/admin/orders',
    {
      schema: adminListOrdersSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => ordersService.adminListOrders(request.query as never)
  );

  fastify.get(
    '/api/v1/admin/orders/board',
    {
      schema: adminOrderBoardSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async () => ordersService.adminGetOrderBoard()
  );

  fastify.get(
    '/api/v1/admin/orders/export',
    {
      schema: adminExportOrdersCsvSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:export'), loadShedGuard],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request, reply) => {
      const csv = await ordersService.adminExportOrdersCsv(request.query as never);
      reply.header('content-type', 'text/csv; charset=utf-8');
      reply.header('content-disposition', 'attachment; filename="orders-export.csv"');
      return reply.send(csv);
    }
  );

  fastify.get(
    '/api/v1/admin/orders/:id',
    {
      schema: adminGetOrderByIdSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return ordersService.adminGetOrderById(params.id);
    }
  );

  fastify.get(
    '/api/v1/admin/orders/:id/invoice.pdf',
    {
      schema: adminGetInvoicePdfSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request, reply) => {
      const params = request.params as { id: string };
      const invoice = await ordersService.adminGetInvoicePdf(params.id);
      reply.header('content-type', 'application/pdf');
      reply.header('content-disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      reply.header('cache-control', 'private, no-store');
      return reply.send(invoice.content);
    }
  );

  fastify.patch(
    '/api/v1/admin/orders/:id/status',
    {
      schema: adminUpdateOrderStatusSchema,
      preHandler: [
        ...adminGuard,
        adminPermissionGuard('orders:write'),
        async (request) => {
          const body = request.body as { status?: string };
          if (body.status === 'REFUNDED' && !hasAdminPermission(request.user?.permissions, 'orders:refund')) {
            throw new AppError(ERROR_CODES.FORBIDDEN, 'Insufficient permissions', 403);
          }
        },
        idempotencyPreHandler
      ],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const adminUser = getCurrentUser(request);
      const params = request.params as { id: string };
      const body = request.body as { note?: string };
      const taggedNote = body.note?.trim()
        ? `${body.note.trim()} [admin:${adminUser.sub}]`
        : `[admin:${adminUser.sub}]`;
      return ordersService.adminUpdateOrderStatus(params.id, {
        ...(request.body as Record<string, unknown>),
        note: taggedNote
      } as never);
    }
  );

  fastify.post(
    '/api/v1/admin/orders/:id/ship',
    {
      schema: adminShipOrderSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:write'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return ordersService.adminShipOrder(params.id);
    }
  );

  fastify.post(
    '/api/v1/admin/orders/:id/cancel',
    {
      schema: adminCancelOrderSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:refund'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const adminUser = getCurrentUser(request);
      const params = request.params as { id: string };
      const body = (request.body as CancelOrderInput | undefined) ?? {};
      const reason = body.reason?.trim()
        ? `${body.reason.trim()} [admin:${adminUser.sub}]`
        : `Cancelled by admin [admin:${adminUser.sub}]`;
      return ordersService.adminCancelOrder(params.id, {
        ...body,
        reason
      });
    }
  );

  fastify.post(
    '/api/v1/admin/orders/:id/schedule-pickup',
    {
      schema: adminSchedulePickupSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:write'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return ordersService.adminSchedulePickup(params.id);
    }
  );

  fastify.post(
    '/api/v1/admin/orders/:id/print-label',
    {
      schema: adminPrintLabelSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return ordersService.adminPrintLabel(params.id);
    }
  );

  fastify.post(
    '/api/v1/admin/orders/:id/notifications/retrigger',
    {
      schema: adminRetriggerNotificationSchema,
      preHandler: [...adminGuard, adminPermissionGuard('orders:notify'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      return ordersService.adminRetriggerNotification(params.id, request.body as never);
    }
  );

  fastify.post(
    '/api/v1/payments/retry',
    {
      schema: {
        tags: ['payments'],
        summary: 'Retry payment for a failed or pending-payment order',
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['orderId'],
          properties: {
            orderId: { type: 'string', minLength: 1, maxLength: 64 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['orderId', 'provider', 'providerOrderId', 'amount', 'currency'],
            properties: {
              orderId: { type: 'string' },
              provider: { type: 'string' },
              providerOrderId: { type: 'string' },
              amount: { type: 'integer' },
              currency: { type: 'string' }
            }
          }
        }
      },
      preHandler: [...customerGuard, idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.checkoutMutation
      }
    },
    async (request) => {
      const user = getCurrentUser(request);
      const body = request.body as { orderId: string };
      const retryClientIp = resolveSecurityClientIp({
        directRemoteIp: request.raw.socket.remoteAddress ?? null,
        derivedRequestIp: request.ip,
        trustedProxyRules
      });
      return ordersService.retryPayment(
        user.sub,
        body.orderId,
        retryClientIp !== null ? { clientIp: retryClientIp } : {}
      );
    }
  );

  fastify.post(
    '/api/v1/orders/:id/return-requests',
    {
      schema: {
        tags: ['orders'],
        summary: 'Create a return request for a delivered order',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string', maxLength: 64 } }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['items', 'reason'],
          properties: {
            reason: { type: 'string', minLength: 1, maxLength: 500 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['orderItemId', 'quantity'],
                properties: {
                  orderItemId: { type: 'string', maxLength: 64 },
                  quantity: { type: 'integer', minimum: 1, maximum: 10000 },
                  reason: { type: 'string', maxLength: 500 }
                }
              }
            }
          }
        },
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'orderId', 'status', 'reason', 'createdAt'],
            properties: {
              id: { type: 'string' },
              orderId: { type: 'string' },
              status: { type: 'string', enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED'], maxLength: 30 },
              reason: { type: 'string' },
              createdAt: { type: 'string' }
            }
          }
        }
      },
      preHandler: [...customerGuard, idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.checkoutMutation
      }
    },
    async (request, reply) => {
      const user = getCurrentUser(request);
      const params = request.params as { id: string };
      const body = request.body as { items: Array<{ orderItemId: string; quantity: number; reason?: string }>; reason: string };
      const result = await ordersService.createReturnRequest(user.sub, params.id, body);
      reply.code(201);
      return result;
    }
  );

  fastify.get(
    '/api/v1/admin/return-requests',
    {
      preHandler: [...adminGuard, adminPermissionGuard('orders:read')],
      config: {
        rateLimit: routeRateLimitProfiles.adminRead
      },
      schema: {
        tags: ['admin', 'returns'],
        summary: 'List return requests',
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED'], maxLength: 30 },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['items', 'total', 'page', 'limit'],
            properties: {
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'orderId', 'orderNumber', 'userId', 'customerEmail', 'customerName', 'status', 'reason', 'createdAt'],
                  properties: {
                    id: { type: 'string' },
                    orderId: { type: 'string' },
                    orderNumber: { type: 'string' },
                    userId: { type: 'string' },
                    customerEmail: { type: 'string' },
                    customerName: { type: 'string' },
                    status: { type: 'string', enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED'], maxLength: 30 },
                    reason: { type: 'string' },
                    createdAt: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const query = request.query as { status?: ReturnRequestStatus; page?: number; limit?: number };
      return ordersService.adminListReturnRequests(query);
    }
  );

  fastify.patch(
    '/api/v1/admin/return-requests/:id',
    {
      preHandler: [...adminGuard, adminPermissionGuard('orders:write'), idempotencyPreHandler],
      config: {
        rateLimit: routeRateLimitProfiles.adminWrite
      },
      schema: {
        tags: ['admin', 'returns'],
        summary: 'Update a return request status',
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string', maxLength: 64 } }
        },
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED'], maxLength: 30 },
            adminNote: { type: 'string', maxLength: 1000 }
          }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'orderId', 'status', 'updatedAt'],
            properties: {
              id: { type: 'string' },
              orderId: { type: 'string' },
              status: { type: 'string', enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKED_UP', 'REFUNDED'], maxLength: 30 },
              adminNote: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              updatedAt: { type: 'string' }
            }
          }
        }
      }
    },
    async (request) => {
      const adminUser = getCurrentUser(request);
      const params = request.params as { id: string };
      const body = request.body as { status: ReturnRequestStatus; adminNote?: string };
      return ordersService.adminUpdateReturnRequest(adminUser.sub, params.id, body);
    }
  );
}

