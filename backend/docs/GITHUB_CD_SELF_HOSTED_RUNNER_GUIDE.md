# GitHub CD — Self-Hosted Runner (Push-to-Deploy)

> **Purpose:** Enable **automatic, safe VPS deploys** on every `git push` to `main` — similar in developer experience to Vercel, but the build and restart run on **your client's Hetzner VPS**.
>
> **Canonical companion:** `docs/CLIENT_VPS_SETUP_GUIDE.md` §22 (summary + nginx/PM2 context)  
> **Per-client checklist copy:** `docs/templates/client-GITHUB_CD_SETUP.template.md` → `docs/clients/<client-id>/GITHUB_CD_SETUP.md`  
> **Architecture decision:** `docs/DECISIONS.md` — [2026-05-23] Push-to-deploy via per-repo self-hosted runner

---

## Mental model

| Concept | Meaning |
|---------|---------|
| **One runner per client GitHub repo** | Runner is registered to `https://github.com/<org>/<client-repo>`, not to the template backend repo |
| **Runner lives on the client's VPS** | Long-lived `actions-runner` systemd service; **polls GitHub outbound on port 443** |
| **No inbound SSH for deploys** | After runner is Online, restrict port 22 to office IP |
| **CI in the cloud, deploy on VPS** | `Reliability CI` runs on `ubuntu-latest`; `Deploy to VPS` runs on `runs-on: <client-id>-vps` |
| **Opt-in per repo** | `VPS_DEPLOY_ENABLED=true` only on client repos — template stays off |

---

## End-to-end flow

```
Developer: git push origin main
    │
    ▼
Reliability CI (GitHub-hosted, ubuntu-latest)
    │  typecheck, unit/e2e tests, build, guardrails, smoke
    │  FAIL → stop (no deploy)
    ▼
Deploy to VPS (workflow_run trigger)
    │  queued for runner label <client-id>-vps
    ▼
Self-hosted runner on client VPS (polling GitHub)
    ├─ deploy-backend  → bash $VPS_CLIENT_PATH/scripts/vps-deploy.sh
    │       git pull + SHA verify → npm ci → migrate → docker compose swap
    │       /health + /health/ready gate
    └─ deploy-frontend → bash $VPS_CLIENT_PATH/scripts/vps-frontend-deploy.sh $VPS_FRONTEND_PATH
            git pull → change detect → npm ci → build → pm2 reload (zero downtime)
```

**Daily workflow after setup:** `git commit && git push origin main` — nothing else.

---

## Prerequisites (before enabling CD)

| # | Requirement | Phase |
|---|-------------|-------|
| 1 | VPS host baseline (Docker, Node 22, nginx, Postgres, UFW) | 6 |
| 2 | Monorepo or backend repo cloned on VPS; `backend/.env` present | 7 |
| 3 | First manual backend deploy healthy: `GET /api/v1/health` | 7 |
| 4 | Ops bootstrap + DB-overlay keys saved | 8 |
| 5 | `/api/v1/health/ready` → `status=ready`, `runtimeConfigMissingKeys=[]` | 8 |
| 6 | Frontend `.env.production.local` + one-time `pm2 start` (if using frontend CD) | 10 |
| 7 | Root or backend workflow files committed to **client** repo `main` | 7.6 |

> **Important:** `vps-deploy.sh` **fails** the deploy job if readiness is not fully green. You can install the runner after Phase 7, but **backend auto-deploy succeeds only after Phase 8**.

---

## Repository layout: where workflows live

GitHub **only** executes workflows from `.github/workflows/` at the **repository root**.

| Client repo shape | Workflow location | CI working directory |
|-------------------|-------------------|---------------------|
| **Monorepo** (`backend/` + `frontend/` at root) | Repo root: `.github/workflows/reliability-ci.yml`, `deploy.yml` | `defaults.run.working-directory: backend` |
| **Backend-only** (fork/clone of template) | `backend/.github/workflows/ci.yml`, `deploy.yml` | default (backend root) |

Deploy scripts **always** live at `backend/scripts/vps-deploy.sh` and `backend/scripts/vps-frontend-deploy.sh`.

**Monorepo frontend deploy invocation** (required — script is not under `frontend/scripts/`):

```bash
bash "$VPS_CLIENT_PATH/scripts/vps-frontend-deploy.sh" "$VPS_FRONTEND_PATH" "$COMMIT_SHA"
```

---

## VPS directory layout (monorepo — recommended)

Single git clone; two deploy paths:

```text
/var/www/<client-id>/
├── .git/
├── backend/          ← VPS_CLIENT_PATH secret
│   ├── .env
│   └── scripts/vps-deploy.sh
└── frontend/         ← VPS_FRONTEND_PATH secret
    └── .env.production.local
```

```bash
git clone https://github.com/<org>/<client-repo>.git /var/www/<client-id>
```

Do **not** maintain two separate clones for backend and frontend — they will drift.

---

## One-time setup checklist

### Step A — Install self-hosted runner (VPS)

SSH as deploy user. Token from **client repo → Settings → Actions → Runners → New self-hosted runner** (expires in ~1 hour).

