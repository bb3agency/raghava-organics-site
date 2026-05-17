import { describe, expect, it } from 'vitest';
import { renderNotificationEmail } from './email-templates';

describe('renderNotificationEmail', () => {
  it('renders OrderConfirmed with order-aware subject', async () => {
    const rendered = await renderNotificationEmail('OrderConfirmed', { orderId: 'order_123' });
    expect(rendered.subject).toContain('order_123');
    expect(rendered.html).toContain('Order Confirmed');
  });

  it('rejects unsupported template names', async () => {
    await expect(
      renderNotificationEmail('UnknownTemplate', {
        orderId: 'order_123'
      })
    ).rejects.toThrow('Unsupported email template');
  });

  it('renders PasswordReset template with email in body', async () => {
    const rendered = await renderNotificationEmail('PasswordReset', {
      email: 'user@example.com',
      resetToken: 'reset-token-123'
    });
    expect(rendered.subject).toContain('Password reset request');
    expect(rendered.html).toContain('user@example.com');
    expect(rendered.html).toContain('reset-token-123');
  });

  it('renders AdminInviteSetup template with admin setup URL and expiry', async () => {
    const rendered = await renderNotificationEmail('AdminInviteSetup', {
      email: 'merchant@example.com',
      setupUrl: 'https://client.example.com/admin/setup?token=abc',
      expiresAt: '2026-05-13T00:00:00.000Z'
    });
    expect(rendered.subject).toContain('Merchant admin setup invite');
    expect(rendered.html).toContain('merchant@example.com');
    expect(rendered.html).toContain('/admin/setup?token=abc');
    expect(rendered.html).toContain('2026-05-13T00:00:00.000Z');
  });

  it('renders LowStockAlert with sku rows in body', async () => {
    const rendered = await renderNotificationEmail('LowStockAlert', {
      items: [{ sku: 'SKU-123', quantity: 2, lowStockThreshold: 5 }]
    });
    expect(rendered.subject).toContain('Low stock alert');
    expect(rendered.html).toContain('SKU-123');
  });
});
