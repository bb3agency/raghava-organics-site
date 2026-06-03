# Raghava Organics — Deployment Readiness Signoff

**Assessment date:** 2026-06-03 (updated after list-response + storefront catalog hardening)

## Local readiness (Phase 5 partial)

| Item | Status | Evidence |
|------|--------|----------|
| Client `.env` bootstrap keys | OK | `backend/.env` (gitignored) |
| `CLIENT_ID` / `POSTGRES_DB` alignment | OK | `raghava-organics` / `raghava_organics` |
| Health + migrations | OK | [LOCAL_SETUP_EVIDENCE.md](./LOCAL_SETUP_EVIDENCE.md) |
| VPS deploy scripts + pack | OK | [scripts/](./scripts/), [VPS_DEPLOYMENT_PACK.md](./VPS_DEPLOYMENT_PACK.md) |
| Frontend unit tests + build | OK | 2026-06-03: `npm test` (70), `npm run build` |
| Backend unit tests | OK | 2026-06-03: `npm run test:unit` (865) |
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

1. **Storefront:** `/products` loads without console errors; search via `/products?q=…` returns results (API param `search`).
2. **Account:** Logged-in user → Settings → saved addresses render; Order history lists orders.
3. **Admin:** `/admin/products` list loads; create product with **Initial stock qty > 0** → product appears on storefront `/products` and PDP.
4. **Admin auth:** Login OTP → resend code with Turnstile visible on OTP step (production).
5. **Ops:** `/ops` audit/users lists load (no empty crash from malformed `items`).
