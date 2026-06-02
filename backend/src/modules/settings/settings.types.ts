export type UpdateShippingSettingsInput = {
  pickupPincode: string;
  minOrderValuePaise: number;
};

export type ShippingSettingsResponse = {
  pickupPincode: string;
  minOrderValuePaise: number;
  source: 'database' | 'environment' | 'default';
};

export type StoreProfileResponse = {
  storeName: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
};

export type UpdateStoreProfileInput = {
  storeName?: string;
  websiteUrl?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  gstin?: string;
  fssaiNumber?: string;
};

export type NotificationSettingsResponse = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  primaryChannels: Record<string, PrimaryNotificationChannel>;
  smsTemplates: Record<string, string>;
};

export type NotificationFlags = Pick<NotificationSettingsResponse, 'emailEnabled' | 'smsEnabled' | 'whatsappEnabled'>;

export type UpdateNotificationSettingsInput = {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
  primaryChannels?: Record<string, PrimaryNotificationChannel>;
  smsTemplates?: Record<string, string>;
};

export type PrimaryNotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export type InventorySettingsResponse = {
  defaultLowStockThreshold: number;
};

export type UpdateInventorySettingsInput = {
  defaultLowStockThreshold: number;
};
