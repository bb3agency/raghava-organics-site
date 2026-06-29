# Grocery Platform — Interview Notes (Full Project)

> Companion to `grocery_study_plan.md`. Snippets are simplified-but-faithful versions of real
> code. File references are exact so you can open and point at them.
>
> **Core 3 (memorize cold):** §1 Payments · §2 Courier · §3 Auth.
> **Breadth (be able to speak to):** §0 Architecture · §4 Cart/Inventory · §5 Coupons ·
> §6 Outbox/Inbox/Reconciliation · §7 Notifications · §8 Ops control plane · §9 Frontend (RSC).

---

## 0. Architecture & Request Flow (the 60-second map)

**Shape:** Next.js 15 storefront (App Router + React Server Components) → Fastify/TypeScript REST API
→ PostgreSQL (Prisma) + Redis. Two clients (raghava, sbgs) share one **versioned platform core**;
per-client differences live in design tokens and `FEATURE_*` flags, not forked code.

- **Backend layout:** `backend/src/` → `app.ts` (Fastify bootstrap + plugins), `main.ts` (entry),
  `modules/*` are **vertical slices** (each has `*.routes.ts`, `*.service.ts`, `*.schemas.ts`,
  `*.types.ts` + colocated tests), `common/*` is cross-cutting (idempotency, reliability, redis,
  auth, errors, rate-limit, observability).
- **Adapter pattern everywhere external:** payments (`razorpay`/`cod`/`noop`), shipping
  (`delhivery`/`shiprocket`/`noop`), notifications (`resend`/`msg91`/`fast2sms`/`meta-whatsapp`).
  The active provider is resolved at runtime from **Ops DB config**, not `.env`.
- **Secrets:** only bootstrap keys (`DATABASE_URL`, `JWT_SECRET`, `OPS_DB_ENCRYPTION_KEY`) are in
  `.env`; provider API keys live encrypted in `OpsConfigSecret` and are loaded at runtime.
- **Three planes:** customer storefront (`/api/v1/*`), merchant admin (`/api/v1/admin/*`,
  permission-gated), platform ops (`/api/v1/ops/*`, cookie-session). They never proxy through each other.

**One-liner:** "Headless Next.js 15 + RSC over a modular Fastify API on Postgres/Prisma/Redis, with
every external dependency behind a swappable adapter hardened by idempotency, timeouts, and breakers."

**Likely questions:** Why modular monolith over microservices? (One deploy, shared types, clear
module boundaries — split later if a module needs independent scale.) Why adapters? (Swap providers by
config; test with `noop`; isolate failures.)

---

## 1. Payments & Idempotency  ★ exactly-once, deferred refunds, trust boundary

**Where it lives:** `backend/src/common/idempotency/idempotency.ts`,
`backend/src/modules/orders/orders.service.ts`, `backend/src/modules/payments/*`.

**How it works in my code:**
- Critical writes (`POST /orders`, `/payments/initiate`, `/payments/verify`) carry an
  `idempotency-key` header. A Fastify **pre-handler** turns it into a unique row in
  `IdempotencyRecord`, keyed by `scopeKey + route + method + idempotencyKey`.
- `scopeKey` is a fingerprint of *who* is calling — logged-in user, else `cart_session` cookie,
  else IP — so one user's key can't collide with another's.
- The body is SHA-256 hashed. Same key + **different** body → `409 payload mismatch` (catches bugs).
- State machine on the row: `PROCESSING → COMPLETED | FAILED`.
  - `PROCESSING` already exists → `409 already processing` (blocks concurrent double-submit).
  - `COMPLETED` → **replay the stored response** with header `Idempotent-Replayed: true` (no re-charge).
  - `FAILED` → allowed to retry, but an **atomic CAS** (`updateMany where status: FAILED`) ensures
    only one retry flips it back to `PROCESSING`.
- TTL 24h.

**Trust boundary (say this unprompted):** the backend recomputes
`subtotal + tax + shipping − discount`; the Razorpay amount the modal opens with comes **only** from
`/payments/initiate`. The frontend never computes the charged total — prevents price tampering.

