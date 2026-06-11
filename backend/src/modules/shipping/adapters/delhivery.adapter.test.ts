import { afterEach, describe, expect, it, vi } from 'vitest';
import DelhiveryAdapter from './delhivery.adapter';

describe('DelhiveryAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates shipment using token auth and multipart data mapping', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ packages: [{ waybill: 'AWB123' }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DelhiveryAdapter({ apiKey: 'delhivery_key', baseUrl: 'https://track.delhivery.com/api' });
    const result = await adapter.createShipment({
      orderNumber: 'ORD-2026-00001',
      amountRupees: 499.5,
      destinationPincode: '560001',
      originPincode: '110001',
      totalWeightGrams: 1200,
      paymentMode: 'Prepaid',
      sellerGstTin: '29ABCDE1234F1Z5',
      hsnCode: '1001',
      customer: {
        fullName: 'Test User',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Bengaluru',
        state: 'Karnataka'
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/cmu/create.json');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token delhivery_key');

    const formBody = init.body as FormData;
    const rawData = formBody.get('data');
    const format = formBody.get('format');
    expect(format).toBe('json');
    expect(typeof rawData).toBe('string');
    if (typeof rawData !== 'string') {
      throw new Error('Expected Delhivery form data payload as string');
    }
    const parsedData = JSON.parse(rawData) as {
      shipments: Array<{
        order: string;
        total_amount: number;
        pin: string;
        origin_pin: string;
        payment_mode: string;
        weight: number;
        seller_gst_tin: string;
        hsn_code: string;
      }>;
    };
    expect(parsedData.shipments[0]).toMatchObject({
      order: 'ORD-2026-00001',
      total_amount: 499.5,
      pin: '560001',
      origin_pin: '110001',
      payment_mode: 'Prepaid',
      weight: 1200,
      seller_gst_tin: '29ABCDE1234F1Z5',
      hsn_code: '1001'
    });

    expect(result.awbNumber).toBe('AWB123');
    expect(result.trackingUrl).toContain('AWB123');
  });

  it('uses default numeric HSN when order payload omits product HSN', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ packages: [{ waybill: 'AWB999' }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DelhiveryAdapter({ apiKey: 'delhivery_key', baseUrl: 'https://track.delhivery.com/api' });
    await adapter.createShipment({
      orderNumber: 'ORD-2026-00003',
      amountRupees: 100,
      destinationPincode: '560001',
      originPincode: '110001',
      totalWeightGrams: 500,
      paymentMode: 'Prepaid',
      sellerGstTin: '29ABCDE1234F1Z5',
      hsnCode: 'NA',
      customer: {
        fullName: 'Test User',
        phone: '9999999999',
        line1: 'Street 1',
        city: 'Bengaluru',
        state: 'Karnataka'
      }
    });

    const formBody = (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData;
    const parsedData = JSON.parse(String(formBody.get('data'))) as {
      shipments: Array<{ hsn_code: string }>;
    };
    expect(parsedData.shipments[0]?.hsn_code).toBe('2106');
  });

  it('checks serviceability using Delhivery pincode endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ delivery_codes: [{ postal_code: { pin: '560001' } }] })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DelhiveryAdapter({ apiKey: 'delhivery_key', baseUrl: 'https://track.delhivery.com/api' });
    const result = await adapter.checkServiceability('560001');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/c/api/pin-codes/json/?filter_codes=560001');
    expect(result.serviceable).toBe(true);
    expect(result.pincode).toBe('560001');
  });

  it('calculates delivery charge and ETA from Delhivery rate endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ total_amount: 88.5, estimated_delivery_days: 2 })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DelhiveryAdapter({ apiKey: 'delhivery_key', baseUrl: 'https://track.delhivery.com/api' });
    const result = await adapter.calculateDeliveryRate({
      destinationPincode: '560001',
      originPincode: '110001',
      totalWeightGrams: 1500
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/api/kinko/v1/invoice/charges/');
    expect(url).toContain('d_pin=560001');
    expect(url).toContain('o_pin=110001');
    expect(url).toContain('cgm=1500');
    expect(result).toMatchObject({
      shippingChargePaise: 8850,
      estimatedDays: 2
    });
  });

  it('throws when Delhivery returns invalid JSON on success response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'not-json'
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new DelhiveryAdapter({ apiKey: 'delhivery_key', baseUrl: 'https://track.delhivery.com/api' });
    await expect(adapter.checkServiceability('560001')).rejects.toMatchObject({
      statusCode: 502,
      message: 'Delhivery returned invalid JSON'
    });
  });
});
