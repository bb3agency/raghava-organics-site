# Frontend Development Log — Raghava Organics

> **Purpose:** Frontend phase tracker for Phase 4 delivery and Phase 5 readiness evidence.
>
> Cross-reference: `../backend/docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md` Phase 4 and Phase 5.

---

## Project Identity

| Field | Value |
|---|---|
| Client name | Raghava Organics |
| Backend API (local) | `http://localhost:3000/api/v1` |
| Storefront URL (local) | `http://localhost:3101` |
| Razorpay test key ID | `rzp_test_xxx` (set in `.env.local` when available) |
| Feature flags active | `FEATURE_COUPONS_ENABLED=false`, `FEATURE_REVIEWS_ENABLED=false`, `FEATURE_WISHLIST_ENABLED=false`, `FEATURE_GST_INVOICING_ENABLED=true`, `FEATURE_RESPONSE_ENVELOPE_ENABLED=false` (defaults from backend `.env.example` — confirm in backend `.env`) |
| Backend repo path | `../backend` |
| Frontend repo path | `.` |
| Phase 4 start date | 2026-05-16 |
| Last updated | 2026-05-16 (Contract hardening pass) |

---

## First-Session Setup Checklist (2026-05-16)

- [x] `frontend/` Next.js app scaffolded (App Router, Tailwind 4, shadcn/ui, Zustand, RHF, Zod, Framer Motion, Lucide)
- [x] `lib/api.ts` baseline API client (dual-envelope parser, `ApiError`, idempotency header support)
- [x] Zustand stores: `stores/auth.ts`, `stores/cart.ts`, `stores/ui.ts`
- [x] Route groups: `(storefront)`, `(auth)` with placeholder pages
- [x] `.env.local` and `.env.example` generated with canonical variable names
- [x] `frontend-agent-rules.md` copied to `.agents/rules/dev-rules.md` and `.cursor/rules/dev-rules.mdc`
- [x] This dev log created from template
- [x] Backend health check passes (`GET /api/v1/health`) — verified 2026-05-16 21:20 IST (`status:ok`, `database:connected`, `redis:connected`)
- [x] Database migrations current (verified with `npx prisma migrate status` on 2026-05-16)
- [x] Backend `npm run dev:e2e` + workers running (workers active in terminal logs)
- [ ] Postman E2E baseline passed (Phase 2 gate)

**Current tier:** Sprint G — Go-live sign-off  
**Next incomplete slice:** Manual provider credentials + Postman baseline confirmation

---

## Backend Provider Confirmation (confirm before Tier 3 mutations)

| Provider | Backend `.env` key set? | Dry-run status | Dry-run date |
|---|---|---|---|
| Razorpay | [ ] | [ ] not done / [ ] passed | — |
| COD | n/a (no key needed) | [ ] confirmed in settings | — |
| Delhivery / Shiprocket | [ ] | [ ] not done / [ ] passed | — |
| Resend (email) | [ ] | [ ] not done / [ ] passed | — |
| MSG91 (SMS/WhatsApp) | [ ] | [ ] not done / [ ] passed | — |

---

## Environment Setup

- [x] `.env.local` generated with all required values
- [x] `frontend-agent-rules.md` copied to `.agents/rules/dev-rules.md`
- [x] Backend is running locally (`npm run dev:e2e` + workers) and health check passes
- [ ] Postman E2E baseline passes (Phase 2 gate already cleared before this log was created)

