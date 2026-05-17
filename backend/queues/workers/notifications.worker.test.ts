import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createNotificationsWorker } from './notifications.worker';

type NotificationsWorkerDeps = NonNullable<Parameters<typeof createNotificationsWorker>[1]>;
type NotificationsWorkerType = NonNullable<NotificationsWorkerDeps['Worker']>;
type NotificationsPrismaType = NonNullable<NotificationsWorkerDeps['PrismaClient']>;

describe('notifications worker', () => {
  let processor: ((job: { name: string; data: unknown }) => Promise<void>) | undefined;
  const createLog = vi.fn();
  const findStoreSettings = vi.fn();
  const findOpsConfigSecrets = vi.fn();
  const sendEmail = vi.fn();
  const sendSms = vi.fn();
  const sendWhatsapp = vi.fn();

  function MockWorker(_name: string, proc: (job: { name: string; data: unknown }) => Promise<void>) {
    processor = proc;
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
      }
    };
  }

  function mockCreateNotificationProviders() {
    return {
      email: { sendEmail },
      sms: { sendSms },
      whatsapp: { sendWhatsapp }
    };
  }

  beforeEach(() => {
    processor = undefined;
    createLog.mockReset();
    findStoreSettings.mockReset();
    findOpsConfigSecrets.mockReset();
    sendEmail.mockReset();
    sendSms.mockReset();
    sendWhatsapp.mockReset();
    process.env.NOTIFY_EMAIL_ENABLED = 'true';
    process.env.NOTIFY_SMS_ENABLED = 'true';
    process.env.NOTIFY_WHATSAPP_ENABLED = 'true';
    process.env.SMS_PROVIDER = 'msg91';
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.MSG91_AUTH_KEY = 'msg91-key';
    process.env.META_WHATSAPP_ACCESS_TOKEN = 'meta-token';
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = '123456789';
    findStoreSettings.mockResolvedValue(null);
    findOpsConfigSecrets.mockResolvedValue([]);
  });

  it('logs sent email notification on provider success', async () => {
    createNotificationsWorker({}, {
      Worker: MockWorker as unknown as NotificationsWorkerType,
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType,
      createNotificationProviders: mockCreateNotificationProviders
    });
    sendEmail.mockResolvedValue({ messageId: 'email_1', providerPayload: {} });

    await processor?.({
      name: 'send-email',
      data: { to: 'test@example.com', template: 'OrderConfirmed', data: { orderId: '1' } }
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
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
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType,
      createNotificationProviders: mockCreateNotificationProviders
    });
    sendSms.mockRejectedValue(new Error('provider timeout'));

    await expect(
      processor?.({
        name: 'send-sms',
        data: { phone: '9876543210', template: 'OutForDelivery', data: {} }
      })
    ).rejects.toThrow('provider timeout');

    expect(sendSms).toHaveBeenCalledWith({
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
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType,
      createNotificationProviders: mockCreateNotificationProviders
    });

    await processor?.({
      name: 'send-sms',
      data: { phone: '9876543210', template: 'OutForDelivery', data: {} }
    });

    expect(sendSms).not.toHaveBeenCalled();
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
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType,
      createNotificationProviders: mockCreateNotificationProviders
    });
    sendWhatsapp.mockResolvedValue({ messageId: 'wa_1', providerPayload: {} });

    await processor?.({
      name: 'send-whatsapp',
      data: { phone: '9876543210', template: 'OutForDelivery', data: { orderNumber: 'ORD-1' } }
    });

    expect(sendWhatsapp).toHaveBeenCalledTimes(1);
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
      PrismaClient: MockPrismaClient as unknown as NotificationsPrismaType,
      createNotificationProviders: mockCreateNotificationProviders
    });

    await processor?.({
      name: 'send-whatsapp',
      data: { phone: '9876543210', template: 'OutForDelivery', data: {} }
    });

    expect(sendWhatsapp).not.toHaveBeenCalled();
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
