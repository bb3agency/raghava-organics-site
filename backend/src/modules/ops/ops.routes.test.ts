import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@common/guards/ops-auth.guard', () => ({
  opsAuthGuard: vi.fn(async (request: { opsUser?: { id: string } }) => {
    request.opsUser = { id: 'ops_1' };
  })
}));
vi.mock('@common/guards/ops-permissions.guard', () => ({
  opsPermissionGuard: vi.fn(() => async () => undefined)
}));

const loadShedState = vi.hoisted(() => ({
  getLoadShedMode: vi.fn(async () => 'normal')
}));
vi.mock('@common/reliability/load-shed.guard', () => ({
  getLoadShedMode: loadShedState.getLoadShedMode
}));

const opsServiceState = vi.hoisted(() => ({
  getConfigOverview: vi.fn(async () => ({
    generatedAt: new Date().toISOString(),
    runtimeProfile: 'development-like',
    domains: [],
    strictProfileHealth: {
      noPlaceholdersInStrict: true,
      missingRequiredKeysInStrict: []
    }
  })),
  validateConfigDraft: vi.fn(async () => ({
    valid: true,
    domain: null,
    checkedKeys: ['PAYMENT_PROVIDER'],
    errors: [],
    warnings: [],
    requiresRestart: true
  })),
  getStoredConfigSecrets: vi.fn(async () => ([
    {
      domain: 'payments',
      key: 'RAZORPAY_KEY_ID',
      maskedValue: 'rz******id',
      keyVersion: 1,
      requiresRestart: true,
      updatedAt: new Date().toISOString()
    }
  ])),
  saveConfigDraft: vi.fn(async () => ({
    valid: true,
    savedKeys: ['RAZORPAY_KEY_ID'],
    domain: 'payments',
    requiresRestart: true,
    masked: [{ key: 'RAZORPAY_KEY_ID', maskedValue: 'rz******id' }]
  })),
  requestEmailOtp: vi.fn(async () => ({
    challengeId: 'challenge_1',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  })),
  verifyEmailOtp: vi.fn(async () => ({ verified: true })),
  createOpsInvite: vi.fn(async () => ({
    inviteId: 'invite_1',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    setupUrl: 'https://client.com/ops/setup?token=abc'
  })),
  consumeOpsInvite: vi.fn(async () => ({
    opsUserId: 'ops_1',
    email: 'ops@example.com',
    name: 'Ops User',
    keyId: 'opskid_1',
    apiKey: 'opsk_1',
    permissions: ['OPS_READ'],
    ipAllowlist: ['127.0.0.1/32']
  })),
  cleanupExpiredInvites: vi.fn(async () => ({ cleaned: 0 })),
  getOpsSessionProfile: vi.fn(async () => ({
    id: 'ops_1',
    email: 'ops@example.com',
    name: 'Ops User',
    permissions: ['OPS_READ'],
    mfaEnabled: true,
    ipAllowlist: ['10.0.0.0/8'],
    lastLoginAt: null
  })),
  listApprovalRequests: vi.fn(async () => ({
    items: [],
    page: 1,
    limit: 20,
    total: 0
  })),
  requestLoadShedChange: vi.fn(async () => ({
    requestId: 'req_1',
    status: 'PENDING_APPROVAL',
    expiresAt: new Date().toISOString()
  })),
  confirmLoadShedChange: vi.fn(async () => ({ mode: 'normal', updated: true, requestId: 'req_1' })),
  rejectLoadShedChange: vi.fn(async () => ({ requestId: 'req_1', status: 'REJECTED', rejected: true })),
  listAuditLogs: vi.fn(async () => ({ items: [], page: 1, limit: 20, total: 0 }))
}));

vi.mock('./ops.service', () => {
  class MockOpsService {
    getConfigOverview = opsServiceState.getConfigOverview;
    validateConfigDraft = opsServiceState.validateConfigDraft;
    getStoredConfigSecrets = opsServiceState.getStoredConfigSecrets;
    saveConfigDraft = opsServiceState.saveConfigDraft;
    requestEmailOtp = opsServiceState.requestEmailOtp;
    verifyEmailOtp = opsServiceState.verifyEmailOtp;
    createOpsInvite = opsServiceState.createOpsInvite;
    consumeOpsInvite = opsServiceState.consumeOpsInvite;
    cleanupExpiredInvites = opsServiceState.cleanupExpiredInvites;
    getOpsSessionProfile = opsServiceState.getOpsSessionProfile;
    listApprovalRequests = opsServiceState.listApprovalRequests;
    requestLoadShedChange = opsServiceState.requestLoadShedChange;
    confirmLoadShedChange = opsServiceState.confirmLoadShedChange;
    rejectLoadShedChange = opsServiceState.rejectLoadShedChange;
    listAuditLogs = opsServiceState.listAuditLogs;
    constructor(_fastify: unknown) {}
  }
  return { OpsService: MockOpsService };
});

