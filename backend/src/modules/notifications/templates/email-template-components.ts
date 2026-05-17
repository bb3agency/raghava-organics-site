import { createElement, type ReactElement } from 'react';

type CommonTemplateProps = {
  title: string;
  message: string;
};

function BaseEmailTemplate({ title, message }: CommonTemplateProps): ReactElement {
  return createElement(
    'html',
    null,
    createElement(
      'body',
      {
        style: {
          fontFamily: 'Arial, sans-serif',
          color: '#111827',
          lineHeight: 1.5
        }
      },
      createElement('h2', null, title),
      createElement('p', null, message)
    )
  );
}

export function OrderConfirmedEmail(orderId: string): ReactElement {
  return BaseEmailTemplate({ title: 'Order Confirmed', message: `Your order ${orderId} has been confirmed.` });
}

export function PaymentFailedEmail(orderId: string): ReactElement {
  return BaseEmailTemplate({ title: 'Payment Failed', message: `We could not process payment for order ${orderId}.` });
}

export function OrderShippedEmail(orderId: string): ReactElement {
  return BaseEmailTemplate({ title: 'Order Shipped', message: `Your order ${orderId} is in transit.` });
}

export function OutForDeliveryEmail(orderId: string): ReactElement {
  return BaseEmailTemplate({ title: 'Out For Delivery', message: `Your order ${orderId} is out for delivery.` });
}

export function OrderDeliveredEmail(orderId: string): ReactElement {
  return BaseEmailTemplate({ title: 'Order Delivered', message: `Your order ${orderId} has been delivered.` });
}

export function OrderCancelledEmail(orderId: string): ReactElement {
  return BaseEmailTemplate({ title: 'Order Cancelled', message: `Your order ${orderId} has been cancelled.` });
}

export function LowStockAlertEmail(items: Array<{ sku: string; quantity: number; lowStockThreshold: number }>): ReactElement {
  return BaseEmailTemplate({
    title: 'Low Stock Alert',
    message:
      items.length > 0
        ? `Low stock variants: ${items.map((item) => `${item.sku} (${item.quantity}/${item.lowStockThreshold})`).join(', ')}`
        : 'Please review inventory levels for flagged products.'
  });
}

export function PasswordResetEmail(email: string, resetToken: string): ReactElement {
  return BaseEmailTemplate({
    title: 'Password Reset',
    message: `Use your reset flow to update password for account ${email}. Reset token: ${resetToken}`
  });
}

export function OpsInviteSetupEmail(email: string, setupUrl: string, expiresAt: string): ReactElement {
  return BaseEmailTemplate({
    title: 'Ops Account Setup',
    message: `A secure ops setup invite is ready for ${email}. Open: ${setupUrl}. This link expires at ${expiresAt}.`
  });
}

export function AdminInviteSetupEmail(email: string, setupUrl: string, expiresAt: string): ReactElement {
  return BaseEmailTemplate({
    title: 'Merchant Admin Account Setup',
    message: `A secure merchant admin setup invite is ready for ${email}. Open: ${setupUrl}. This link expires at ${expiresAt}.`
  });
}

export function OpsActionOtpEmail(action: string, code: string, expiresAt: string): ReactElement {
  return BaseEmailTemplate({
    title: 'Ops Action Verification Code',
    message: `Use OTP ${code} to authorize action '${action}'. Code expires at ${expiresAt}.`
  });
}
