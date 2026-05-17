import { standardAdminErrorResponses } from '@common/errors/error-response.schema';

const emptyParamsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {}
} as const;

const emptyQuerystringSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {}
} as const;

const shippingSettingsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['pickupPincode', 'minOrderValuePaise', 'source'],
  properties: {
    pickupPincode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
    minOrderValuePaise: { type: 'integer', minimum: 0, maximum: 1000000000 },
    source: { type: 'string', enum: ['database', 'environment'], maxLength: 20 }
  }
} as const;

const storeProfileSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['storeName', 'logoUrl', 'contactEmail', 'contactPhone', 'gstin', 'fssaiNumber'],
  properties: {
    storeName: { anyOf: [{ type: 'string', maxLength: 150 }, { type: 'null' }] },
    logoUrl: { anyOf: [{ type: 'string', maxLength: 1000 }, { type: 'null' }] },
    contactEmail: { anyOf: [{ type: 'string', maxLength: 200 }, { type: 'null' }] },
    contactPhone: { anyOf: [{ type: 'string', maxLength: 30 }, { type: 'null' }] },
    gstin: { anyOf: [{ type: 'string', maxLength: 30 }, { type: 'null' }] },
    fssaiNumber: { anyOf: [{ type: 'string', maxLength: 30 }, { type: 'null' }] }
  }
} as const;

const notificationSettingsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['emailEnabled', 'smsEnabled', 'whatsappEnabled', 'smsTemplates'],
  properties: {
    emailEnabled: { type: 'boolean' },
    smsEnabled: { type: 'boolean' },
    whatsappEnabled: { type: 'boolean' },
    smsTemplates: {
      type: 'object',
      additionalProperties: { type: 'string', maxLength: 320 },
      maxProperties: 50
    }
  }
} as const;

const inventorySettingsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['defaultLowStockThreshold'],
  properties: {
    defaultLowStockThreshold: { type: 'integer', minimum: 0, maximum: 1000000 }
  }
} as const;

export const getShippingSettingsSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  response: {
    200: shippingSettingsSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const updateShippingSettingsSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['pickupPincode', 'minOrderValuePaise'],
    properties: {
      pickupPincode: { type: 'string', minLength: 6, maxLength: 6, pattern: '^[0-9]{6}$' },
      minOrderValuePaise: { type: 'integer', minimum: 0, maximum: 1000000000 }
    }
  },
  response: {
    200: shippingSettingsSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const getStoreProfileSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  response: {
    200: storeProfileSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const updateStoreProfileSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      storeName: { type: 'string', maxLength: 150 },
      logoUrl: { type: 'string', maxLength: 1000 },
      contactEmail: { type: 'string', format: 'email', maxLength: 200 },
      contactPhone: { type: 'string', maxLength: 30 },
      gstin: { type: 'string', maxLength: 30 },
      fssaiNumber: { type: 'string', maxLength: 30 }
    }
  },
  response: {
    200: storeProfileSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const getNotificationSettingsSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  response: {
    200: notificationSettingsSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const updateNotificationSettingsSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      emailEnabled: { type: 'boolean' },
      smsEnabled: { type: 'boolean' },
      whatsappEnabled: { type: 'boolean' },
      smsTemplates: {
        type: 'object',
        additionalProperties: { type: 'string', maxLength: 320 },
        maxProperties: 50
      }
    }
  },
  response: {
    200: notificationSettingsSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const getInventorySettingsSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  response: {
    200: inventorySettingsSchema,
    ...standardAdminErrorResponses
  }
} as const;

export const updateInventorySettingsSchema = {
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['defaultLowStockThreshold'],
    properties: {
      defaultLowStockThreshold: { type: 'integer', minimum: 0, maximum: 1000000 }
    }
  },
  response: {
    200: inventorySettingsSchema,
    ...standardAdminErrorResponses
  }
} as const;
