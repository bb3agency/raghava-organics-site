# Client VPS Deployment Log — Raghava Organics

> **Scope:** Phases 6–14. Master runbook: [CLIENT_ONBOARDING_EXECUTION_ORDER.md](../../../backend/docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md)

---

## Project Identity

| Field | Value |
|---|---|
| Client name | Raghava Organics |
| `CLIENT_ID` | `raghava-organics` |
| Domain | `raghavaorganics.com` (details in gitignored [VPS_INPUTS.md](./VPS_INPUTS.md)) |
| Admin path | `/admin` |
| Backend port | `3001` |
| Storefront port | `3101` |
| VPS IP | `178.104.46.202` |
| Deploy user | `d_user` |
| Git repo | `https://github.com/bb3agency/raghava-organics-site` |
| Backend path | `/var/www/raghava-organics/backend` |
| Frontend path | `/var/www/raghava-organics/frontend` |
| Phase 5 (local) | 2026-05-23 |
| Last updated | 2026-05-23 |

---

## Phase 6 — VPS Baseline

**Status:** `[~]` scripts ready — execute on VPS

- [ ] Run `bash docs/clients/raghava-organics/scripts/phase6-host-baseline.sh` (from repo root on VPS after clone)
- [ ] Full checklist: [CLIENT_VPS_DEPLOYMENT_LOG_TEMPLATE.md](../../../backend/docs/CLIENT_VPS_DEPLOYMENT_LOG_TEMPLATE.md)

---

## Phase 7 — Backend deploy

**Status:** `[~]` scripts ready — requires production `.env` in vault

- [ ] `production.backend.env` on VPS at `backend/.env`
- [ ] Run `phase7-backend-deploy.sh`
- [ ] `curl http://127.0.0.1:3001/api/v1/health` OK
- [ ] Nginx + Certbot per [VPS_DEPLOYMENT_PACK.md](./VPS_DEPLOYMENT_PACK.md)

---

## Phase 8 — Ops bootstrap

**Status:** `[ ]` blocked until live Resend

- [ ] Run `phase8-ops-bootstrap.sh` or manual `ops:newuser`
- [ ] Ops UI config save + container restart

---

## Phase 10 — Frontend

**Status:** `[~]` template ready

- [ ] `.env.production.local` from [frontend/.env.production.example](../../../frontend/.env.production.example)
- [ ] `pm2` process `raghava-organics-frontend`

---

## Phase 5 / 12 — Evidence

- [ ] [PHASE5_EVIDENCE_CHECKLIST.md](./PHASE5_EVIDENCE_CHECKLIST.md)
