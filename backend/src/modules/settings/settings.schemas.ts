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
  required: ['storeName', 'websiteUrl', 'logoUrl', 'contactEmail', 'contactPhone', 'gstin', 'fssaiNumber'],
  properties: {
    storeName: { anyOf: [{ type: 'string', maxLength: 150 }, { type: 'null' }] },
    websiteUrl: { anyOf: [{ type: 'string', maxLength: 1000 }, { type: 'null' }] },
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
  required: ['emailEnabled', 'smsEnabled', 'whatsappEnabled', 'primaryChannels', 'smsTemplates'],
  properties: {
    emailEnabled: { type: 'boolean' },
    smsEnabled: { type: 'boolean' },
    whatsappEnabled: { type: 'boolean' },
    primaryChannels: {
      type: 'object',
      additionalProperties: {
        type: 'string',
        enum: ['EMAIL', 'SMS', 'WHATSAPP']
      },
      maxProperties: 100
    },
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
      websiteUrl: { type: 'string', maxLength: 1000 },
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
      primaryChannels: {
        type: 'object',
        additionalProperties: {
          type: 'string',
          enum: ['EMAIL', 'SMS', 'WHATSAPP']
        },
        maxProperties: 100
      },
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

const codSettingsShape = {
  type: 'object',
  additionalProperties: false,
  required: ['isCodEnabled', 'cancellationWindowHours'],
  properties: {
    isCodEnabled: { type: 'boolean' },
    cancellationWindowHours: { type: 'integer', minimum: 1 },
    sellerState: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] }
  }
} as const;

export const getCodSettingsSchema = {
  tags: ['admin', 'settings'],
  summary: 'Get COD and cancellation settings',
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  response: {
    200: codSettingsShape,
    ...standardAdminErrorResponses
  }
} as const;

export const updateCodSettingsSchema = {
  tags: ['admin', 'settings'],
  summary: 'Update COD and cancellation settings',
  params: emptyParamsSchema,
  querystring: emptyQuerystringSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      isCodEnabled: { type: 'boolean' },
      cancellationWindowHours: { type: 'integer', minimum: 1, maximum: 720 },
      sellerState: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] }
    }
  },
  response: {
    200: codSettingsShape,
    ...standardAdminErrorResponses
  }
} as const;
