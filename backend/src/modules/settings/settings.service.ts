import { FastifyInstance } from 'fastify';
import { AppError } from '@common/errors/app-error';
import { ERROR_CODES } from '@common/errors/error-codes';
import { SmsTemplateRegistry } from '@modules/notifications/sms-template-registry';
import {
  InventorySettingsResponse,
  NotificationFlags,
  NotificationSettingsResponse,
  ShippingSettingsResponse,
  StoreProfileResponse,
  UpdateInventorySettingsInput,
  UpdateNotificationSettingsInput,
  UpdateShippingSettingsInput,
  UpdateStoreProfileInput
} from './settings.types';

export class SettingsService {
  private static readonly singletonKey = 'default';

  constructor(private readonly fastify: FastifyInstance) {}

  async getShippingSettings(): Promise<ShippingSettingsResponse> {
    const settings = await this.fastify.prisma.storeSettings.findUnique({
      where: { singletonKey: SettingsService.singletonKey },
      select: { pickupPincode: true, minOrderValuePaise: true, defaultLowStockThreshold: true }
    });

    if (settings) {
      return {
        pickupPincode: settings.pickupPincode,
        minOrderValuePaise: settings.minOrderValuePaise,
        source: 'database'
      };
    }

    const envPickup = (process.env.SHIPROCKET_PICKUP_PINCODE ?? process.env.DELHIVERY_PICKUP_PINCODE)?.trim();
    if (envPickup && envPickup.length === 6) {
      return {
        pickupPincode: envPickup,
        minOrderValuePaise: 0,
        source: 'environment'
      };
    }

    throw new AppError(ERROR_CODES.NOT_FOUND, 'Pickup pincode is not configured', 404);
  }

  async updateShippingSettings(input: UpdateShippingSettingsInput): Promise<ShippingSettingsResponse> {
    const pickupPincode = input.pickupPincode.trim();
    const minOrderValuePaise = Math.floor(input.minOrderValuePaise);
    const updated = await this.fastify.prisma.storeSettings.upsert({
      where: { singletonKey: SettingsService.singletonKey },
      update: { pickupPincode, minOrderValuePaise },
      create: {
        singletonKey: SettingsService.singletonKey,
        pickupPincode,
        minOrderValuePaise,
        defaultLowStockThreshold: 5
      },
      select: { pickupPincode: true, minOrderValuePaise: true }
    });

    return {
      pickupPincode: updated.pickupPincode,
      minOrderValuePaise: updated.minOrderValuePaise,
      source: 'database'
    };
  }

  async getStoreProfile(): Promise<StoreProfileResponse> {
    const settings = await this.fastify.prisma.storeSettings.findUnique({
      where: { singletonKey: SettingsService.singletonKey },
      select: {
        storeName: true,
        logoUrl: true,
        contactEmail: true,
        contactPhone: true,
        gstin: true,
        fssaiNumber: true
      }
    });

    return {
      storeName: settings?.storeName ?? null,
      logoUrl: settings?.logoUrl ?? null,
      contactEmail: settings?.contactEmail ?? null,
      contactPhone: settings?.contactPhone ?? null,
      gstin: settings?.gstin ?? null,
      fssaiNumber: settings?.fssaiNumber ?? null
    };
  }

