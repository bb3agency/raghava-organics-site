/**
 * Maps abstract template names to human-readable SMS message text
 * with simple {{variable}} substitution.
 */
const DEFAULT_STORE_NAME = 'Our Store';

type TemplateData = Record<string, unknown>;

export class SmsTemplateRegistry {
  private readonly templates: Readonly<Record<string, string>>;

  constructor(overrides?: Record<string, string>) {
    this.templates = Object.freeze({
      ...SmsTemplateRegistry.defaultTemplates(),
      ...overrides
    });
  }

  /**
   * Returns default SMS template map used when no merchant overrides exist.
   */
  static defaultTemplates(): Record<string, string> {
    return {
      OrderConfirmed:
        'Hi from {{storeName}}! Your order {{orderId}} is confirmed. We\'ll notify you on each shipment milestone.',
      OrderShipped:
        '{{storeName}} update: Order {{orderId}} has been shipped and is in transit. Track via your order details page.',
      OutForDelivery:
        '{{storeName}} update: Order {{orderId}} is out for delivery today. Please keep your phone reachable for delivery assistance.',
      OrderDelivered:
        'Delivered by {{storeName}}: Order {{orderId}} has been marked delivered. If this was not received, contact support immediately.',
      OrderCancelled:
        '{{storeName}} notice: Order {{orderId}} has been cancelled as requested or due to processing constraints. Contact support for help.',
      PaymentFailed:
        '{{storeName}} payment alert: Payment for order {{orderId}} failed. Please retry from your order page to avoid cancellation.',
      FailedDelivery:
        '{{storeName}} delivery alert: Delivery failed for order {{orderId}} (AWB {{awb}}). Please contact support to reschedule.',
      OpsInviteSetup:
        '{{storeName}} security: Your ops setup OTP is {{otp}}. Valid for 10 minutes. Do not share this code.',
      OpsActionOtp:
        '{{storeName}} security: Your ops action OTP is {{otp}}. Valid for 10 minutes. Do not share this code.'
    };
  }

  /**
   * Builds safe SMS template data with store name injected.
   */
  static composeTemplateData(input: TemplateData, storeName?: string | null): TemplateData {
    return {
      ...input,
      storeName: SmsTemplateRegistry.normalizeStoreName(storeName)
    };
  }

  /**
   * Validates and normalizes merchant-provided SMS templates.
   */
  static normalizeTemplateOverrides(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    const result: Record<string, string> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, templateValue] of entries) {
      if (typeof templateValue !== 'string') {
        continue;
      }
      const trimmedKey = key.trim();
      const trimmedValue = templateValue.trim();
      if (!trimmedKey || !trimmedValue) {
        continue;
      }
      result[trimmedKey] = trimmedValue;
    }

    return result;
  }

  /**
   * Resolves effective store name with fallback.
   */
  static normalizeStoreName(storeName?: string | null): string {
    const trimmed = (storeName ?? '').trim();
    if (trimmed) {
      return trimmed;
    }

    return DEFAULT_STORE_NAME;
  }

  resolve(name: string, data: Record<string, unknown>): string {
    const template = this.templates[name];
    if (!template) {
      return `${name}${JSON.stringify(data)}`;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = data[key];
      return value !== undefined && value !== null && (typeof value === 'string' || typeof value === 'number')
        ? String(value)
        : '';
    });
  }
}
