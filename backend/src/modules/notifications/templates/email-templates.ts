import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { render } from '@react-email/render';
import {
  AdminInviteSetupEmail,
  LowStockAlertEmail,
  OrderCancelledEmail,
  OrderConfirmedEmail,
  OrderDeliveredEmail,
  OrderShippedEmail,
  OutForDeliveryEmail,
  PasswordResetEmail,
  PaymentFailedEmail,
  OpsInviteSetupEmail,
  OpsActionOtpEmail
} from './email-template-components';

const supportedEmailTemplates = [
  'OrderConfirmed',
  'PaymentFailed',
  'OrderShipped',
  'OutForDelivery',
  'OrderDelivered',
  'OrderCancelled',
  'LowStockAlert',
  'PasswordReset',
  'AdminInviteSetup',
  'OpsInviteSetup',
  'OpsActionOtp'
] as const;

export type EmailTemplateName = (typeof supportedEmailTemplates)[number];

type RenderedEmail = {
  subject: string;
  html: string;
};

function escapeHtml(input: unknown): string {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function renderNotificationEmail(template: string, data: Record<string, unknown>): Promise<RenderedEmail> {
  if (!supportedEmailTemplates.includes(template as EmailTemplateName)) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, `Unsupported email template: ${template}`, 400);
  }

  const orderId = data.orderId ? escapeHtml(data.orderId) : 'N/A';

  switch (template as EmailTemplateName) {
    case 'OrderConfirmed':
      return {
        subject: `Order confirmed - ${orderId}`,
        html: await render(OrderConfirmedEmail(orderId))
      };
    case 'PaymentFailed':
      return {
        subject: `Payment failed - ${orderId}`,
        html: await render(PaymentFailedEmail(orderId))
      };
    case 'OrderShipped':
      return {
        subject: `Order shipped - ${orderId}`,
        html: await render(OrderShippedEmail(orderId))
      };
    case 'OutForDelivery':
      return {
        subject: `Out for delivery - ${orderId}`,
        html: await render(OutForDeliveryEmail(orderId))
      };
    case 'OrderDelivered':
      return {
        subject: `Order delivered - ${orderId}`,
        html: await render(OrderDeliveredEmail(orderId))
      };
    case 'OrderCancelled':
      return {
        subject: `Order cancelled - ${orderId}`,
        html: await render(OrderCancelledEmail(orderId))
      };
    case 'LowStockAlert':
      {
        const items = Array.isArray(data.items)
          ? data.items
              .map((item) => {
                if (!item || typeof item !== 'object') {
                  return null;
                }
                const row = item as Record<string, unknown>;
                return {
                  sku: escapeHtml(row.sku ?? 'N/A'),
                  quantity: Number(row.quantity ?? 0),
                  lowStockThreshold: Number(row.lowStockThreshold ?? 0)
                };
              })
              .filter((item): item is { sku: string; quantity: number; lowStockThreshold: number } => item !== null)
          : [];

      return {
        subject: 'Low stock alert',
        html: await render(LowStockAlertEmail(items))
      };
      }
    case 'PasswordReset':
      {
        const email = escapeHtml(data.email ?? 'N/A');
        const resetToken = escapeHtml(data.resetToken ?? 'N/A');
      return {
        subject: 'Password reset request',
        html: await render(PasswordResetEmail(email, resetToken))
      };
      }
    case 'OpsInviteSetup':
      {
        const email = escapeHtml(data.email ?? 'N/A');
        const setupUrl = escapeHtml(data.setupUrl ?? 'N/A');
        const expiresAt = escapeHtml(data.expiresAt ?? 'N/A');
        return {
          subject: 'Ops setup invite',
          html: await render(OpsInviteSetupEmail(email, setupUrl, expiresAt))
        };
      }
    case 'AdminInviteSetup':
      {
        const email = escapeHtml(data.email ?? 'N/A');
        const setupUrl = escapeHtml(data.setupUrl ?? 'N/A');
        const expiresAt = escapeHtml(data.expiresAt ?? 'N/A');
        return {
          subject: 'Merchant admin setup invite',
          html: await render(AdminInviteSetupEmail(email, setupUrl, expiresAt))
        };
      }
    case 'OpsActionOtp':
      {
        const action = escapeHtml(data.action ?? 'ops-write');
        const code = escapeHtml(data.code ?? 'N/A');
        const expiresAt = escapeHtml(data.expiresAt ?? 'N/A');
        return {
          subject: 'Ops verification code',
          html: await render(OpsActionOtpEmail(action, code, expiresAt))
        };
      }
  }
}
