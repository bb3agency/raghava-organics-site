import { OrderStatus, PaymentStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { OrdersService } from './orders.service';
import { CartService } from '@modules/cart/cart.service';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function baseQueues() {
  return {
    analytics: { add: vi.fn() },
    shipping: { add: vi.fn() },
    orderProcessing: { add: vi.fn() },
    refunds: { add: vi.fn() },
    notifications: { add: vi.fn() }
  };
}

function baseLog() {
  return { error: vi.fn(), warn: vi.fn() };
}

// ---------------------------------------------------------------------------
// createOrder — COD path
// ---------------------------------------------------------------------------

describe('OrdersService createOrder — COD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(CartService.prototype, 'checkPincodeServiceability').mockResolvedValue({
      pincode: '500001',
      serviceable: true
    });
    vi.spyOn(CartService.prototype, 'getDeliveryRates').mockResolvedValue({
      pincode: '500001',
      shippingCharge: 0,
      estimatedDays: 2
    });
  });

  function buildTx(isCodEnabled: boolean) {
    return {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1n }]),
      address: { findFirst: vi.fn().mockResolvedValue({ id: 'addr_1', userId: 'user_1', fullName: 'Test', phone: '9999999999', line1: 'L1', city: 'Hyd', state: 'TG', pincode: '500001', line2: null }) },
      cart: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'cart_1',
          coupon: null,
          items: [{
            variantId: 'v1', quantity: 1, priceSnapshot: 10000,
            variant: { id: 'v1', name: 'V1', sku: 'SKU-1', productId: 'p1', product: { categoryId: 'c1' }, inventory: { quantity: 5 } }
          }]
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      storeSettings: {
        findUnique: vi.fn().mockResolvedValue({ isCodEnabled, cancellationWindowHours: 24 })
      },
      order: {
        create: vi.fn().mockResolvedValue({ id: 'order_1', status: isCodEnabled ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'order_1', orderNumber: 'ORD-2026-00001', userId: 'user_1',
          status: isCodEnabled ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT,
          shippingAddress: { fullName: 'Test', phone: '9999999999', line1: 'L1', city: 'Hyd', state: 'TG', pincode: '500001' },
          subtotal: 10000, shippingCharge: 0, discountAmount: 0, total: 10000, notes: null,
          createdAt: new Date(), updatedAt: new Date(),
          items: [{ id: 'oi_1', variantId: 'v1', productName: 'V1', variantName: 'V1', sku: 'SKU-1', quantity: 1, unitPrice: 10000, totalPrice: 10000 }],
          statusHistory: [], payment: null, shipment: null, creditNotes: [], invoice: null, customer: null
        })
      },
      orderItem: { create: vi.fn().mockResolvedValue(undefined) },
      orderStatusHistory: { create: vi.fn().mockResolvedValue(undefined) },
      cartItem: { deleteMany: vi.fn().mockResolvedValue(undefined) },
      payment: { create: vi.fn().mockResolvedValue({ id: 'pay_1' }) }
    };
  }

  it('rejects COD order when isCodEnabled is false', async () => {
    const tx = buildTx(false);
    const fastify = {
      prisma: {
        order: { count: vi.fn().mockResolvedValue(0) },
        storeSettings: { findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 }) },
        address: { findFirst: vi.fn().mockResolvedValue({ id: 'addr_1', userId: 'user_1', pincode: '500001', fullName: 'Test', phone: '9999999999', line1: 'L1', city: 'Hyd', state: 'TG', line2: null }) },
        $transaction: vi.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);
    await expect(
      service.createOrder('user_1', { addressId: 'addr_1', paymentMode: 'COD' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('creates COD order with CONFIRMED status and payment record when enabled', async () => {
    const tx = buildTx(true);
    const fastify = {
      prisma: {
        order: { count: vi.fn().mockResolvedValue(0) },
        storeSettings: { findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 }) },
        address: { findFirst: vi.fn().mockResolvedValue({ id: 'addr_1', userId: 'user_1', pincode: '500001', fullName: 'Test', phone: '9999999999', line1: 'L1', city: 'Hyd', state: 'TG', line2: null }) },
        $transaction: vi.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);
    await service.createOrder('user_1', { addressId: 'addr_1', paymentMode: 'COD' });

    expect(tx.payment.create).toHaveBeenCalledOnce();
    const paymentCallArg = tx.payment.create.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
    expect(paymentCallArg?.data['provider']).toBe('COD');
  });

  it('creates PREPAID order with PENDING_PAYMENT status and no COD payment record', async () => {
    const tx = buildTx(false);
    // override: storeSettings not needed for prepaid
    tx.storeSettings.findUnique.mockResolvedValue({ isCodEnabled: false, cancellationWindowHours: 24 });
    const fastify = {
      prisma: {
        order: { count: vi.fn().mockResolvedValue(0) },
        storeSettings: { findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 }) },
        address: { findFirst: vi.fn().mockResolvedValue({ id: 'addr_1', userId: 'user_1', pincode: '500001', fullName: 'Test', phone: '9999999999', line1: 'L1', city: 'Hyd', state: 'TG', line2: null }) },
        $transaction: vi.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);
    await service.createOrder('user_1', { addressId: 'addr_1' }); // default PREPAID
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// retryPayment
// ---------------------------------------------------------------------------

describe('OrdersService retryPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildFastifyWithOrder(opts: { status: OrderStatus; paymentMode?: string }) {
    return {
      prisma: {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'order_1',
            userId: 'user_1',
            status: opts.status,
            paymentMode: opts.paymentMode ?? 'PREPAID',
            payment: { id: 'pay_1', status: PaymentStatus.FAILED, providerOrderId: 'rpay_1', amount: 10000, currency: 'INR' }
          })
        },
        storeSettings: { findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 }) }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;
  }

  it('throws VALIDATION_ERROR for COD orders', async () => {
    const fastify = buildFastifyWithOrder({ status: OrderStatus.PAYMENT_FAILED, paymentMode: 'COD' });
    const service = new OrdersService(fastify);
    await expect(service.retryPayment('user_1', 'order_1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400
    });
  });

  it('throws INVALID_STATUS_TRANSITION for non-payment-failed orders', async () => {
    const fastify = buildFastifyWithOrder({ status: OrderStatus.DELIVERED });
    const service = new OrdersService(fastify);
    await expect(service.retryPayment('user_1', 'order_1')).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
      statusCode: 409
    });
  });

  it('throws NOT_FOUND when order does not belong to user', async () => {
    const fastify = {
      prisma: {
        order: { findFirst: vi.fn().mockResolvedValue(null) },
        storeSettings: { findUnique: vi.fn().mockResolvedValue({ minOrderValuePaise: 0 }) }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;
    const service = new OrdersService(fastify);
    await expect(service.retryPayment('user_1', 'order_999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404
    });
  });
});

