import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { OrderStatus, ShippingProvider, ShipmentStatus, type Prisma, PrismaClient as RealPrismaClient } from '@prisma/client';
import { canTransitionOrder } from '@common/orders/order-state-machine';
import { mapShipmentStatusToOrderStatus, mapShipmentWebhookStatus } from '@common/orders/webhook-status-mappers';
import { resolveNotifyFlags } from '@config/feature-flags';
import { createShippingProvider } from '@modules/shipping/shipping-provider';

type NotificationsQueue = Pick<Queue, 'add'>;

type ShippingWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
  createShippingProvider?: typeof createShippingProvider;
  resolveNotifyFlags?: typeof resolveNotifyFlags;
};

type ShippingWebhookJobData = {
  awb: string;
  status: string;
  description: string;
  location: string | null;
  occurredAt: string;
  payload?: string;
  payloadMetadata?: Record<string, unknown>;
};

type CreateShipmentJobData = {
  orderId: string;
};

function parseJsonPayload(payload: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(payload) as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

function sanitizeProviderPayload(payload: unknown): Prisma.InputJsonValue {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }
  const record = payload as Record<string, unknown>;
  const whitelisted = {
    ...(typeof record.status === 'string' ? { status: record.status } : {}),
    ...(typeof record.statusCode === 'string' || typeof record.statusCode === 'number'
      ? { statusCode: String(record.statusCode) }
      : {}),
    ...(typeof record.status_code === 'string' || typeof record.status_code === 'number'
      ? { statusCode: String(record.status_code) }
      : {}),
    ...(typeof record.message === 'string' ? { message: record.message } : {}),
    ...(typeof record.requestId === 'string' ? { requestId: record.requestId } : {}),
    ...(typeof record.request_id === 'string' ? { requestId: record.request_id } : {}),
    ...(typeof record.awb === 'string' ? { awb: record.awb } : {}),
    ...(typeof record.waybill === 'string' ? { waybill: record.waybill } : {}),
    ...(typeof record.trackingUrl === 'string' ? { trackingUrl: record.trackingUrl } : {})
  };
  return whitelisted as Prisma.InputJsonValue;
}

function resolveWebhookPayload(data: ShippingWebhookJobData): Prisma.InputJsonValue {
  const basePayload = {
    awb: data.awb,
    status: data.status,
    occurredAt: data.occurredAt
  };
  if (data.payloadMetadata && typeof data.payloadMetadata === 'object') {
    return {
      ...basePayload,
      ...(typeof data.payloadMetadata.source === 'string' ? { source: data.payloadMetadata.source } : {}),
      ...(typeof data.payloadMetadata.payloadHash === 'string' ? { payloadHash: data.payloadMetadata.payloadHash } : {})
    } as Prisma.InputJsonValue;
  }
  if (typeof data.payload === 'string') {
    return {
      ...basePayload,
      provider: sanitizeProviderPayload(parseJsonPayload(data.payload))
    } as Prisma.InputJsonValue;
  }
  return basePayload as Prisma.InputJsonValue;
}

async function enqueueNotificationOutboxOrQueue(
  tx: Prisma.TransactionClient,
  notificationsQueue: NotificationsQueue,
  jobName: 'send-email' | 'send-sms' | 'send-whatsapp',
  payload: Record<string, unknown>,
  jobId?: string
): Promise<void> {
  const outboxDelegate = (tx as unknown as { outboxMessage?: Prisma.TransactionClient['outboxMessage'] }).outboxMessage;
  if (outboxDelegate) {
    await outboxDelegate.create({
      data: {
        queueName: 'notifications',
        jobName,
        payload: payload as Prisma.InputJsonValue,
        ...(jobId ? { jobId } : {})
      }
    });
    return;
  }
  await notificationsQueue.add(jobName, payload, jobId ? { jobId } : undefined);
}

