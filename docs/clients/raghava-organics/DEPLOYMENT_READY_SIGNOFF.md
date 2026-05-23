# Raghava Organics — Deployment Readiness Signoff

**Assessment date:** 2026-05-23

## Local readiness (Phase 5 partial)

| Item | Status | Evidence |
|------|--------|----------|
| Client `.env` bootstrap keys | OK | `backend/.env` (gitignored) |
| `CLIENT_ID` / `POSTGRES_DB` alignment | OK | `raghava-organics` / `raghava_organics` |
| Health + migrations | OK | [LOCAL_SETUP_EVIDENCE.md](./LOCAL_SETUP_EVIDENCE.md) |
| VPS deploy scripts + pack | OK | [scripts/](./scripts/), [VPS_DEPLOYMENT_PACK.md](./VPS_DEPLOYMENT_PACK.md) |

## Production (operator-run on VPS)

| Phase | Artifact | Status |
|-------|----------|--------|
| 6 | [scripts/phase6-host-baseline.sh](./scripts/phase6-host-baseline.sh) | Run on VPS |
| 7 | [scripts/phase7-backend-deploy.sh](./scripts/phase7-backend-deploy.sh) | Run on VPS |
| 8 | [scripts/phase8-ops-bootstrap.sh](./scripts/phase8-ops-bootstrap.sh) | Run on VPS |
| 10 | [frontend/.env.production.example](../../../frontend/.env.production.example) | Copy on VPS |
| 5 | [PHASE5_EVIDENCE_CHECKLIST.md](./PHASE5_EVIDENCE_CHECKLIST.md) | After prod live |

**Human sign-off:** _pending production health + go-live checklists_
