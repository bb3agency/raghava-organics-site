# Phase 7 VPS Deploy Incident Playbook (May 2026)

This document captures a real end-to-end deploy incident from live VPS setup and converts it into a deterministic Phase 7 runbook.

Scope:
- Backend API + workers bootstrap on VPS
- Host PostgreSQL + Docker network routing
- Mandatory production env preflight
- Failure signatures and exact fixes

Use this together with:
- `docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md` (phase sequence)
- `docs/CLIENT_VPS_SETUP_GUIDE.md` (host provisioning)
- `docs/PRODUCTION_FIRST_DEPLOY_CHECKLIST.md` (Phase 1/2 env model)

---

## 1) Golden deploy order (Phase 7)

1. Clone repository to VPS and ensure backend path exists.
2. Create host PostgreSQL user/database before any container startup.
3. Place production `backend/.env` (never commit this file).
4. Run env preflight checks (bootstrap keys hard-required, DB-overlay keys surfaced as warnings).
5. Run Prisma using lockfile-pinned version (never floating `npx prisma` without `npm ci`).
6. Start Redis, then backend/workers using production compose overlay.
7. Verify health: `http://127.0.0.1:<BACKEND_PORT>/api/v1/health`.
8. Only after health is stable, continue with Nginx/TLS and ops bootstrap.

---

## 2) Mandatory `.env` preflight (before startup)

The following must exist and be non-placeholder before first boot:

- Bootstrap: `DATABASE_URL`, `REDIS_URL`, `OPS_DB_ENCRYPTION_KEY`
- Auth/secrets: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `OPS_COOKIE_SECRET`, `AUDIT_ANCHOR_SECRET`
- Runtime routing: `NODE_ENV=production`, `PORT=3000`, `BACKEND_PORT=3001`

Runtime keys managed through Ops DB overlay are now allowed to be absent at startup. If absent, provider factories fail only at call-time with `CONFIG_NOT_READY`, and `/api/v1/health/ready` reports `runtimeConfigMissingKeys`.

Notes:
- `PORT` is container-internal app port (must remain `3000` with current compose mapping).
- `BACKEND_PORT` is host-exposed port (for Nginx/local health checks).
- After editing `.env`, use recreate flow (`up -d --force-recreate`), not plain restart.

---

## 3) Production compose behavior on VPS

Do not run plain base compose in VPS production when host PostgreSQL is authoritative.

Use:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -p <client-id> up -d backend workers
```

Why:
- Base compose includes a `postgres` service with port bind `:5432`.
- If host PostgreSQL already uses 5432, plain compose startup causes:
  - `failed to bind host port 0.0.0.0:5432: address already in use`

---

## 4) Failure signatures observed and fixes

### A) `Missing /backend/.env — copy from vault`
Cause:
- Phase script executed before placing production `.env`.

Fix:
- Copy filled production env to `backend/.env` on VPS before phase script.

### B) Prisma `P1012` / datasource `url` no longer supported
Cause:
- `npx prisma` pulled latest Prisma CLI (v7) because dependencies were not installed.

Fix:
- Run `npm ci` first, then use lockfile-pinned Prisma.
- Never run bare `npx prisma` in clean host directory.

### C) `P1001 Can't reach database at host.docker.internal` during host-side migrate
Cause:
- Host shell migration attempted with container-only hostname.

Fix:
- For host-side migrate, override to loopback (`127.0.0.1`) for the migration command.
- Keep container runtime `DATABASE_URL` pointed to host gateway/bridge-compatible address.

### D) Docker startup `Cannot find module './scripts/lib/logger'`
Cause:
- Production image did not include `scripts/lib/logger` used by bootstrap scripts.

Fix:
- Ensure `.dockerignore` allows `scripts/lib/**`.
- Ensure Dockerfile copies `scripts/lib` into production image.

### E) Backend/worker crash loop with DB unreachable from containers
Cause:
- Host PostgreSQL initially bound to localhost only and/or auth/firewall rules incomplete.

Fix:
1. `listen_addresses` must allow non-localhost clients (`*` or explicit host gateway).
2. `pg_hba.conf` must allow DB user/db from Docker private ranges and VPS hairpin case.
3. UFW must allow Docker private CIDR to reach host port 5432.
4. Verify with network-level checks from Docker.

### F) Historical incident: crash loop on missing runtime env keys
Cause:
- Earlier validation hard-failed startup for runtime keys that are now DB-overlay managed.

Fix:
- Startup validation now only hard-fails on true bootstrap keys.
- Configure runtime keys in Ops UI and restart API/workers.

### G) Historical incident: crash loop on missing provider keys
Cause:
- Provider mode/credentials were validated at startup instead of on provider use.

Fix:
- Provider factories now return call-time `CONFIG_NOT_READY` errors when runtime config is incomplete.
- Complete provider config in Ops UI before go-live and verify `/api/v1/health/ready` has `runtimeConfigMissingKeys: []`.

---

## 5) Network verification commands (authoritative)

Host DB availability:

```bash
ss -tlnp | rg 5432
psql "postgresql://<user>@127.0.0.1:5432/<db>" -c "SELECT 1;"
psql "postgresql://<user>@172.17.0.1:5432/<db>" -c "SELECT 1;"
```

Docker-to-host routing:

```bash
docker inspect <backend-container> --format '{{json .HostConfig.ExtraHosts}}'
docker run --rm --add-host=host.docker.internal:host-gateway alpine sh -c "apk add -q netcat-openbsd && nc -zv host.docker.internal 5432"
```

Compose-network DB auth test:

```bash
docker run --rm --network <client-network> --add-host=host.docker.internal:host-gateway alpine sh -c "apk add -q postgresql-client && psql -h host.docker.internal -U <db_user> -d <db_name> -c 'SELECT 1'"
```

If this fails with `no pg_hba.conf entry`, use the source host shown in error to patch `pg_hba.conf`.

---

## 6) Phase 7 readiness gate (must pass before continuing)

- `docker compose ... ps` shows backend and workers stable (no restarts).
- Backend health endpoint responds consistently:
  - `database: connected`
  - `redis: connected`
- Readiness endpoint confirms runtime completeness:
  - `GET /api/v1/health/ready` => `status: ready`
  - `runtimeConfigMissingKeys` is empty
- No `Missing required env var` in backend/workers logs.
- No Prisma init errors in logs.
- No pending port collisions (`5432`, `3001`).

Do not proceed to Nginx/TLS, Ops bootstrap, or frontend deploy until this gate is green.

---

## 7) Operational reminders

- Never paste live secrets into chat logs or committed docs.
- If a secret was exposed during troubleshooting, rotate it after stabilization.
- Keep provider credentials in Phase 1/Phase 2 boundaries:
  - Bootstrap keys required for first boot
  - Ops-managed keys migrated to encrypted DB overlay after ops login

