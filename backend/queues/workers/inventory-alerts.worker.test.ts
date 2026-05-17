import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInventoryAlertsWorker } from './inventory-alerts.worker';

type InventoryAlertsDeps = NonNullable<Parameters<typeof createInventoryAlertsWorker>[1]>;
type InventoryAlertsWorkerType = NonNullable<InventoryAlertsDeps['Worker']>;
type InventoryAlertsPrismaType = NonNullable<InventoryAlertsDeps['PrismaClient']>;
type InventoryAlertsQueueType = NonNullable<InventoryAlertsDeps['notificationsQueue']>;

describe('inventory alerts worker', () => {
  let processor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
  const notificationsAdd = vi.fn();
  const inventoryFindMany = vi.fn();
  const inventoryUpdateMany = vi.fn();
  const lowStockAlertEventCreateMany = vi.fn();

  function MockWorker(_name: string, proc: (job: { name: string; data: unknown }) => Promise<void>) {
    processor = proc;
  }

  function MockPrismaClient() {
    return {
      inventory: {
        findMany: inventoryFindMany,
        updateMany: inventoryUpdateMany
      },
      lowStockAlertEvent: {
        createMany: lowStockAlertEventCreateMany
      }
    };
  }

  const mockQueue = { add: notificationsAdd } as unknown as InventoryAlertsQueueType;

  const workerDeps = {
    Worker: MockWorker as unknown as InventoryAlertsWorkerType,
    PrismaClient: MockPrismaClient as unknown as InventoryAlertsPrismaType,
    notificationsQueue: mockQueue
  };

  beforeEach(() => {
    processor = undefined;
    notificationsAdd.mockReset();
    inventoryFindMany.mockReset();
    inventoryUpdateMany.mockReset();
    lowStockAlertEventCreateMany.mockReset();
    process.env.ADMIN_ALERT_EMAIL = 'admin@example.com';
  });

  it('enqueues LowStockAlert and marks rows as alerted', async () => {
    createInventoryAlertsWorker({}, workerDeps);
    inventoryFindMany.mockResolvedValue([
      {
        id: 'inv_1',
        variantId: 'var_1',
        quantity: 2,
        lowStockThreshold: 5,
        variant: {
          product: {
            name: 'Product 1'
          },
          sku: 'SKU-1',
          name: 'Variant 1'
        }
      }
    ]);
    inventoryUpdateMany.mockResolvedValue({ count: 1 });
    lowStockAlertEventCreateMany.mockResolvedValue({ count: 1 });

    await processor?.({
      name: 'check-low-stock',
      data: {}
    });

    expect(notificationsAdd).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'admin@example.com',
        template: 'LowStockAlert'
      })
    );
    expect(inventoryUpdateMany).toHaveBeenCalledWith({
      where: { id: 'inv_1', lowStockAlerted: false },
      data: { lowStockAlerted: true }
    });
    expect(lowStockAlertEventCreateMany).toHaveBeenCalledWith({
      data: [
        {
          inventoryId: 'inv_1',
          variantId: 'var_1',
          sku: 'SKU-1',
          variantName: 'Variant 1',
          productName: 'Product 1',
          quantity: 2,
          lowStockThreshold: 5
        }
      ]
    });
  });
});