vi.mock('./ops.service.js', () => {
  class MockOpsService {
    getConfigOverview = opsServiceState.getConfigOverview;
    validateConfigDraft = opsServiceState.validateConfigDraft;
    getStoredConfigSecrets = opsServiceState.getStoredConfigSecrets;
    saveConfigDraft = opsServiceState.saveConfigDraft;
    requestEmailOtp = opsServiceState.requestEmailOtp;
    verifyEmailOtp = opsServiceState.verifyEmailOtp;
    createOpsInvite = opsServiceState.createOpsInvite;
    consumeOpsInvite = opsServiceState.consumeOpsInvite;
    cleanupExpiredInvites = opsServiceState.cleanupExpiredInvites;
    getOpsSessionProfile = opsServiceState.getOpsSessionProfile;
    listApprovalRequests = opsServiceState.listApprovalRequests;
    requestLoadShedChange = opsServiceState.requestLoadShedChange;
    confirmLoadShedChange = opsServiceState.confirmLoadShedChange;
    rejectLoadShedChange = opsServiceState.rejectLoadShedChange;
    listAuditLogs = opsServiceState.listAuditLogs;
    constructor(_fastify: unknown) {}
  }
  return { OpsService: MockOpsService };
});

vi.mock('./ops.service.ts', () => {
  class MockOpsService {
    getConfigOverview = opsServiceState.getConfigOverview;
    validateConfigDraft = opsServiceState.validateConfigDraft;
    getStoredConfigSecrets = opsServiceState.getStoredConfigSecrets;
    saveConfigDraft = opsServiceState.saveConfigDraft;
    requestEmailOtp = opsServiceState.requestEmailOtp;
    verifyEmailOtp = opsServiceState.verifyEmailOtp;
    createOpsInvite = opsServiceState.createOpsInvite;
    consumeOpsInvite = opsServiceState.consumeOpsInvite;
    cleanupExpiredInvites = opsServiceState.cleanupExpiredInvites;
    getOpsSessionProfile = opsServiceState.getOpsSessionProfile;
    listApprovalRequests = opsServiceState.listApprovalRequests;
    requestLoadShedChange = opsServiceState.requestLoadShedChange;
    confirmLoadShedChange = opsServiceState.confirmLoadShedChange;
    rejectLoadShedChange = opsServiceState.rejectLoadShedChange;
    listAuditLogs = opsServiceState.listAuditLogs;
    constructor(_fastify: unknown) {}
  }
  return { OpsService: MockOpsService };
});

import { registerOpsRoutes } from './ops.routes';

