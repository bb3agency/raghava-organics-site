import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let failedHandler: ((job: unknown, error: Error) => void) | undefined;

const state = {
  processor: undefined as undefined | ((job: { name: string; data: unknown }) => Promise<void>),
  notificationsAdd: vi.fn(),
  createShipment: vi.fn(),
  tx: {
    shipment: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn()
    },
    shipmentEvent: {
      create: vi.fn()
    },
    productVariant: {
      findMany: vi.fn()
    },
    storeSettings: {
      findUnique: vi.fn()
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    orderStatusHistory: {
      create: vi.fn()
    },
    payment: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
};

function MockWorker(_name: string, processor: (job: { name: string; data: unknown }) => Promise<void>) {
  state.processor = processor;
  return { on: (event: string, handler: (job: unknown, error: Error) => void) => { if (event === 'failed') failedHandler = handler; } };
}

function MockPrismaClient() {
  return {
    order: {
      findUnique: state.tx.order.findUnique
    },
    storeSettings: {
      findUnique: state.tx.storeSettings.findUnique
    },
    productVariant: {
      findMany: state.tx.productVariant.findMany
    },
    $transaction<T>(fn: (tx: typeof state.tx) => Promise<T>) {
      return fn(state.tx);
    }
  };
}

function mockCreateShippingProvider() {
  return {
    createShipment: state.createShipment,
    trackShipment: vi.fn(),
    cancelShipment: vi.fn(),
    checkServiceability: vi.fn(),
    calculateDeliveryRate: vi.fn()
  };
}

import { createShippingWorker } from './shipping.worker';
import { DEFAULT_SHIPPING_HSN_FALLBACK } from '@common/shipping/resolve-shipping-hsn';
import { featureFlags } from '../../src/config/feature-flags';

describe('shipping worker error and retry behavior', () => {
  let originalGstInvoicingFlag: boolean;
  const mockConnection = {} as Parameters<typeof createShippingWorker>[0];
  type NotificationsQueueArg = Parameters<typeof createShippingWorker>[1];
  type ShippingDeps = NonNullable<Parameters<typeof createShippingWorker>[2]>;
  type ShippingWorkerType = NonNullable<ShippingDeps['Worker']>;
  type ShippingPrismaType = NonNullable<ShippingDeps['PrismaClient']>;
  const mockNotificationsQueue = { add: state.notificationsAdd } as unknown as NotificationsQueueArg;
  const sendTechnicalFailureAlert = vi.fn().mockResolvedValue(undefined);

  const shippingDeps = {
    Worker: MockWorker as unknown as ShippingWorkerType,
    PrismaClient: MockPrismaClient as unknown as ShippingPrismaType,
    createShippingProvider: mockCreateShippingProvider,
    sendTechnicalFailureAlert
  };
  const boot = () =>
    createShippingWorker(mockConnection, mockNotificationsQueue, shippingDeps);

  beforeEach(() => {
    originalGstInvoicingFlag = featureFlags.gstInvoicing;
    featureFlags.gstInvoicing = true;
    failedHandler = undefined;
    sendTechnicalFailureAlert.mockReset();
    process.env.DELHIVERY_PICKUP_PINCODE = '500001';
    state.processor = undefined;
    state.createShipment.mockReset();
    state.tx.shipment.findFirst.mockReset();
    state.tx.shipment.update.mockReset();
    state.tx.shipment.create.mockReset();
    state.tx.shipmentEvent.create.mockReset();
    state.tx.productVariant.findMany.mockReset();
    state.tx.storeSettings.findUnique.mockReset();
    state.tx.order.findUnique.mockReset();
    state.tx.order.update.mockReset();
    state.tx.orderStatusHistory.create.mockReset();
    state.tx.payment.findUnique.mockReset();
    state.tx.payment.update.mockReset();
    state.notificationsAdd.mockReset();
    state.tx.storeSettings.findUnique.mockResolvedValue({
      pickupPincode: '500001',
      contactEmail: 'admin@example.com',
      gstin: '29ABCDE1234F1Z5'
    });
  });

  afterEach(() => {
    featureFlags.gstInvoicing = originalGstInvoicingFlag;
  });

  it('creates shipment and marks order shipped for create-shipment job', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_1',
      orderNumber: 'ORD-2026-00001',
      total: 1000,
      status: 'PROCESSING',
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001'
      },
      payment: { status: 'CAPTURED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 2, productName: 'Test Product', sku: 'SKU-1', unitPrice: 500 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      { id: 'variant_1', weight: 300, product: { attributes: { hsnCode: '1001' } } }
    ]);
    state.createShipment.mockResolvedValue({
      awbNumber: 'AWB123',
      trackingUrl: 'https://track.example/AWB123',
      providerPayload: { ok: true }
    });
    state.tx.shipment.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'create-shipment',
      data: { orderId: 'order_1' }
    });

    expect(state.createShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 'ORD-2026-00001',
        paymentMode: 'Prepaid',
        sellerGstTin: '29ABCDE1234F1Z5',
        hsnCode: '1001',
        items: [
          expect.objectContaining({
            name: 'Test Product',
            sku: 'SKU-1',
            hsnCode: '1001'
          })
        ]
      })
    );
    expect(state.tx.shipment.create).toHaveBeenCalledTimes(1);
    expect(state.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { status: 'SHIPPED' }
    });
  });

  it('uses default shipping HSN when product attributes omit hsnCode and GST invoicing is disabled', async () => {
    featureFlags.gstInvoicing = false;
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_no_hsn',
      orderNumber: 'ORD-2026-00003',
      total: 1000,
      status: 'PROCESSING',
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001'
      },
      payment: { status: 'CAPTURED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 1, productName: 'test-product', sku: 'TEST-SKU', unitPrice: 1000 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      { id: 'variant_1', weight: 300, hsnCode: null, product: { attributes: {} } }
    ]);
    state.createShipment.mockResolvedValue({
      awbNumber: 'AWB456',
      trackingUrl: 'https://track.example/AWB456',
      providerPayload: { ok: true }
    });
    state.tx.shipment.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'create-shipment',
      data: { orderId: 'order_no_hsn' }
    });

    expect(state.createShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        hsnCode: DEFAULT_SHIPPING_HSN_FALLBACK,
        items: [
          expect.objectContaining({
            name: 'test-product',
            hsnCode: DEFAULT_SHIPPING_HSN_FALLBACK
          })
        ]
      })
    );
  });

  it('throws when shipping phone is not a valid 10-digit Indian number', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_bad_phone',
      orderNumber: 'ORD-2026-00006',
      total: 1000,
      status: 'PROCESSING',
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '12345',
        line1: 'Street 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001'
      },
      payment: { status: 'CAPTURED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 1, productName: 'test-product', sku: 'TEST-SKU', unitPrice: 1000, totalPrice: 1000 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      { id: 'variant_1', weight: 300, hsnCode: '1001', product: { attributes: {} } }
    ]);

    await expect(
      state.processor?.({
        name: 'create-shipment',
        data: { orderId: 'order_bad_phone' }
      })
    ).rejects.toThrow('Invalid shipping phone for shipment booking');
    expect(state.createShipment).not.toHaveBeenCalled();
  });

  it('throws when GST invoicing is enabled and products omit explicit HSN codes', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_no_hsn_gst',
      orderNumber: 'ORD-2026-00005',
      total: 1000,
      status: 'PROCESSING',
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001'
      },
      payment: { status: 'CAPTURED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 1, productName: 'test-product', sku: 'TEST-SKU', unitPrice: 1000 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      { id: 'variant_1', weight: 300, hsnCode: null, product: { attributes: {} } }
    ]);

    await expect(
      state.processor?.({
        name: 'create-shipment',
        data: { orderId: 'order_no_hsn_gst' }
      })
    ).rejects.toThrow('Missing product HSN code(s) for shipment booking');
    expect(state.createShipment).not.toHaveBeenCalled();
  });

  it('prefers variant hsnCode over product attributes when building shipment items', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_variant_hsn',
      orderNumber: 'ORD-2026-00004',
      total: 1000,
      status: 'PROCESSING',
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001'
      },
      payment: { status: 'CAPTURED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 1, productName: 'Spice Mix', sku: 'SPICE-1', unitPrice: 1000 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      {
        id: 'variant_1',
        weight: 300,
        hsnCode: '3304',
        product: { attributes: { hsnCode: '1001' } }
      }
    ]);
    state.createShipment.mockResolvedValue({
      awbNumber: 'AWB3304',
      trackingUrl: 'https://track.example/AWB3304',
      providerPayload: { ok: true }
    });
    state.tx.shipment.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'create-shipment',
      data: { orderId: 'order_variant_hsn' }
    });

    expect(state.createShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        hsnCode: '3304',
        items: [expect.objectContaining({ hsnCode: '3304' })]
      })
    );
  });

  it('throws when creating shipment before payment capture', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_2',
      orderNumber: 'ORD-2026-00002',
      total: 1000,
      status: 'PROCESSING',
      shippingAddress: {
        fullName: 'Test Customer',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001'
      },
      payment: { status: 'CREATED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 1, productName: 'Test Product', sku: 'SKU-1', unitPrice: 500 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      { id: 'variant_1', weight: 300, product: { attributes: { hsnCode: '1001' } } }
    ]);

    await expect(
      state.processor?.({
        name: 'create-shipment',
        data: { orderId: 'order_2' }
      })
    ).rejects.toThrow('Shipment booking requires captured payment for prepaid orders');
    expect(state.createShipment).not.toHaveBeenCalled();
  });

  it('creates COD shipment without requiring CAPTURED payment', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue({
      id: 'order_cod',
      orderNumber: 'ORD-2026-00099',
      total: 50000,
      status: 'PROCESSING',
      paymentMode: 'COD',
      shippingAddress: {
        fullName: 'COD Buyer',
        phone: '8888888888',
        line1: 'COD Street',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001'
      },
      payment: { status: 'CREATED' },
      shipment: null,
      items: [{ variantId: 'variant_1', quantity: 1, productName: 'Test Product', sku: 'SKU-1', unitPrice: 500 }]
    });
    state.tx.productVariant.findMany.mockResolvedValue([
      { id: 'variant_1', weight: 400, product: { attributes: { hsnCode: '6109' } } }
    ]);
    state.createShipment.mockResolvedValue({
      awbNumber: 'AWB-COD-123',
      trackingUrl: 'https://track.example/AWB-COD-123',
      providerPayload: { ok: true }
    });
    state.tx.shipment.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'create-shipment',
      data: { orderId: 'order_cod' }
    });

    expect(state.createShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMode: 'COD'
      })
    );
    expect(state.tx.shipment.create).toHaveBeenCalledTimes(1);
  });

  it('ignores create-shipment when order is missing', async () => {
    boot();
    state.tx.order.findUnique.mockResolvedValue(null);

    await state.processor?.({
      name: 'create-shipment',
      data: { orderId: 'missing-order' }
    });

    expect(state.createShipment).not.toHaveBeenCalled();
    expect(state.tx.shipment.create).not.toHaveBeenCalled();
    expect(state.tx.order.update).not.toHaveBeenCalled();
  });

  it('returns without changes when shipment is missing', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue(null);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_1',
        status: 'In Transit',
        description: 'moving',
        location: 'Hub',
        occurredAt: new Date().toISOString(),
        payload: '{}'
      }
    });

    expect(state.tx.shipment.update).not.toHaveBeenCalled();
    expect(state.tx.shipmentEvent.create).not.toHaveBeenCalled();
  });

  it('resolves shipment by shiprocketShipmentId when awb is absent', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_sr',
      awbNumber: 'AWB-SR-001',
      trackingUrl: 'https://track.example/AWB-SR-001',
      order: {
        id: 'order_sr',
        status: 'SHIPPED',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: '',
        shiprocketShipmentId: '67890',
        status: 'IN TRANSIT',
        description: 'Moving',
        location: 'Hub',
        occurredAt: new Date().toISOString(),
        payload: '{}'
      }
    });

    expect(state.tx.shipment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ shiprocketShipmentId: '67890' }]
        }
      })
    );
    expect(state.tx.shipmentEvent.create).toHaveBeenCalled();
  });

  it('throws when shipment update fails so BullMQ can retry', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'SHIPPED',
        user: {
          email: 'test@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockRejectedValue(new Error('temporary shipping db error'));

    await expect(
      state.processor?.({
        name: 'update-shipment-status',
        data: {
          awb: 'awb_1',
          status: 'In Transit',
          description: 'moving',
          location: 'Hub',
          occurredAt: new Date().toISOString(),
          payload: '{}'
        }
      })
    ).rejects.toThrow('temporary shipping db error');
  });

  it('updates shipment and order timeline for out-for-delivery webhook', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'SHIPPED',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_1',
        status: 'Out For Delivery',
        description: 'on route',
        location: 'Last mile hub',
        occurredAt: '2026-04-26T13:00:00.000Z',
        payload: '{"awb":"awb_1"}'
      }
    });

    expect(state.tx.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'OUT_FOR_DELIVERY'
        })
      })
    );
    expect(state.tx.shipmentEvent.create).toHaveBeenCalledTimes(1);
    expect(state.tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order_1' },
      data: { status: 'OUT_FOR_DELIVERY' }
    });
    expect(state.tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order_1',
          fromStatus: 'SHIPPED',
          toStatus: 'OUT_FOR_DELIVERY'
        })
      })
    );
    expect(state.notificationsAdd).toHaveBeenCalledWith(
      'send-primary',
      expect.objectContaining({
        email: 'customer@example.com',
        phone: '9999999999',
        template: 'OutForDelivery'
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('shipping:primary:order_1:out-for-delivery')
      })
    );
  });

  it('accepts legacy shipment-webhook job name for backward compatibility', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'SHIPPED',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'shipment-webhook',
      data: {
        awb: 'awb_legacy',
        status: 'In Transit',
        description: 'legacy payload',
        location: 'Hub',
        occurredAt: '2026-04-26T13:00:00.000Z',
        payload: '{"awb":"awb_legacy"}'
      }
    });

    expect(state.tx.shipment.update).toHaveBeenCalledTimes(1);
    expect(state.tx.shipmentEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not coerce unknown shipment statuses to in_transit', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'SHIPPED',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_legacy',
        status: 'UNKNOWN_VENDOR_STATE',
        description: 'legacy payload',
        location: 'Hub',
        occurredAt: '2026-04-26T13:00:00.000Z',
        payload: '{"awb":"awb_legacy"}'
      }
    });

    expect(state.tx.shipment.update).toHaveBeenCalledWith({
      where: { id: 'shipment_1' },
      data: {
        webhookPayload: expect.objectContaining({
          awb: 'awb_legacy',
          status: 'UNKNOWN_VENDOR_STATE',
          occurredAt: '2026-04-26T13:00:00.000Z'
        })
      }
    });
    expect(state.tx.order.update).not.toHaveBeenCalled();
    expect(state.notificationsAdd).not.toHaveBeenCalled();
  });

  it('enqueues delivered primary notification', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'OUT_FOR_DELIVERY',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_1',
        status: 'Delivered',
        description: 'delivered',
        location: 'Customer doorstep',
        occurredAt: '2026-04-26T13:00:00.000Z',
        payload: '{"awb":"awb_1"}'
      }
    });

    expect(state.notificationsAdd).toHaveBeenCalledWith(
      'send-primary',
      expect.objectContaining({
        email: 'customer@example.com',
        phone: '9999999999',
        template: 'OrderDelivered'
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('shipping:primary:order_1:delivered')
      })
    );
  });

  it('enqueues failed-delivery primary notification', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'OUT_FOR_DELIVERY',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_1',
        status: 'FAILED_DELIVERY',
        description: 'delivery attempt failed',
        location: 'Customer address',
        occurredAt: '2026-04-26T13:00:00.000Z',
        payload: '{"awb":"awb_1"}'
      }
    });

    expect(state.notificationsAdd).toHaveBeenCalledWith(
      'send-primary',
      expect.objectContaining({
        email: 'customer@example.com',
        phone: '9999999999',
        template: 'FailedDelivery'
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('shipping:primary:order_1:failed-delivery')
      })
    );
  });

  it('auto-captures COD payment when DELIVERED webhook fires', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'OUT_FOR_DELIVERY',
        paymentMode: 'COD',
        payment: { status: 'CREATED', capturedAt: null },
        user: {
          email: 'cod-customer@example.com',
          phone: '7777777777'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);
    state.tx.payment.update.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_cod_1',
        status: 'Delivered',
        description: 'Delivered to customer',
        location: 'Customer doorstep',
        occurredAt: '2026-04-26T15:00:00.000Z',
        payload: '{"awb":"awb_cod_1"}'
      }
    });

    expect(state.tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order_1' },
        data: expect.objectContaining({ status: 'CAPTURED' })
      })
    );
    expect(state.tx.orderStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          triggeredBy: 'SHIPPING_WEBHOOK',
          note: expect.stringContaining('COD payment marked as collected')
        })
      })
    );
  });

  it('skips COD auto-capture if payment already CAPTURED', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'OUT_FOR_DELIVERY',
        paymentMode: 'COD',
        payment: { status: 'CAPTURED', capturedAt: new Date() },
        user: { email: null, phone: null }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_cod_2',
        status: 'Delivered',
        description: 'Already captured',
        location: null,
        occurredAt: '2026-04-26T16:00:00.000Z',
        payload: '{"awb":"awb_cod_2"}'
      }
    });

    expect(state.tx.payment.update).not.toHaveBeenCalled();
  });

  it('does not auto-capture payment for PREPAID DELIVERED orders', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'OUT_FOR_DELIVERY',
        paymentMode: 'PREPAID',
        payment: { status: 'CAPTURED', capturedAt: new Date() },
        user: { email: null, phone: null }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_prepaid_1',
        status: 'Delivered',
        description: 'Delivered',
        location: null,
        occurredAt: '2026-04-26T17:00:00.000Z',
        payload: '{"awb":"awb_prepaid_1"}'
      }
    });

    expect(state.tx.payment.update).not.toHaveBeenCalled();
  });

  it('enqueues admin email notification for RTO initiated', async () => {
    boot();
    state.tx.shipment.findFirst.mockResolvedValue({
      id: 'shipment_1',
      order: {
        id: 'order_1',
        status: 'OUT_FOR_DELIVERY',
        user: {
          email: 'customer@example.com',
          phone: '9999999999'
        }
      }
    });
    state.tx.shipment.update.mockResolvedValue(undefined);
    state.tx.shipmentEvent.create.mockResolvedValue(undefined);
    state.tx.order.update.mockResolvedValue(undefined);
    state.tx.orderStatusHistory.create.mockResolvedValue(undefined);
    state.tx.storeSettings.findUnique.mockResolvedValue({
      contactEmail: 'admin@example.com'
    });

    await state.processor?.({
      name: 'update-shipment-status',
      data: {
        awb: 'awb_1',
        status: 'RTO_INITIATED',
        description: 'return to origin started',
        location: 'Hub',
        occurredAt: '2026-04-26T13:00:00.000Z',
        payload: '{"awb":"awb_1"}'
      }
    });

    expect(state.notificationsAdd).toHaveBeenCalledWith(
      'send-primary',
      expect.objectContaining({
        email: 'admin@example.com',
        template: 'OrderCancelled'
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('shipping:primary:order_1:rto-initiated')
      })
    );
  });

  it('sends terminal failure alert when shipping job exhausts all attempts', () => {
    boot();

    const terminalJob = { name: 'create-shipment', id: 'job_s1', opts: { attempts: 3 }, attemptsMade: 3 };
    failedHandler?.(terminalJob, new Error('provider unreachable'));

    expect(sendTechnicalFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'shipping',
        jobName: 'create-shipment',
        jobId: 'job_s1',
        terminalFailure: true,
        errorMessage: 'provider unreachable'
      })
    );
  });

  it('does NOT send alert when shipping job still has remaining attempts', () => {
    boot();

    const retryJob = { name: 'create-shipment', id: 'job_s2', opts: { attempts: 3 }, attemptsMade: 1 };
    failedHandler?.(retryJob, new Error('transient error'));

    expect(sendTechnicalFailureAlert).not.toHaveBeenCalled();
  });
});

