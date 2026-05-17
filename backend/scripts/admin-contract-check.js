const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const FETCH_TIMEOUT_MS = Number(process.env.CONTRACT_ADMIN_FETCH_TIMEOUT_MS || 10000);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@12345';

function formatFetchFailure(path, error) {
  const reason = error instanceof Error ? error.message : String(error);
  return [
    `Admin contract check could not reach ${BASE_URL}${path}.`,
    `Reason: ${reason}`,
    'Ensure the backend is running and BASE_URL points to that running server.',
    `Also seed or configure an admin user matching credentials ADMIN_EMAIL/ADMIN_PASSWORD (${ADMIN_EMAIL} / ${ADMIN_PASSWORD}).`
  ].join(' ');
}

async function request(path, options = {}) {
  const requestOptions = {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
  };

  try {
    return await fetch(`${BASE_URL}${path}`, requestOptions);
  } catch (error) {
    throw new Error(formatFetchFailure(path, error), {
      cause: error instanceof Error ? error : undefined
    });
  }
}

async function requestJson(path, options = {}) {
  const response = await request(path, options);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: response.status, json, headers: response.headers };
}

async function main() {
  const unauthProbe = await requestJson('/api/v1/admin/users');
  if (unauthProbe.status !== 401) {
    throw new Error(`Expected 401 on unauthenticated admin route probe, received ${unauthProbe.status}`);
  }

  const loginRes = await requestJson('/api/v1/auth/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
  });

  const token = loginRes.json?.data?.accessToken ?? loginRes.json?.accessToken;
  if (loginRes.status !== 200 || !token) {

    throw new Error(`Admin login failed: ${loginRes.status} ${JSON.stringify(loginRes.json)}`);
  }

  const authHeaders = { authorization: `Bearer ${token}` };

  const listUsersRes = await requestJson('/api/v1/admin/users', { headers: authHeaders });
  process.stdout.write(`/api/v1/admin/users => ${listUsersRes.status}\n`);
  if (listUsersRes.status !== 200) {
    throw new Error(`Contract check failed for /api/v1/admin/users: ${listUsersRes.status} ${JSON.stringify(listUsersRes.json)}`);
  }

  const listOrdersRes = await requestJson('/api/v1/admin/orders?page=1&limit=20', { headers: authHeaders });
  process.stdout.write(`/api/v1/admin/orders => ${listOrdersRes.status}\n`);
  if (listOrdersRes.status !== 200) {
    throw new Error(`Contract check failed for /api/v1/admin/orders: ${listOrdersRes.status}`);
  }
  const listProductsRes = await requestJson('/api/v1/admin/products?page=1&limit=20', { headers: authHeaders });
  process.stdout.write(`/api/v1/admin/products => ${listProductsRes.status}\n`);
  if (listProductsRes.status !== 200) {
    throw new Error(`Contract check failed for /api/v1/admin/products: ${listProductsRes.status}`);
  }

  // Extract candidate IDs: responses return { items: [...], meta: {...} } directly (no data wrapper).
  const candidateUserId = listUsersRes.json?.items?.[0]?.id ?? listUsersRes.json?.data?.items?.[0]?.id;
  const candidateOrderId = listOrdersRes.json?.items?.[0]?.id ?? listOrdersRes.json?.data?.items?.[0]?.id;
  const candidateProductId = listProductsRes.json?.items?.[0]?.id ?? listProductsRes.json?.data?.items?.[0]?.id;

  if (candidateOrderId) {
    const retriggerRes = await requestJson(`/api/v1/admin/orders/${candidateOrderId}/notifications/retrigger`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        template: 'OrderConfirmed',
        channels: ['EMAIL']
      })
    });
    process.stdout.write(
      `/api/v1/admin/orders/${candidateOrderId}/notifications/retrigger => ${retriggerRes.status}\n`
    );
    if (retriggerRes.status !== 200) {
      throw new Error(`Contract check failed for /api/v1/admin/orders/${candidateOrderId}/notifications/retrigger: ${retriggerRes.status}`);
    }
  }

  const jsonEndpoints = [
    ...(candidateUserId ? [`/api/v1/admin/users/${candidateUserId}`] : []),
    ...(candidateProductId ? [`/api/v1/admin/products/${candidateProductId}`] : []),
    '/api/v1/admin/categories',
    '/api/v1/admin/inventory?page=1&limit=20',
    '/api/v1/admin/inventory/low-stock',
    '/api/v1/admin/orders?page=1&limit=20',
    ...(candidateOrderId ? [`/api/v1/admin/orders/${candidateOrderId}`] : []),
    '/api/v1/admin/coupons?page=1&limit=20',
    '/api/v1/admin/coupons/analytics?page=1&limit=20',
    ...((process.env.FEATURE_REVIEWS_ENABLED ?? 'false').toLowerCase() === 'true'
      ? ['/api/v1/admin/reviews?page=1&limit=20']
      : []),
    '/api/v1/admin/settings/store',
    '/api/v1/admin/settings/notifications',
    '/api/v1/admin/settings/inventory',
    '/api/v1/admin/dashboard/kpis',
    '/api/v1/admin/dashboard/sales-chart',
    '/api/v1/admin/dashboard/top-products',
    '/api/v1/admin/analytics/revenue',
    '/api/v1/admin/analytics/funnel',
    '/api/v1/admin/analytics/inventory-alerts',
    '/api/v1/admin/analytics/notifications',
    '/api/v1/admin/analytics/category-breakdown',
    '/api/v1/admin/analytics/reconciliation-issues?page=1&limit=20',
    '/api/v1/admin/analytics/outbox-dead-letter?page=1&limit=20',
    '/api/v1/admin/analytics/inbox-failures?page=1&limit=20'
  ];

  for (const path of jsonEndpoints) {
    const res = await requestJson(path, { headers: authHeaders });
    process.stdout.write(`${path} => ${res.status}\n`);
    if (res.status !== 200) {
      throw new Error(`Contract check failed for ${path}: ${res.status} ${JSON.stringify(res.json)}`);
    }
  }

  const exportCsvRes = await request(
    `/api/v1/admin/orders/export?from=${encodeURIComponent('2026-01-01T00:00:00.000Z')}&to=${encodeURIComponent(
      new Date().toISOString()
    )}`,
    { headers: authHeaders }
  );
  const exportCsvContentType = exportCsvRes.headers.get('content-type') || '';
  process.stdout.write(`/api/v1/admin/orders/export => ${exportCsvRes.status} content-type=${exportCsvContentType}\n`);
  if (exportCsvRes.status !== 200 || !exportCsvContentType.includes('text/csv')) {
    throw new Error('Contract check failed for /api/v1/admin/orders/export');
  }

  const shippingSettingsPatchRes = await requestJson('/api/v1/admin/settings/shipping', {
    method: 'PATCH',
    headers: {
      ...authHeaders,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      pickupPincode: '522006',
      minOrderValuePaise: 10000
    })
  });
  process.stdout.write(
    `/api/v1/admin/settings/shipping [PATCH] => ${shippingSettingsPatchRes.status}\n`
  );
  if (shippingSettingsPatchRes.status !== 200) {
    throw new Error(`Contract check failed for PATCH /api/v1/admin/settings/shipping: ${shippingSettingsPatchRes.status}`);
  }
  // minOrderValuePaise may be at root or under .data depending on envelope
  const patchedMin = shippingSettingsPatchRes.json?.minOrderValuePaise ?? shippingSettingsPatchRes.json?.data?.minOrderValuePaise;
  if (patchedMin !== 10000) {
    throw new Error('Contract check failed for PATCH /api/v1/admin/settings/shipping: minOrderValuePaise mismatch');
  }

  const shippingSettingsGetRes = await requestJson('/api/v1/admin/settings/shipping', {
    headers: authHeaders
  });
  process.stdout.write(
    `/api/v1/admin/settings/shipping [GET] => ${shippingSettingsGetRes.status}\n`
  );
  if (shippingSettingsGetRes.status !== 200) {
    throw new Error(`Contract check failed for GET /api/v1/admin/settings/shipping: ${shippingSettingsGetRes.status}`);
  }
  const getMin = shippingSettingsGetRes.json?.minOrderValuePaise ?? shippingSettingsGetRes.json?.data?.minOrderValuePaise;
  if (typeof getMin !== 'number') {
    throw new Error('Contract check failed for GET /api/v1/admin/settings/shipping: minOrderValuePaise must be number');
  }
  if (getMin !== 10000) {
    throw new Error('Contract check failed for GET /api/v1/admin/settings/shipping: persisted minOrderValuePaise mismatch');
  }

  const refundedOrderRes = await requestJson('/api/v1/admin/orders?page=1&limit=1&status=REFUNDED', {
    headers: authHeaders
  });
  process.stdout.write(
    `/api/v1/admin/orders?status=REFUNDED => ${refundedOrderRes.status}\n`
  );
  if (refundedOrderRes.status !== 200) {
    throw new Error(`Contract check failed for /api/v1/admin/orders?status=REFUNDED: ${refundedOrderRes.status}`);
  }

  const refundedOrderId = refundedOrderRes.json?.items?.[0]?.id ?? refundedOrderRes.json?.data?.items?.[0]?.id;
  if (refundedOrderId) {
    const refundedOrderDetailRes = await requestJson(`/api/v1/admin/orders/${refundedOrderId}`, {
      headers: authHeaders
    });
    process.stdout.write(
      `/api/v1/admin/orders/${refundedOrderId} => ${refundedOrderDetailRes.status}\n`
    );
    if (refundedOrderDetailRes.status !== 200) {
      throw new Error(`Contract check failed for refunded order detail: ${refundedOrderDetailRes.status}`);
    }

    const creditNotes = refundedOrderDetailRes.json?.creditNotes ?? refundedOrderDetailRes.json?.data?.creditNotes;
    if (!Array.isArray(creditNotes)) {
      throw new Error('Refunded order detail contract check failed: creditNotes must be an array');
    }

    for (const creditNote of creditNotes) {
      if (
        typeof creditNote !== 'object' ||
        creditNote === null ||
        typeof creditNote.creditNoteNumber !== 'string' ||
        typeof creditNote.originalInvoiceNumber !== 'string' ||
        typeof creditNote.reason !== 'string'
      ) {
        throw new Error('Refunded order detail contract check failed: invalid creditNotes item shape');
      }
    }
  } else {
    process.stdout.write('No refunded orders found; skipped refunded order detail creditNotes validation.\n');
  }

  const queuesRes = await request('/api/v1/admin/queues', {
    headers: authHeaders
  });
  const contentType = queuesRes.headers.get('content-type') || '';
  process.stdout.write(`/api/v1/admin/queues => ${queuesRes.status} content-type=${contentType}\n`);

  if (queuesRes.status !== 200 || !contentType.includes('text/html')) {
    throw new Error('Bull Board contract check failed');
  }


}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
