import Fastify from 'fastify';
import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerAnalyticsRoutes } from '../analytics/analytics.routes';
import { registerDashboardRoutes } from '../dashboard/dashboard.routes';
import { registerUsersRoutes } from '../users/users.routes';
import { AnalyticsService } from '../analytics/analytics.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { UsersService } from '../users/users.service';

interface MockError {
  statusCode?: number;
  code?: string;
  message?: string;
}

function createApp() {
  const app = Fastify();
  app.setErrorHandler((err, _request, reply) => {
    const error = err as MockError;
    const statusCode =
      typeof error.statusCode === 'number' ? error.statusCode : 500;
    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: error.message,
        statusCode,
        details: { kind: 'internal', hintKey: 'unknown', retryable: false, remediation: '' }
      }
    });
  });
  app.decorateRequest('jwtVerify', async function () {
    const req = this as unknown as { user?: unknown };
    req.user = { sub: 'admin-1', role: Role.ADMIN, permissions: ['*'] };
  });
  return app;
}

describe('admin routes integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SCOPE_ENFORCEMENT = 'false';
  });

  it('serves admin users list and detail routes', async () => {
    vi.spyOn(UsersService.prototype, 'adminListUsers').mockResolvedValue({
      items: [
        {
          id: 'user_1',
          email: 'user@example.com',
          phone: null,
          firstName: 'User',
          lastName: 'One',
          isBanned: false,
          totalOrders: 0,
          totalSpendPaise: 0,
          createdAt: new Date().toISOString()
        }
      ],
      meta: { page: 1, limit: 20, total: 0, totalPages: 0 }
    });
    vi.spyOn(UsersService.prototype, 'adminGetUserById').mockResolvedValue({
      id: 'user_1',
      email: 'user@example.com',
      phone: null,
      firstName: 'User',
      lastName: 'One',
      isBanned: false,
      bannedAt: null,
      bannedReason: null,
      createdAt: new Date().toISOString(),
      addresses: [],
      orders: []
    });

    const app = createApp();
    await registerUsersRoutes(app);

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users?page=1&limit=20'
    });
    expect(listResponse.statusCode).toBe(200);
    expect(UsersService.prototype.adminListUsers).toHaveBeenCalledTimes(1);

    const detailResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/users/user_1'
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(UsersService.prototype.adminGetUserById).toHaveBeenCalledWith('user_1');

    await app.close();
  });

  it('serves dashboard aggregate routes', async () => {
    vi.spyOn(DashboardService.prototype, 'getKpis').mockResolvedValue({
      period: '7d',
      from: new Date().toISOString(),
      to: new Date().toISOString(),
      ordersCount: 5,
      revenuePaise: 10000,
      averageOrderValuePaise: 2000,
      customersCount: 3
    });
    vi.spyOn(DashboardService.prototype, 'getSalesChart').mockResolvedValue({
      granularity: 'day',
      points: [{ bucket: '2026-04-26', ordersCount: 1, revenuePaise: 1000 }]
    });
    vi.spyOn(DashboardService.prototype, 'getTopProducts').mockResolvedValue({
      items: [
        {
          variantId: 'var_1',
          productName: 'Product',
          variantName: 'Variant',
          quantitySold: 1,
          revenuePaise: 1000
        }
      ]
    });

    const app = createApp();
    await registerDashboardRoutes(app);

    const kpisResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard/kpis?period=7d'
    });
    expect(kpisResponse.statusCode).toBe(200);

    const salesResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard/sales-chart?granularity=day'
    });
    expect(salesResponse.statusCode).toBe(200);

    const topProductsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard/top-products?limit=10'
    });
    expect(topProductsResponse.statusCode).toBe(200);
    expect(DashboardService.prototype.getTopProducts).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('serves analytics routes', async () => {
    vi.spyOn(AnalyticsService.prototype, 'getRevenue').mockResolvedValue({
      granularity: 'day',
      points: [{ bucket: '2026-04-26', revenuePaise: 1000, ordersCount: 1 }]
    });
    vi.spyOn(AnalyticsService.prototype, 'exportRevenueCsv').mockResolvedValue('"bucket","ordersCount","revenuePaise"\n"2026-04-26","1","1000"');
    vi.spyOn(AnalyticsService.prototype, 'getFunnel').mockResolvedValue({
      steps: [{ eventType: 'ADD_TO_CART', count: 5, conversionRatePercent: 100 }]
    });
    vi.spyOn(AnalyticsService.prototype, 'getInventoryAlerts').mockResolvedValue({
      items: []
    });
    vi.spyOn(AnalyticsService.prototype, 'getNotificationDeliveryStats').mockResolvedValue({
      channels: [{ channel: 'EMAIL', total: 10, sent: 9, failed: 1, deliveryRatePercent: 90 }]
    });
    vi.spyOn(AnalyticsService.prototype, 'getCategoryBreakdown').mockResolvedValue({
      items: [{ categoryId: 'cat_1', categoryName: 'Snacks', revenuePaise: 1000, sharePercent: 100 }]
    });

    const app = createApp();
    await registerAnalyticsRoutes(app);

    const revenueResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/revenue?granularity=day'
    });
    expect(revenueResponse.statusCode).toBe(200);

    const funnelResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/funnel'
    });
    expect(funnelResponse.statusCode).toBe(200);

    const revenueExportResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/revenue/export?granularity=day'
    });
    expect(revenueExportResponse.statusCode).toBe(200);

    const inventoryResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/inventory-alerts'
    });
    expect(inventoryResponse.statusCode).toBe(200);

    const notificationsResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/notifications'
    });
    expect(notificationsResponse.statusCode).toBe(200);
    expect(AnalyticsService.prototype.getNotificationDeliveryStats).toHaveBeenCalledTimes(1);

    const categoryBreakdownResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/category-breakdown'
    });
    expect(categoryBreakdownResponse.statusCode).toBe(200);
    expect(AnalyticsService.prototype.getCategoryBreakdown).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

