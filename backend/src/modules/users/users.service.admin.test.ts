import { describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { UsersService } from './users.service';

describe('UsersService admin APIs', () => {
  it('returns admin user list with search and aggregate fields', async () => {
    const fastify = {
      prisma: {
        user: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'user_1',
              email: 'test@example.com',
              phone: '9999999999',
              firstName: 'Test',
              lastName: 'User',
              isVerified: true,
              createdAt: new Date('2026-04-27T00:00:00.000Z')
            }
          ]),
          count: vi.fn().mockResolvedValue(1)
        },
        order: {
          groupBy: vi.fn().mockResolvedValue([
            {
              userId: 'user_1',
              _count: { _all: 3 },
              _sum: { total: 15000 }
            }
          ])
        },
        $transaction: vi
          .fn()
          .mockImplementation(async (queries: Array<Promise<unknown>>) =>
            Promise.all(queries)
          )
      }
    } as unknown as FastifyInstance;

    const service = new UsersService(fastify);
    const result = await service.adminListUsers({ page: 1, limit: 20, search: 'test' });

    expect(result.items[0]).toMatchObject({
      id: 'user_1',
      totalOrders: 3,
      totalSpendPaise: 15000
    });
  });

  it('returns addresses along with admin user detail', async () => {
    const fastify = {
      prisma: {
        user: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'user_1',
            email: 'test@example.com',
            phone: '9999999999',
            firstName: 'Test',
            lastName: 'User',
            isVerified: true,
            createdAt: new Date('2026-04-27T00:00:00.000Z'),
            addresses: [
              {
                id: 'addr_1',
                fullName: 'Test User',
                phone: '9999999999',
                line1: 'Street 1',
                line2: null,
                city: 'Hyderabad',
                state: 'Telangana',
                pincode: '500001',
                isDefault: true
              }
            ],
            orders: []
          })
        }
      }
    } as unknown as FastifyInstance;

    const service = new UsersService(fastify);
    const result = await service.adminGetUserById('user_1');

    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]?.id).toBe('addr_1');
  });

  it('returns shipment projection fields in admin user order detail', async () => {
    const fastify = {
      prisma: {
        user: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'user_2',
            email: 'u2@example.com',
            phone: '9999999998',
            firstName: 'U',
            lastName: 'Two',
            isVerified: true,
            createdAt: new Date('2026-04-27T00:00:00.000Z'),
            addresses: [],
            orders: [
              {
                id: 'order_2',
                orderNumber: 'ORD-2',
                status: 'SHIPPED',
                subtotal: 1000,
                shippingCharge: 0,
                discountAmount: 0,
                total: 1000,
                createdAt: new Date('2026-04-27T00:00:00.000Z'),
                shipment: {
                  status: 'OUT_FOR_DELIVERY',
                  awbNumber: 'AWB2',
                  trackingUrl: 'https://track.example/AWB2',
                  events: [{ status: 'OUT_FOR_DELIVERY', occurredAt: new Date('2026-04-27T10:00:00.000Z') }]
                }
              }
            ]
          })
        }
      }
    } as unknown as FastifyInstance;

    const service = new UsersService(fastify);
    const result = await service.adminGetUserById('user_2');
    expect(result.orders[0]).toMatchObject({
      shipmentStatus: 'OUT_FOR_DELIVERY',
      awb: 'AWB2',
      trackingUrl: 'https://track.example/AWB2',
      latestShipmentEventStatus: 'OUT_FOR_DELIVERY',
      latestShipmentEventAt: '2026-04-27T10:00:00.000Z'
    });
  });
});
