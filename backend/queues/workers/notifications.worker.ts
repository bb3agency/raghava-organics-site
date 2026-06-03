import { Worker, type ConnectionOptions } from 'bullmq';
import { NotificationChannel, NotificationStatus, PrismaClient as RealPrismaClient } from '@prisma/client';
import { type SmsProviderAdapter } from '@common/interfaces/notification-provider.interface';
import { decryptOpsConfigValue } from '@common/security/ops-config-crypto';
import { Fast2smsAdapter } from '@modules/notifications/adapters/fast2sms.adapter';
import { MetaWhatsAppAdapter } from '@modules/notifications/adapters/meta-whatsapp.adapter';
import { Msg91Adapter } from '@modules/notifications/adapters/msg91.adapter';
import { ResendAdapter } from '@modules/notifications/adapters/resend.adapter';
import { sendNotificationFailureAlert, sendTechnicalFailureAlert } from '@modules/notifications/notification-failure-alert';
import type { createNotificationProviders } from '@modules/notifications/notification-provider';
import { SmsTemplateRegistry } from '@modules/notifications/sms-template-registry';
import { supportedEmailTemplates } from '@modules/notifications/templates/email-templates';

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

type SendPrimaryNotificationJobData = {
  template: string;
  data: Record<string, unknown>;
  email?: string | null;
  phone?: string | null;
};

type PrimaryChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

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

function normalizePrimaryChannel(value: string | undefined): PrimaryChannel | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'EMAIL' || normalized === 'SMS' || normalized === 'WHATSAPP') {
    return normalized;
  }
  return null;
}

function normalizePrimaryChannels(value: unknown): Record<string, PrimaryChannel> {
  const defaults = Object.fromEntries(
    supportedEmailTemplates.map((template) => [template, 'EMAIL'])
  ) as Record<string, PrimaryChannel>;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const normalized = { ...defaults };
  for (const [template, channelRaw] of Object.entries(value as Record<string, unknown>)) {
    if (!supportedEmailTemplates.includes(template as (typeof supportedEmailTemplates)[number])) {
      continue;
    }
    const channel = normalizePrimaryChannel(typeof channelRaw === 'string' ? channelRaw : undefined);
    if (channel) {
      normalized[template] = channel;
    }
  }

  return normalized;
}

function resolvePrimaryChannel(template: string, primaryChannels: Record<string, PrimaryChannel>): PrimaryChannel | null {
  return primaryChannels[template] ?? null;
}

type NotificationsWorkerDeps = {
  PrismaClient?: typeof RealPrismaClient;
  Worker?: typeof Worker;
  // Backward-compatible test seam. Kept to avoid breaking existing worker tests.
  createNotificationProviders?: typeof createNotificationProviders;
};

