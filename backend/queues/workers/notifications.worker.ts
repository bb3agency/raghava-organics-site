import { Worker, type ConnectionOptions } from 'bullmq';
import { NotificationChannel, NotificationStatus, PrismaClient as RealPrismaClient } from '@prisma/client';
import { type SmsProviderAdapter } from '@common/interfaces/notification-provider.interface';
import { decryptOpsConfigValue } from '@common/security/ops-config-crypto';
import { Fast2smsAdapter } from '@modules/notifications/adapters/fast2sms.adapter';
import { createNotificationProviders } from '@modules/notifications/notification-provider';
import { SmsTemplateRegistry } from '@modules/notifications/sms-template-registry';

type SendEmailJobData = {
  to: string;
  template: string;
  data: Record<string, unknown>;
};

type SendSmsJobData = {
  phone: string;
  template: string;
  data: Record<string, unknown>;
};

type SendWhatsappJobData = {
  phone: string;
  template: string;
  data: Record<string, unknown>;
};

function resolveSmsProviderName(runtimeConfig: NodeJS.ProcessEnv): string {
  return (runtimeConfig.SMS_PROVIDER ?? 'msg91').trim().toLowerCase();
}

function hasSmsProviderCredentials(runtimeConfig: NodeJS.ProcessEnv): boolean {
  const provider = resolveSmsProviderName(runtimeConfig);
  if (provider === 'noop') {
    return false;
  }
  if (provider === 'msg91') {
    return !!runtimeConfig.MSG91_AUTH_KEY?.trim();
  }
  if (provider === 'fast2sms') {
    return !!runtimeConfig.FAST2SMS_API_KEY?.trim();
  }
  return false;
}

function parseEnabledFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  return value.trim().toLowerCase() === 'true';
}

type NotificationsWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
  createNotificationProviders?: typeof createNotificationProviders;
};