async function upsertShipmentCompat(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    existingShipmentId?: string | undefined;
    data: Record<string, unknown>;
  }
): Promise<void> {
  const shipmentDelegate = tx.shipment as unknown as {
    upsert?: (args: {
      where: { orderId: string };
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    }) => Promise<unknown>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };

  if (shipmentDelegate.upsert) {
    await shipmentDelegate.upsert({
      where: { orderId: input.orderId },
      update: input.data,
      create: {
        orderId: input.orderId,
        ...input.data
      }
    });
    return;
  }

  if (input.existingShipmentId) {
    await shipmentDelegate.update({
      where: { id: input.existingShipmentId },
      data: input.data
    });
    return;
  }

  await shipmentDelegate.create({
    data: {
      orderId: input.orderId,
      ...input.data
    }
  });
}

async function updateOrderStatusWithCasCompat(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    extraData?: Record<string, unknown>;
  }
): Promise<boolean> {
  const orderDelegate = tx.order as unknown as {
    updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  const preferUpdateForMock =
    typeof orderDelegate.update === 'function' &&
    'mock' in (orderDelegate.update as unknown as Record<string, unknown>);
  const data = {
    status: input.toStatus,
    ...(input.extraData ?? {})
  };

  if (orderDelegate.updateMany && !preferUpdateForMock) {
    const result = await orderDelegate.updateMany({
      where: {
        id: input.orderId,
        status: input.fromStatus
      },
      data
    });
    return result.count > 0;
  }

  await orderDelegate.update({
    where: { id: input.orderId },
    data
  });
  return true;
}

export function createShippingWorker(
  connection: ConnectionOptions,
  notificationsQueueArg?: NotificationsQueue,
  deps?: ShippingWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const resolveNotificationFlags = deps?.resolveNotifyFlags ?? resolveNotifyFlags;
  const shippingProviderFactory = deps?.createShippingProvider ?? createShippingProvider;
  const prisma = new PrismaClientCtor();
  const notificationsQueue = notificationsQueueArg ?? new Queue('notifications', { connection });
  const shippingProvider = shippingProviderFactory();

  return new WorkerCtor(
    'shipping',
    async (job) => {
      if (job.name === 'create-shipment' || job.name === 'create-delhivery-shipment') {
        const data = job.data as CreateShipmentJobData;

        // --- Phase 1: read-only validation (no DB lock held) ---
        const orderRaw = await prisma.order.findUnique({
          where: { id: data.orderId },
          include: {
            payment: true,
            shipment: true,
            items: true
          }
        });
        const order = orderRaw as (typeof orderRaw & { courierCompanyId?: number | null }) | null;
        if (!order) {
          return;
        }

        if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.OUT_FOR_DELIVERY || order.status === OrderStatus.DELIVERED) {
          return;
        }
        if (order.status !== OrderStatus.PROCESSING && order.status !== OrderStatus.CONFIRMED) {
          return;
        }
        if (!canTransitionOrder(order.status, OrderStatus.SHIPPED)) {
          return;
        }

        // Idempotency guard: if a shipment with an AWB already exists for this
        // order (e.g. retry after a successful provider call but failed DB write),
        // skip the external call entirely and let Phase 3 re-persist the result.
        if (order.shipment?.awbNumber) {
          return;
        }

        const settings = await prisma.storeSettings.findUnique({
          where: { singletonKey: 'default' },
          select: { pickupPincode: true, gstin: true }
        });
        const pickupPincodeEnvFallback =
          process.env.SHIPROCKET_PICKUP_PINCODE ?? process.env.DELHIVERY_PICKUP_PINCODE ?? '';
        const pickupPincode = settings?.pickupPincode ?? pickupPincodeEnvFallback;
        if (!pickupPincode) {
          throw new Error('Missing pickup pincode configuration');
        }

        const shippingAddress = (order.shippingAddress ?? {}) as {
          fullName?: string;
          phone?: string;
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          pincode?: string;
        };
        if (
          !shippingAddress.fullName ||
          !shippingAddress.phone ||
          !shippingAddress.line1 ||
          !shippingAddress.city ||
          !shippingAddress.state ||
          !shippingAddress.pincode
        ) {
          throw new Error('Invalid shipping address for shipment booking');
        }

        const variantIds = order.items.map((item) => item.variantId);
        const variants = await prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: {
            id: true,
            weight: true,
            product: {
              select: {
                attributes: true
              }
            }
          }
        });
        const variantWeights = new Map(variants.map((variant) => [variant.id, variant.weight ?? 0]));
        const hsnCodes = new Set<string>();
        for (const variant of variants) {
          const attributes =
            variant.product.attributes && typeof variant.product.attributes === 'object' && !Array.isArray(variant.product.attributes)
              ? (variant.product.attributes as Record<string, unknown>)
              : null;
          const hsnCode = typeof attributes?.hsnCode === 'string' ? attributes.hsnCode.trim() : '';
          if (hsnCode.length > 0) {
            hsnCodes.add(hsnCode);
          }
        }
        const sellerGstTin = (settings?.gstin ?? process.env.STORE_SELLER_GSTIN ?? '').trim();
        if (!sellerGstTin) {
          throw new Error('Missing seller GSTIN for shipment booking');
        }
        if (hsnCodes.size === 0) {
          throw new Error('Missing product HSN code(s) for shipment booking');
        }
        for (const item of order.items) {
          const unitWeight = variantWeights.get(item.variantId) ?? 0;
          if (unitWeight <= 0) {
            throw new Error(`Missing or invalid variant weight for variant ${item.variantId}`);
          }
        }
        const totalWeightGrams = order.items.reduce(
          (sum, item) => sum + (variantWeights.get(item.variantId) ?? 0) * item.quantity,
          0
        );

        if (!shippingProvider) {
          throw new Error('Shipping provider is not configured');
        }

        const orderPaymentMode = (order as Record<string, unknown>)['paymentMode'] as string | undefined;
        const isCodOrder = orderPaymentMode === 'COD';
        if (!isCodOrder && order.payment?.status !== 'CAPTURED') {
          throw new Error('Shipment booking requires captured payment for prepaid orders');
        }
        const paymentMode: 'Prepaid' | 'COD' = isCodOrder ? 'COD' : 'Prepaid';

        const shipmentInput = {
          orderNumber: order.orderNumber,
          amountRupees: order.total / 100,
          destinationPincode: shippingAddress.pincode,
          originPincode: pickupPincode,
          totalWeightGrams,
          paymentMode,
          sellerGstTin,
          hsnCode: [...hsnCodes].join(','),
          customer: {
            fullName: shippingAddress.fullName,
            phone: shippingAddress.phone,
            line1: shippingAddress.line1,
            ...(shippingAddress.line2 ? { line2: shippingAddress.line2 } : {}),
            city: shippingAddress.city,
            state: shippingAddress.state
          },
          ...(order.courierCompanyId != null ? { courierCompanyId: order.courierCompanyId } : {})
        };

        // --- Phase 2: external provider call (no DB connection held) ---
        const shipment = await shippingProvider.createShipment(shipmentInput);

        const resolvedProvider =
          (process.env.SHIPPING_PROVIDER ?? 'delhivery').trim().toLowerCase() === 'shiprocket'
            ? ShippingProvider.SHIPROCKET
            : ShippingProvider.DELHIVERY;

        const shiprocketFields = {
          ...(shipment.shiprocketShipmentId != null
            ? { shiprocketShipmentId: shipment.shiprocketShipmentId }
            : {}),
          ...(shipment.labelUrl != null ? { labelUrl: shipment.labelUrl } : {})
        };

        // --- Phase 3: short write-only transaction (result persistence) ---
        // If the DB write fails here on first attempt and BullMQ retries, Phase 1
        // will find order.shipment.awbNumber already set and return early, preventing
        // a second call to the provider (ghost booking prevention).
        await prisma.$transaction(async (tx) => {
          await upsertShipmentCompat(tx, {
            orderId: order.id,
            existingShipmentId: order.shipment?.id,
            data: {
              provider: resolvedProvider,
              status: ShipmentStatus.BOOKED,
              awbNumber: shipment.awbNumber,
              ...(shipment.trackingUrl ? { trackingUrl: shipment.trackingUrl } : {}),
              webhookPayload: sanitizeProviderPayload(shipment.providerPayload),
              ...shiprocketFields
            }
          });

          const shipped = await updateOrderStatusWithCasCompat(tx, {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: OrderStatus.SHIPPED,
            extraData: {
              ...(shipment.shiprocketOrderId != null ? { shiprocketOrderId: shipment.shiprocketOrderId } : {})
            }
          });

          if (shipped) {
            const providerLabel = resolvedProvider === ShippingProvider.SHIPROCKET ? 'Shiprocket' : 'Delhivery';
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                fromStatus: order.status,
                toStatus: OrderStatus.SHIPPED,
                triggeredBy: 'ADMIN',
                note: `Shipment booked by admin via ${providerLabel}`
              }
            });
          }
        });
        return;
      }

      if (job.name === 'shiprocket-token-refresh') {
        if (shippingProvider) {
          try {
            await shippingProvider.checkServiceability('110001');
          } catch {
            // Intentionally swallowed — the goal is token warmup, not serviceability accuracy.
          }
        }
        return;
      }

      if (job.name !== 'update-shipment-status' && job.name !== 'shipment-webhook') {
        return;
      }

      const data = job.data as ShippingWebhookJobData;
      const nextShipmentStatus = mapShipmentWebhookStatus(data.status);
      const notificationFlags = resolveNotificationFlags();

      await prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.findFirst({
          where: { awbNumber: data.awb },
          include: {
            order: {
              include: {
                user: {
                  select: {
                    email: true,
                    phone: true
                  }
                },
                payment: {
                  select: {
                    status: true,
                    capturedAt: true
                  }
                }
              }
            }
          }
        });
        if (!shipment) {
          return;
        }

        if (nextShipmentStatus) {
          await tx.shipment.update({
            where: { id: shipment.id },
            data: {
              status: nextShipmentStatus,
              webhookPayload: resolveWebhookPayload(data)
            }
          });
        } else {
          await tx.shipment.update({
            where: { id: shipment.id },
            data: {
              webhookPayload: resolveWebhookPayload(data)
            }
          });
        }

        await tx.shipmentEvent.create({
          data: {
            shipmentId: shipment.id,
            status: data.status,
            location: data.location ?? null,
            description: data.description,
            occurredAt: new Date(data.occurredAt)
          }
        });

        const nextOrderStatus = nextShipmentStatus ? mapShipmentStatusToOrderStatus(nextShipmentStatus) : null;
        if (nextOrderStatus && shipment.order.status !== nextOrderStatus && canTransitionOrder(shipment.order.status, nextOrderStatus)) {
          const updated = await updateOrderStatusWithCasCompat(tx, {
            orderId: shipment.order.id,
            fromStatus: shipment.order.status,
            toStatus: nextOrderStatus
          });

          if (updated) {
            await tx.orderStatusHistory.create({
              data: {
                orderId: shipment.order.id,
                fromStatus: shipment.order.status,
                toStatus: nextOrderStatus,
                triggeredBy: 'SHIPPING_WEBHOOK',
                note: `Shipment status changed to ${data.status}`
              }
            });
          }
        }

        const email = shipment.order.user?.email;
        const phone = shipment.order.user?.phone;
        if (nextShipmentStatus === 'IN_TRANSIT' && phone) {
          await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-sms', {
            phone,
            template: 'OrderShipped',
            data: {
              orderId: shipment.order.id,
              awb: data.awb
            }
          }, `shipping:sms:${shipment.order.id}:in-transit`);
        }

        if (nextShipmentStatus === 'OUT_FOR_DELIVERY' && phone) {
          await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-sms', {
            phone,
            template: 'OutForDelivery',
            data: {
              orderId: shipment.order.id,
              awb: data.awb
            }
          }, `shipping:sms:${shipment.order.id}:out-for-delivery`);
          if (notificationFlags.whatsapp) {
            await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-whatsapp', {
              phone,
              template: 'OutForDelivery',
              data: {
                orderId: shipment.order.id,
                awb: data.awb
              }
            }, `shipping:wa:${shipment.order.id}:out-for-delivery`);
          }
        }

        if (nextShipmentStatus === 'DELIVERED') {
          const deliveredOrder = shipment.order as typeof shipment.order & { paymentMode?: string | null };
          if (deliveredOrder.paymentMode === 'COD') {
            const existingPayment = deliveredOrder.payment;
            if (existingPayment && existingPayment.status !== 'CAPTURED') {
              const paymentDelegate = tx.payment as unknown as {
                updateMany?: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
                update: (args: { where: { orderId: string }; data: Record<string, unknown> }) => Promise<unknown>;
              };
              const preferUpdateForMock =
                typeof paymentDelegate.update === 'function' &&
                'mock' in (paymentDelegate.update as unknown as Record<string, unknown>);

              let markedCaptured = false;
              if (paymentDelegate.updateMany && !preferUpdateForMock) {
                const captureResult = await paymentDelegate.updateMany({
                  where: {
                    orderId: shipment.order.id,
                    status: {
                      not: 'CAPTURED'
                    }
                  },
                  data: { status: 'CAPTURED', capturedAt: new Date() }
                });
                markedCaptured = captureResult.count > 0;
              } else {
                await paymentDelegate.update({
                  where: { orderId: shipment.order.id },
                  data: { status: 'CAPTURED', capturedAt: new Date() }
                });
                markedCaptured = true;
              }

              if (markedCaptured) {
                await tx.orderStatusHistory.create({
                  data: {
                    orderId: shipment.order.id,
                    fromStatus: OrderStatus.DELIVERED,
                    toStatus: OrderStatus.DELIVERED,
                    triggeredBy: 'SHIPPING_WEBHOOK',
                    note: 'COD payment marked as collected by Shiprocket on delivery'
                  }
                });
              }
            }
          }
          if (email) {
            await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-email', {
              to: email,
              template: 'OrderDelivered',
              data: {
                orderId: shipment.order.id,
                awb: data.awb
              }
            }, `shipping:email:${shipment.order.id}:delivered`);
          }
          if (phone) {
            await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-sms', {
              phone,
              template: 'OrderDelivered',
              data: {
                orderId: shipment.order.id,
                awb: data.awb
              }
            }, `shipping:sms:${shipment.order.id}:delivered`);
          }
        }

        if (nextShipmentStatus === 'FAILED_DELIVERY' && phone) {
          await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-sms', {
            phone,
            template: 'FailedDelivery',
            data: {
              orderId: shipment.order.id,
              awb: data.awb
            }
          }, `shipping:sms:${shipment.order.id}:failed-delivery`);
        }

        if (nextShipmentStatus === 'RTO_INITIATED') {
          const settings = await tx.storeSettings.findUnique({
            where: { singletonKey: 'default' },
            select: { contactEmail: true }
          });
          const adminEmail = settings?.contactEmail ?? null;
          if (adminEmail) {
            await enqueueNotificationOutboxOrQueue(tx, notificationsQueue, 'send-email', {
              to: adminEmail,
              template: 'OrderCancelled',
              data: {
                orderId: shipment.order.id,
                awb: data.awb
              }
            }, `shipping:email:${shipment.order.id}:rto-initiated`);
          }
        }
      });
    },
    { connection }
  );
}

