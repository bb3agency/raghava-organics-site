# Frontend AI Go-Live Checklist

Use this checklist before shipping any AI-generated storefront/admin frontend against this backend.

Pair this with `docs/BACKEND_GO_LIVE_CHECKLIST.md` for final go-live sign-off. The backend checklist includes audit-hardened gates covering Nginx security headers, JSON schema `additionalProperties: false` enforcement, SLO alert test coverage, JWT fail-fast validation, script credential env var usage, and admin route rate-limit/load-shed guards.

## 1) Environment & Profile Safety

- [ ] Frontend uses only `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_STOREFRONT_URL`.
- [ ] `NEXT_PUBLIC_API_BASE_URL` includes `/api/v1`.
- [ ] No hardcoded API URLs in code.
- [ ] No alternate env names (for example `NEXT_PUBLIC_API_URL`).
- [ ] Production-like backend profile is understood:
  - `NODE_ENV=development` or `test` => development-like
  - Any other value (`production`, `staging`, `qa`, `uat`, custom, or unset) => production-like
- [ ] `PAYMENT_PROVIDER=noop` and `SHIPPING_PROVIDER=noop` are treated as local simulation only.
- [ ] Frontend repo has latest AI rules synced from backend: `frontend-agent-rules.md` -> `.agents/rules/dev-rules.md`.

## 2) Response Contract Compliance

- [ ] API client supports both success shapes:
  - enveloped: `{ success, data, meta? }`
  - raw payload: route-specific JSON body
- [ ] Error handling branches on `error.code`, not free-form `error.message`.
- [ ] UI fallbacks exist for network failure, non-JSON failure, and timeout.

## 3) Auth & Session Handling

- [ ] Refresh token is never stored in `localStorage` or `sessionStorage`.
- [ ] Refresh token remains backend-controlled (HTTP-only cookie flow).
- [ ] Access token handling is ephemeral (memory/state), not long-term browser storage.
- [ ] 401 flow is implemented: refresh -> retry original request -> logout if refresh fails.

## 4) Idempotency on Critical Mutations

- [ ] `idempotency-key` is sent on:
  - `POST /api/v1/orders`
  - `POST /api/v1/orders/:id/cancel`
  - `POST /api/v1/payments/initiate`
  - `POST /api/v1/payments/verify`
  - destructive admin writes (create/update/delete affecting inventory/orders/payments)
- [ ] Each user action generates a new unique idempotency key.
- [ ] Retries reuse the same key for the same intent.
- [ ] Frontend handles `409 CONFLICT` on state-changing actions by refreshing state and retrying appropriately (backend uses atomic CAS patterns — concurrent mutations receive 409 with descriptive error code).

## 5) Checkout Flow Split (Mandatory)

- [ ] PREPAID flow implemented exactly:
  1. `POST /api/v1/orders`
  2. `POST /api/v1/payments/initiate`
  3. Razorpay modal
  4. `POST /api/v1/payments/verify`
- [ ] COD flow implemented exactly:
  1. `POST /api/v1/orders` with `{ "paymentMode": "COD" }`
  2. Skip Razorpay modal
  3. Skip `/payments/initiate`
  4. Treat COD payment status semantics as `CREATED` -> `CAPTURED` (do not invent `PENDING`/`PAID` enums in frontend logic)
  5. Shipment remains manual-only via admin `POST /api/v1/admin/orders/:id/ship`
- [ ] Prepaid retry path uses `POST /api/v1/payments/retry`.
- [ ] Shipping is treated as manual-only in admin UX: payment confirmation does not trigger shipment booking automatically.
- [ ] Admin order UI respects backend ship-state fields (`canShipNow`, `shipBlockReason`, `shippingMode`) before enabling ship action.
- [ ] Admin refund UX reflects deferred state semantics: requesting `REFUNDED` can return a successful response while order status remains pre-refund until asynchronous refund worker/provider confirmation completes.

## 6) Webhook Boundary Enforcement

- [ ] Browser/frontend never calls webhook endpoints:
  - `/api/v1/payments/webhook`
  - `/api/v1/shipping/webhook`
- [ ] No frontend route, action, or utility invokes any backend `*webhook*` endpoint.

## 7) Money & Data Integrity

- [ ] Business logic uses paise integers from backend.
- [ ] UI formatting converts paise to currency display only.
- [ ] No calculations are performed on already formatted display strings.

## 8) AI Agent Output Review (Code Review Gate)

- [ ] Generated API layer is centralized and typed.
- [ ] No direct fetch duplication across components for critical flows.
- [ ] No secrets in client bundles (`NEXT_PUBLIC_*` checked).
- [ ] No unsafe assumptions about envelope-only or raw-only responses.
- [ ] No webhook invocations from browser code.

## 8.1) Simultaneous Build + Integration Gate (Mandatory)

- [ ] Frontend work is organized as **vertical slices** (contract -> API client -> UI -> integration -> tests), not page-only batches.
- [ ] For each slice, routes and request/response schemas are frozen before UI implementation begins.
- [ ] For each slice, API calls are integrated with real backend routes (no permanent mock-only slice closure).
- [ ] Admin and ops surfaces are delivered in this order unless intentionally overridden with documented rationale:
  1. Foundation (auth, refresh, API client, error mapper, permission-aware nav)
  2. Ops control plane surfaces
  3. Admin read surfaces
  4. Admin mutation surfaces
  5. Reliability/replay surfaces
  6. Storefront customer journey surfaces
- [ ] Slice closure criteria are enforced:
  - happy path + negative path complete,
  - permission-aware UX + backend 401/403 handling complete,
  - idempotency behavior complete for critical writes,
  - one integration test and one UI interaction test passing.