**Deferred refund lifecycle:** admin cancel/refund (`orders.service.ts` ~L794+) does **not** flip the
order to `REFUNDED` inline. It validates the captured payment, **queues** the refund
(`queuedRefund = true`), and the UI shows a "Refund Pending" state until a worker/provider webhook
confirms. Refunds are async because the provider settles them asynchronously.

### Snippet A — Idempotency pre-handler (the core decision)
```ts
const existing = await prisma.idempotencyRecord.findUnique({
  where: { scopeKey_route_method_idempotencyKey: { scopeKey, route, method, idempotencyKey } },
});

if (existing) {
  if (existing.requestHash !== requestHash)          // same key, different body
    throw new AppError(CONFLICT, 'Idempotency-Key payload mismatch', 409);
  if (existing.status === 'PROCESSING')              // concurrent duplicate in flight
    throw new AppError(CONFLICT, 'Already processing', 409);
  if (existing.status === 'COMPLETED')               // replay cached response — no re-charge
    return reply.code(existing.responseStatus ?? 200).send(existing.responsePayload);
}
// else: create row as PROCESSING, run handler, then mark COMPLETED with the response.
```

**How I'd describe it:** "Payment POSTs get retried by flaky networks and impatient users. I make
them exactly-once: a per-scope idempotency key persisted in Postgres with a PROCESSING/COMPLETED
state machine, so a duplicate either blocks (in-flight) or replays the original response — never a
second charge."

**Follow-ups:**
- *Idempotency vs a DB unique constraint?* Unique constraint stops the duplicate *row*; idempotency
  also returns the **original response** for the retry and handles the in-flight race. I use both —
  unique constraint on the record backs the logic.
- *Why hash the body?* To detect a reused key with changed data — a client bug or attack — instead of
  silently serving the wrong cached result.
- *Two requests race the same new key?* The unique constraint makes one `create` win; the loser reads
  `PROCESSING` and gets a 409. CAS handles the FAILED-retry race the same way.

---

## 2. Courier Reliability  ★ keep it simple: circuit breaker + timeout

**Where it lives:** `backend/src/modules/shipping/shipping-provider.ts` (breaker),
`adapters/delhivery.adapter.ts` + `adapters/shiprocket.adapter.ts` (per-call timeout).
Both implement one `ShippingProviderAdapter` interface (rates, create+label+AWB, track, cancel).

**Two reliability layers — that's all you need to remember:**

1. **Circuit breaker** wraps the adapter. Count failures; after 5, "open" for 30s and fail fast with
   503 instead of hammering a dead provider. Success resets the count. Noop/unconfigured adapters
   aren't wrapped (a config error shouldn't trip the breaker).
2. **Per-call timeout** inside the adapter: race the fetch against a 12s wall-clock timer so a stalled
   provider never hangs the request (which would surface as an Nginx 502).

The breaker is **process-local per replica** (not shared via Redis) — simple, and fine because each
instance independently protects itself.

### Snippet B — Circuit breaker (simplified)
```ts
class CircuitBreakerShippingAdapter {
  private failures = 0;
  private openUntil = 0;
  constructor(private delegate, private threshold = 5, private cooldownMs = 30_000) {}

  async createShipment(input) {
    if (Date.now() < this.openUntil)                 // OPEN: fail fast
      throw new AppError(INTERNAL_ERROR, 'Shipping provider temporarily unavailable', 503);
    try {
      const r = await this.delegate.createShipment(input);
      this.failures = 0; this.openUntil = 0;         // success → CLOSED
      return r;
    } catch (e) {
      if (++this.failures >= this.threshold)         // trip → OPEN for cooldown
        { this.openUntil = Date.now() + this.cooldownMs; this.failures = 0; }
      throw e;
    }
  }
}
```

### Snippet C — Hard timeout (Promise.race)
```ts
const controller = new AbortController();
const timeout = new Promise((_, reject) =>
  setTimeout(() => { controller.abort(); reject(new AppError(INTERNAL_ERROR, 'Provider timed out', 422)); }, 12_000)
);
const operation = fetch(url, { ...init, signal: controller.signal }).then(r => r.text());
operation.catch(() => {});                           // swallow late rejection (no unhandled crash)
return await Promise.race([operation, timeout]);     // whichever settles first wins
```

