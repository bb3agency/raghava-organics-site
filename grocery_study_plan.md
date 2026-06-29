# Grocery Platform — 60‑Minute Interview Study Plan

> Goal: be able to confidently explain the architecture, payment/order reliability, courier
> integrations, and auth of **this** codebase — grounded in real files, not generic ecommerce theory.

---

## 0. Architecture & Deployment Overview (5 min)

**Shape:** Headless storefront (Next.js 15 App Router, RSC) → typed REST API (Fastify + TypeScript)
→ PostgreSQL (Prisma) + Redis. Two clients (raghava, sbgs) share one versioned platform core.

- **Frontend:** `frontend/app/` — route groups `(storefront)`, `(account)`, `(auth)`, `(admin)`, `(ops)`.
  Server Components fetch directly; mutations go through Server Actions; tokens live in Zustand memory.
- **Backend:** `backend/src/` — `app.ts` (Fastify bootstrap), `modules/*` (vertical slices:
  `orders`, `payments`, `shipping`, `auth`, `cart`, `inventory`, `coupons`, `ops`…),
  `common/*` (cross‑cutting: `idempotency`, `reliability`, `redis`, `auth`, `errors`).
- **Provider pattern:** payments and shipping are **adapter‑based** (`adapters/razorpay`, `cod`, `noop`;
  `adapters/delhivery`, `shiprocket`, `noop`) selected at runtime from Ops DB config.

**Likely questions:** Why headless? Why Fastify modules over a monolith controller? Why RSC vs SPA?

---

## 1. Domain Model — PostgreSQL + Prisma (8 min)

Single source of truth: `backend/prisma/schema.prisma` (~1030 lines, ~50 models).

Core chain to memorize:
`User → Cart → CartItem` … `Order → OrderItem → Payment → Shipment → ShipmentEvent`.

- **Money as Int (paise)** everywhere — never floats. Frontend divides by 100 on display only.
- **Catalogue:** `Product → ProductVariant → Inventory` (+ `InventoryAdjustment` audit trail).
- **Reliability tables:** `IdempotencyRecord`, `OutboxMessage`, `WebhookInboxEvent`,
  `ReconciliationIssue` — these are the "distributed systems" talking points.
- **Auth tables:** `RefreshToken` (hashed, rotated), `PasswordResetToken`, `OpsOtpChallenge`,
  `AdminPermissionGrant`, `OpsConfigSecret` (encrypted provider keys).

**Talking points:** unique constraints for idempotency, status history as append‑only audit,
why secrets live in DB (`OpsConfigSecret`) not `.env`.

---

## 2. Checkout, Order & Payment Lifecycle (15 min — HIGHEST VALUE)

Flow: `cart → prepare-checkout → POST /orders → POST /payments/initiate → Razorpay modal →
POST /payments/verify` (PREPAID); COD short‑circuits after `/orders` with `paymentMode: 'COD'`.

Key files: `modules/orders/orders.service.ts`, `orders.routes.ts`, `modules/payments/*`.

**Idempotency (the headline):** `common/idempotency/idempotency.ts`
- `idempotency-key` header + per‑scope fingerprint (user / cart cookie / IP) + route + method +
  SHA‑256 hash of body → unique key in `IdempotencyRecord`.
- States `PROCESSING → COMPLETED/FAILED`; concurrent dupes get the cached response (no double‑charge).
- **Why:** payment POSTs are retried by clients/networks; backend must be exactly‑once.

**Trust boundary:** backend recomputes subtotal+tax+shipping−discount; Razorpay amount comes only
from `/payments/initiate`. Frontend never calculates the charged total.

**Talking points:** idempotency vs DB unique constraint; deferred/async REFUND lifecycle;
PREPAID vs COD branching; why prices are server‑authoritative.

---

## 3. Courier Integration + Reliability Patterns (12 min — HIGH VALUE)

Dual provider via `ShippingProviderAdapter` interface: `delhivery.adapter.ts`, `shiprocket.adapter.ts`.
Operations: rates/serviceability, create shipment (label + AWB), track, cancel.

