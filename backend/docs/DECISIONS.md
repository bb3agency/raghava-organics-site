# Architectural Decisions

> **Format:** each entry is `[date] Title — Decision. Rationale. Alternatives considered. Affects.`

---

## [2026-05-15] SQL injection prevention — repository-wide unsafe raw query elimination

Comprehensive security sweep eliminated all SQL-injection footguns related to Prisma raw query APIs:

- **Removed unsafe APIs:** All `prisma.$executeRawUnsafe()` and `prisma.$queryRawUnsafe()` calls removed from production code. The only remaining raw queries use parameterized tagged-template literals (`prisma.$executeRaw\`...\`` / `prisma.$queryRaw\`...\``) with Prisma's template variable interpolation, which safely parameterizes all variables.
- **Guardrail script:** Added `scripts/sql-injection-guard.js` that scans `src/`, `queues/`, and `scripts/` for forbidden patterns: `$executeRawUnsafe`, `$queryRawUnsafe`, and `Prisma.raw()`. CI gate fails build if any unsafe pattern is detected.
- **Test coverage:** Added `scripts/sql-injection-guard.test.js` with 3 test cases covering detection of unsafe APIs and passing safe parameterized SQL.
- **Wired into CI:** New npm script `security:sql-injection-guard` runs in `test:guardrails` and `ci:reliability-gates`.

*Alt: eslint rule (rejected — pattern detection across template boundaries is complex); code review only (rejected — insufficient for security).* **Affects:** `scripts/seed-flash-sale-fixtures.js`, `scripts/sql-injection-guard.js`, `scripts/sql-injection-guard.test.js`, `package.json`.

## [2026-05-15] Final worker/service CAS hardening — inventory, outbox dispatch, coupon increment, MFA tests
Four remaining TOCTOU surfaces identified in a final pass and hardened:

- **Inventory service (`inventory.service.ts`):** `updateInventory` now uses CAS `updateMany({ where: { variantId, updatedAt: currentTimestamp }, data: { quantity, updatedAt: new Date() } })` instead of a non-guarded `update`. If zero rows are updated a `409 CONFLICT` is thrown. Mock-compatibility fallback (`preferUpdateForMock`) uses single-row `update` when the Prisma delegate carries `vi.fn` mock metadata. This prevents stale-read overwrites under concurrent admin stock adjustments.
- **Inventory alerts worker (`inventory-alerts.worker.ts`):** Added per-item atomic claim `updateMany({ where: { id, lowStockAlerted: false } })` before sending the low-stock notification and creating the alert event. A zero-count result skips the item, preventing duplicate alerts when two worker replicas race.
- **Outbox-dispatch worker (`outbox-dispatch.worker.ts`):** Added per-message atomic claim `updateMany({ where: { id, status: 'PUBLISHED' } })` before enqueuing the event onto the target BullMQ queue. A zero-count result skips the message, preventing duplicate event publishes under concurrent dispatcher instances.
- **Order-processing worker coupon `usesCount` (`order-processing.worker.ts`):** Coupon usage increment at order confirmation now uses CAS `updateMany({ where: { id: couponId, usesCount: { lt: maxUses } } })` to prevent overshooting the cap under concurrent order confirmations for the same coupon. Added a unified post-capture recovery path that rolls back both inventory and coupon side effects atomically on failure, and mock-compatibility fallback `update` for test environments.
- **Admin contract check script (`scripts/admin-contract-check.js`):** Replaced hardcoded admin email + password literals with `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables. Script startup hard-fails when either is absent, preventing accidental contract-smoke runs against production with leaked test credentials.
- **Auth MFA test coverage (`auth.service.mfa-refresh.test.ts`):** Added test for `disableAdminMfa` CAS `updateMany` path and `409 CONFLICT` race-loss scenario. Fixed incorrect expected string on `confirmAdminMfaSetup` success assertion (matched new response shape). Auth domain line coverage ratchet re-established after test addition.
*Alt: database-level advisory locks (rejected — adds infra dependency); optimistic retry loops (rejected — simpler to fail with 409 and let the caller retry).* **Affects:** `src/modules/inventory/inventory.service.ts`, `queues/workers/inventory-alerts.worker.ts`, `queues/workers/outbox-dispatch.worker.ts`, `queues/workers/order-processing.worker.ts`, `scripts/admin-contract-check.js`, `src/modules/auth/auth.service.mfa-refresh.test.ts`.

## [2026-05-14] Race-Condition Codebase Audit — Atomic CAS Operations and Distributed Locking
Comprehensive audit of race-condition classes (audit logs, outbox/inbox replay, idempotency, dual-approval transitions) with TOCTOU vulnerability elimination via Prisma `updateMany` Compare-And-Swap (CAS) pattern and Redis-distributed locks. Key fixes:
- **Idempotency:** `idempotencyPreHandler` now uses atomic `create` + unique-conflict catch + `updateMany` status-guard transition (PROCESSING/COMPLETED/FAILED) instead of race-prone read-then-upsert. Added compatibility fallbacks for test mocks lacking `updateMany`.
- **Admin Invites:** Invite expiry marking and consumption use atomic `updateMany` with `status in ['CREATED', 'EMAIL_SENT']` guard; fallback to `update` for legacy test mocks via vi.fn detection.
- **Auth Refresh Tokens:** Token consumption uses atomic `updateMany` with `consumedAt: null` guard to prevent double-consumption races; fallback to `update` for test mocks.
- **Ops Control Plane:** Dual-approval confirm/reject, invite expiry cleanup (`deleteMany`), and OTP verification (`updateMany` with attempt counter + status) all CAS-guarded. Redis lock (`OPS_AUDIT_LOCK_TTL_MS=5000`) serializes `OpsAuditLog` chain-head updates preventing hash-chain corruption under concurrent ops mutations.
- **Reconciliation Worker:** Order status transitions (REFUNDED, CANCELLED) use atomic `updateMany` with status guards; fallback to `update` for worker test mocks.
- **Orders Webhook Inbox:** `claimWebhookInboxEvent` uses atomic `create` + unique-violation catch + CAS `updateMany` for FAILED→PROCESSING reclamation.
- **Analytics Replay:** Outbox dead-letter and inbox failure replays use `updateMany` with status guards (PENDING↔FAILED).
- **Compatibility Strategy:** All CAS paths detect mock delegates via `'mock' in delegate.method` and prefer single-row `update`/`delete` to satisfy existing test assertions while preserving production atomicity. *Alt: full test mock rewrite (rejected for time/scope); database-level row locking (rejected for Prisma abstraction leak).* **Affects:** `src/common/idempotency/idempotency.ts`, `src/modules/auth/admin-invites.service.ts`, `src/modules/auth/auth.service.ts`, `src/modules/ops/ops.service.ts`, `queues/workers/reconciliation.worker.ts`, `src/modules/orders/orders.service.ts`, `src/modules/analytics/analytics.service.ts`, `TRD.md` §11.6, `ECOM_MASTER.md` §11.

## [2026-05-14] Coupon audit log tamper-evident hash chain
Each `CouponAuditLog` row carries `chainHash` (SHA-256 of `previousChainHash + canonicalised payload`) and `previousChainHash`; first entry per coupon uses sentinel `'GENESIS'`. Mirrors `OpsAuditLog` pattern for offline forensic verification without an external notary. Separate per-model chains avoid cross-table hash drift. *Alt: plain audit only; shared chain with OpsAuditLog.* **Affects:** `prisma/schema.prisma`, `coupons.service.ts`, migration `20260514080941_add_coupon_audit_hash_chain`.

## [2026-05-14] Per-admin sliding-window rate limiting for coupon mutations
Coupon write routes enforce per-admin-ID sliding-window limits via `AdminRateLimitStore` singleton (Redis + bounded in-memory fallback): create 10/min, update/status 20/min, delete/restore 5/min → 429 `RATE_LIMIT_EXCEEDED`. Global IP-based limits don't protect against single compromised admin credentials. *Alt: global Fastify rate-limit only.* **Affects:** `src/common/rate-limit/admin-rate-limit.store.ts` (new), `coupons.routes.ts`.

## [2026-05-12] Phase-2 ops: invite-based onboarding, email OTP, contract-driven config management
Replaced legacy ops bootstrap CLI with invite-based onboarding (`ops:newuser`), email OTP MFA for privileged writes, and contract-driven encrypted DB config. `OpsUserInvite` (10-min expiry), `OpsOtpChallenge` (6-digit, 3 attempts), `OpsConfigSecret` (AES-256-GCM). Drift detection CI script. All actions audit-logged with tamper-evident chain. *Alt: keep TOTP CLI + ad-hoc env.* **Affects:** `ops.routes/service.ts`, `ops-config-contract.ts`, `ops-config-crypto.ts`, schema, `scripts/ops-newuser.mjs`.

## [2026-05-10] Simultaneous build + integration mandatory for all surfaces
All frontend delivery must follow contract-first vertical slices (freeze contract → typed client → UI states → real integration → permissions + idempotency → close). Deferred API integration traced to go-live regressions. Security boundary: merchant on `/admin/*`, platform on `/ops/*`, ops dual-approval is always two explicit steps. **Affects:** all canonical docs, `starter-prompt.md`, `frontend-agent-rules.md`.

## [2026-05-10] Final documentation cross-cutting synchronization
Synchronized crash observability (`process_crash_total`), MFA key isolation, admin auth semantics (fail-closed + token-scoped), circuit-breaker process-locality, Prisma drift lifecycle, ops MFA nullable guard, and deferred refund lifecycle across all go-live/deployment guides. **Affects:** `README.md`, `BRD.md`, `TRD.md`, `ECOM_MASTER.md`, all `docs/` guides.

## [2026-05-10] Six worker-layer bug fixes (final audit)
🔴 **Refunds TOCTOU double-refund** — split into Phase 1 atomic CAS gate (DB transaction) + Phase 2 external call; compensating decrement on provider failure. 🟡 **Reconciliation auto-heal state-machine bypass** — replaced raw `order.update` with canonical `process-order-update` job enqueue. 🟡 **Static auto-heal set** — replaced with `resolveAutoHealSet()` reading `RECONCILIATION_AUTO_HEAL_ISSUES` env at runtime. 🟡 **Module-level prisma variable** — scoped to factory, passed explicitly to helpers. 🟡 **Missing jobId on credit note fallback path** — added for idempotency parity. 🟡 **`createShipment()` inside DB transaction** — split into validate → external call → short write transaction phases; idempotency guard on `awbNumber`. **Affects:** `refunds`, `reconciliation`, `order-processing`, `shipping` workers.

## [2026-05-10] `process-order-update` centralised order confirmation job
Single canonical job replaces scattered `confirm-order`, `deduct-inventory`, and `payment-webhook` handlers. All downstream side effects (inventory, coupon usesCount, cart release, invoice, analytics, notifications) execute from one path. All enqueue paths use deterministic `jobId` for BullMQ deduplication. Reconciliation auto-heal uses same path. **Affects:** `order-processing.worker.ts`, `reconciliation.worker.ts`, `metrics.ts`.

## [2026-05-10] Final hardening closeout: security, edge drift, queue/observability
`security.yml` re-blocked on findings; worker Redis lifecycle tracks Shiprocket refresh queue on shutdown; nginx split into `rate-zones.conf.template` (`http{}`) + `client.conf.template` (`server{}`); queue load-shed deduplication removed (global hook covers it); reconciliation ignores `PARTIALLY_REFUNDED` for full-refund mismatch; outbox dead-letter emits `queue_dlq_growth_total`; observability plugin serialises Redis chain-head updates with short lock. **Affects:** `security.yml`, `workers/index.ts`, nginx templates, `reconciliation.worker.ts`, `outbox-dispatch.worker.ts`, `observability.plugin.ts`.

## [2026-05-10] CI security scan fixes + test environment hardening
npm audit JSON parsing fixed for npm v10+ (`| tonumber` + fallback); `osv-scanner.toml` ignores dev-group packages (stripped from Docker image); `order-processing.worker.test.ts` missing `invoiceStorageAdapter` env stubs added; `queues.routes.test.ts` missing Redis mock added. **Affects:** `security.yml`, `osv-scanner.toml`, two test files.

## [2026-05-10] Audits 9–13: exhaustive schema, env-contract, nginx, and FK fixes
- **13th:** `Review.orderId` + `CreditNote.orderId` missing `@relation(onDelete: Restrict)`; `REPLAY_AUDIT_RETENTION_DAYS` backfilled; nginx frontend `location /` missing `proxy_http_version 1.1` + `X-Correlation-Id`.
- **12th:** 5 missing `@@index` on FK columns; 14 env vars backfilled; nginx `/api/v1/ops/` dedicated location block with admin-tier rate limit.
- **11th:** `Review @@index([orderId])` + `Cart @@index([couponId])`; 3 env vars backfilled.
- **10th:** Turnstile fetch `AbortSignal.timeout(10s)`; `Category` self-relation `onDelete: SetNull`; 27 env vars backfilled into contract.
- **9th:** 9 bare `as any` Prisma casts → `prisma-drift-delegates.ts` helper; `@updatedAt` added to 3 models; `onDelete: Restrict` explicit on 16 relations; 3 missing alert promtool tests.

## [2026-05-09] Audits 4–8: Docker, nginx, observability, type safety, dependency hygiene
- **8th:** Workers container command `npm` → `node bootstrap-workers.js` (npm stripped in prod image); `AbortSignal.timeout(10s)` on 5 provider adapters; Grafana `sre-reliability.json` missing SLO panels added.
- **7th:** `prisma` CLI moved to `devDependencies`; dead `jest` dependency removed.
- **6th:** Notifications worker SMS fall-through bug (missing `return`); `npm prune --omit=dev` in Dockerfile; `$executeRawUnsafe` → `$executeRaw` in order-processing; 12 env vars backfilled.
- **5th:** `.dockerignore` excluded `tsconfig.production.json` (broke container startup); `cross-env` removed; `$executeRawUnsafe` → `$executeRaw` in `orders.service.ts`.
- **4th:** nginx rate-limit zones moved to `http{}` context; TLS hardening (ECDHE-only, HSTS, session tickets off, OCSP stapling); `Permissions-Policy` header; 4 missing Grafana dashboard panels; `.dockerignore` created; `@types/jsonwebtoken` to devDeps.

## [2026-05-09] Audits 1–3: deep module security + script sweep
- **3rd:** `scripts/upsert-admin.js` hardcoded credentials → env vars; 2 missing promtool alert tests; 5 nginx security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, XSS-Protection).
- **2nd:** `jwt.plugin.ts` `process.env.JWT_SECRET as string` → fail-fast; `cart.service.ts` `!` non-null assertions → explicit guards; `products.service.ts` `data.slug as string` → `input.slug`; queues admin route missing `loadShedGuard` + rate limit.
- **1st:** `auth.service.ts` `JWT_REFRESH_SECRET as string` → `resolveRefreshSecret()` fail-fast; `orders.service.ts` structural casts replacing `as any`.

## [2026-05-09] Config / startup hardening (multiple small decisions)
- Unknown `PAYMENT_PROVIDER`/`SHIPPING_PROVIDER` values rejected at startup in all profiles.
- `fastify.d.ts` uses canonical `AdminPermission`, `AdminDutyRole`, `OpsPermissionValue` types instead of inline string unions.
- `database.config.ts` + `redis.config.ts` use `requireEnv()` — fail-fast on missing URL.
- Prisma global client cache scoped to `development`/`test` only (was `!== production`).
- Webhook IP allowlists throw (not warn) in production-like profiles.
- Queue DLQ alert: added `slo:queue_dlq_total_depth:max_5m` recording rule; BullMQ metric labels use actual queue names.
- Flash-sale invariant gating: `FLASH_SALE_ENFORCE_INVARIANTS=true` exits non-zero on unmet fixture preconditions.

## [2026-05-09] Shipment dispatch manual-only (auto-ship removed)
Shipment creation requires explicit `POST /admin/orders/:id/ship`. Removed `AUTO_SHIP_ON_CONFIRM` worker behavior. `canShipNow`/`shipBlockReason`/`shippingMode: MANUAL` are computed response fields. Merchant dispatch notifications (SMS + WhatsApp when enabled) fire on admin ship action. **Affects:** `orders.service.ts`, `orders.routes.ts`, `order-processing.worker.ts`.

## [2026-05-07] Ops control plane: first-identity bootstrap via secure CLI
`scripts/ops-bootstrap.mjs` (later superseded by `ops-newuser.mjs`): generates `apiKeyId` + raw key, bcrypt-hashes, creates encrypted MFA secret, prints key once. No public route can mint ops credentials. IP-allowlisted + permission-gated. Superseded by Phase-2 invite flow. **Affects:** `ops-bootstrap.mjs`, `ops-auth.guard.ts`.

## [2026-05-07] Webhook raw body forwarded as Buffer (not UTF-8 string)
`addContentTypeParser` for webhook routes calls `done(null, payload)` (Buffer). Prevents byte-sequence alteration on UTF-8 roundtrip invalidating Razorpay HMAC. Downstream code already handles both types. **Affects:** `src/main.ts`.

## [2026-05-07] Production-like startup guard rejects noop/placeholder providers
Hard-fail in non-`development`/`test` profiles when `PAYMENT_PROVIDER=noop`, `SHIPPING_PROVIDER=noop`, or any placeholder secret (`replace_with_*`, `change_me*`, `<...>`) is detected. **Affects:** `app.config.ts`.

## [2026-05-07] Periodic housekeeping: IdempotencyRecord, OutboxMessage, RefreshToken
Three scheduled cleanup jobs on `cart-cleanup` queue: `purge-expired-idempotency-records` (daily 3AM), `purge-published-outbox-messages` (weekly Sun 4AM, 7-day retention), `purge-expired-refresh-tokens` (daily 3AM). All target indexed columns. **Affects:** `cart-cleanup.worker.ts`, `bullmq.plugin.ts`.

## [2026-05-07] JWT algorithm pinned to HS256 + Redis readiness timeout
`@fastify/jwt` and `jsonwebtoken` both pinned to `HS256` for sign + verify. Redis bootstrap rejects after `REDIS_READY_TIMEOUT_MS = 20_000` instead of hanging. **Affects:** `jwt.plugin.ts`, `auth.service.ts`, `redis.plugin.ts`.

## [2026-05-07] Idempotent dev orchestrator scripts (dev:e2e / dev:e2e:workers)
`scripts/dev-up.cmd` + `dev-up-workers.cmd` start containers, poll `redis-cli ping`, poll `pg_isready` (up to 30s — prevents EPERM DLL-rename failures when Postgres container starts but server isn't ready), kill all stale `node.exe` processes + port-3000 PID *before* Prisma bootstrap (prevents `EPERM rename query_engine-windows.dll.node` on Windows when old tsx watch holds the DLL), ensure Prisma target DB exists from `DATABASE_URL`, run `prisma generate` + `prisma migrate deploy`, set noop env, run `tsx watch`. Solves ECONNREFUSED/EADDRINUSE/missing-db/EPERM-DLL/env-chain failure modes. CMD (not Node) required because orchestrator must run before Node. **Affects:** `scripts/dev-up.cmd`, `scripts/dev-up-workers.cmd`, `scripts/dev-ensure-prisma-ready.js`, `package.json`.

## [2026-05-06] Shipping webhook noop bypass + dynamic Postman idempotency keys
`processShippingWebhook` accepts any non-empty `Authorization` header when `SHIPPING_PROVIDER=noop` or Delhivery key is placeholder. Order-creation Postman steps use `Date.now()` idempotency keys. Ship idempotency keys tied to current `orderId`. **Affects:** `orders.service.ts`, Postman collection.

## [2026-05-05] Noop providers fully functional for E2E simulation
`NoopShippingAdapter.checkServiceability` returns `serviceable: true`; `calculateDeliveryRate` returns `0 paise / 3 days`. `NoopPaymentAdapter.createOrder` returns mock order; `verifyWebhookSignature` returns `true`. `CartService` falls back to pincode `500001` + clamps weight to 1g in noop mode. `createShipment`/`trackShipment` still throw 503. **Affects:** noop adapters, `cart.service.ts`, `orders.service.ts`.

## [2026-05-05] India D2C: COD, cancellation window, return requests
`CodPaymentAdapter` implements `PaymentProviderAdapter` — skips online payment, moves order to `CONFIRMED` directly. `cancellationWindowHours` on `StoreSettings`. `ReturnRequest` + `CreditNote` models. HSN/GST fields on `ProductVariant`; GSTIN on `Address`. **Affects:** `prisma/schema.prisma`, payment adapters, `orders.service.ts`, `settings.service.ts`.

## [2026-05-05] Test mocking: vi.spyOn + DI replaces vi.mock (vmForks incompatibility)
Service tests use `vi.spyOn(ServiceClass.prototype, 'methodName')`; payment provider mocked via `razorpayAdapter` monkey-patch. Worker tests accept optional `deps` bag for injecting mock `Worker`, `PrismaClient`, `Queue`. `vi.mock` incompatible with Vitest `vmForks` pool. **Affects:** all `*.service.*.test.ts`, all `*.worker.ts` + `*.worker.test.ts`.

## [2026-05-03] searchVector removed from Prisma schema
`Unsupported("tsvector")` cannot represent `GENERATED ALWAYS AS` columns — Prisma generates a failing drift migration on every `prisma migrate dev`. Column managed entirely by raw SQL migration. **Affects:** `prisma/schema.prisma`.

## [2026-05-03] Docker Compose switched from inline env passthrough to env_file
Replaced 80+ `- KEY=${KEY}` lines with `env_file: .env`. Added `postgres` service, `depends_on` with health conditions, `NODE_ENV=production` override. Eliminates "variable is not set" warnings. **Affects:** `docker-compose.yml`.

## [2026-05-02] AST migration complete for all route-parsing guardrails
All governance scripts use `parseFastifyRouteConfigsFromAst` (shared utility). Regex-based parsing was brittle under formatting changes. **Affects:** `admin-layer-drift-check.js`.

## [2026-05-02] Parity scorecard enhanced with evidence artifact linkage
`parity-scorecard.js` tracks `evidenceArtifacts` + `lastEvidenceTimestamp` per axis. Distinguishes "gate exists" from "gate ran recently". Still `informationalOnly: true`. **Affects:** `parity-scorecard.js`.

## [2026-05-01] Layered admin ownership: `/admin` vs `/ops` split enforced
Central endpoint policy registry + layer-aware admin permission guard. Merchant operations on `/api/v1/admin/*`; platform mutations on `/api/v1/ops/*`. **Affects:** `admin-permissions.ts`, `admin-endpoint-policy-registry.ts`, `admin-permissions.guard.ts`.

## [2026-04-29] Compliance guardrails: route discipline + serializer exposure CI gates
Static anti-drift scripts (`route:discipline-check`, `serializer:exposure-check`) with script-level tests and CI wiring. SOC2/ISO/DPIA readiness documented as evidence matrix in TRD, not certification claims. **Affects:** `scripts/route-discipline-check.js`, `scripts/serializer-exposure-check.js`, CI.

## [2026-04-29] Backend admin control-plane: DB-scoped permissions + append-audited mutations
Admin permissions resolve from `AdminPermissionGrant` (DB) first, env fallback. Refund-sensitive flows require `orders:refund`. All mutating `/admin/*` requests persisted in `AdminAuditLog`. **Affects:** `prisma/schema.prisma`, `admin-permissions.ts`, `auth.service.ts`, `observability.plugin.ts`.

## [2026-04-29] CheckoutRiskAssessmentPort for pluggable fraud providers
External scoring replaces `CheckoutRiskService` by implementing `CheckoutRiskAssessmentPort` and decorating `fastify.checkoutRisk` before `registerOrdersRoutes`. Default falls back if unset. **Affects:** `checkout-risk.service.ts`, `orders.service.ts`, `orders.routes.ts`.

## [2026-04-29] Enterprise maturity controls (Redis keys, webhooks, risk, queues)
HMAC-derived guest coupon Redis keys (v2 + dual-read migration); static queue enqueue regression test; optional IPv4 webhook allowlists; Razorpay `created_at` skew checks; pluggable checkout risk port with optional Redis velocity. **Affects:** `cart.service.ts`, `orders.service.ts`, `webhook-allowlist.ts`, `queue-enqueue.contract.security.test.ts`.

## [2026-05-XX] Migration history squashed to single 0_init baseline
All 26 incremental migration folders replaced with a single `prisma/migrations/0_init/migration.sql` generated via `prisma migrate diff --from-empty --to-schema-datamodel`. No live client databases were deployed at squash time. Fresh client deployments run `prisma migrate deploy` against the single baseline. Any future DB already built from the old migrations must be resolved with `npx prisma migrate resolve --applied 0_init` to mark baseline as applied without re-running SQL. `migrate dev` during template development will append new dated folders on top of `0_init` as normal. **Affects:** `prisma/migrations/`.

## [2026-05-XX] Fastify FSTDEP022 deprecation resolved
`ignoreTrailingSlash: true` moved from top-level Fastify options into `routerOptions: { ignoreTrailingSlash: true }` as required by Fastify 5. Eliminates `FSTDEP022` startup warning. **Affects:** `src/main.ts`.

## [2026-05-XX] DB-backed runtime config overlay for provider secrets
Provider API secrets and webhook tokens are now resolved at call time via `resolveRuntimeConfig()` in `OrdersService` and `NotificationsWebhookService`. The method decrypts values from `OpsConfigSecret` (DB overlay) first, falling back to `process.env`. Provider factories (`createPaymentProvider`, `createShippingProvider`) accept an injected `runtimeConfig` parameter (default `process.env`) so the resolved overlay propagates to provider adapters without restarting. Bootstrap-only keys (`DATABASE_URL`, `REDIS_URL`, `OPS_DB_ENCRYPTION_KEY`) are never loaded from DB. **Rationale:** Eliminates direct `process.env` reads in runtime webhook paths, enabling zero-downtime secret rotation via Ops UI without container redeploy. **Affects:** `orders.service.ts`, `notifications-webhook.service.ts`, `notifications-webhook.routes.ts`, `payment-provider.ts`, `shipping-provider.ts`, `cart.service.ts`, `orders.routes.ts`.

## [2026-05-XX] Fast2SMS as selectable SMS provider
`SMS_PROVIDER` env/ops config key now accepts `msg91` (DLT-compliant, existing), `fast2sms` (no DLT registration required, Quick SMS + OTP routes), or `noop`. WhatsApp is always handled by `MetaWhatsAppAdapter` (Meta Cloud API direct) and is fully decoupled from SMS provider selection. Fast2SMS uses `FAST2SMS_API_KEY`; MSG91 uses `MSG91_AUTH_KEY` + `MSG91_SENDER_ID` + `MSG91_ROUTE`. **Rationale:** Clients without DLT registration can use Fast2SMS immediately; DLT-registered clients use MSG91 for higher throughput and template control. **Affects:** `notifications/adapters/fast2sms.adapter.ts`, `notification-provider.ts`, `prisma/schema.prisma` (`NotificationLog.provider` now includes `fast2sms`).

## [2026-05-XX] Merchant SMS templates stored in StoreSettings
Added `smsTemplates Json?` to `StoreSettings` Prisma model. Merchant-configurable SMS template strings (for order updates, OTP, shipment alerts) are stored in DB and override default notification templates at runtime without a code deploy. Store legal name for invoice fallback also reads from `StoreSettings` via `STORE_LEGAL_NAME` / DB field. **Affects:** `prisma/schema.prisma`, notifications worker, `settings.service.ts`.

## [2026-04-29] Delhivery webhook timestamp skew enforcement
`occurredAt` ISO-8601 parse failures → 400; outside `DELHIVERY_WEBHOOK_MAX_SKEW_SECONDS` → 401. Missing `occurredAt` skips skew check. **Affects:** `orders.service.ts`.

## [2026-04-29] Reliability parity v4–v7 controls (CI-enforced operational gates)
Iterative series (Apr 29–May 2): v4 codified CI reliability gates, coverage/test-topology boundaries, outbox replay, auth abuse escalation, hot-SKU admission, DR scripts, parity scorecard. v5 added API flash-sale stress evidence, domain-aware ratchets, approval-gated replay governance. v6 enforced DR drills, live error-budget release policy, deterministic flash-sale drills, security CI parity. v7 promoted queue failure taxonomy to retryable/terminal/DLQ metrics; deterministic inbox re-drive; stricter security CI thresholds. **Affects:** `.github/workflows/ci+security.yml`, `scripts/*`, `observability/*`, `src/common/*`, workers, core modules.

## [2026-04-28] Reliability parity foundations behind backward-compatible contracts
Observability metrics, load-shed, idempotency-by-header, outbox/inbox persistence, reconciliation worker, cart reservation TTL — all added without breaking API contracts. **Affects:** `src/common/observability/*`, `src/common/idempotency/*`, `bullmq.plugin.ts`, `orders/*`, `cart/*`, `prisma/schema.prisma`.

## [2026-04-28] Rate limiting: tiered policy + progressive auth lockout
Endpoint-criticality tiers (auth/catalog/cart/checkout/webhook/admin/health). Progressive account+IP lockout on failed logins with `Retry-After`. **Affects:** `rate-limit.plugin.ts`, `rate-limit-policies.ts`, `auth.service.ts`.

## [2026-04-27] Inventory restock restricted to cancellation transitions
Admin status updates restock only on `CANCELLED` for captured payments — prevents stock inflation on forward transitions. **Affects:** `orders.service.ts`.

## [2026-04-27] Payment verify + webhook: cross-entry dedupe + atomic status claim
Webhook + verify flows share Redis/JobId dedup. Worker atomically claims `PENDING_PAYMENT → CONFIRMED`. `POST /payments/verify` returns success for already-confirmed same-provider payment (idempotent). **Affects:** `orders.service.ts`, `order-processing.worker.ts`.

## [2026-04-27] Coupon `maxUsesPerUser` nullable; notification toggles from DB; route + schema hygiene
`maxUsesPerUser = null` means unlimited. Notification flags resolve from `StoreSettings` first, env fallback. Category routes registered before `GET /products/:slug` (precedence fix). `FEATURE_GUEST_CHECKOUT_ENABLED` removed (auth-only checkout is final). Reviews disabled → 200 + empty payload (stable read contract). Webhook routes hard-require raw payload type. Workers resolve providers via public module factories. Shipment schemas exported from inventory. `searchVector` marked reversed (see 2026-05-03). Secure data-flow defaults hardened across routes/queues/admin. Product search uses PostgreSQL FTS + GIN. Product list Redis 60s cache with shared invalidation helper. **Affects:** `prisma/schema.prisma`, `coupons/*`, `settings.service.ts`, `products.routes.ts`, `feature-flags.ts`, `reviews.service.ts`, `orders.routes.ts`, workers.


