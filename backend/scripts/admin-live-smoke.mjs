#!/usr/bin/env node
/**
 * Smoke-test admin API routes against a live local backend.
 * Usage: node scripts/admin-live-smoke.mjs [baseUrl]
 */
const base = (process.argv[2] ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');

const ADMIN_EMAIL = process.env.ADMIN_SMOKE_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_SMOKE_PASSWORD ?? 'Admin@12345';
const ADMIN_OTP = process.env.ADMIN_SMOKE_OTP ?? '000000';

const endpoints = [
  { method: 'GET', path: '/admin/dashboard/kpis?period=7d' },
  { method: 'GET', path: '/admin/dashboard/kpis?period=today' },
  { method: 'GET', path: '/admin/dashboard/sales-chart?granularity=day' },
  { method: 'GET', path: '/admin/dashboard/top-products?limit=5' },
  { method: 'GET', path: '/admin/orders?page=1&limit=5' },
  { method: 'GET', path: '/admin/orders/board' },
  { method: 'GET', path: '/admin/payments?page=1&limit=5' },
  { method: 'GET', path: '/admin/shipments?page=1&limit=5' },
  { method: 'GET', path: '/admin/inventory?page=1&limit=5' },
  { method: 'GET', path: '/admin/inventory/low-stock' },
  { method: 'GET', path: '/admin/products?page=1&limit=5' },
  { method: 'GET', path: '/admin/categories' },
  { method: 'GET', path: '/admin/users?page=1&limit=5' },
  { method: 'GET', path: '/admin/return-requests?page=1&limit=5' },
  { method: 'GET', path: '/admin/reviews?page=1&limit=5' },
  { method: 'GET', path: '/admin/coupons?page=1&limit=5' },
  { method: 'GET', path: '/admin/analytics/revenue?granularity=day' },
  { method: 'GET', path: '/admin/analytics/funnel' },
  { method: 'GET', path: '/admin/analytics/category-breakdown' },
  { method: 'GET', path: '/admin/analytics/inventory-alerts' },
  { method: 'GET', path: '/admin/analytics/notifications' },
  { method: 'GET', path: '/admin/analytics/reconciliation-issues?page=1&limit=5' },
  { method: 'GET', path: '/admin/analytics/outbox-dead-letter?page=1&limit=5' },
  { method: 'GET', path: '/admin/analytics/inbox-failures?page=1&limit=5' },
  { method: 'GET', path: '/admin/settings/shipping' },
  { method: 'GET', path: '/admin/settings/store' },
  { method: 'GET', path: '/admin/settings/inventory' },
  { method: 'GET', path: '/admin/settings/notifications' },
  { method: 'GET', path: '/admin/settings/cod' },
];

async function request(method, path, { token, body, cookieJar } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookieJar) headers.Cookie = cookieJar;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json, setCookie };
}

function extractRefreshCookie(setCookie) {
  const raw = setCookie.find((c) => c.startsWith('refresh_token='));
  if (!raw) return null;
  return raw.split(';')[0];
}

function unwrapPayload(json) {
  return json?.data !== undefined ? json.data : json;
}

async function main() {
  console.log(`Admin live smoke → ${base}`);

  const otpReq = await request('POST', '/auth/admin/login/request-otp', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (otpReq.status !== 200) {
    console.error('request-otp failed', otpReq.status, otpReq.json);
    process.exit(1);
  }
  console.log('request-otp OK:', otpReq.json?.data?.message ?? otpReq.json?.message);

  const verify = await request('POST', '/auth/admin/login/verify-otp', {
    body: { email: ADMIN_EMAIL, otp: ADMIN_OTP },
  });
  if (verify.status !== 200) {
    console.error('verify-otp failed', verify.status, verify.json);
    process.exit(1);
  }

  const accessToken =
    verify.json?.data?.accessToken ?? verify.json?.accessToken;
  const refreshCookie = extractRefreshCookie(verify.setCookie);
  if (!accessToken) {
    console.error('No accessToken in verify response', verify.json);
    process.exit(1);
  }
  console.log('verify-otp OK, token received');

  const auth = { token: accessToken, cookieJar: refreshCookie ?? undefined };

  let passed = 0;
  let failed = 0;

  async function check(label, method, path) {
    const res = await request(method, path, auth);
    const ok = res.status >= 200 && res.status < 300;
    const shape =
      res.json?.data !== undefined
        ? 'envelope'
        : Array.isArray(res.json)
          ? 'array'
          : typeof res.json;
    if (ok) {
      passed++;
      console.log(`  OK ${label} (${res.status}, ${shape})`);
    } else {
      failed++;
      const errMsg = res.json?.error?.message ?? JSON.stringify(res.json).slice(0, 120);
      console.error(`  FAIL ${label} (${res.status}) ${errMsg}`);
    }
    return res;
  }

  for (const ep of endpoints) {
    await check(`${ep.method} ${ep.path}`, ep.method, ep.path);
  }

  const ordersRes = await request('GET', '/admin/orders?page=1&limit=1', auth);
  const ordersPayload = unwrapPayload(ordersRes.json);
  const orderId = ordersPayload?.items?.[0]?.id;
  if (orderId) {
    await check(`GET /admin/orders/${orderId}`, 'GET', `/admin/orders/${orderId}`);
    await check(
      `GET /admin/orders/${orderId}/timeline`,
      'GET',
      `/admin/orders/${orderId}/timeline`,
    );
  } else {
    console.log('  SKIP order detail/timeline (no orders in database)');
  }

  const paymentsRes = await request('GET', '/admin/payments?page=1&limit=1', auth);
  const paymentId = unwrapPayload(paymentsRes.json)?.items?.[0]?.id;
  if (paymentId) {
    await check(`GET /admin/payments/${paymentId}`, 'GET', `/admin/payments/${paymentId}`);
  }

  const shipmentsRes = await request('GET', '/admin/shipments?page=1&limit=1', auth);
  const shipmentId = unwrapPayload(shipmentsRes.json)?.items?.[0]?.id;
  if (shipmentId) {
    await check(`GET /admin/shipments/${shipmentId}`, 'GET', `/admin/shipments/${shipmentId}`);
  }

  const returnsRes = await request('GET', '/admin/return-requests?page=1&limit=1', auth);
  const returnId = unwrapPayload(returnsRes.json)?.items?.[0]?.id;
  if (returnId) {
    await check(
      `GET /admin/return-requests/${returnId}`,
      'GET',
      `/admin/return-requests/${returnId}`,
    );
  }

  const couponsRes = await request('GET', '/admin/coupons?page=1&limit=1', auth);
  const couponId = unwrapPayload(couponsRes.json)?.items?.[0]?.id;
  if (couponId) {
    await check(`GET /admin/coupons/${couponId}`, 'GET', `/admin/coupons/${couponId}`);
    await check(
      `GET /admin/coupons/${couponId}/analytics`,
      'GET',
      `/admin/coupons/${couponId}/analytics`,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
