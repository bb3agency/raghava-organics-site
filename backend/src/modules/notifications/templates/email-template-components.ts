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

export function OtpVerificationEmail(otp: string): ReactElement {
  return BaseEmailTemplate({
    title: 'OTP Verification',
    message: `Your verification OTP is ${otp}. This code is valid for a limited time. Do not share it with anyone.`
  });
}

export function CustomerOtpVerificationEmail(otp: string, storeName: string): ReactElement {
  return BaseEmailTemplate({
    title: `Sign-in code for ${storeName}`,
    message: `Your one-time sign-in code is ${otp}. This code expires in 5 minutes. Do not share this code with anyone — ${storeName} will never ask you for it.`
  });
}

export function NotificationDeliveryFailureEmail(args: {
  template: string;
  channel: string;
  recipient: string;
  errorMessage: string;
  domain?: string;
  component?: string;
  failureStage?: string;
  queueName?: string;
  jobName?: string;
  jobId?: string;
  outboxMessageId?: string;
  route?: string;
  method?: string;
  statusCode?: string;
  terminalFailure?: string;
  clientName?: string;
  websiteUrl?: string;
}): ReactElement {
  return BaseEmailTemplate({
    title: 'Technical Failure Alert',
    message: `Client: ${args.clientName ?? 'Unknown Client'} (${args.websiteUrl ?? 'https://unknown-client.local'}). Domain: ${args.domain ?? 'system'}. Component: ${args.component ?? 'unknown-component'}. Template: '${args.template}'. Channel: ${args.channel}. Recipient: ${args.recipient}. Stage: ${args.failureStage ?? 'UNKNOWN'}. Queue: ${args.queueName ?? 'unknown'}. Job: ${args.jobName ?? 'unknown'} (${args.jobId ?? 'unknown'}). Outbox: ${args.outboxMessageId ?? 'n/a'}. Route: ${args.method ?? 'n/a'} ${args.route ?? 'n/a'}. Status: ${args.statusCode ?? '500'}. Terminal: ${args.terminalFailure ?? 'false'}. Error: ${args.errorMessage}`
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

export function ProcessRestartAlertEmail(args: {
  requestedBy: string;
  scheduledFor: string;
  jobId: string;
  clientName?: string;
  websiteUrl?: string;
}): ReactElement {
  return BaseEmailTemplate({
    title: 'Process Restart Alert — Action Required If Server Stalls',
    message: `A scheduled process restart was triggered for ${args.clientName ?? 'Unknown Client'} (${args.websiteUrl ?? 'https://unknown-client.local'}). Requested by ops user: ${args.requestedBy}. Scheduled for: ${args.scheduledFor}. Job ID: ${args.jobId}. The process is about to exit. PM2 / Docker should restart it automatically. If the server does not come back online within a few minutes, manual intervention is required. Check PM2 logs or Docker container status immediately.`
  });
}