**Circuit breaker:** `modules/shipping/shipping-provider.ts` → `CircuitBreakerShippingAdapter`
- `failureThreshold` (default 5), `cooldownMs` (30s), `openUntil` timestamp gate.
- `assertClosed()` throws 503 while open; `recordSuccess` resets; `recordFailure` trips.
- Noop/unconfigured adapters are intentionally **not** wrapped (config errors shouldn't trip breaker).
- Configurable via Ops: `SHIPPING_CB_FAILURE_THRESHOLD`, cooldown.

**Plus (from project memory):** per‑call timeouts via `Promise.race`, cancel‑by‑order_id (Shiprocket)
vs cancel‑by‑AWB (Delhivery), warehouse‑level pickup semantics.

**Talking points:** breaker states (closed/open/half‑open) — note this impl is closed/open with
cooldown; circuit breaker is **process‑local per replica** (not Redis‑shared) and why that's OK.

---

## 4. Auth, Sessions & Token Rotation (12 min — HIGH VALUE)

Multi‑role: customer / admin / ops. Files: `modules/auth/auth.service.ts`, `auth.routes.ts`,
`common/auth/*`, `auth-cookies.ts`.

- **Access token:** short‑lived JWT, kept in frontend memory (Zustand) only.
- **Refresh token:** httpOnly cookie; stored **bcrypt‑hashed** in `RefreshToken` table;
  7‑day TTL; bound to User‑Agent + IP context.
- **Rotation + reuse detection:** `refresh()` does atomic CAS (`updateMany where not consumed`);
  a replayed/consumed token → 401 and revokes all sessions. This is the rotation story.
- **OTP:** phone OTP (signup/login) + 2‑step admin OTP + 5 critical Ops ops need secondary OTP.
- **Authorization:** permission‑gated admin console; permissions snapshotted into the access token.

**Talking points:** why memory+httpOnly split; rotation vs reuse detection; token‑snapshot
permission staleness; why bcrypt‑hash refresh tokens at rest.

---

## 5. Redis — What & Why (5 min)

Files: `common/redis/redis-connection.ts`, `common/reliability`, cart reservations, rate‑limit.
- Caching, rate limiting (`common/rate-limit`), cart reservations / locks, OTP throttling,
  load‑shed + maintenance state, BullMQ queues (`modules/queues`, Bull Board).
- **Why:** fast shared coordination the DB shouldn't carry; ephemeral state with TTL.

**Talking points:** Redis as coordination layer vs Postgres as durable truth; maintenance mode
is **Postgres‑backed** (survives Redis flush) — a deliberate durability choice.

---

## 6. Reliability Extras (3 min)

Outbox (`OutboxMessage` + dead‑letter/replay), Webhook Inbox (`WebhookInboxEvent`, dedupe + replay),
`ReconciliationIssue`. Browser never calls webhook endpoints — providers hit `/api/v1/*/webhook`.

---

## Time Allocation (60 min)

| # | Section | Min | Priority |
|---|---------|-----|----------|
| 0 | Architecture overview | 5 | core |
| 1 | Data model (Prisma/PG) | 8 | core |
| 2 | Order + payment + idempotency | 15 | **top** |
| 3 | Courier + circuit breaker | 12 | **top** |
| 4 | Auth + token rotation | 12 | **top** |
| 5 | Redis | 5 | support |
| 6 | Outbox/inbox/reconciliation | 3 | support |

---

## Snippets to Produce in Phase 2 (memorizable, 10–30 lines each)

1. Idempotent order/payment pre‑handler (key + scope + body hash, PROCESSING→COMPLETED).
2. JWT issue + refresh rotation with atomic CAS reuse detection.
3. Circuit‑breaker adapter (assertClosed / recordFailure / cooldown).
4. Per‑call `Promise.race` timeout wrapper for a courier call.
5. Server‑authoritative total + Razorpay amount from `/payments/initiate`.
6. `formatPrice(paise)` + "never do math on display values" rule.