```bash
# One folder per client on multi-tenant VPS (never share ~/actions-runner across repos)
mkdir -p ~/actions-runner-<client-id> && cd ~/actions-runner-<client-id>

# Use exact curl URL + version from the GitHub UI (do not guess the version)
curl -o actions-runner-linux-x64.tar.gz -L <URL_FROM_GITHUB>
tar xzf ./actions-runner-linux-x64.tar.gz

./config.sh \
  --url https://github.com/<org>/<client-repo> \
  --token <REGISTRATION_TOKEN> \
  --name "<client-id>-vps" \
  --labels "self-hosted,<client-id>-vps" \
  --unattended

sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

**Multi-client on one VPS:** client A → `~/actions-runner-greengrocer`, client B → `~/actions-runner-raghava-organics`. Each runner registers to **its own** GitHub repo; `VPS_RUNNER_LABEL` in each repo prevents cross-routing.

**Verify:** GitHub → Settings → Actions → Runners → **Idle** (green) for `<client-id>-vps`.

**Multi-client VPS:** Each client repo gets its **own** runner registration and **unique** label (`greengrocer-vps`, `raghava-organics-vps`, …). Never share one generic runner across client repos without labels.

### Step B — GitHub repository configuration (client repo only)

**Settings → Secrets and variables → Actions**

#### Variables (must be Variables, not Secrets — workflows use `vars.*`)

| Name | Example | Purpose |
|------|---------|---------|
| `VPS_DEPLOY_ENABLED` | `true` | Master switch — without this, deploy workflow is skipped |
| `VPS_RUNNER_LABEL` | `raghava-organics-vps` | Must match runner `--labels` (prevents cross-client routing) |
| `FRONTEND_DEPLOY_ENABLED` | `true` | Enable frontend job; omit for API-only clients |

#### Secrets

| Name | Example | Purpose |
|------|---------|---------|
| `VPS_CLIENT_PATH` | `/var/www/raghava-organics/backend` | Backend deploy script + Docker compose root |
| `VPS_FRONTEND_PATH` | `/var/www/raghava-organics/frontend` | Next.js app root for PM2 |

### Step C — First-time PM2 (frontend CD only)

```bash
cd /var/www/<client-id>/frontend
# .env.production.local must exist with:
# CLIENT_ID, STOREFRONT_PORT, NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_STOREFRONT_URL,
# OPS_UI_BASIC_AUTH_USERNAME, OPS_UI_BASIC_AUTH_PASSWORD
bash /var/www/<client-id>/docs/clients/<client-id>/scripts/phase10-frontend-deploy.sh
pm2 startup   # run the printed sudo command
pm2 save
```

Subsequent deploys use `pm2 reload` via `vps-frontend-deploy.sh`.

### Step D — Push workflows and test

Ensure client repo `main` contains the workflow files (see [Repository layout](#repository-layout-where-workflows-live)).

```bash
git commit --allow-empty -m "chore: verify VPS CD pipeline"
git push origin main
```

**Watch:** Actions → **Reliability CI** (pass) → **Deploy to VPS** → jobs on `<client-id>-vps`.

### Step E — Post-setup hardening

- Restrict SSH (port 22) to office CIDR — deploys no longer need public SSH.
- Confirm UFW does **not** expose `BACKEND_PORT` / `STOREFRONT_PORT` publicly (nginx terminates TLS on 443).

---

## What each deploy script does

### `vps-deploy.sh` (backend)

1. Validate `CLIENT_PATH` and `.env` exist  
2. `git pull` + verify SHA matches CI-validated commit  
3. `npm ci` + `verify-client-bootstrap-env.mjs`  
4. `docker compose build`  
5. `prisma migrate deploy` (host Postgres via `127.0.0.1` URL)  
6. `docker compose -p <client-id> -f docker-compose.yml -f docker-compose.prod.yml up -d backend workers`  
7. `/api/v1/health` retry loop  
8. `/api/v1/health/ready` — must be `ready` with `runtimeConfigMissingKeys: []`  
9. `docker image prune -f`

**Downtime:** ~3–5s (nginx serves maintenance page on 502/503).

### `vps-frontend-deploy.sh` (frontend)

1. `git pull` + SHA verify (same monorepo)  
2. Skip build if no frontend-relevant files changed since last deploy SHA  
3. `npm ci` + `npm run build`  
4. `pm2 reload <client-id>-frontend`  
5. HTTP check on `http://127.0.0.1:<STOREFRONT_PORT>/`
6. `/ops/setup` basic-auth check using `OPS_UI_BASIC_AUTH_USERNAME/PASSWORD` from `.env.production.local`

**Downtime:** zero (graceful PM2 reload).

---

## What the pipeline never touches

- VPS `backend/.env` (bootstrap secrets)  
- Ops DB-overlay secrets (`OpsConfigSecret`)  
- Nginx / TLS configuration  
- Template backend repo (unless `VPS_DEPLOY_ENABLED` is set there by mistake)

---

## Manual / emergency deploy

GitHub → Actions → **Deploy to VPS** → **Run workflow** (`workflow_dispatch`).