`.env.local` values logged (non-secret only):

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_STORE_NAME=Raghava Organics
NEXT_PUBLIC_STOREFRONT_URL=http://localhost:3101
NEXT_PUBLIC_RAZORPAY_KEY_ID=(pending)
```

---

## Go-Live Reference (build-time)

| Document | Path |
|---|---|
| Integration guide | `../backend/docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` |
| Frontend go-live checklist | `../backend/docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` |
| Backend go-live checklist | `../backend/docs/BACKEND_GO_LIVE_CHECKLIST.md` |
| Client handoff (post go-live) | `../backend/docs/CLIENT_HANDOFF_INDEX.md` |

---

## Slice Tracker

> Status: `[ ]` not started · `[~]` in progress · `[x]` done (all gate checks passed)

### Tier 1 — Foundation

| Slice | Status | Notes |
|---|---|---|
| Project scaffold (Next.js 15+, Tailwind, shadcn/ui, Zustand, RHF+Zod) | [x] | |
| Shared API client (dual-envelope parser, error.code mapper, auth injection) | [x] | `lib/api.ts`, `lib/authenticated-api.ts`, `lib/auth-api.ts` |
| Auth Zustand store (accessToken in memory, refresh-on-401, force-login) | [x] | `stores/auth.ts`, `hooks/use-authenticated-api.ts` |
| Cart Zustand store (guest-safe, merge-on-login aware) | [x] | `cart-api.ts`, `use-cart-sync.ts`, merge-on-login wiring |
| Permission-aware nav scaffold | [x] | `MainNav`, `/admin` placeholder |
| Global error code → UI copy mapping | [x] | `lib/error-messages.ts` |

**Tier 1 done when:** All slices `[x]`. Auth OTP flow produces session. 401 refresh loop works. Both envelope shapes parse. Permission-gated nav renders correctly.

---

### Tier 2 — Ops Control Plane

| Slice | Status | Notes |
|---|---|---|
| Session bootstrap (`/ops/session`) | [x] | `app/(ops)/ops/page.tsx` |
| Load-shed two-step request/confirm/reject | [x] | `app/(ops)/ops/load-shed/page.tsx`, `actions/ops.actions.ts` |
| Approvals queue read surface | [x] | `app/(ops)/ops/approvals/page.tsx` |
| Config overview + validate/save + OTP surfaces | [x] | `app/(ops)/ops/config/page.tsx`, `components/ops/OpsConfigForms.tsx`, `actions/ops.actions.ts` |
| Audit timeline + invites + setup + metrics routes | [x] | `app/(ops)/ops/audit/page.tsx`, `app/(ops)/ops/invites/page.tsx`, `app/(ops)/ops/setup/page.tsx`, `app/(ops)/ops/metrics/page.tsx` |

### Tier 3 — Admin Read

| Slice | Status | Notes |
|---|---|---|
| Dashboard KPIs/chart/top-products | [x] | `app/(storefront)/admin/page.tsx` |
| Orders read | [x] | `app/(storefront)/admin/orders/page.tsx` |
| Order detail + invoice download | [x] | `app/(storefront)/admin/orders/[id]/page.tsx` |
| Products + categories read | [x] | `app/(storefront)/admin/products/page.tsx` |
| Inventory + low-stock read | [x] | `app/(storefront)/admin/inventory/page.tsx` |
| Customers read | [x] | `app/(storefront)/admin/customers/page.tsx` |
| Order board + returns read | [x] | `app/(storefront)/admin/orders/board/page.tsx`, `app/(storefront)/admin/returns/page.tsx` |

### Tier 4 — Admin Mutations

| Slice | Status | Notes |
|---|---|---|
| Mutation panels with idempotency keys | [x] | `components/admin/AdminMutationPanel.tsx` |
| Ship/cancel/refund fulfillment (Shiprocket; COD via webhook) | [x] | `AdminOrderFulfillmentPanel.tsx`, `admin/mutations`, `admin/orders/[id]` |
| PREPAID initiate/verify dry-run surface | [x] | Executed via storefront checkout flow (`components/checkout/CheckoutForm.tsx`) |
| Admin COD settings surface | [x] | `app/(storefront)/admin/settings/cod/page.tsx`, `components/admin/CodSettingsPanel.tsx` |
| Additional settings mutation surfaces | [x] | `app/(storefront)/admin/settings/{shipping,store,notifications,inventory}/page.tsx` |

### Tier 5 — Reliability

| Slice | Status | Notes |
|---|---|---|
| Reconciliation issues | [x] | `/admin/reliability` |
| Outbox/inbox replay visibility | [x] | `/admin/reliability` analytics panels |
| Revenue/funnel/category analytics | [x] | `/admin/reliability` |
| DLQ summary visibility | [x] | `/admin/reliability` (`/admin/queues/dlq/summary`) |

### Tier 6 — Storefront

| Slice | Status | Notes |
|---|---|---|
| Component-first catalogue (`ProductCard`, `ProductGrid`) | [x] | `components/product/*` |
| PLP with query `searchParams` | [x] | `app/(storefront)/products/page.tsx` |
| PDP route + loading state | [x] | `app/(storefront)/products/[slug]/` |
| Cart synced from backend | [x] | `components/cart/CartWorkspace.tsx`, add/update/remove/clear wired |
| Checkout PREPAID/COD contract surface | [x] | `components/checkout/CheckoutForm.tsx` with create/initiate/verify flow |
| Search + category routes | [x] | `app/(storefront)/search/page.tsx`, `app/(storefront)/categories/[slug]/page.tsx` |
| Account orders/detail/settings | [x] | `app/(account)/orders/*`, `dashboard/page.tsx`, `settings/page.tsx` |
| COD visibility gating | [x] | checkout now gates COD by `NEXT_PUBLIC_COD_ENABLED` and shows disabled state copy |

---

## Phase 5 Local Gate (Sprint G)

| Gate item | Status | Evidence |
|---|---|---|
| Health + DB + Redis live | [x] | `GET /api/v1/health` verified |
| Backend migrations up to date | [x] | `npx prisma migrate status` |
| Frontend quality gates | [x] | `npm run typecheck && npm run lint && npm run test && npm run build` |
| Integration coverage (`api`, `auth`, `cart`) | [x] | `lib/*.integration.test.ts` passing |
| Frontend checklist reconciliation | [x] | This log updated for all tiers |
| Backend go-live docs manual review | [~] | References present; manual final pass required |
| Postman E2E folder 0→3 | [ ] | Manual run pending in Postman workspace |

---

## Ready-to-Build Gate

| Criterion | Status |
|---|---|
| `frontend/` exists with baseline stack | [x] |
| Rules synced (`.agents/rules`, `.cursor/rules`) | [x] |
| `docs/FRONTEND_DEV_LOG.md` initialized | [x] |
| `.env.local` / `.env.example` with canonical names | [x] |
| Backend health + DB migrated | [x] verified |
| `npm run typecheck` + `npm run build` pass | [x] verified 2026-05-16 |

---

## Notes

### 2026-05-16

- Frontend setup kickoff completed: monorepo `frontend/` folder at repo root, sibling to `backend/`.
- Tier 1 Foundation completed: auth UI (OTP/email/register/forgot-password), cart API + merge wiring, account guard, logout handling, and live integration tests.
- Tier 2–6 slices implemented in sequence: ops control plane, admin read/mutations, reliability visibility, and storefront PLP/PDP/cart/checkout foundations.
- Sprint G local gate executed: typecheck/lint/tests/build all green.
- Contract hardening follow-up completed:
  - Product card/PDP now perform real cart mutations and set guest merge flags.
  - Checkout now calls `/orders` + PREPAID `/payments/initiate` and `/payments/verify`; COD path skips payment initiation.
  - Admin guard added and ops API parser aligned for envelope/raw success modes.
  - Reliability replay-preview/replay actions added for inbox/outbox dead-letter flows.
  - Search/category routes and account order/detail/settings pages now call live backend routes.
- COD/settings continuation slice completed (SMS intentionally deferred):
  - Added merchant admin COD settings page backed by `/api/v1/admin/settings/cod`.
  - Checkout now conditionally hides COD option based on a frontend feature gate (`NEXT_PUBLIC_COD_ENABLED`), preserving PREPAID flow.
- Ops-first hardening pass started:
  - Added route-complete ops surfaces for audit logs, invite issuance/cleanup, setup token consume flow, config validate/save with OTP actions, and metrics snapshot.
  - Updated `frontend/.env.example` with server-only ops variables required for `/api/v1/ops/*` integration.
- Admin contract completion pass started:
  - Added admin invite setup flow route (`/admin/setup`) with OTP send + invite consume endpoints.
  - Added missing control-plane surfaces for order detail/board, returns actions, queues visibility, and non-COD settings (`shipping`, `store`, `notifications`, `inventory`).
- Ops/Admin compliance hardening (2026-05-17):
  - `/ops` guarded via `frontend/proxy.ts` (HTTP Basic Auth, fail-closed in production when creds missing).
  - Server-side ops calls (`lib/ops-api.ts`, `actions/ops.actions.ts`) require matching Basic Auth via `lib/ops-ui-auth.ts`.
  - Admin route-level permission guard (`AdminRouteGuard`) + permission-aware nav.
  - Ops config page shows full contract metadata (no truncation).
  - Error hints for `409` / `ops_audit_chain_lock_timeout` via `getApiErrorMessageWithHint`.
  - Backend/docs/rules synced: COD webhook capture (no `cod-collected`), metrics header `x-ops-token`.
  - Validation: `npm run typecheck`, `npm run lint`, `npm run build` green.
- Admin MFA + shipping runtime overlay (2026-05-17):
  - `/admin/login` uses `POST /auth/admin/login` with MFA code step-up; invite setup redirects with `mfaEnrollment=1`.
  - `/admin/security/mfa` enrolls/confirms/disables admin MFA (`users:read`); session expiry warning in admin layout.
  - Backend `adminSchedulePickup` / `adminPrintLabel` resolve Shiprocket/Delhivery keys via `resolveRuntimeConfig` (Ops DB overlay).

**Blockers / decisions made:**
- Backend startup gate now passes (`health` endpoint returns OK with DB and Redis connected).
- Backend `.env` now uses `CLIENT_ID=raghava-organics` and `POSTGRES_DB=raghava_organics`; `REDIS_PASSWORD` remains blank and should be aligned with `REDIS_URL` before reliability/gate testing.

**What to do first in the next session (read this at session start):**
1. Run Postman folders 0→3 and attach evidence to go-live packet.
2. Fill provider confirmations (Razorpay/Delhivery/Resend/MSG91) with real dry-run timestamps.
3. Complete backend and frontend formal go-live checklist sign-off.

---