describe('ops routes schema and handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declares config overview and config validate route schemas', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);

    const overviewRoute = routes.find((entry) => entry.url === '/api/v1/ops/config/overview' && entry.method === 'GET');
    expect(overviewRoute).toBeDefined();
    const overviewSchema = overviewRoute?.schema as { response?: Record<number, unknown> };
    expect(overviewSchema.response?.[200]).toBeDefined();

    const validateRoute = routes.find((entry) => entry.url === '/api/v1/ops/config/validate' && entry.method === 'POST');
    expect(validateRoute).toBeDefined();
    const validateSchema = validateRoute?.schema as {
      body?: unknown;
      response?: Record<number, unknown>;
    };
    expect(validateSchema.body).toBeDefined();
    expect(validateSchema.response?.[200]).toBeDefined();

    const storedRoute = routes.find((entry) => entry.url === '/api/v1/ops/config/stored' && entry.method === 'GET');
    expect(storedRoute).toBeDefined();

    const saveRoute = routes.find((entry) => entry.url === '/api/v1/ops/config/save' && entry.method === 'POST');
    expect(saveRoute).toBeDefined();

    const otpRequestRoute = routes.find((entry) => entry.url === '/api/v1/ops/otp/request' && entry.method === 'POST');
    expect(otpRequestRoute).toBeDefined();

    const otpVerifyRoute = routes.find((entry) => entry.url === '/api/v1/ops/otp/verify' && entry.method === 'POST');
    expect(otpVerifyRoute).toBeDefined();

    const inviteRoute = routes.find((entry) => entry.url === '/api/v1/ops/invites' && entry.method === 'POST');
    expect(inviteRoute).toBeDefined();

    const consumeRoute = routes.find((entry) => entry.url === '/api/v1/ops/invites/consume' && entry.method === 'POST');
    expect(consumeRoute).toBeDefined();

    const cleanupRoute = routes.find((entry) => entry.url === '/api/v1/ops/invites/cleanup-expired' && entry.method === 'POST');
    expect(cleanupRoute).toBeDefined();

    await app.close();
  });

  it('declares invite, otp, and config-save route contracts', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);

    const inviteRoute = routes.find((entry) => entry.url === '/api/v1/ops/invites' && entry.method === 'POST');
    expect(inviteRoute).toBeDefined();
    const inviteSchema = inviteRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(inviteSchema.body).toBeDefined();
    expect(inviteSchema.response?.[200]).toBeDefined();

    const consumeRoute = routes.find((entry) => entry.url === '/api/v1/ops/invites/consume' && entry.method === 'POST');
    expect(consumeRoute).toBeDefined();
    const consumeSchema = consumeRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(consumeSchema.body).toBeDefined();
    expect(consumeSchema.response?.[200]).toBeDefined();

    const otpRequestRoute = routes.find((entry) => entry.url === '/api/v1/ops/otp/request' && entry.method === 'POST');
    expect(otpRequestRoute).toBeDefined();
    const otpRequestSchema = otpRequestRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(otpRequestSchema.body).toBeDefined();
    expect(otpRequestSchema.response?.[200]).toBeDefined();

    const otpVerifyRoute = routes.find((entry) => entry.url === '/api/v1/ops/otp/verify' && entry.method === 'POST');
    expect(otpVerifyRoute).toBeDefined();
    const otpVerifySchema = otpVerifyRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(otpVerifySchema.body).toBeDefined();
    expect(otpVerifySchema.response?.[200]).toBeDefined();

    const saveRoute = routes.find((entry) => entry.url === '/api/v1/ops/config/save' && entry.method === 'POST');
    expect(saveRoute).toBeDefined();
    const saveSchema = saveRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(saveSchema.body).toBeDefined();
    expect(saveSchema.response?.[200]).toBeDefined();

    const cleanupRoute = routes.find((entry) => entry.url === '/api/v1/ops/invites/cleanup-expired' && entry.method === 'POST');
    expect(cleanupRoute).toBeDefined();
    const cleanupSchema = cleanupRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(cleanupSchema.body).toBeDefined();
    expect(cleanupSchema.response?.[200]).toBeDefined();

    await app.close();
  });

  it('declares session route schema for frontend bootstrap', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);
    const route = routes.find((entry) => entry.url === '/api/v1/ops/session' && entry.method === 'GET');
    expect(route).toBeDefined();
    const schema = route?.schema as { response?: Record<number, unknown> };
    expect(schema.response?.[200]).toBeDefined();
    await app.close();
  });

  it('declares explicit params/querystring schema for GET load-shed', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);
    const route = routes.find((entry) => entry.url === '/api/v1/ops/load-shed' && entry.method === 'GET');
    expect(route).toBeDefined();
    const schema = route?.schema as { params?: unknown; querystring?: unknown };
    expect(schema.params).toBeDefined();
    expect(schema.querystring).toBeDefined();
    await app.close();
  });

  it('declares dual-approval response schema for POST load-shed', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);
    const route = routes.find((entry) => entry.url === '/api/v1/ops/load-shed' && entry.method === 'POST');
    expect(route).toBeDefined();
    const schema = route?.schema as {
      params?: unknown;
      querystring?: unknown;
      body?: unknown;
      response?: Record<number, unknown>;
    };
    expect(schema.params).toBeDefined();
    expect(schema.querystring).toBeDefined();
    expect(schema.body).toBeDefined();
    expect(schema.response?.[202]).toBeDefined();
    await app.close();
  });

  it('declares approval confirm route schema', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);
    const route = routes.find((entry) => entry.url === '/api/v1/ops/approvals/:requestId/confirm' && entry.method === 'POST');
    expect(route).toBeDefined();
    const schema = route?.schema as {
      params?: { required?: string[] };
      querystring?: unknown;
      body?: unknown;
      response?: Record<number, unknown>;
    };
    expect(schema.params).toBeDefined();
    expect(schema.params?.required).toContain('requestId');
    expect(schema.querystring).toBeDefined();
    expect(schema.body).toBeDefined();
    expect(schema.response?.[200]).toBeDefined();
    await app.close();
  });

  it('declares approvals list, reject, and audit logs route schemas', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown }> = [];
    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema
      });
    });
    await registerOpsRoutes(app);

    const approvalsList = routes.find((entry) => entry.url === '/api/v1/ops/approvals' && entry.method === 'GET');
    expect(approvalsList).toBeDefined();
    const approvalsListSchema = approvalsList?.schema as { response?: Record<number, unknown> };
    expect(approvalsListSchema.response?.[200]).toBeDefined();

    const rejectRoute = routes.find((entry) => entry.url === '/api/v1/ops/approvals/:requestId/reject' && entry.method === 'POST');
    expect(rejectRoute).toBeDefined();
    const rejectSchema = rejectRoute?.schema as { body?: unknown; response?: Record<number, unknown> };
    expect(rejectSchema.body).toBeDefined();
    expect(rejectSchema.response?.[200]).toBeDefined();

    const auditRoute = routes.find((entry) => entry.url === '/api/v1/ops/audit/logs' && entry.method === 'GET');
    expect(auditRoute).toBeDefined();
    const auditSchema = auditRoute?.schema as { response?: Record<number, unknown> };
    expect(auditSchema.response?.[200]).toBeDefined();

    await app.close();
  });
});