// ---------------------------------------------------------------------------
// createReturnRequest
// ---------------------------------------------------------------------------

describe('OrdersService createReturnRequest', () => {
  beforeEach(() => vi.clearAllMocks());

  const deliveredOrder = {
    id: 'order_1',
    userId: 'user_1',
    status: OrderStatus.DELIVERED,
    items: [
      { id: 'oi_1', quantity: 2 },
      { id: 'oi_2', quantity: 1 }
    ],
    payment: { id: 'pay_1', status: PaymentStatus.CAPTURED }
  };

  it('throws INVALID_STATUS_TRANSITION for non-DELIVERED orders', async () => {
    const fastify = {
      prisma: {
        order: {
          findFirst: vi.fn().mockResolvedValue({ ...deliveredOrder, status: OrderStatus.CONFIRMED })
        }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;
    const service = new OrdersService(fastify);
    await expect(
      service.createReturnRequest('user_1', 'order_1', { items: [{ orderItemId: 'oi_1', quantity: 1 }], reason: 'damaged' })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION', statusCode: 409 });
  });

  it('throws VALIDATION_ERROR for quantity exceeding ordered amount', async () => {
    const returnRequestCreate = vi.fn();
    const fastify = {
      prisma: {
        order: { findFirst: vi.fn().mockResolvedValue(deliveredOrder) },
        returnRequest: { create: returnRequestCreate }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;
    const service = new OrdersService(fastify);
    await expect(
      service.createReturnRequest('user_1', 'order_1', { items: [{ orderItemId: 'oi_1', quantity: 99 }], reason: 'damaged' })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
    expect(returnRequestCreate).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for unknown orderItemId', async () => {
    const fastify = {
      prisma: {
        order: { findFirst: vi.fn().mockResolvedValue(deliveredOrder) }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;
    const service = new OrdersService(fastify);
    await expect(
      service.createReturnRequest('user_1', 'order_1', { items: [{ orderItemId: 'oi_999', quantity: 1 }], reason: 'wrong item' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('creates return request with REQUESTED status for valid input', async () => {
    const returnRequestCreate = vi.fn().mockResolvedValue({
      id: 'rr_1',
      orderId: 'order_1',
      status: 'REQUESTED',
      reason: 'damaged',
      createdAt: new Date()
    });
    const fastify = {
      prisma: {
        order: { findFirst: vi.fn().mockResolvedValue(deliveredOrder) },
        returnRequest: { create: returnRequestCreate }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;
    const service = new OrdersService(fastify);
    const result = await service.createReturnRequest('user_1', 'order_1', {
      items: [{ orderItemId: 'oi_1', quantity: 1 }],
      reason: 'damaged'
    });
    expect(result.status).toBe('REQUESTED');
    expect(result.orderId).toBe('order_1');
    expect(returnRequestCreate).toHaveBeenCalledOnce();
  });
});

describe('OrdersService admin return-request operations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND when admin updates missing return request', async () => {
    const fastify = {
      prisma: {
        returnRequest: {
          findUnique: vi.fn().mockResolvedValue(null)
        }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);
    await expect(
      service.adminUpdateReturnRequest('admin_1', 'rr_missing', { status: 'APPROVED' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('updates return request status with admin attribution', async () => {
    const returnRequestUpdate = vi.fn().mockResolvedValue({
      id: 'rr_1',
      orderId: 'order_1',
      status: 'APPROVED',
      adminNote: 'approved [admin:admin_1]',
      updatedAt: new Date()
    });
    const fastify = {
      prisma: {
        returnRequest: {
          findUnique: vi.fn().mockResolvedValue({ id: 'rr_1' }),
          update: returnRequestUpdate
        }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);
    const result = await service.adminUpdateReturnRequest('admin_1', 'rr_1', {
      status: 'APPROVED',
      adminNote: 'approved'
    });

    expect(result.status).toBe('APPROVED');
    expect(returnRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rr_1' },
        data: expect.objectContaining({
          status: 'APPROVED',
          adminNote: expect.stringContaining('[admin:admin_1]')
        })
      })
    );
  });

  it('lists return requests with mapped customer payload', async () => {
    const fastify = {
      prisma: {
        returnRequest: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'rr_1',
              orderId: 'order_1',
              order: { orderNumber: 'ORD-2026-00001' },
              userId: 'user_1',
              user: { email: 'user@example.com', firstName: 'Ada', lastName: 'Lovelace' },
              status: 'REQUESTED',
              reason: 'damaged',
              createdAt: new Date()
            }
          ]),
          count: vi.fn().mockResolvedValue(1)
        }
      },
      log: baseLog(),
      queues: baseQueues(),
      redis: { set: vi.fn() }
    } as unknown as FastifyInstance;

    const service = new OrdersService(fastify);
    const result = await service.adminListReturnRequests({ status: 'REQUESTED', page: 1, limit: 20 });

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'rr_1',
        orderId: 'order_1',
        orderNumber: 'ORD-2026-00001',
        userId: 'user_1',
        customerEmail: 'user@example.com',
        customerName: 'Ada Lovelace',
        status: 'REQUESTED',
        reason: 'damaged'
      })
    );
  });
});

// ---------------------------------------------------------------------------
// cancelMyOrder — cancellation window enforcement
// ---------------------------------------------------------------------------

describe('OrdersService cancelMyOrder — cancellation window', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildCancelFastify(createdAt: Date, windowHours: number) {
    const tx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'order_1',
          userId: 'user_1',
          status: OrderStatus.CONFIRMED,
          createdAt,
          payment: null
        }),
        update: vi.fn().mockResolvedValue({ id: 'order_1', status: OrderStatus.CANCELLED }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'order_1', orderNumber: 'ORD-2026-00001', userId: 'user_1',
          status: OrderStatus.CANCELLED,
          shippingAddress: {}, subtotal: 0, shippingCharge: 0, discountAmount: 0, total: 0,
          notes: null, createdAt, updatedAt: new Date(),
          items: [], statusHistory: [], payment: null, shipment: null, creditNotes: [], invoice: null, customer: null
        })
      },
      storeSettings: {
        findUnique: vi.fn().mockResolvedValue({ cancellationWindowHours: windowHours })
      },
      orderStatusHistory: { create: vi.fn().mockResolvedValue(undefined) }
    };
    return {
      fastify: {
        prisma: {
          $transaction: vi.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx))
        },
        log: baseLog(),
        queues: baseQueues(),
        redis: { set: vi.fn() }
      } as unknown as FastifyInstance,
      tx
    };
  }

  it('allows cancellation within the window', async () => {
    const recentlyCreated = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    const { fastify, tx } = buildCancelFastify(recentlyCreated, 24);
    const service = new OrdersService(fastify);
    await service.cancelMyOrder('user_1', 'order_1', { reason: 'changed mind' });
    expect(tx.order.update).toHaveBeenCalledOnce();
  });

  it('rejects cancellation after window expires', async () => {
    const oldOrder = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const { fastify } = buildCancelFastify(oldOrder, 24);
    const service = new OrdersService(fastify);
    await expect(
      service.cancelMyOrder('user_1', 'order_1', { reason: 'changed mind' })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION', statusCode: 409 });
  });

  it('respects custom window from store settings', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { fastify, tx } = buildCancelFastify(twoHoursAgo, 3); // 3-hour window
    const service = new OrdersService(fastify);
    await service.cancelMyOrder('user_1', 'order_1', { reason: 'changed mind' });
    expect(tx.order.update).toHaveBeenCalledOnce();
  });

  it('rejects if window is 1h and order is 2h old', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { fastify } = buildCancelFastify(twoHoursAgo, 1);
    const service = new OrdersService(fastify);
    await expect(
      service.cancelMyOrder('user_1', 'order_1', { reason: 'changed mind' })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS_TRANSITION', statusCode: 409 });
  });
});