export function createNotificationsWorker(
  connection: ConnectionOptions,
  deps?: NotificationsWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
  const createProviders = deps?.createNotificationProviders ?? createNotificationProviders;
  const prisma = new PrismaClientCtor();
  const OPS_RUNTIME_NOTIFICATION_KEYS = [
    'NOTIFY_EMAIL_ENABLED',
    'NOTIFY_SMS_ENABLED',
    'NOTIFY_WHATSAPP_ENABLED',
    'SMS_PROVIDER',
    'RESEND_API_KEY',
    'RESEND_FROM',
    'MSG91_AUTH_KEY',
    'MSG91_SENDER_ID',
    'MSG91_ROUTE',
    'FAST2SMS_API_KEY',
    'META_WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_PHONE_NUMBER_ID',
    'META_WHATSAPP_API_VERSION'
  ] as const;

  async function resolveRuntimeConfig(): Promise<NodeJS.ProcessEnv> {
    const runtimeConfig: NodeJS.ProcessEnv = { ...process.env };
    const rows = await prisma.opsConfigSecret.findMany({
      where: {
        isActive: true,
        secretKey: {
          in: [...OPS_RUNTIME_NOTIFICATION_KEYS]
        }
      },
      select: {
        secretKey: true,
        encryptedValue: true
      }
    });

    for (const row of rows) {
      runtimeConfig[row.secretKey] = decryptOpsConfigValue(row.encryptedValue);
    }

    return runtimeConfig;
  }

  function resolveSmsAdapter(
    runtimeConfig: NodeJS.ProcessEnv,
    providers: ReturnType<typeof createNotificationProviders>,
    smsTemplateOverrides: Record<string, string>
  ): SmsProviderAdapter {
    if (resolveSmsProviderName(runtimeConfig) !== 'fast2sms') {
      return providers.sms;
    }

    return new Fast2smsAdapter({
      apiKey: runtimeConfig.FAST2SMS_API_KEY ?? '',
      templateRegistry: new SmsTemplateRegistry(smsTemplateOverrides)
    });
  }

  async function resolveEffectiveNotificationFlags(runtimeConfig: NodeJS.ProcessEnv) {
    const envFlags = {
      email: parseEnabledFlag(runtimeConfig.NOTIFY_EMAIL_ENABLED, true),
      sms: parseEnabledFlag(runtimeConfig.NOTIFY_SMS_ENABLED, true),
      whatsapp: parseEnabledFlag(runtimeConfig.NOTIFY_WHATSAPP_ENABLED, false)
    };
    const settings = await prisma.storeSettings.findUnique({
      where: { singletonKey: 'default' },
      select: {
        notifyEmailEnabled: true,
        notifySmsEnabled: true,
        notifyWhatsappEnabled: true,
        storeName: true,
        smsTemplates: true
      }
    });
    const storeName = (settings?.storeName ?? runtimeConfig.STORE_LEGAL_NAME ?? '').trim();

    return {
      emailEnabled: settings?.notifyEmailEnabled ?? envFlags.email,
      smsEnabled: settings?.notifySmsEnabled ?? envFlags.sms,
      whatsappEnabled: settings?.notifyWhatsappEnabled ?? envFlags.whatsapp,
      storeName,
      smsTemplates: SmsTemplateRegistry.normalizeTemplateOverrides(settings?.smsTemplates)
    };
  }

  return new WorkerCtor(
    'notifications',
    async (job) => {
      if (job.name === 'send-email') {
        const data = job.data as SendEmailJobData;
        const runtimeConfig = await resolveRuntimeConfig();
        const flags = await resolveEffectiveNotificationFlags(runtimeConfig);
        if (!flags.emailEnabled || !runtimeConfig.RESEND_API_KEY) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.EMAIL,
              recipient: data.to,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'resend',
              errorMessage: 'Email notifications disabled or RESEND_API_KEY missing'
            }
          });
          return;
        }

        try {
          const providers = createProviders(runtimeConfig);
          const sent = await providers.email.sendEmail(data);
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.EMAIL,
              recipient: data.to,
              template: data.template,
              status: NotificationStatus.SENT,
              provider: 'resend',
              ...(sent.messageId ? { providerMessageId: sent.messageId } : {})
            }
          });
        } catch (error) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.EMAIL,
              recipient: data.to,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'resend',
              errorMessage: error instanceof Error ? error.message : 'Unknown email provider error'
            }
          });
          throw error;
        }
        return;
      }

      if (job.name === 'send-sms') {
        const data = job.data as SendSmsJobData;
        const runtimeConfig = await resolveRuntimeConfig();
        const flags = await resolveEffectiveNotificationFlags(runtimeConfig);
        const smsProvider = resolveSmsProviderName(runtimeConfig);
        if (!flags.smsEnabled || !hasSmsProviderCredentials(runtimeConfig)) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.SMS,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: smsProvider,
              errorMessage: 'SMS notifications disabled or provider credentials missing'
            }
          });
          return;
        }

        try {
          const providers = createProviders(runtimeConfig);
          const smsAdapter = resolveSmsAdapter(runtimeConfig, providers, flags.smsTemplates);
          const smsData: SendSmsJobData = {
            ...data,
            data: SmsTemplateRegistry.composeTemplateData(data.data, flags.storeName)
          };
          const sent = await smsAdapter.sendSms(smsData);
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.SMS,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.SENT,
              provider: smsProvider,
              ...(sent.messageId ? { providerMessageId: sent.messageId } : {})
            }
          });
        } catch (error) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.SMS,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: smsProvider,
              errorMessage: error instanceof Error ? error.message : 'Unknown SMS provider error'
            }
          });
          throw error;
        }
        return;
      }

      if (job.name === 'send-whatsapp') {
        const data = job.data as SendWhatsappJobData;
        const runtimeConfig = await resolveRuntimeConfig();
        const flags = await resolveEffectiveNotificationFlags(runtimeConfig);
        if (!flags.whatsappEnabled || !runtimeConfig.META_WHATSAPP_ACCESS_TOKEN || !runtimeConfig.META_WHATSAPP_PHONE_NUMBER_ID) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'meta-whatsapp',
              errorMessage: 'WhatsApp notifications disabled or Meta WhatsApp credentials missing'
            }
          });
          return;
        }

        try {
          const providers = createProviders(runtimeConfig);
          const sent = await providers.whatsapp.sendWhatsapp(data);
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.SENT,
              provider: 'meta-whatsapp',
              ...(sent.messageId ? { providerMessageId: sent.messageId } : {})
            }
          });
        } catch (error) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'meta-whatsapp',
              errorMessage: error instanceof Error ? error.message : 'Unknown WhatsApp provider error'
            }
          });
          throw error;
        }
      }
    },
    { connection }
  );
}

