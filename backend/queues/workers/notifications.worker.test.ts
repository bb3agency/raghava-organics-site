import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ResendAdapter } from '@modules/notifications/adapters/resend.adapter';
import { Msg91Adapter } from '@modules/notifications/adapters/msg91.adapter';
import { MetaWhatsAppAdapter } from '@modules/notifications/adapters/meta-whatsapp.adapter';

import { createNotificationsWorker } from './notifications.worker';

type NotificationsWorkerDeps = NonNullable<Parameters<typeof createNotificationsWorker>[1]>;
type NotificationsWorkerType = NonNullable<NotificationsWorkerDeps['Worker']>;
type NotificationsPrismaType = NonNullable<NotificationsWorkerDeps['PrismaClient']>;

describe('notifications worker', () => {
  let processor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
  const createLog = vi.fn();
  const findStoreSettings = vi.fn();
  const findOpsConfigSecrets = vi.fn();
  const findOpsUsers = vi.fn();
  const findAdminUsers = vi.fn();

  let sendEmailSpy: ReturnType<typeof vi.spyOn>;
  let sendSmsSpy: ReturnType<typeof vi.spyOn>;
  let sendWhatsappSpy: ReturnType<typeof vi.spyOn>;

  class MockWorker {
    on(): void { /* no-op for tests */ }
    constructor(_name: string, proc: (job: { name: string; data: unknown }) => Promise<void>) {
      processor = proc;
    }
  }

  function MockPrismaClient() {
    return {
      notificationLog: {
        create: createLog
      },
      storeSettings: {
        findUnique: findStoreSettings
      },
      opsConfigSecret: {
        findMany: findOpsConfigSecrets
      },
      opsUser: {
        findMany: findOpsUsers
      },
      user: {
        findMany: findAdminUsers
      }
    };
  }

  beforeEach(() => {
    processor = undefined;
    createLog.mockReset();
    findStoreSettings.mockReset();
    findOpsConfigSecrets.mockReset();
    findOpsUsers.mockReset();
    findAdminUsers.mockReset();

    sendEmailSpy = vi.spyOn(ResendAdapter.prototype, 'sendEmail');
    sendSmsSpy = vi.spyOn(Msg91Adapter.prototype, 'sendSms');
    sendWhatsappSpy = vi.spyOn(MetaWhatsAppAdapter.prototype, 'sendWhatsapp');

    process.env.NOTIFY_EMAIL_ENABLED = 'true';
    process.env.NOTIFY_SMS_ENABLED = 'true';
    process.env.NOTIFY_WHATSAPP_ENABLED = 'true';
    process.env.SMS_PROVIDER = 'msg91';
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.MSG91_AUTH_KEY = 'msg91-key';
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';
    process.env.NOTIFY_PRIMARY_CHANNEL = 'SMS';
    findStoreSettings.mockResolvedValue(null);
    findOpsConfigSecrets.mockResolvedValue([]);
    findOpsUsers.mockResolvedValue([]);
    findAdminUsers.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes send-primary using configured global channel', async () => {
    process.env.NOTIFY_PRIMARY_CHANNEL = 'EMAIL';
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType
    });
    sendEmailSpy.mockResolvedValue({ messageId: 'email_primary_1', providerPayload: {} });

    await processor?.({
      name: 'send-primary',
      data: {
        email: 'primary@example.com',
        phone: '9876543210',
        template: 'OrderConfirmed',
        data: { orderId: '1' }
      }
    });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendSmsSpy).not.toHaveBeenCalled();
    expect(sendWhatsappSpy).not.toHaveBeenCalled();
    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'EMAIL',
        recipient: 'primary@example.com',
        template: 'OrderConfirmed',
        status: 'SENT'
      })
    });
  });

  it('logs sent email notification on provider success', async () => {
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType
    });
    sendEmailSpy.mockResolvedValue({ messageId: 'email_1', providerPayload: {} });

    await processor?.({
      name: 'send-email',
      data: { to: 'test@example.com', template: 'OrderConfirmed', data: { orderId: '1' } }
    });

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'EMAIL',
        recipient: 'test@example.com',
        template: 'OrderConfirmed',
        status: 'SENT',
        provider: 'resend',
        providerMessageId: 'email_1'
      })
    });
  });

  it('logs failed sms notification and throws so BullMQ can retry', async () => {
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType
    });
    sendSmsSpy.mockRejectedValue(new Error('provider timeout'));

    await expect(
      processor?.({
        name: 'send-sms',
        data: { phone: '9876543210', template: 'OutForDelivery', data: {} }
      })
    ).rejects.toThrow('provider timeout');

    expect(sendSmsSpy).toHaveBeenCalledWith({
      phone: '9876543210',
      template: 'OutForDelivery',
      data: {
        storeName: expect.any(String)
      }
    });

    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'SMS',
        recipient: '9876543210',
        template: 'OutForDelivery',
        status: 'FAILED',
        provider: 'msg91'
      })
    });
  });

  it('logs failed sms with fast2sms provider when credentials missing', async () => {
    process.env.SMS_PROVIDER = 'fast2sms';
    process.env.FAST2SMS_API_KEY = '';
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType
    });

    await processor?.({
      name: 'send-sms',
      data: { phone: '9876543210', template: 'OutForDelivery', data: {} }
    });

    expect(sendSmsSpy).not.toHaveBeenCalled();
    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'SMS',
        recipient: '9876543210',
        template: 'OutForDelivery',
        status: 'FAILED',
        provider: 'fast2sms',
        errorMessage: 'SMS notifications disabled or provider credentials missing'
      })
    });
  });

  it('logs sent whatsapp notification on provider success', async () => {
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType
    });
    sendWhatsappSpy.mockResolvedValue({ messageId: 'wa_1', providerPayload: {} });

    await processor?.({
      name: 'send-whatsapp',
      data: { phone: '9876543210', template: 'OutForDelivery', data: { orderNumber: 'ORD-1' } }
    });

    expect(sendWhatsappSpy).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'WHATSAPP',
        recipient: '9876543210',
        template: 'OutForDelivery',
        status: 'SENT',
        provider: 'meta-whatsapp',
        providerMessageId: 'wa_1'
      })
    });
  });

  it('logs failed whatsapp when channel disabled', async () => {
    process.env.NOTIFY_WHATSAPP_ENABLED = 'false';
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType
    });

    await processor?.({
      name: 'send-whatsapp',
      data: { phone: '9876543210', template: 'OutForDelivery', data: {} }
    });

    expect(sendWhatsappSpy).not.toHaveBeenCalled();
    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'WHATSAPP',
        recipient: '9876543210',
        template: 'OutForDelivery',
        status: 'FAILED',
        provider: 'meta-whatsapp'
      })
    });
  });
});