- [ ] Milestone cadence is enforced every 4-6 merged slices:
  - rerun backend guardrail/release subset,
  - verify BRD AC mapping coverage,
  - execute one full end-to-end high-risk scenario.
- [ ] Coupon admin UI covers the full lifecycle: create, edit, pause/resume, soft-delete, and restore. The list view shows deleted coupons in a separate "deleted" state (not permanently hidden) with a restore action.
- [ ] Deleting a coupon calls `DELETE /api/v1/admin/coupons/:id` (soft-delete). The UI never calls a hard-delete endpoint because none exists.
- [ ] Restoring a coupon calls `POST /api/v1/admin/coupons/:id/restore` and refreshes the coupon state to active.
- [ ] Audit log view per coupon (`GET /api/v1/admin/coupons/:id/audit`) is accessible from the coupon detail screen, showing actor, timestamp, action, and before/after diff.
- [ ] UI handles `RATE_LIMIT_EXCEEDED` (429) on coupon write actions with a user-friendly message (e.g. "Too many operations — please wait a moment") rather than a generic error.
- [ ] `BUY_X_GET_Y` coupon type is disabled/hidden in create/edit forms until v2.2 (backend rejects it with `VALIDATION_ERROR`).
- [ ] Coupon UI is fully gated on `FEATURE_COUPONS_ENABLED` — if the flag is off the coupon nav item and routes do not render.
- [ ] Merchant actions are never routed through ops endpoints to simplify UI logic.
- [ ] Ops dual-approval UX is modeled as two explicit user actions (`request` then `confirm/reject`), not collapsed into one-step auto-confirm behavior.
- [ ] Ops control plane surfaces handle `503 ops_audit_chain_lock_timeout` as retryable after 1–2 second backoff (audit chain lock contention under concurrent ops activity — not a failure).
- [ ] Ops config UI surfaces (`/ops/config/overview`, `/ops/config/stored`, `/ops/config/save`) follow contract metadata (`mutableViaOps`, `requiresRestart`, `runtimeSource`) and never reveal plaintext secret values.
- [ ] Bootstrap-only Ops config keys (`DATABASE_URL`, initial `REDIS_URL`, `OPS_DB_ENCRYPTION_KEY`) render as read-only with operator copy that changes must happen in deployment env/secret manager, not via DB-backed save.
- [ ] DB-overlay eligible Ops config keys show restart-required semantics clearly: saved values are encrypted at rest, override env only for contract-allowed non-bootstrap keys, and apply only after API/worker restart.
- [ ] `/admin/setup` consumes merchant admin invite tokens only through `POST /api/v1/admin/invites/consume`; tokens are never stored in localStorage/sessionStorage/logs, and expired/consumed/invalid tokens produce a safe terminal state requesting a fresh ops-issued invite.
- [ ] Merchant admin setup UI never displays or requests `ops:*`, `queues:inspect`, `developer:*`, provider-secret, database, Redis, or ops-control permissions.
- [ ] Frontend invoice behavior follows backend contract: CTA gated by `invoice.hasPdf`; customer/admin downloads use authenticated routes (`/orders/:id/invoice.pdf`, `/admin/orders/:id/invoice.pdf`).

## 9) Release Validation Commands (Backend Cross-Check)

Run from backend root before sign-off:

> These commands are the backend release gate subset. Also execute and archive `docs/BACKEND_GO_LIVE_CHECKLIST.md`, which validates full environment-to-implementation parity (not only provider configuration).

```cmd
cmd /c npm run typecheck
cmd /c npm run test:unit
cmd /c npm run test:e2e
cmd /c npm run test:security
cmd /c npm run test:guardrails
cmd /c npm run build
cmd /c npx prisma validate --schema prisma/schema.prisma
cmd /c npm run prisma:generate:safe
cmd /c npm run edge:drift-check
cmd /c npm run release:policy-state
cmd /c npm run release:guard
cmd /c npm run parity:scorecard
```

Sign-off expectation:
- [ ] All commands exit `0`.
- [ ] `release:guard` reports pass.
- [ ] Guardrails pass for admin/docs/config parity.

## 10) Final Go-Live Sign-Off

- [ ] Real payment provider credentials configured for production-like profile.
- [ ] Real shipping provider credentials configured for production-like profile.
- [ ] Frontend env values match deployed domains exactly.
- [ ] UAT completed for guest checkout, auth checkout, COD, prepaid, retry, cancellation.
- [ ] Team confirms no `noop` usage in production-like deploy.
- [ ] Provider onboarding and secret lifecycle controls follow `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` (public-vs-secret env boundaries, rotation, incident response).
- [ ] Admin UI and support runbooks acknowledge permission snapshot behavior: grant/revoke changes on admins are token-issuance scoped and may require logout/re-auth for immediate UI/API effect.

---

## Quick Reuse Note (Per Client)

For each new client project:
1. Duplicate this checklist in the client deployment workspace.
2. Fill pass/fail notes beside each item.
3. Archive the completed checklist with release evidence (build logs, test logs, environment snapshot).

---

> **This checklist is used twice in the client onboarding process:** first as part of **Phase 5** (full local integration testing gate — run against the local dev environment before any VPS work) and again as part of **Phase 12** (go-live validation against the live VPS deployment). The complete ordered sequence — client intake → third-party accounts → backend config → provider dry-runs → frontend build → **full local testing gate (Phase 5, this checklist)** → VPS baseline → VPS deploy → ops bootstrap → admin provisioning → frontend deploy → webhook registration → **VPS go-live validation (Phase 12, this checklist again)** → DNS cutover → post-handoff — see **[`docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md`](CLIENT_ONBOARDING_EXECUTION_ORDER.md)**.
