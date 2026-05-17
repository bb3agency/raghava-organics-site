import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@common/guards/jwt-auth.guard', () => ({
  jwtAuthGuard: vi.fn(async () => undefined)
}));
vi.mock('@common/guards/roles.guard', () => ({
  rolesGuard: vi.fn(() => async () => undefined)
}));
vi.mock('@common/guards/admin-permissions.guard', () => ({
  adminPermissionGuard: vi.fn(() => async () => undefined)
}));

const usersServiceState = vi.hoisted(() => ({
  getMe: vi.fn(async () => ({
    id: 'user_1',
    email: 'user@example.com',
    phone: '9999999999',
    firstName: 'First',
    lastName: 'Last',
    role: 'CUSTOMER',
    isVerified: true
  })),
  patchMe: vi.fn(async () => ({
    id: 'user_1',
    email: 'user@example.com',
    phone: '9999999999',
    firstName: 'First',
    lastName: 'Last',
    role: 'CUSTOMER',
    isVerified: true
  })),
  listAddresses: vi.fn(async () => ({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } })),
  createAddress: vi.fn(async () => ({
    id: 'addr_1',
    fullName: 'First Last',
    phone: '9999999999',
    line1: 'Line 1',
    line2: null,
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500001',
    isDefault: true
  })),
  updateAddress: vi.fn(async () => ({
    id: 'addr_1',
    fullName: 'First Last',
    phone: '9999999999',
    line1: 'Line 1',
    line2: null,
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500001',
    isDefault: true
  })),
  deleteAddress: vi.fn(async () => ({ message: 'Address deleted' })),
  listOrders: vi.fn(async () => ({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } })),
  adminListUsers: vi.fn(async () => ({ items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } })),
  adminGetUserById: vi.fn(async () => ({
    id: 'user_1',
    email: 'user@example.com',
    phone: '9999999999',
    firstName: 'First',
    lastName: 'Last',
    isVerified: true,
    createdAt: new Date().toISOString(),
    addresses: [],
    orders: []
  }))
}));

vi.mock('./users.service', () => {
  class MockUsersService {
    getMe = usersServiceState.getMe;
    patchMe = usersServiceState.patchMe;
    listAddresses = usersServiceState.listAddresses;
    createAddress = usersServiceState.createAddress;
    updateAddress = usersServiceState.updateAddress;
    deleteAddress = usersServiceState.deleteAddress;
    listOrders = usersServiceState.listOrders;
    adminListUsers = usersServiceState.adminListUsers;
    adminGetUserById = usersServiceState.adminGetUserById;
    constructor(_fastify: unknown) {}
  }

  return { UsersService: MockUsersService };
});

import { registerUsersRoutes } from './users.routes';

describe('users routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers customer and admin routes with schema and guards', async () => {
    const app = Fastify();
    const routes: Array<{ method: string | string[]; url: string; schema?: unknown; preHandler?: unknown }> = [];

    app.addHook('onRoute', (routeOptions) => {
      routes.push({
        method: routeOptions.method,
        url: routeOptions.url,
        schema: routeOptions.schema,
        preHandler: routeOptions.preHandler
      });
    });

    await registerUsersRoutes(app);

    const me = routes.find((route) => route.url === '/api/v1/users/me' && route.method === 'GET');
    expect(me).toBeDefined();
    expect(me?.preHandler).toBeDefined();
    expect((me?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    const myAddresses = routes.find((route) => route.url === '/api/v1/users/me/addresses' && route.method === 'GET');
    expect(myAddresses).toBeDefined();
    expect(myAddresses?.preHandler).toBeDefined();

    const adminUsers = routes.find((route) => route.url === '/api/v1/admin/users' && route.method === 'GET');
    expect(adminUsers).toBeDefined();
    expect(adminUsers?.preHandler).toBeDefined();
    expect((adminUsers?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    const adminUserById = routes.find((route) => route.url === '/api/v1/admin/users/:id' && route.method === 'GET');
    expect(adminUserById).toBeDefined();
    expect(adminUserById?.preHandler).toBeDefined();
    expect((adminUserById?.schema as { response?: Record<number, unknown> }).response?.[200]).toBeDefined();

    await app.close();
  });
});