**How I'd describe it:** "Two providers, one adapter interface. Each call has a 12-second hard
timeout via Promise.race so a stalled provider can't hang the request, and the adapter is wrapped in a
circuit breaker that fails fast after repeated errors so we don't pile load onto a provider that's
already down."

**Follow-ups:**
- *Breaker states?* Mine is closed ↔ open with a cooldown (the cooldown expiry acts as the half-open
  probe — the next call tests the provider; success closes it).
- *Why race instead of just AbortController?* In some Node/undici versions an aborted signal doesn't
  interrupt a stalled body read, so `response.text()` hangs. The wall-clock race guarantees the method
  always settles. (Real comment is in `delhivery.adapter.ts`.)
- *Failover between providers?* Provider is selected from Ops config; the breaker isolates a failing
  one. Cancellation differs per provider — Shiprocket cancels by order_id, Delhivery by AWB.

---

## 3. Auth & Token Rotation  ★ memory + httpOnly, rotation with reuse detection

**Where it lives:** `backend/src/modules/auth/auth.service.ts`, `auth-cookies.ts`,
`common/auth/*`. Roles: customer / admin / ops.

**How it works in my code:**
- **Access token:** short-lived JWT, held in frontend **memory** (Zustand) — never localStorage.
- **Refresh token:** **httpOnly cookie**; stored **bcrypt-hashed** in the `RefreshToken` table
  (7-day TTL), bound to a device context (User-Agent + IP hash).
