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
| Last updated | 2026-05-24 (VPS CD hardening + incident closure) |

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
**Next incomplete slice:** Execute VPS scripts on server ([docs/clients/raghava-organics/README.md](../../docs/clients/raghava-organics/README.md)) + Postman 0→3

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
| Ops login + cookie session (`/ops/login`, `lib/ops-client-api.ts`) | [x] | Browser `ops_session` cookie; no API-key headers |
| Session bootstrap (`GET /ops/session`) | [x] | `OpsSessionPanel`; route shell `OpsRootLayout` + `OpsConsoleShell` (console nav post-login only) |
| Load-shed single-step OTP (`POST /ops/load-shed`) | [x] | `OpsLoadShedPanel`, `OpsCriticalOtpForm` |
| Config overview/stored/save + OTP (`config-save`) | [x] | `OpsConfigPagePanel`, `OpsConfigEditor` |
| Invites create/revoke + users deactivate + system restart | [x] | `OpsInvitesPanel`, `OpsUsersPanel`, `OpsSystemPanel` |
| Audit timeline + queue visibility under `/ops/queues` | [x] | `OpsAuditPanel`, `OpsQueuesPanel` |
| Metrics (server token) | [x] | `lib/ops-api.ts` + `app/(ops)/ops/metrics/page.tsx` |
| Setup consume flow | [x] | `app/(ops)/ops/setup/page.tsx` |
| ~~Approvals queue~~ | — | Removed — backend has no approvals routes |

### Tier 3 — Admin Read

| Slice | Status | Notes |
|---|---|---|
| Dashboard KPIs/chart/top-products | [x] | `app/(storefront)/admin/page.tsx` |
| Orders read | [x] | `app/(storefront)/admin/orders/page.tsx` |
| Order detail + invoice download | [x] | `app/(storefront)/admin/orders/[id]/page.tsx` |
| Products + categories read | [x] | `app/(storefront)/admin/products/page.tsx` |
| Inventory + low-stock read | [x] | `app/(storefront)/admin/inventory/page.tsx` |
| Customers read + CRM (orders/notes/ban) | [x] | `admin/customers/[id]`, `AdminCustomerDetailPanel` |
| Shipments + payments global read | [x] | `admin/shipments`, `admin/payments` |
| Returns list + detail | [x] | `admin/returns`, `admin/returns/[id]` |
| Reviews moderation queue | [x] | `admin/reviews` |
| Inventory history per variant | [x] | `AdminInventoryHistoryPanel` on inventory page |
| Order board + returns read | [x] | `app/(storefront)/admin/orders/board/page.tsx`, `app/(storefront)/admin/returns/page.tsx` |

### Tier 4 — Admin Mutations

| Slice | Status | Notes |
|---|---|---|
| Mutation panels with idempotency keys | [x] | `components/admin/AdminMutationPanel.tsx` |
| Ship/cancel/refund fulfillment (Shiprocket; COD via webhook) | [x] | `AdminOrderFulfillmentPanel.tsx` — refund via `PATCH .../status` REFUNDED |
| Customer ban/unban + notes CRUD | [x] | `AdminCustomerDetailPanel.tsx` |
| Inventory bulk + variant delete + review delete | [x] | `AdminMutationPanel` presets on inventory/reviews pages |
| Coupons lifecycle (feature-flagged) | [x] | `admin/coupons` + mutation presets |
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
- Full ops/admin contract rebaseline (2026-05-23):
  - Removed stale ops approvals surface and admin MFA/TOTP UI; admin login is email OTP (`request-otp` → `verify-otp`).
  - Ops browser integration via `lib/ops-client-api.ts` (`credentials: 'include'`); server metrics remain in `lib/ops-api.ts`.
  - Added `/ops/login`, users, queues, system; load-shed is single-step OTP; five critical ops writes share `OpsCriticalOtpForm`.
  - Admin read: shipments, payments, reviews, returns detail, CRM tabs; admin queues page points operators to `/ops/queues`.
  - `OpsSessionGate` retained for optional panel use; route-level auth via `OpsConsoleShell` (public: `/ops/login`, `/ops/setup` only).

- Ops UI auth shell (2026-05-24): `OpsRootLayout` hides console nav on `/ops/login` and `/ops/setup`; `OpsConsoleShell` gates all other `/ops/*` routes via `GET /ops/session` + redirect to login.
- Ops queues DLQ summary (2026-05-24): frontend uses `bySourceQueue` to match `GET /ops/queues/dlq/summary` response (fixes `Object.entries` crash on `/ops/queues`).
- Ops SaaS UI pass (2026-05-24): sidebar shell (`OpsConsoleShell`), shared `ops-ui` primitives, overview dashboard, polished login/setup, all control-plane panels with tables/badges/permission gates.

**Blockers / decisions made:**
- Backend startup gate now passes (`health` endpoint returns OK with DB and Redis connected).
- Backend local bootstrap complete (2026-05-23): see [docs/clients/raghava-organics/LOCAL_SETUP_EVIDENCE.md](../../docs/clients/raghava-organics/LOCAL_SETUP_EVIDENCE.md). VPS pack + phase scripts: [docs/clients/raghava-organics/README.md](../../docs/clients/raghava-organics/README.md).

