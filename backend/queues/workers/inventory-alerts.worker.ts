import { Worker, type ConnectionOptions } from 'bullmq';
import { Queue } from 'bullmq';
import { PrismaClient as RealPrismaClient } from '@prisma/client';

type NotificationsQueue = Pick<Queue, 'add'>;

type InventoryAlertsWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
  Queue?: typeof Queue;
  notificationsQueue?: NotificationsQueue;
};

function resolveAdminAlertEmail(): string {
  if (process.env.ADMIN_ALERT_EMAIL) {
    return process.env.ADMIN_ALERT_EMAIL;
  }
  if (!process.env.RESEND_FROM) {
    return 'admin@example.com';
  }
  const match = process.env.RESEND_FROM.match(/<([^>]+)>/);
  return match?.[1] ?? process.env.RESEND_FROM;
}

export function createInventoryAlertsWorker(
  connection: ConnectionOptions,
  deps?: InventoryAlertsWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const QueueCtor = deps?.Queue ?? Queue;
  const prisma = new PrismaClientCtor();
  const notificationsQueue = deps?.notificationsQueue ?? new QueueCtor('notifications', { connection });

  return new WorkerCtor(
    'inventory-alerts',
    async (job) => {
      if (job.name !== 'check-low-stock') {
        return;
      }

      const candidateItems = await prisma.inventory.findMany({
        where: {
          lowStockAlerted: false
        },
        include: {
          variant: {
            select: {
              product: {
                select: {
                  name: true
                }
              },
              id: true,
              sku: true,
              name: true
            }
          }
        }
      });
      const reservationDelegate = (prisma as unknown as { cartReservation?: RealPrismaClient['cartReservation'] }).cartReservation;
      const reserved = reservationDelegate
        ? await reservationDelegate.groupBy({
            by: ['variantId'],
            where: {
              expiresAt: { gt: new Date() }
            },
            _sum: { quantity: true }
          })
        : [];
      const reservedByVariant = new Map(reserved.map((item) => [item.variantId, item._sum.quantity ?? 0]));
      const lowStockItems = candidateItems
        .map((item) => {
          const reservedQuantity = reservedByVariant.get(item.variantId) ?? 0;
          const availableQuantity = Math.max(item.quantity - reservedQuantity, 0);
          return {
            ...item,
            availableQuantity
          };
        })
        .filter((item) => item.availableQuantity <= item.lowStockThreshold);

      if (lowStockItems.length === 0) {
        return;
      }

      const claimedItems: typeof lowStockItems = [];
      for (const item of lowStockItems) {
        const claimResult = await prisma.inventory.updateMany({
          where: {
            id: item.id,
            lowStockAlerted: false
          },
          data: {
            lowStockAlerted: true
          }
        });

        if (claimResult.count > 0) {
          claimedItems.push(item);
        }
      }

      if (claimedItems.length === 0) {
        return;
      }

      const adminEmail = resolveAdminAlertEmail();
      await notificationsQueue.add('send-email', {
        to: adminEmail,
        template: 'LowStockAlert',
        data: {
          items: claimedItems.map((item) => ({
            inventoryId: item.id,
            variantId: item.variantId,
            sku: item.variant.sku,
            variantName: item.variant.name,
            quantity: item.availableQuantity,
            lowStockThreshold: item.lowStockThreshold
          }))
        }
      });

      await prisma.lowStockAlertEvent.createMany({
        data: claimedItems.map((item) => ({
          inventoryId: item.id,
          variantId: item.variantId,
          sku: item.variant.sku,
          variantName: item.variant.name,
          productName: item.variant.product.name,
          quantity: item.availableQuantity,
          lowStockThreshold: item.lowStockThreshold
        }))
      });
    },
    { connection }
  );
}

