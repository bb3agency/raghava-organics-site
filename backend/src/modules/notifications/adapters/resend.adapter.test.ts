import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendAdapter } from './resend.adapter';

describe('ResendAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends rendered template subject and html', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: 'email_123' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new ResendAdapter({
      apiKey: 'resend_key',
      fromEmail: 'noreply@example.com',
      baseUrl: 'https://api.resend.com'
    });

    const result = await adapter.sendEmail({
      to: 'user@example.com',
      template: 'OrderConfirmed',
      data: { orderId: 'order_123' }
    });

    expect(result.messageId).toBe('email_123');
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    if (typeof requestInit.body !== 'string') {
      throw new Error('Expected JSON string body');
    }
    const payload = JSON.parse(requestInit.body) as {
      subject: string;
      html: string;
    };
    expect(payload.subject).toContain('order_123');
    expect(payload.html).toContain('Order Confirmed');
  });
});
