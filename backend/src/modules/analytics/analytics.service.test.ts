import { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';

function createAnalyticsServiceHarness() {
  const orderFindManyMock = vi.fn();
  const analyticsGroupByMock = vi.fn();
  const inventoryFindManyMock = vi.fn();
  const lowStockAlertEventFindManyMock = vi.fn();
  const notificationGroupByMock = vi.fn();

  const fastify = {
    prisma: {
      order: {
        findMany: orderFindManyMock
      },
      analyticsEvent: {
        groupBy: analyticsGroupByMock
      },
      inventory: {
        findMany: inventoryFindManyMock
      },
      lowStockAlertEvent: {
        findMany: lowStockAlertEventFindManyMock
      },
      notificationLog: {
        groupBy: notificationGroupByMock
      }
    }
  } as unknown as FastifyInstance;

  return {
    service: new AnalyticsService(fastify),
    orderFindManyMock,
    analyticsGroupByMock,
    inventoryFindManyMock,
    lowStockAlertEventFindManyMock,
    notificationGroupByMock
  };
}

describe('AnalyticsService date-window and empty-data behavior', () => {
  it('throws validation error when date range is invalid', async () => {
    const { service } = createAnalyticsServiceHarness();

    await expect(
      service.getRevenue({
        from: '2026-04-27T00:00:00.000Z',
        to: '2026-04-26T00:00:00.000Z',
        granularity: 'day'
      })
    ).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('returns empty revenue points for no orders', async () => {
    const { service, orderFindManyMock } = createAnalyticsServiceHarness();
    orderFindManyMock.mockResolvedValue([]);

    const result = await service.getRevenue({ granularity: 'day' });

    expect(result.points).toEqual([]);
  });

  it('buckets revenue correctly at UTC hour boundaries', async () => {
    const { service, orderFindManyMock } = createAnalyticsServiceHarness();
    orderFindManyMock.mockResolvedValue([
      {
        createdAt: new Date('2026-04-26T10:59:59.000Z'),
        total: 1000
      },
      {
        createdAt: new Date('2026-04-26T11:00:00.000Z'),
        total: 2000
      },
      {
        createdAt: new Date('2026-04-26T11:10:00.000Z'),
        total: 500
      }
    ]);

    const result = await service.getRevenue({ granularity: 'hour' });

    expect(result.points).toEqual([
      { bucket: '2026-04-26T10', revenuePaise: 1000, ordersCount: 1 },
      { bucket: '2026-04-26T11', revenuePaise: 2500, ordersCount: 2 }
    ]);
  });

  it('buckets revenue week granularity using monday UTC start', async () => {
    const { service, orderFindManyMock } = createAnalyticsServiceHarness();
    orderFindManyMock.mockResolvedValue([
      {
        createdAt: new Date('2026-04-26T12:00:00.000Z'),
        total: 1000
      },
      {
        createdAt: new Date('2026-04-27T01:00:00.000Z'),
        total: 2000
      }
    ]);

    const result = await service.getRevenue({ granularity: 'week' });

    expect(result.points).toEqual([
      { bucket: '2026-04-20', revenuePaise: 1000, ordersCount: 1 },
      { bucket: '2026-04-27', revenuePaise: 2000, ordersCount: 1 }
    ]);
  });

  it('returns zeroed funnel conversion when no events exist', async () => {
    const { service, analyticsGroupByMock } = createAnalyticsServiceHarness();
    analyticsGroupByMock.mockResolvedValue([]);

    const result = await service.getFunnel({});

    expect(result.steps).toHaveLength(5);
    for (const step of result.steps) {
      expect(step.count).toBe(0);
      expect(step.conversionRatePercent).toBe(0);
    }
  });

  it('returns empty inventory alerts when all variants are above threshold', async () => {
    const { service, lowStockAlertEventFindManyMock } = createAnalyticsServiceHarness();
    lowStockAlertEventFindManyMock.mockResolvedValue([]);

    const result = await service.getInventoryAlerts();

    expect(result.items).toEqual([]);
  });

  it('returns empty channels when notification logs are absent', async () => {
    const { service, notificationGroupByMock } = createAnalyticsServiceHarness();
    notificationGroupByMock.mockResolvedValue([]);

    const result = await service.getNotificationDeliveryStats({});

    expect(result.channels).toEqual([]);
  });

  it('returns category revenue breakdown with share percentages', async () => {
    const { service, orderFindManyMock } = createAnalyticsServiceHarness();
    orderFindManyMock.mockResolvedValue([
      {
        items: [
          {
            totalPrice: 700,
            variant: {
              product: {
                categoryId: 'cat_1',
                category: { name: 'Snacks' }
              }
            }
          },
          {
            totalPrice: 300,
            variant: {
              product: {
                categoryId: 'cat_2',
                category: { name: 'Beverages' }
              }
            }
          }
        ]
      }
    ]);

    const result = await service.getCategoryBreakdown({});

    expect(result.items).toEqual([
      { categoryId: 'cat_1', categoryName: 'Snacks', revenuePaise: 700, sharePercent: 70 },
      { categoryId: 'cat_2', categoryName: 'Beverages', revenuePaise: 300, sharePercent: 30 }
    ]);
  });

  it('exports revenue report as CSV', async () => {
    const { service, orderFindManyMock } = createAnalyticsServiceHarness();
    orderFindManyMock.mockResolvedValue([
      {
        createdAt: new Date('2026-04-26T10:00:00.000Z'),
        total: 1000
      }
    ]);

    const csv = await service.exportRevenueCsv({ granularity: 'day' });
    expect(csv).toContain('"bucket","ordersCount","revenuePaise"');
    expect(csv).toContain('"2026-04-26","1","1000"');
  });
});