- **Rotation:** every refresh consumes the old token and issues a new one.
- **Reuse detection:** if a refresh token doesn't match the stored hash or the device context is
  wrong → **revoke all sessions** for that session id (a stolen/replayed token can't continue).
- **Atomic CAS consume:** `updateMany where consumedAt: null` — if count is 0, someone already used it
  → 401. Stops two concurrent refreshes from both succeeding.
- **OTP:** phone OTP for customer signup/login; 2-step OTP for admin login; 5 critical Ops actions
  need a secondary OTP. Admin permissions are snapshotted into the access token.

### Snippet D — Refresh rotation with CAS + reuse detection
```ts
const rec = await prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
if (!rec || rec.revokedAt || rec.consumedAt || rec.expiresAt <= new Date())
  throw new AppError(UNAUTHORISED, 'Invalid refresh token', 401);

if (!(await bcrypt.compare(refreshToken, rec.tokenHash)) || rec.deviceKeyHash !== ctx.deviceKeyHash) {
  await prisma.refreshToken.updateMany(                 // reuse/theft → kill the whole session
    { where: { sessionId: payload.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  throw new AppError(UNAUTHORISED, 'Invalid refresh token', 401);
}
const consumed = await prisma.refreshToken.updateMany(  // atomic CAS: consume once
  { where: { id: rec.id, consumedAt: null }, data: { consumedAt: new Date() } });
if (consumed.count === 0) throw new AppError(UNAUTHORISED, 'Already consumed', 401);

return issueTokensForUser(user, { sessionId: payload.sid });  // rotate: new access + refresh
```

**How I'd describe it:** "Access tokens live in memory and are short-lived; refresh tokens are
httpOnly cookies, bcrypt-hashed at rest, and rotated on every use. An atomic compare-and-set consumes
each refresh exactly once, and a mismatch triggers reuse detection that revokes the whole session."

**Follow-ups:**
- *Why memory + httpOnly split?* Memory access token isn't reachable by XSS-stolen localStorage;
  httpOnly refresh isn't reachable by JS at all. Short access TTL limits the blast radius.
- *Why hash refresh tokens?* So a DB leak doesn't hand out usable sessions — same reason as passwords.
- *Permission staleness?* Permissions are snapshotted in the access token, so a grant/revoke only
  takes effect after the next refresh — I force a refresh/redirect after permission changes.

---

## 4. Cart, Inventory & Reservations

**Where it lives:** `modules/cart/cart.service.ts`, `modules/inventory/inventory.service.ts`,
Prisma models `Cart`, `CartItem`, `CartReservation`, `Inventory`, `InventoryAdjustment`.

**How it works:**
- **Guest + logged-in carts:** guests get a `cart_session` httpOnly cookie; on login the guest cart is
  **merged** into the user cart (items + coupon). Same cookie is the idempotency scope for anon users.
- **Reservations (oversell protection):** adding an item upserts a `CartReservation` with a TTL
  (`CART_RESERVATION_TTL_MINUTES`, default 20) inside a DB transaction, and extends the cart's
  reservation window. A `HOT_SKU_USER_RESERVE_CAP` limits how much of a hot SKU one user can hold.
- **Inventory as ledger:** stock changes go through `InventoryAdjustment` (append-only audit) — never a
  blind `UPDATE` — so every decrement/restock is traceable. Bulk updates roll back fully on any failure.
- **Stock decrement happens at order creation inside a transaction**, so the order and the stock change
  commit atomically.

**Talking points:** reservation-with-TTL vs hard decrement (reservations avoid locking inventory for
abandoned carts while still preventing oversell during checkout); ledger pattern for auditability;
why the merge-on-login matters for conversion.

**Follow-up — "two users buy the last unit at once?"** The decrement runs in a transaction at order
creation; the second transaction sees insufficient stock and fails. Reservations narrow the race
window before that point.

---

## 5. Coupons

**Where it lives:** `modules/coupons/coupons.service.ts`, models `Coupon`, `CouponUsage`,
`CouponAuditLog`.

- Full lifecycle: create → edit → pause/resume → soft-delete → restore (+ clone, + per-coupon audit
  log). **No hard delete** — deleted coupons stay visible with a restore action.
- Usage limits enforced by **aggregating `CouponUsage`** (global cap + per-user cap) rather than a
  mutable counter, so concurrent applies can't over-spend a coupon.
- Write actions are rate-limited (handle `429 RATE_LIMIT_EXCEEDED` gracefully). `BUY_X_GET_Y` type is
  feature-flagged off until v2.2.

**Talking point:** aggregate-on-read vs increment-a-counter — aggregation is race-safe and gives a
free audit trail; the trade-off is a heavier read, which is fine at coupon-apply volume.

---

## 6. Outbox / Inbox / Reconciliation  ★ the distributed-systems story

**Where it lives:** `orders.service.ts` (`enqueueOutboxMessage`, `claimWebhookInboxEvent`,
`markWebhookInboxEvent`), models `OutboxMessage`, `WebhookInboxEvent`, `ReconciliationIssue`.

- **Transactional outbox:** side-effects (refund initiation, notifications, shipment work) are written
  as an `OutboxMessage` **in the same DB transaction** as the state change, then a worker delivers them.
  This guarantees "if the order committed, the side-effect will eventually fire" — no lost events, no
  dual-write inconsistency. Failed messages go to a dead-letter list with replay.
- **Webhook inbox (inbound idempotency):** Razorpay/courier webhooks are **claimed** into
  `WebhookInboxEvent` by a unique event key before processing and marked `PROCESSED` after. A provider
  that delivers the same webhook twice (they retry) is deduped — processed exactly once.
- **Reconciliation:** `ReconciliationIssue` records mismatches (e.g., payment captured at provider but
  order not updated) for an operator to resolve — the safety net when async flows drift.

**How I'd describe it:** "Outbound side-effects use a transactional outbox so they can't be lost or
double-written; inbound webhooks use an inbox table keyed by event id so provider retries are
idempotent. Anything that still drifts lands in a reconciliation queue."

**Follow-ups:** *Why outbox instead of just calling the API inline?* Inline risks a dual-write: the DB
commits but the HTTP call fails (or vice-versa). Outbox makes the event part of the same transaction.
*Exactly-once delivery?* Truly exactly-once delivery is impossible; this is at-least-once delivery +
idempotent consumers (inbox dedupe) = effectively-once processing.

---

## 7. Notifications (multi-channel, provider-agnostic)

**Where it lives:** `modules/notifications/` — `notification-provider.ts`, `sms-template-registry.ts`,
`adapters/` (`resend` email, `msg91`/`fast2sms` SMS, `meta-whatsapp`), model `NotificationLog`.

- One interface, channel adapters chosen by config (`SMS_PROVIDER`, `NOTIFY_WHATSAPP_ENABLED`, etc.).
  `noop` mode for local dev surfaces the OTP in the UI instead of sending.
- Triggered **off the outbox/queue**, not inline in the request — so a slow SMS provider never blocks
  checkout. Every send is recorded in `NotificationLog` for delivery analytics.
- Backend also emits structured **failure alerts** to active Ops/Admin users on error paths
  (`notification-failure-alert.ts`).

**Talking point:** notifications are async + logged, so checkout latency is independent of provider
speed and delivery is observable.

---

## 8. Ops Control Plane (platform layer, separate from merchant admin)

**Where it lives:** `modules/ops/ops.service.ts`, `ops-config-contract.ts`, `ops-config-runtime.ts`.

- **Cookie session only** (`ops_session`) — no JWT, no API keys in the browser. Public routes are just
  `/ops/login` and `/ops/setup`; everything else is gated by `GET /ops/session`.
- **Config overlay:** non-bootstrap keys can be stored encrypted in `OpsConfigSecret` and override env
  at runtime; UI shows metadata (`mutableViaOps`, `requiresRestart`, `runtimeSource`) and **only masked
  secret values**.
- **5 critical ops require a secondary OTP** (config-save, load-shed, system-restart, user-deactivate,
  invite-revoke). Audit log is tamper-evident via chain hashing.
- **Load-shed / maintenance:** `normal | reduced | emergency | maintenance`; maintenance writes a
  durable Postgres row (survives Redis flush) with a 2-minute pending warning before Nginx serves a
  static page.

**Talking point:** clean separation — merchant actions never touch ops APIs; platform-level controls
(provider keys, load-shed) are isolated behind a stricter auth + OTP layer.

---

## 9. Frontend (Next.js 15, RSC)

**Where it lives:** `frontend/app/` route groups — `(storefront)`, `(account)`, `(auth)`,
`(admin)`, `(ops)`.

- **Server Components by default**; `"use client"` only for interactivity (cart sheet, search, modals).
  Read-heavy pages (catalogue, PDP, categories) render on the server → good LCP + SEO, minimal client JS.
- **Mutations via Server Actions**, then `revalidatePath`/`revalidateTag` to bust cache — no hand-written
  `route.ts` for data Server Components can fetch.
- **Rendering strategy:** SSG/ISR for catalogue (`revalidate`), SSR for cart/checkout/account
  (user-specific). Every route segment has a `loading.tsx` skeleton for streaming.
- **API client (`lib/api.ts`):** one typed fetch wrapper — canonical base URL, dual envelope/raw
  response parsing, `error.code` branching, 401→refresh→retry, idempotency-key injection on critical
  writes. Money formatted only at render via `formatPrice(paise)`.
- **Token handling:** access token in Zustand memory, refresh in httpOnly cookie (see §3).

**Talking points:** RSC vs SPA trade-off (server fetch + less client JS vs interactivity boundary);
why money is server-authoritative and only divided by 100 at display; why one centralized API client.

---

## Interview Cheat Sheet

**Snippets**
- **A — Idempotency pre-handler:** per-scope key + body hash + PROCESSING/COMPLETED state → exactly-once payments.
- **B — Circuit breaker:** fail fast after N errors, cooldown, reset on success.
- **C — Promise.race timeout:** 12s hard wall-clock so a stalled provider never hangs the request.
- **D — Refresh rotation:** bcrypt-compare + atomic CAS consume + revoke-all on reuse.

**Sound bites**
- *Reliability:* "Every external call has a hard timeout and a circuit breaker, so one slow or dead
  provider degrades gracefully instead of taking the request thread — or the page — down with it."
- *Idempotency:* "Payment writes are exactly-once: a per-scope idempotency key in Postgres with a
  state machine, so retries replay the original response and never double-charge."
- *Auth/security:* "Access tokens in memory, refresh tokens httpOnly and hashed, rotated on every use
  with reuse detection that kills the session — and money is always server-authoritative."

**One-liner architecture pitch:** "Headless Next.js 15 storefront over a modular Fastify/TypeScript
API on Postgres + Prisma + Redis, with payments and couriers behind swappable adapters hardened by
idempotency, timeouts, and circuit breakers."