  async updateStoreProfile(input: UpdateStoreProfileInput): Promise<StoreProfileResponse> {
    const updated = await this.fastify.prisma.storeSettings.upsert({
      where: { singletonKey: SettingsService.singletonKey },
      update: {
        ...(input.storeName !== undefined ? { storeName: input.storeName } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
        ...(input.fssaiNumber !== undefined ? { fssaiNumber: input.fssaiNumber } : {})
      },
      create: {
        singletonKey: SettingsService.singletonKey,
        pickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE ?? process.env.DELHIVERY_PICKUP_PINCODE ?? '500001',
        defaultLowStockThreshold: 5,
        ...(input.storeName !== undefined ? { storeName: input.storeName } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
        ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
        ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
        ...(input.fssaiNumber !== undefined ? { fssaiNumber: input.fssaiNumber } : {})
      },
      select: {
        storeName: true,
        logoUrl: true,
        contactEmail: true,
        contactPhone: true,
        gstin: true,
        fssaiNumber: true
      }
    });

    return {
      storeName: updated.storeName,
      logoUrl: updated.logoUrl,
      contactEmail: updated.contactEmail,
      contactPhone: updated.contactPhone,
      gstin: updated.gstin,
      fssaiNumber: updated.fssaiNumber
    };
  }

  async getNotificationSettings(): Promise<NotificationSettingsResponse> {
    const settings = await this.fastify.prisma.storeSettings.findUnique({
      where: { singletonKey: SettingsService.singletonKey },
      select: {
        notifyEmailEnabled: true,
        notifySmsEnabled: true,
        notifyWhatsappEnabled: true,
        smsTemplates: true
      }
    });

    return {
      emailEnabled: settings?.notifyEmailEnabled ?? true,
      smsEnabled: settings?.notifySmsEnabled ?? true,
      whatsappEnabled: settings?.notifyWhatsappEnabled ?? false,
      smsTemplates: SmsTemplateRegistry.normalizeTemplateOverrides(settings?.smsTemplates)
    };
  }

  async updateNotificationSettings(input: UpdateNotificationSettingsInput): Promise<NotificationSettingsResponse> {
    const normalizedSmsTemplates =
      input.smsTemplates !== undefined ? SmsTemplateRegistry.normalizeTemplateOverrides(input.smsTemplates) : undefined;

    const updated = await this.fastify.prisma.storeSettings.upsert({
      where: { singletonKey: SettingsService.singletonKey },
      update: {
        ...(input.emailEnabled !== undefined ? { notifyEmailEnabled: input.emailEnabled } : {}),
        ...(input.smsEnabled !== undefined ? { notifySmsEnabled: input.smsEnabled } : {}),
        ...(input.whatsappEnabled !== undefined ? { notifyWhatsappEnabled: input.whatsappEnabled } : {}),
        ...(normalizedSmsTemplates !== undefined ? { smsTemplates: normalizedSmsTemplates } : {})
      },
      create: {
        singletonKey: SettingsService.singletonKey,
        pickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE ?? process.env.DELHIVERY_PICKUP_PINCODE ?? '500001',
        defaultLowStockThreshold: 5,
        ...(input.emailEnabled !== undefined ? { notifyEmailEnabled: input.emailEnabled } : {}),
        ...(input.smsEnabled !== undefined ? { notifySmsEnabled: input.smsEnabled } : {}),
        ...(input.whatsappEnabled !== undefined ? { notifyWhatsappEnabled: input.whatsappEnabled } : {}),
        ...(normalizedSmsTemplates !== undefined ? { smsTemplates: normalizedSmsTemplates } : {})
      },
      select: {
        notifyEmailEnabled: true,
        notifySmsEnabled: true,
        notifyWhatsappEnabled: true,
        smsTemplates: true
      }
    });

    return {
      emailEnabled: updated.notifyEmailEnabled,
      smsEnabled: updated.notifySmsEnabled,
      whatsappEnabled: updated.notifyWhatsappEnabled,
      smsTemplates: SmsTemplateRegistry.normalizeTemplateOverrides(updated.smsTemplates)
    };
  }

  async resolveNotificationFlags(): Promise<NotificationFlags> {
    try {
      const settings = await this.fastify.prisma.storeSettings.findUnique({
        where: { singletonKey: SettingsService.singletonKey },
        select: {
          notifyEmailEnabled: true,
          notifySmsEnabled: true,
          notifyWhatsappEnabled: true
        }
      });

      return {
        emailEnabled: settings?.notifyEmailEnabled ?? (process.env.NOTIFY_EMAIL_ENABLED ?? 'true').toLowerCase() === 'true',
        smsEnabled: settings?.notifySmsEnabled ?? (process.env.NOTIFY_SMS_ENABLED ?? 'true').toLowerCase() === 'true',
        whatsappEnabled:
          settings?.notifyWhatsappEnabled ?? (process.env.NOTIFY_WHATSAPP_ENABLED ?? 'false').toLowerCase() === 'true'
      };
    } catch {
      return {
        emailEnabled: (process.env.NOTIFY_EMAIL_ENABLED ?? 'true').toLowerCase() === 'true',
        smsEnabled: (process.env.NOTIFY_SMS_ENABLED ?? 'true').toLowerCase() === 'true',
        whatsappEnabled: (process.env.NOTIFY_WHATSAPP_ENABLED ?? 'false').toLowerCase() === 'true'
      };
    }
  }

  async getInventorySettings(): Promise<InventorySettingsResponse> {
    const settings = await this.fastify.prisma.storeSettings.findUnique({
      where: { singletonKey: SettingsService.singletonKey },
      select: {
        defaultLowStockThreshold: true
      }
    });

    return {
      defaultLowStockThreshold: settings?.defaultLowStockThreshold ?? 5
    };
  }

  async updateInventorySettings(input: UpdateInventorySettingsInput): Promise<InventorySettingsResponse> {
    const threshold = Math.floor(input.defaultLowStockThreshold);
    const updated = await this.fastify.prisma.storeSettings.upsert({
      where: { singletonKey: SettingsService.singletonKey },
      update: {
        defaultLowStockThreshold: threshold
      },
      create: {
        singletonKey: SettingsService.singletonKey,
        pickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE ?? process.env.DELHIVERY_PICKUP_PINCODE ?? '500001',
        defaultLowStockThreshold: threshold
      },
      select: {
        defaultLowStockThreshold: true
      }
    });

    return {
      defaultLowStockThreshold: updated.defaultLowStockThreshold
    };
  }

  async getCodSettings(): Promise<{ isCodEnabled: boolean; cancellationWindowHours: number; sellerState: string | null }> {
    const settings = await this.fastify.prisma.storeSettings.findUnique({
      where: { singletonKey: SettingsService.singletonKey },
      select: { isCodEnabled: true, cancellationWindowHours: true, sellerState: true }
    }) as { isCodEnabled: boolean; cancellationWindowHours: number; sellerState: string | null } | null;
    return {
      isCodEnabled: settings?.isCodEnabled ?? false,
      cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
      sellerState: settings?.sellerState ?? null
    };
  }

  async updateCodSettings(input: { isCodEnabled?: boolean; cancellationWindowHours?: number; sellerState?: string | null }): Promise<{ isCodEnabled: boolean; cancellationWindowHours: number; sellerState: string | null }> {
    const updateData: Record<string, unknown> = {};
    if (input.isCodEnabled !== undefined) updateData['isCodEnabled'] = input.isCodEnabled;
    if (input.cancellationWindowHours !== undefined) updateData['cancellationWindowHours'] = Math.max(1, Math.floor(input.cancellationWindowHours));
    if (input.sellerState !== undefined) updateData['sellerState'] = input.sellerState;

    const updated = await this.fastify.prisma.storeSettings.upsert({
      where: { singletonKey: SettingsService.singletonKey },
      update: updateData,
      create: {
        singletonKey: SettingsService.singletonKey,
        pickupPincode: process.env.SHIPROCKET_PICKUP_PINCODE ?? process.env.DELHIVERY_PICKUP_PINCODE ?? '500001',
        defaultLowStockThreshold: 5,
        ...updateData
      },
      select: { isCodEnabled: true, cancellationWindowHours: true, sellerState: true }
    }) as { isCodEnabled: boolean; cancellationWindowHours: number; sellerState: string | null };
    return updated;
  }

  async resolveDefaultLowStockThreshold(): Promise<number> {
    const settings = await this.fastify.prisma.storeSettings.findUnique({
      where: { singletonKey: SettingsService.singletonKey },
      select: { defaultLowStockThreshold: true }
    });
    return settings?.defaultLowStockThreshold ?? 5;
  }
}
