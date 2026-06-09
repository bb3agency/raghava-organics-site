# Raghava Organics — Deployment Readiness Signoff

**Assessment date:** 2026-06-03 (updated after admin UI redesign — Dashboard, Orders, Payments, Coupons, Reviews pages restyled to FreshMart design system)

## Local readiness (Phase 5 partial)

| Item | Status | Evidence |
|------|--------|----------|
| Client `.env` bootstrap keys | OK | `backend/.env` (gitignored) |
| `CLIENT_ID` / `POSTGRES_DB` alignment | OK | `raghava-organics` / `raghava_organics` |
| Health + migrations | OK | [LOCAL_SETUP_EVIDENCE.md](./LOCAL_SETUP_EVIDENCE.md) |
| VPS deploy scripts + pack | OK | [scripts/](./scripts/), [VPS_DEPLOYMENT_PACK.md](./VPS_DEPLOYMENT_PACK.md) |
| Frontend unit tests + build | OK | 2026-06-03: `npm test` (70), `npm run build` |
| Backend unit tests | OK | 2026-06-03: `npm run test:unit` (868) |
| List-response / catalog fixes | OK | [frontend/docs/FRONTEND_DEV_LOG.md](../../../frontend/docs/FRONTEND_DEV_LOG.md) §2026-06-03 |

## Production (operator-run on VPS)

| Phase | Artifact | Status |
|-------|----------|--------|
| 6 | [scripts/phase6-host-baseline.sh](./scripts/phase6-host-baseline.sh) | Run on VPS |
| 7 | [scripts/phase7-backend-deploy.sh](./scripts/phase7-backend-deploy.sh) | Run on VPS |
| 8 | [scripts/phase8-ops-bootstrap.sh](./scripts/phase8-ops-bootstrap.sh) | Run on VPS |
| 10 | [frontend/.env.production.example](../../../frontend/.env.production.example) | Copy on VPS |
| 5 | [PHASE5_EVIDENCE_CHECKLIST.md](./PHASE5_EVIDENCE_CHECKLIST.md) | After prod live |

**Human sign-off:** _pending production health + go-live checklists_

### Post-deploy smoke checklist (2026-06-03)

After CD deploy to VPS:

1. **Storefront:** `/products` loads without console errors; search via `/products?search=…` returns results.
2. **Account — addresses:** Settings → add address → appears in list; Checkout → saved address chip selects → place COD or test PREPAID order with `addressId` path.
3. **Checkout:** Guest cart → login with `?redirect=/checkout` → returns to checkout; PREPAID success → `/checkout/success`; abandoned Razorpay → message + retry from `/orders`.
4. **Email:** After COD or confirmed PREPAID (workers up), `NotificationLog` shows `OrderConfirmed` template **SENT** for customer email.
5. **Account:** Order history shows payment mode + loading state (no flash “No orders yet”).
6. **Admin — Dashboard:** `/admin` loads with KPI cards, Sales Overview chart, Top Products, Recent Orders, Category breakdown, Low Stock alerts, and Quick Actions panels.
7. **Admin — Orders:** `/admin/orders` loads with KPI cards, filter bar, and redesigned table with customer avatars, status badges, and action icons.
8. **Admin — Payments:** `/admin/payments` loads with KPI cards, filter bar, and redesigned table with transaction IDs, payment method badges, and status pills.
9. **Admin — Coupons:** `/admin/coupons` loads with KPI cards, filter bar, redesigned table with usage progress bars, and "Create Coupon" CTA.
10. **Admin — Reviews:** `/admin/reviews` loads with KPI cards, right sidebar Rating Overview, filter bar, and redesigned table with star ratings and moderation action icons.
11. **Admin — Products:** `/admin/products` list loads; create product with **Initial stock qty > 0** → visible on storefront.
12. **Admin images:** Edit product → upload image (≤ 5 MB) → file appears on PDP; `GET /api/v1/media/products/:id/:file` returns 200; Cloudflare (if used) serves cached asset.
13. **Admin auth:** Login OTP → resend with Turnstile on OTP step.
14. **Ops:** `/ops` audit/users lists load (no empty crash from malformed `items`).

**Product media:** configure R2 in **Ops UI** (Product Media domain), restart API, verify `/health/ready`, set frontend `NEXT_PUBLIC_IMAGE_CDN_URL`, run `npm run verify:r2-media` (no R2 keys in `backend/.env`).

**Note:** COD visibility at checkout still follows `NEXT_PUBLIC_COD_ENABLED` **and** DB `storeSettings.isCodEnabled` — align both before go-live.
