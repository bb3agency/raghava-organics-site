import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { type EmailProviderAdapter, type SendEmailInput, type SendResult } from '@common/interfaces/notification-provider.interface';
import { renderNotificationEmail } from '@modules/notifications/templates/email-templates';

type ResendAdapterOptions = {
  apiKey: string;
  fromEmail: string;
  baseUrl?: string;
};

export class ResendAdapter implements EmailProviderAdapter {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly baseUrl: string;

  constructor(options: ResendAdapterOptions) {
    this.apiKey = options.apiKey;
    this.fromEmail = options.fromEmail;
    this.baseUrl = options.baseUrl ?? 'https://api.resend.com';
  }

  async sendEmail(input: SendEmailInput): Promise<SendResult> {
    const rendered = await renderNotificationEmail(input.template, input.data);

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [input.to],
        subject: rendered.subject,
        html: rendered.html
      }),
      signal: AbortSignal.timeout(10_000)
    });

    const payload = await this.parsePayload(response);
    if (!response.ok) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, `Resend request failed: ${response.status}`, 502);
    }

    const messageId = typeof payload.id === 'string' ? payload.id : undefined;
    return {
      ...(messageId ? { messageId } : {}),
      providerPayload: payload
    };
  }

  private async parsePayload(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }
}