export function createNotificationsWorker(
  connection: ConnectionOptions,
  deps?: NotificationsWorkerDeps
): Worker {
  const PrismaClientCtor = deps?.PrismaClient ?? RealPrismaClient;
  const WorkerCtor = deps?.Worker ?? Worker;
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
    const runtimeConfig: NodeJS.ProcessEnv = {};
    for (const key of OPS_RUNTIME_NOTIFICATION_KEYS) {
      const envValue = process.env[key];
      if (envValue) {
        runtimeConfig[key] = envValue;
      }
    }

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
    smsTemplateOverrides: Record<string, string>
  ): SmsProviderAdapter {
    const provider = resolveSmsProviderName(runtimeConfig);
    if (provider === 'fast2sms') {
      return new Fast2smsAdapter({
        apiKey: runtimeConfig.FAST2SMS_API_KEY ?? '',
        templateRegistry: new SmsTemplateRegistry(smsTemplateOverrides)
      });
    }

    return new Msg91Adapter({
      authKey: runtimeConfig.MSG91_AUTH_KEY ?? '',
      senderId: runtimeConfig.MSG91_SENDER_ID ?? 'ECOMTM',
      route: runtimeConfig.MSG91_ROUTE ?? '4'
    });
  }

  async function resolveEffectiveNotificationFlags(runtimeConfig: NodeJS.ProcessEnv) {
    const envFlags = {
      email: parseEnabledFlag(runtimeConfig.NOTIFY_EMAIL_ENABLED, true),
      sms: parseEnabledFlag(runtimeConfig.NOTIFY_SMS_ENABLED, false),
      whatsapp: parseEnabledFlag(runtimeConfig.NOTIFY_WHATSAPP_ENABLED, false)
    };
    const settings = await prisma.storeSettings.findUnique({
      where: { singletonKey: 'default' },
      select: {
        notifyEmailEnabled: true,
        notifySmsEnabled: true,
        notifyWhatsappEnabled: true,
        primaryNotificationChannels: true,
        storeName: true,
        smsTemplates: true
      }
    });
    const storeName = (settings?.storeName ?? '').trim();

    return {
      emailEnabled: settings?.notifyEmailEnabled ?? envFlags.email,
      smsEnabled: settings?.notifySmsEnabled ?? envFlags.sms,
      whatsappEnabled: settings?.notifyWhatsappEnabled ?? envFlags.whatsapp,
      primaryChannels: normalizePrimaryChannels(settings?.primaryNotificationChannels),
      storeName: storeName.length > 0 ? storeName : '[MISSING_CONFIG:StoreSettings.storeName]',
      smsTemplates: SmsTemplateRegistry.normalizeTemplateOverrides(settings?.smsTemplates)
    };
  }

  const worker = new WorkerCtor(
    'notifications',
    async (job) => {
      if (job.name === 'send-email') {
        const data = job.data as SendEmailJobData;
        const runtimeConfig = await resolveRuntimeConfig();
        const flags = await resolveEffectiveNotificationFlags(runtimeConfig);
        if (!flags.emailEnabled || !runtimeConfig.RESEND_API_KEY) {
          const errorMessage = 'Email notifications disabled or RESEND_API_KEY missing';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.EMAIL,
              recipient: data.to,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'resend',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'EMAIL',
            recipient: data.to,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          throw new Error(errorMessage);
        }

        try {
          const emailAdapter = new ResendAdapter({
            apiKey: runtimeConfig.RESEND_API_KEY ?? '',
            fromEmail: runtimeConfig.RESEND_FROM ?? 'noreply@example.com'
          });
          const sent = await emailAdapter.sendEmail(data);
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown email provider error';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.EMAIL,
              recipient: data.to,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'resend',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'EMAIL',
            recipient: data.to,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
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
          const errorMessage = 'SMS notifications disabled or provider credentials missing';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.SMS,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: smsProvider,
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'SMS',
            recipient: data.phone,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          return;
        }

        try {
          const smsAdapter = resolveSmsAdapter(runtimeConfig, flags.smsTemplates);
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown SMS provider error';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.SMS,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: smsProvider,
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'SMS',
            recipient: data.phone,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
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
          const errorMessage = 'WhatsApp notifications disabled or Meta WhatsApp credentials missing';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'meta-whatsapp',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'WHATSAPP',
            recipient: data.phone,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          return;
        }

        try {
          const whatsappAdapter = new MetaWhatsAppAdapter({
            accessToken: runtimeConfig.META_WHATSAPP_ACCESS_TOKEN ?? '',
            phoneNumberId: runtimeConfig.META_WHATSAPP_PHONE_NUMBER_ID ?? '',
            apiVersion: runtimeConfig.META_WHATSAPP_API_VERSION ?? 'v21.0'
          });
          const sent = await whatsappAdapter.sendWhatsapp(data);
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
          const errorMessage = error instanceof Error ? error.message : 'Unknown WhatsApp provider error';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient: data.phone,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'meta-whatsapp',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'WHATSAPP',
            recipient: data.phone,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          throw error;
        }
        return;
      }

      if (job.name === 'send-primary') {
        const data = job.data as SendPrimaryNotificationJobData;
        const runtimeConfig = await resolveRuntimeConfig();
        const flags = await resolveEffectiveNotificationFlags(runtimeConfig);
        const primaryChannel = resolvePrimaryChannel(data.template, flags.primaryChannels);

        if (!primaryChannel) {
          const errorMessage = 'Primary notification channel mapping missing or invalid for template';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.EMAIL,
              recipient: data.email?.trim() || data.phone?.trim() || 'unknown-recipient',
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'config',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'UNKNOWN',
            recipient: data.email?.trim() || data.phone?.trim() || 'unknown-recipient',
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          return;
        }

        if (primaryChannel === 'EMAIL') {
          const recipient = data.email?.trim() ?? '';
          const errorMessage =
            !recipient
              ? 'Primary EMAIL channel selected but recipient email is missing'
              : !flags.emailEnabled || !runtimeConfig.RESEND_API_KEY
                ? 'Email notifications disabled or RESEND_API_KEY missing'
                : null;

          if (errorMessage) {
            await prisma.notificationLog.create({
              data: {
                channel: NotificationChannel.EMAIL,
                recipient: recipient || 'missing-email',
                template: data.template,
                status: NotificationStatus.FAILED,
                provider: 'resend',
                errorMessage
              }
            });
            await sendNotificationFailureAlert({
              prisma,
              template: data.template,
              channel: 'EMAIL',
              recipient: recipient || 'missing-email',
              errorMessage,
              failureStage: 'WORKER_DELIVERY',
              queueName: 'notifications',
              jobName: job.name,
              jobId: String(job.id ?? 'unknown')
            });
            return;
          }

          try {
            const emailAdapter = new ResendAdapter({
              apiKey: runtimeConfig.RESEND_API_KEY ?? '',
              fromEmail: runtimeConfig.RESEND_FROM ?? 'noreply@example.com'
            });
            const sent = await emailAdapter.sendEmail({
              to: recipient,
              template: data.template,
              data: data.data
            });
            await prisma.notificationLog.create({
              data: {
                channel: NotificationChannel.EMAIL,
                recipient,
                template: data.template,
                status: NotificationStatus.SENT,
                provider: 'resend',
                ...(sent.messageId ? { providerMessageId: sent.messageId } : {})
              }
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown email provider error';
            await prisma.notificationLog.create({
              data: {
                channel: NotificationChannel.EMAIL,
                recipient,
                template: data.template,
                status: NotificationStatus.FAILED,
                provider: 'resend',
                errorMessage
              }
            });
            await sendNotificationFailureAlert({
              prisma,
              template: data.template,
              channel: 'EMAIL',
              recipient,
              errorMessage,
              failureStage: 'WORKER_DELIVERY',
              queueName: 'notifications',
              jobName: job.name,
              jobId: String(job.id ?? 'unknown')
            });
            throw error;
          }
          return;
        }

        if (primaryChannel === 'SMS') {
          const recipient = data.phone?.trim() ?? '';
          const smsProvider = resolveSmsProviderName(runtimeConfig);
          const errorMessage =
            !recipient
              ? 'Primary SMS channel selected but recipient phone is missing'
              : !flags.smsEnabled || !hasSmsProviderCredentials(runtimeConfig)
                ? 'SMS notifications disabled or provider credentials missing'
                : null;

          if (errorMessage) {
            await prisma.notificationLog.create({
              data: {
                channel: NotificationChannel.SMS,
                recipient: recipient || 'missing-phone',
                template: data.template,
                status: NotificationStatus.FAILED,
                provider: smsProvider,
                errorMessage
              }
            });
            await sendNotificationFailureAlert({
              prisma,
              template: data.template,
              channel: 'SMS',
              recipient: recipient || 'missing-phone',
              errorMessage,
              failureStage: 'WORKER_DELIVERY',
              queueName: 'notifications',
              jobName: job.name,
              jobId: String(job.id ?? 'unknown')
            });
            return;
          }

          try {
            const smsAdapter = resolveSmsAdapter(runtimeConfig, flags.smsTemplates);
            const sent = await smsAdapter.sendSms({
              phone: recipient,
              template: data.template,
              data: SmsTemplateRegistry.composeTemplateData(data.data, flags.storeName)
            });
            await prisma.notificationLog.create({
              data: {
                channel: NotificationChannel.SMS,
                recipient,
                template: data.template,
                status: NotificationStatus.SENT,
                provider: smsProvider,
                ...(sent.messageId ? { providerMessageId: sent.messageId } : {})
              }
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown SMS provider error';
            await prisma.notificationLog.create({
              data: {
                channel: NotificationChannel.SMS,
                recipient,
                template: data.template,
                status: NotificationStatus.FAILED,
                provider: smsProvider,
                errorMessage
              }
            });
            await sendNotificationFailureAlert({
              prisma,
              template: data.template,
              channel: 'SMS',
              recipient,
              errorMessage,
              failureStage: 'WORKER_DELIVERY',
              queueName: 'notifications',
              jobName: job.name,
              jobId: String(job.id ?? 'unknown')
            });
            throw error;
          }
          return;
        }

        const recipient = data.phone?.trim() ?? '';
        const errorMessage =
          !recipient
            ? 'Primary WHATSAPP channel selected but recipient phone is missing'
            : !flags.whatsappEnabled || !runtimeConfig.META_WHATSAPP_ACCESS_TOKEN || !runtimeConfig.META_WHATSAPP_PHONE_NUMBER_ID
              ? 'WhatsApp notifications disabled or Meta WhatsApp credentials missing'
              : null;

        if (errorMessage) {
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient: recipient || 'missing-phone',
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'meta-whatsapp',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'WHATSAPP',
            recipient: recipient || 'missing-phone',
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          return;
        }

        try {
          const whatsappAdapter = new MetaWhatsAppAdapter({
            accessToken: runtimeConfig.META_WHATSAPP_ACCESS_TOKEN ?? '',
            phoneNumberId: runtimeConfig.META_WHATSAPP_PHONE_NUMBER_ID ?? '',
            apiVersion: runtimeConfig.META_WHATSAPP_API_VERSION ?? 'v21.0'
          });
          const sent = await whatsappAdapter.sendWhatsapp({
            phone: recipient,
            template: data.template,
            data: data.data
          });
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient,
              template: data.template,
              status: NotificationStatus.SENT,
              provider: 'meta-whatsapp',
              ...(sent.messageId ? { providerMessageId: sent.messageId } : {})
            }
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown WhatsApp provider error';
          await prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WHATSAPP,
              recipient,
              template: data.template,
              status: NotificationStatus.FAILED,
              provider: 'meta-whatsapp',
              errorMessage
            }
          });
          await sendNotificationFailureAlert({
            prisma,
            template: data.template,
            channel: 'WHATSAPP',
            recipient,
            errorMessage,
            failureStage: 'WORKER_DELIVERY',
            queueName: 'notifications',
            jobName: job.name,
            jobId: String(job.id ?? 'unknown')
          });
          throw error;
        }
      }
    },
    { connection }
  );

  worker.on('failed', (job, error: unknown) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) return;
    void sendTechnicalFailureAlert({
      prisma,
      template: 'NotificationsWorkerTerminalFailure',
      channel: 'UNKNOWN',
      recipient: 'notifications-worker',
      errorMessage: error instanceof Error ? error.message : String(error),
      failureStage: 'WORKER_TERMINAL',
      queueName: 'notifications',
      jobName: job.name,
      jobId: job.id ?? 'unknown',
      domain: 'notifications',
      component: 'notifications-worker',
      terminalFailure: true
    });
  });

  return worker;
}