Use when you need a redeploy without a new commit. Prefer `git revert` + `git push` for audited rollbacks.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No workflows on push | Workflows not at **repo root** `.github/workflows/` | Add root workflows for monorepo; push to `main` |
| CI runs, deploy never starts | `VPS_DEPLOY_ENABLED` not `true` or not a **Variable** | Fix repo Variables |
| Deploy fails with `Missing required secrets: VPS_CLIENT_PATH ...` | Paths were added as **Variables** instead of **Secrets** | Move `VPS_CLIENT_PATH`/`VPS_FRONTEND_PATH` to repo **Secrets**; keep only booleans/labels in Variables |
| Deploy job queued forever | Runner offline or wrong label | `sudo ~/actions-runner-<client-id>/svc.sh status`; fix `VPS_RUNNER_LABEL` |
| Deploy hit wrong VPS client | Missing/wrong `VPS_RUNNER_LABEL` | Unique label per client repo |
| Backend deploy fails at readiness | Phase 8 incomplete | Ops config save + restart; `curl /health/ready` — on 503, read `data.runtimeConfigMissingKeys` (not only error message) |
| Invite revoke OTP fails (400 on otp/request) | Backend before May 2026 | Ensure `invite-revoke` is in OTP action enum; redeploy backend |
| `SHA mismatch` | Another push during deploy | Re-run workflow |
| Frontend `script not found` | Workflow calls `frontend/scripts/...` | Use `$VPS_CLIENT_PATH/scripts/vps-frontend-deploy.sh` |
| `/ops/setup` returns 401 with `curl -u` | Wrong `OPS_UI_BASIC_AUTH_*` values, PM2 not reloaded, or stale frontend build | Verify `.env.production.local`, run `phase10-frontend-deploy.sh`, and retest localhost `/ops/setup` with real creds |
| Backend deploy fails with `sh: npx: not found` | Production image strips npm/npx binaries | Use host Prisma CLI for migrations and avoid container `npx` |
| Backend deploy fails with `EACCES ... /app/node_modules/.prisma/client/index.js` | `prisma generate` executed inside runtime container as non-root user | Do not run container-side generate in deploy; Prisma client is generated during image build |
| Port 5432 in use on compose up | Started compose `postgres` on host-Postgres VPS | Use `docker-compose.prod.yml` overlay |

**Phase 7 incidents:** `docs/PHASE7_VPS_DEPLOY_INCIDENT_PLAYBOOK.md`

---

## Rollback

**Audited (recommended):**

```bash
git revert <bad-commit>
git push origin main
# CD redeploys automatically after CI passes
```

**Immediate (VPS shell):**

```bash
cd /var/www/<client-id>/backend
git checkout <good-sha>
docker compose -p <client-id> -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend workers
```

---

## Runner maintenance (~1–2× per year)

GitHub deprecates old runner versions. Re-register:

```bash
cd ~/actions-runner-<client-id>
sudo ./svc.sh stop
./config.sh remove --token <REMOVAL_TOKEN>
# Download new runner package, extract
./config.sh --url https://github.com/<org>/<repo> --token <NEW_TOKEN> \
  --name "<client-id>-vps" --labels "self-hosted,<client-id>-vps" --unattended
sudo ./svc.sh install && sudo ./svc.sh start
```

---

## Related files

| File | Role |
|------|------|
| `.github/workflows/reliability-ci.yml` | Monorepo CI entry |
| `.github/workflows/deploy.yml` | Monorepo CD entry |
| `backend/.github/workflows/ci.yml` | Backend-only repo CI |
| `backend/.github/workflows/deploy.yml` | Backend-only repo CD |
| `backend/scripts/vps-deploy.sh` | Backend deploy |
| `backend/scripts/vps-frontend-deploy.sh` | Frontend deploy |
| `backend/docs/templates/scripts/install-github-runner.sh` | Reusable runner install helper for new clients |
| `backend/docs/templates/scripts/verify-cd-status.sh` | Reusable CD/PM2/Docker verification helper |
| `backend/docs/templates/scripts/migrate-runner-directory.sh` | One-time rename helper (`~/actions-runner` -> `~/actions-runner-<client-id>`) |
| `backend/docs/templates/scripts/phase9-github-cd-setup.sh` | VPS preflight before enabling CD |
| `backend/scripts/verify-vps-deploy-preflight.mjs` | Local artifact check (no VPS) |
| `backend/docs/templates/scripts/phase7-backend-deploy.sh` | First manual backend bootstrap |
| `backend/docs/templates/scripts/phase8-ops-bootstrap.sh` | Ops bootstrap helper |

---

## Evidence gate (Phase 7.6 cleared)

- [ ] Runner **Online** on correct client repo with label `<client-id>-vps`  
- [ ] All Variables and Secrets set (see Step B)  
- [ ] Test push to `main`: Reliability CI green → Deploy to VPS green on correct runner  
- [ ] `curl` live domain health + readiness after deploy  
- [ ] Documented in `client-<id>/GITHUB_CD_SETUP.md` and `CLIENT_VPS_DEPLOYMENT_LOG.md`