**What to do first in the next session (read this at session start):**
1. Start dev server: `cd frontend && npm run dev` (runs at http://localhost:3101)
2. Review storefront design against `frontend-design-reference/` and refine any visual details.
3. Build checkout page UI (PREPAID/COD flow) — next major storefront piece.
4. Add ProductGallery thumbnails redesign to match Tasty Daily.
5. Fill [docs/clients/raghava-organics/VPS_INPUTS.md](../../docs/clients/raghava-organics/VPS_INPUTS.md) and run Phase 6–8 scripts on VPS when ready.

### 2026-05-24

- VPS GitHub Actions CD pipeline validated end-to-end for client repo `bb3agency/raghava-organics-site`.
- Runner naming/placement hardened for multi-client VPS:
  - per-client directory convention `~/actions-runner-<client-id>`
  - `CLIENT_ID` normalization in scripts (`Raghava Organics` -> `raghava-organics`).
- Root cause found for skipped deploys: repo had no Variables/Secrets set initially; additionally, path values were mistakenly entered as Variables instead of Secrets.
  - Correct shape: Variables -> `VPS_DEPLOY_ENABLED`, `FRONTEND_DEPLOY_ENABLED`, `VPS_RUNNER_LABEL`
  - Secrets -> `VPS_CLIENT_PATH`, `VPS_FRONTEND_PATH`
- Frontend CD verified:
  - `vps-frontend-deploy.sh` writes `.last-frontend-deploy-sha` after successful build + PM2 reload.
  - Product grid test change deployed successfully through workflow.
- Backend CD issues and fixes:
  - `npx: not found` in deploy path traced to production image intentionally removing npm/npx.
  - `EACCES` on `.prisma/client` traced to runtime container generate step under non-root user.
  - `backend/scripts/vps-deploy.sh` updated: run migrations on host via local Prisma CLI and skip runtime-container Prisma generate.
- Final backend deploy blocker was expected readiness gate (`/health/ready`) due to missing Ops DB-overlay runtime keys (`PAYMENT_PROVIDER`, `SHIPPING_PROVIDER`, `SMS_PROVIDER`).
  - Resolution path documented in client CD setup doc: complete Ops Config (Phase 8), restart API/workers, verify `runtimeConfigMissingKeys: []`.
- Ops permissions model update:
  - Backend now enforces both `OPS_READ` + `OPS_WRITE` for every ops user during invite creation, invite consumption, and login session normalization.
  - Frontend ops invite form removed manual permissions input; UI now treats ops users as mandatory read+write.

---

### 2026-05-26 — Storefront Design Sprint (Tasty Daily theme)

**Scope:** Storefront visual redesign only. `/ops`, `/admin`, backend untouched.

**Design reference:** `frontend-design-reference/` (Tasty Daily organic grocery theme — mirrored locally, added to root `.gitignore`).

**Design system applied:**
- Font: Quicksand (Google Fonts, weights 400/500/600/700) — replaces Inter/Manrope in `lib/fonts.ts`
- Primary colour: `#23403d` (deep forest green) — `oklch(0.272 0.045 178)`
- Accent colour: `#ec6e55` (peach/coral, CTAs + badges + stars) — `oklch(0.64 0.155 28)`
- Background: `#faf3ef` (warm cream) — `oklch(0.974 0.010 68)`
- Border: `#efe8e4` warm — `oklch(0.924 0.012 60)`
- All tokens updated in `app/globals.css` `:root` block; dark mode preserved for ops console

**Components redesigned:**
- `components/layout/Header.tsx` — sticky, logo with `Leaf` icon, centred desktop nav (Shop / Fresh / Staples / Offers), icon-only action bar
- `components/layout/MainNav.tsx` — icon row: Search, Cart (with count badge), Admin shortcut, User/Sign-in; pill Sign-in button
- `components/layout/Footer.tsx` — 4-col (Brand + Quick Links + Policies + Contact), dark green bg, peach social icons
- `components/product/ProductCard.tsx` — rounded-2xl, Featured + sale-% pill badges, hover scale, out-of-stock overlay, rounded-full CTA, accent sale price
- `components/product/ProductGrid.tsx` — priority on first 4 images for LCP
- `components/shared/Rating.tsx` — stars now use `text-accent` (peach/coral)
- `components/shared/PriceDisplay.tsx` — sale price coloured `text-accent`

**New components created:**
- `components/shared/NewsletterForm.tsx` — client component with success state
- `components/product/PlpSortSelect.tsx` — client dropdown, updates `?sort=` URL param
- `components/shared/SearchInput.tsx` — client search box with clear button, pushes `/search?q=`

**Pages redesigned:**
- `app/(storefront)/page.tsx` — full homepage: Hero (green bg, peach CTAs, star social proof), 6-category grid, Featured Products (live data), Trust Bar (4 icons), Newsletter CTA
- `app/(storefront)/products/page.tsx` — PLP with breadcrumb, sort dropdown, organic empty state
- `app/(storefront)/products/[slug]/page.tsx` — PDP with breadcrumb, category label, save-% badge, stock dot, variant pill selector, dual CTA (Add + Buy Now), trust grid, tags
- `app/(storefront)/categories/[slug]/page.tsx` — category header, `generateMetadata`, organic empty state
- `app/(storefront)/search/page.tsx` — `SearchInput` component, prompt/no-results/results states
- `app/(storefront)/cart/page.tsx` — breadcrumb + styled header

**Config:**
- `next.config.ts` — `remotePatterns` for all HTTPS + `localhost` HTTP (product images)
- `.gitignore` (repo root) — `frontend-design-reference/` excluded from git

**Quality gate:** `npx tsc --noEmit` → 0 errors ✅

**Next session priorities:**
1. `cd frontend && npm run dev` → review at http://localhost:3101
2. Redesign `ProductGallery` (thumbnails strip, main image, zoom on hover)
3. Build checkout page UI — PREPAID Razorpay flow + COD confirmation
4. Account pages (`/dashboard`, `/orders`, `/orders/[id]`) — organic styling pass
5. Auth pages (`/login`, `/register`, `/forgot-password`) — match new design

---
