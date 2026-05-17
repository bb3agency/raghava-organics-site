# Multi-Client VPS Setup Guide

This guide is the **deployment runbook** for hosting multiple isolated client stores on **one Ubuntu VPS** using this repository. **Canonical architecture:** `ECOM_MASTER.md` (especially section 5 — VPS and deployment, section 12 — per-client customization) and `TRD.md` (sections 2.3, 3 — infrastructure, 4.2 — plugin order, 7.10–7.12 — webhooks). **Business acceptance for first go-live:** `BRD.md` section 12 (Phase 6 acceptance criteria). **Reusable release checklists:** `docs/BACKEND_GO_LIVE_CHECKLIST.md` + `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`. **Conflict resolution:** `ECOM_MASTER.md` wins.

**Lifecycle:** This is a **Client-Main (Post-Development)** runbook. Use `docs/CLIENT_HANDOFF_INDEX.md` as the primary post-development entrypoint.

This runbook begins after Phase 5 local gate clears. Frontend Phase 4 must already be completed in the mandatory order documented in `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` §1.2: Foundation -> Ops control plane -> Admin read -> Admin mutation -> Reliability -> Storefront customer journey.

---

## 1. What you are building

| Layer | Runs where | Role |
| --- | --- | --- |
| PostgreSQL 16 | **Host** (not in Compose) | One server process; **one database per client** (`TRD.md` §3.2). Containers reach it via `host.docker.internal`. |
| Nginx | **Host** | TLS termination, HTTP→HTTPS redirect, reverse proxy to backend/storefront app. Admin is served as a route within the same frontend deployment. |
| Certbot | **Host** | Certificates under `/etc/letsencrypt/live/<domain>/`. |
| Docker Compose stack | **Per client** | `backend` (Fastify), `workers` (BullMQ consumers), `postgres`, `redis` — see repo root `docker-compose.yml`. |

**Isolation rules (`TRD.md` §2.3, `ECOM_MASTER.md` §5):** never share Redis, database, JWT secrets, or payment/shipping credentials between clients. Each client gets its own `.env`, Compose project, Nginx `server {}` blocks, and TLS identity.

---

## 2. VPS baseline

| Item | Minimum | Notes |
| --- | --- | --- |
| OS | Ubuntu 22.04 LTS | `TRD.md` §3.1 |
| vCPU / RAM | 2 / 4 GB min; 4 / 8 GB recommended for 5–10 sites | Same table in `TRD.md` §3.1 |
| Disk | 40 GB SSD min | 80 GB SSD recommended for 5–10 active sites (`TRD.md` sizing guidance) |
| Nginx | 1.24+ | Required floor from `TRD.md` platform matrix |
| Time sync | **Required** | `systemd-timesyncd` (or NTP). Webhook skew checks (`RAZORPAY_WEBHOOK_MAX_SKEW_SECONDS`, `DELHIVERY_WEBHOOK_MAX_SKEW_SECONDS` in `.env.example`) depend on correct clock. |

Install on the host: **Docker Engine + Compose plugin**, **Nginx**, **Certbot** (nginx plugin), **PostgreSQL 16**, **Node.js 22** (for local `npm ci` / migrations if you do not run them only in CI), **jq** (optional, for JSON scripting). Create a **non-root deploy user** with sudo.

### 2.1 Host hardening checklist (required before first production client)

Use this once per VPS and record completion in your infra runbook:

| Check | Pass criteria |
| --- | --- |
| SSH hardening | `PermitRootLogin no` and `PasswordAuthentication no` in `/etc/ssh/sshd_config` |
| Firewall | `ufw` allows only `22`, `80`, `443` inbound |
| Intrusion protection | `fail2ban` installed, enabled, and running |
| Patch hygiene | `unattended-upgrades` enabled for security updates |
| Time sync | `timedatectl` reports synchronized clock |

Quick verification commands:

```bash
sudo systemctl status fail2ban --no-pager
sudo ufw status
timedatectl status
sudo grep -E "^(PermitRootLogin|PasswordAuthentication)" /etc/ssh/sshd_config
```

### 2.2 Capacity trigger thresholds (operational)

Keep these as scaling signals for the current host:

| Signal | Trigger | Action |
| --- | --- | --- |
| RAM | Sustained >75% during peak windows | Plan vertical resize before onboarding next client |
| CPU | Sustained >70% with request latency increase | Profile workers/provider adapters; plan resize |
| Disk | >70% used on root or data volume | Purge stale artifacts, archive backups, expand storage |
| Redis memory | Frequent eviction pressure or queue lag | Increase Redis limits / reduce retention / resize host |

These are **operational thresholds**, not architecture changes. Canonical stack remains Nginx + host PostgreSQL + per-client isolated app stack.

---

## 3. Port assignment (must follow)

| Client slot N | Backend host port | Typical storefront upstream port |
| --- | --- | --- |
| 1 | 3001 | 3101 |
| 2 | 3002 | 3102 |
| N | 3000 + N | 3100 + N |

**`BACKEND_PORT`** in `.env` maps host port → container `3000` (`docker-compose.yml` `ports: "${BACKEND_PORT}:3000"`). **Do not hardcode** ports inside `docker-compose.yml`; only via env (`TRD.md` §3.3).

---

## 4. Directory layout (recommended)

| Path | Purpose |
| --- | --- |
| `/var/www/<client-id>/backend` | Git clone of **this** template for that client |
| `/var/www/<client-id>/storefront` | Next.js frontend app (App Router — `TRD.md` §12.1) serving both storefront and admin routes (for example `/admin`) |
| `/var/log/nginx/` | Per-site `access.log` / `error.log` if you split logs |

---

## 5. PostgreSQL (host)

### 5.1 Per-Client Database Setup (VPS)

Each client gets **isolated database credentials**. Never share databases or use generic `postgres/postgres` credentials.

#### Step-by-Step Setup:

**1. Create database and user:**
```bash
# Connect to host Postgres as superuser
sudo -u postgres psql

-- Create client database
CREATE DATABASE client_annapoorna;

-- Create dedicated user with strong password
CREATE USER annapoorna_app WITH PASSWORD 'StrongRandomPass123!';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE client_annapoorna TO annapoorna_app;

-- Connect to new database and grant schema privileges
\c client_annapoorna
GRANT ALL ON SCHEMA public TO annapoorna_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO annapoorna_app;
```

**2. Configure client `.env`:**
```env
POSTGRES_USER=annapoorna_app
POSTGRES_PASSWORD=StrongRandomPass123!
POSTGRES_DB=client_annapoorna
POSTGRES_PORT=5432
# URL-encode special characters if present
DATABASE_URL=postgresql://annapoorna_app:StrongRandomPass123!@host.docker.internal:5432/client_annapoorna
```

**3. Verify connectivity from container:**
```bash
docker compose exec backend node -e "console.log(require('@prisma/client').PrismaClient)"
# Or check logs
docker compose logs backend | head -20
```

### 5.2 Credential Lifecycle Management

| Phase | Action | Command/Location |
|-------|--------|------------------|
| **Initial setup** | Create DB + user | `sudo -u postgres psql` → `CREATE DATABASE/USER` |
| **Rotation** | Update password | `ALTER USER annapoorna_app WITH PASSWORD 'NewPass';` then update `.env` |
| **Verification** | Test connection | `npx prisma migrate status` or backend health check |
| **Backup** | pg_dump | `pg_dump -U annapoorna_app -d client_annapoorna > backup.sql` |

### 5.3 Common VPS PostgreSQL Issues

**Issue: Prisma P1000 (password mismatch after rotation)**
```bash
# If you rotated password in .env but DB still has old password:
sudo -u postgres psql -c "ALTER USER annapoorna_app WITH PASSWORD 'NewPasswordFromDotEnv';"
```

**Issue: Host cannot connect to container Postgres**
- VPS uses `host.docker.internal` in `DATABASE_URL` (containers → host Postgres)
- `docker-compose.yml` includes `extra_hosts: host.docker.internal:host-gateway`
- Verify: `docker compose exec backend nslookup host.docker.internal`

**Issue: Permission denied for schema**
```bash
# Re-grant schema privileges after DB creation
sudo -u postgres psql -d client_annapoorna -c "GRANT ALL ON SCHEMA public TO annapoorna_app;"
```

---

## 6. Redis on VPS (secure baseline)

Redis is required for BullMQ workers, idempotency, OTP/rate-limit counters, and webhook dedupe. Treat it as a production dependency, not a best-effort cache.

### 6.1 Security posture (mandatory)

1. Run Redis **inside client Docker network only**. The default `docker-compose.yml` exposes Redis on the host for local development convenience (`ports: "${REDIS_PORT:-6379}:6379"`). **On production VPS, remove or comment out the `ports:` mapping** from the Redis service to prevent external access.
2. Set a strong `REDIS_PASSWORD` per client stack (minimum 32 random characters).
3. Use authenticated URL in `.env`:
   - Compose/VPS: `REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379`
4. Keep Redis isolated per client (`${CLIENT_ID}-redis`), never shared.
5. Keep `protected-mode yes` and avoid public firewall exposure.

### 6.2 Compose configuration (canonical)

This repo’s Compose stack uses:
- `redis-server --requirepass ...`
- append-only persistence (`appendonly yes`, `appendfsync everysec`)
- snapshot saves (`--save 900 1 --save 300 10 --save 60 10000`)
- healthcheck using authenticated `redis-cli ping`
- named volume `redis-data` for persistent state across container restarts

### 6.3 Provisioning checklist

| Check | Pass criteria |
| --- | --- |
| `REDIS_PASSWORD` set | Not placeholder, unique per client |
| `REDIS_URL` auth format | Includes password + service hostname `redis` |
| Redis not publicly exposed | `ports:` mapping removed from Compose Redis service on VPS (default template exposes for local dev — remove for production) |
| Persistence enabled | AOF + RDB settings active |
| Healthcheck green | `docker compose ps` shows Redis healthy |
| App health | `/api/v1/health` returns `redis: connected` |

### 6.4 Quick verification commands

```bash
docker compose ps
docker compose logs -f redis
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" ping
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO persistence
```

Expected:
- `PONG`
- `aof_enabled:1`
- no repeated auth/connect errors in backend/workers logs

### 6.5 Backup and restore notes

- Redis is now persisted via `redis-data` volume.
- Include volume snapshot/backup in client DR runbook (alongside Postgres).
- For restore testing, verify:
  - queue workers recover,
  - idempotency and webhook dedupe keys behave correctly,
  - no cross-client key contamination.

---

## 7. Backend clone, env, and dependencies

1. `git clone <repo-url> /var/www/<client-id>/backend`
2. Copy **`.env.example`** → **`.env`** at repo root.
3. Set **client-specific** values (full inventory is in `.env.example`; narrative checklist in `ECOM_MASTER.md` §12.1):

   | Group | Variables (representative) | Why |
   | --- | --- | --- |
   | Identity / routing | `CLIENT_ID`, `BACKEND_PORT`, `STOREFRONT_URL`, `ADMIN_URL` | Compose names, CORS, emails, redirects |
   | Core | `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `REDIS_PASSWORD` | Runtime (Redis URL must include auth in production-like profiles) |
   | Auth | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`, optional `REDIS_KEY_PEPPER` | Tokens and MFA secret encryption. JWT secrets fail fast if missing/empty; `ADMIN_MFA_ENCRYPTION_KEY` must be independent and must not equal `JWT_REFRESH_SECRET` in production-like profiles. |

**`NODE_ENV` profile classification:**

| `NODE_ENV` value | Runtime profile | Provider guard behavior |
|---|---|---|
| `development`, `test` | development-like | `noop` providers allowed |
| `production`, `staging`, `qa`, `uat`, or any other value | production-like | `noop` blocked; placeholder secrets blocked |

   | Group | Variables (representative) | Why |
   | --- | --- | --- |
   | Prod gates | `REPLAY_APPROVAL_TOKEN`, `OPS_METRICS_ALLOWLIST`, `OPS_METRICS_TOKEN` | Replay APIs and `/api/v1/ops/metrics` protection (`src/common/plugins/observability.plugin.ts`) |
   | Webhooks (defense in depth) | `RAZORPAY_WEBHOOK_ALLOWLIST_CIDR`, `SHIPPING_WEBHOOK_ALLOWLIST_CIDR` (falls back to `DELHIVERY_WEBHOOK_ALLOWLIST_CIDR`), skew windows | Optional IP allowlists **plus** mandatory crypto/token verification (`TRD.md` §7.12) |
   | Risk | `RISK_VELOCITY_ENABLED`, `RISK_PAYMENT_INIT_MAX_PER_HOUR` | Redis velocity on payment initiate (`TRD.md` §7.13) |
   | Payments | `PAYMENT_PROVIDER` (`razorpay` or `cod`; `noop` **dev/E2E only — never in production**), `RAZORPAY_*`, optional `RAZORPAY_WEBHOOK_SECRET_OLD` | `cod` = COD-only store (no Razorpay); COD can also be toggled per-store via admin settings without changing `PAYMENT_PROVIDER` |
   | Provider resilience | `PAYMENT_CB_FAILURE_THRESHOLD`, `PAYMENT_CB_COOLDOWN_MS`, `SHIPPING_CB_FAILURE_THRESHOLD`, `SHIPPING_CB_COOLDOWN_MS` | Circuit-breaker tuning. Current implementation is process-local (not cross-replica shared state) — account for this in incident/SRE playbooks. |
   | Shipping | `SHIPPING_PROVIDER` is **not** `noop` — must be `delhivery` or `shiprocket` | Never `noop` in production-like profiles (`NODE_ENV` is not `development`/`test`) |
   | Shipping credentials | Delhivery `DELHIVERY_API_KEY` + `DELHIVERY_BASE_URL` OR Shiprocket `SHIPROCKET_EMAIL` + `SHIPROCKET_PASSWORD` (depending on `SHIPPING_PROVIDER`) | Verified |
   | Shipping dispatch policy | Manual-only: shipment is created only from admin `POST /api/v1/admin/orders/:id/ship` after ship eligibility checks | No payment-confirmation auto-dispatch |
   | Shipping webhook auth | `DELHIVERY_WEBHOOK_TOKEN`, `SHIPROCKET_WEBHOOK_TOKEN`, optional allowlists (`DELHIVERY_WEBHOOK_ALLOWLIST_CIDR`, `SHIPROCKET_WEBHOOK_ALLOWLIST_CIDR`) | Prefer explicit webhook token validation path for provider callbacks |
   | Validation verbosity | `ENABLE_VERBOSE_VALIDATION_ERRORS` | Keep `false` in production to avoid leaking validation internals |
   | Notifications | `NOTIFY_*`, `RESEND_*`, active SMS provider key (`MSG91_AUTH_KEY`/`MSG91_SENDER_ID`/`MSG91_ROUTE` when `SMS_PROVIDER=msg91` or `FAST2SMS_API_KEY` when `SMS_PROVIDER=fast2sms`), `ADMIN_ALERT_EMAIL` | Queue-backed (`TRD.md` §10) |
   | Invoice storage | `INVOICE_STORAGE_ROOT` | Local filesystem root for invoice PDFs |
   | Ops config encryption | `OPS_DB_ENCRYPTION_KEY` | Required for `/api/v1/ops/config/save` encrypted persistence |
   | Store / GST | `STORE_*` seller fields | Invoicing (`TRD.md` §8.8) |
   | Features | `FEATURE_COUPONS_ENABLED`, `FEATURE_REVIEWS_ENABLED`, `FEATURE_WISHLIST_ENABLED`, `FEATURE_GST_INVOICING_ENABLED`, `FEATURE_RESPONSE_ENVELOPE_ENABLED` | Toggle modules (`ECOM_MASTER.md` §12.2) |
   | Observability | `OTEL_TRACING_ENABLED`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | Distributed tracing to hosted collector |

4. **`npm ci`** on the host (or in CI) before image build so `package-lock.json` is respected.

5. Post-deploy observability sanity check (required):
   - Verify `/api/v1/ops/metrics` is reachable with `x-ops-token`.
   - Confirm crash metric family is present: `process_crash_total{reason="unhandled_rejection|uncaught_exception"}`.
   - Confirm queue/outbox SLO metric families are present (`queue_*`, `outbox_*`) before go-live.
   - Confirm atomic operations and race-condition hardening is active: all CAS-hardened services pass unit tests (`ops.service.test.ts`, `auth.service.mfa-refresh.test.ts`, `admin-invites.service.test.ts`, `reconciliation.worker.test.ts`, `idempotency.test.ts`).
6. **Never commit `.env`.** Secrets live only on the server / secret manager (`TRD.md` §11.4).

---

## 8. Docker Compose services (this repo)

From **`docker-compose.yml`**:

| Service | Image / command | Purpose |
| --- | --- | --- |
| `backend` | Build `Dockerfile`; `CMD` → `node bootstrap-backend.js` | HTTP API (`src/main.ts` bootstrap). |
| `workers` | Same image; `command: ["node", "bootstrap-workers.js"]` → `dist/queues/workers/index.js` | BullMQ job processors (`TRD.md` §10). **Must run** for webhooks, notifications, shipping jobs, refunds, scheduled repeatables. |
| `postgres` | `postgres:16-alpine`, healthchecked, persistent (`pg-data` volume) | Database; credentials set via `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` in `.env`. |
| `redis` | `redis:7-alpine`, auth-enabled (when `REDIS_PASSWORD` set), persistent (`appendonly` + volume), `maxmemory 100mb`, `noeviction` | Queues + cache; **isolated per client stack** (`TRD.md` §3.4). |

**Important:** The Compose file uses `env_file: .env` to inject **all** environment variables into `backend` and `workers` containers. You never need to manually mirror new vars into `docker-compose.yml` — any variable added to `.env` is automatically available in the container. `NODE_ENV=production` and `OTEL_SERVICE_NAME` are explicitly overridden in the compose `environment:` block.

**Build (`Dockerfile`):** multi-stage Node 22 Alpine; `npx prisma generate` + `npm run build` in builder; production stage copies `dist/`, `node_modules/`, `prisma/`, `bootstrap-backend.js`, and `bootstrap-workers.js`. Entrypoint matches **`package.json`** `"start": "node bootstrap-backend.js"`.

---

## 9. Start Infrastructure & Migrate Database

If using the local Docker-based PostgreSQL, start the database and cache services first so Prisma can connect:

```bash
docker compose up -d postgres redis
```

Wait a few seconds for PostgreSQL to initialize, then apply migrations on the deployment host:

```bash
npx prisma generate
npx prisma migrate deploy
```

Use **`migrate deploy`** in production (not `migrate dev`). Migration SQL lives under **`prisma/migrations/`** as a single squashed baseline (`0_init`). After deploy, spot-check tables and `_prisma_migrations` history.

> **If you are applying to a database that was already built from the old incremental migrations** (pre-squash), run this once to mark the baseline as applied without re-executing the SQL:
> ```bash
> npx prisma migrate resolve --applied 0_init
> ```

> **Troubleshooting Note:** If Prisma complains about `query_engine_bg.postgresql.wasm-base64.js` missing, the migration still succeeded. Simply run `npx prisma generate`. If `migrate deploy` connects to `ecom_template` instead of your client database, ensure `.env` is properly configured, then wipe the Docker volume (`docker compose down -v`) and try again. See **`MASTER_DEPLOYMENT_PLAYBOOK.md` Appendix H** for details.

---

## 10. Start the backend stack

Now build and start the Node application services:

```bash
docker compose up -d --build
docker compose logs -f backend
docker compose logs -f workers
```

Verify:

1. Containers: `${CLIENT_ID}-postgres`, `${CLIENT_ID}-redis`, `${CLIENT_ID}-backend`, `${CLIENT_ID}-workers`.
2. Health: `curl -sS http://127.0.0.1:<BACKEND_PORT>/api/v1/health` — must report DB + Redis connected (`TRD.md` §4.3).
3. Workers processing: trigger a test flow or inspect **`GET /api/v1/admin/queues`** (Bull Board, admin JWT — `TRD.md` §10.1).

---

### 10.1 Runtime stability validation (memory-leak and worker-liveness gate)

This is a **mandatory pre-go-live gate** for OTP/auth and queue-dependent flows.

#### A) Run API and workers as separate long-lived processes

Your deployment must keep backend API and workers independent so one process crash does not hide the other:

- Docker Compose model (recommended): keep both `backend` and `workers` services healthy and independently restartable.
- Bare process model (if not using Compose): run `npm run start` and `npm run start:workers` under process supervision (`systemd` or PM2).

Compose quick checks:

```bash
docker compose ps
docker compose logs -f --tail=200 backend
docker compose logs -f --tail=200 workers
```

Pass criteria:

- `backend` and `workers` are both `Up` and stable for >=30 minutes.
- No crash-loop pattern or repeated OOM/restart entries in logs.
- Redis connectivity is stable in both services.

#### B) Monitor RSS/heap over time (not point-in-time only)

Capture memory trend, not just snapshots. Monitor both API and workers:

- Container/process RSS (`docker stats`, cgroup memory, or PM2/systemd metrics).
- Node heap metrics from ops metrics endpoint (for API and worker process if exposed via your telemetry pipeline).

Recommended metrics to record every 60s during soak:

- `process_resident_memory_bytes`
- `nodejs_heap_size_used_bytes`
- `nodejs_heap_size_total_bytes`
- `nodejs_eventloop_lag_seconds` (if instrumented)

Ops metrics snapshot (API):

```bash
curl -sS -H "x-ops-token: $OPS_METRICS_TOKEN" "https://<domain>/api/v1/ops/metrics" > /tmp/ops-metrics.prom
grep -E "process_resident_memory_bytes|nodejs_heap_size_used_bytes|nodejs_heap_size_total_bytes" /tmp/ops-metrics.prom
```

Interpretation guidance:

- Healthy profile: heap usage shows GC sawtooth behavior; RSS may rise initially then stabilize.
- Risk profile: sustained monotonic RSS growth without stabilization after warm-up window.

#### C) Run sustained OTP/login soak (customer auth path)

Run a 30–60 minute sustained test for:

- `POST /api/v1/auth/send-otp`
- `POST /api/v1/auth/verify-otp`

Include realistic concurrency and retry patterns. Ensure SMS provider credentials are valid (MSG91: `MSG91_AUTH_KEY` + `MSG91_SENDER_ID`; Fast2SMS: `FAST2SMS_API_KEY`) and workers are active.

Soak checklist:

1. Warm-up 5 minutes at low concurrency.
2. Ramp to target concurrency (for example 10 -> 25 -> 50 virtual users).
3. Sustain for >=30 minutes.
4. Record latency p95/p99, non-2xx rate, and memory trend for backend + workers.
5. Continue for 10 minutes after load ends to check memory recovery.

Pass criteria (recommended baseline):

- Error rate for auth endpoints remains within your SLO budget (no prolonged 5xx spikes).
- Notification queue backlog does not grow unbounded.
- Worker process remains healthy (no crash/restart loop).
- RSS/heap stabilizes after warm-up; no unbounded post-load climb.

#### D) Verify notification worker is always up (OTP dependency)

OTP delivery depends on notification jobs (`send-sms`) being consumed by workers.

Required checks:

- `workers` service stays up while OTP traffic is active.
- `send-sms` jobs are consumed continuously (no stuck queue growth).
- Dead-letter queue does not show sustained growth for notification jobs.

Operational response if worker is down:

1. Treat as auth-impacting incident (OTP login degraded).
2. Restart workers immediately and verify Redis + provider connectivity.
3. Check backlog drain and confirm fresh OTP delivery recovery.
4. Capture incident evidence in deployment log.

Evidence to archive before go-live:

- Time-series snapshots for RSS/heap (backend + workers)
- OTP/login soak command + summary output
- Queue depth / DLQ screenshots or metric extracts
- Backend + worker log excerpts showing stable operation window

---

## 11. Nginx and TLS

1. Start from repo **`nginx/client.conf.template`** — it encodes **`TRD.md` §3.5** edge limits:
   - HTTP → HTTPS **301**
   - **TLSv1.2** and **TLSv1.3** only, `ssl_prefer_server_ciphers on`
   - **Security headers** (added in deep audit May 2026): `Strict-Transport-Security` (HSTS, 2-year max-age + includeSubDomains + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
   - **TLS hardening**: `ssl_ciphers` ECDHE-only AEAD suite, `ssl_session_cache shared:SSL:10m`, `ssl_session_timeout 1d`, `ssl_session_tickets off`, `ssl_stapling on`, `ssl_stapling_verify on`
   - **Rate-limit zones**: copy **`nginx/rate-zones.conf.template`** to `/etc/nginx/snippets/rate-zones.conf` and add `include /etc/nginx/snippets/rate-zones.conf;` inside the `http {}` block of your top-level `nginx.conf`. The template defines `limit_req_zone` for all route classes (auth, checkout, admin, catalog, cart, webhook, health, default). Per-route `limit_req` directives stay in dedicated `location` blocks inside `client.conf.template` — never inside `if` blocks.
   - **`client_max_body_size 20M`**
   - **`proxy_set_header`** `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` — required because Fastify uses **`trustProxy: true`** (`src/main.ts`) for correct client IP behind Nginx.
2. Replace **`server_name`**, certificate paths, **`proxy_pass`** backend port (`127.0.0.1:<BACKEND_PORT>`), and storefront upstream (e.g. `3101`).
3. **Webhook paths** must proxy to the **same** backend without stripping body: `location /api/` → backend. Webhook URLs for provider dashboards:
   - `https://<customer-domain>/api/v1/payments/webhook`
   - `https://<customer-domain>/api/v1/shipping/webhook`
4. **Admin route model (canonical):** admin is served on the same frontend host as a route (for example `/admin`) through the same frontend upstream; do not configure a separate static admin subdomain unless you intentionally maintain a non-canonical legacy setup.
5. `nginx -t` && `systemctl reload nginx`.
6. Certbot: obtain certs for customer + `www` domains used by the single frontend host; confirm auto-renew (`certbot renew --dry-run`).

If **`RAZORPAY_WEBHOOK_ALLOWLIST_CIDR`** / **`SHIPPING_WEBHOOK_ALLOWLIST_CIDR`** (or fallback `DELHIVERY_WEBHOOK_ALLOWLIST_CIDR`) are set, ensure **real client IP** reaches the app (Nginx forwards `X-Forwarded-For`; app trusts proxy — validate with a test webhook and your actual egress IPs).

---

## 12. Webhook behaviour (implementation tie-in)

**`src/main.ts`** registers a single `application/json` parser with `parseAs: 'buffer'`. For **`/api/v1/payments/webhook`** and **`/api/v1/shipping/webhook`** only, the raw `Buffer` is preserved directly for HMAC/token verification (no UTF-8 roundtrip — eliminates potential byte-sequence alteration); **all other JSON routes** are parsed to objects (`TRD.md` §7.10). Handlers must **enqueue BullMQ** and return **200 quickly** (< 200ms target); heavy work runs in **`workers`** (`TRD.md` §10.3).

---

## 13. CORS and public URLs

Backend CORS must allow the frontend origin configured for that client. If storefront/admin are same-origin routes (for example `/` and `/admin` on one domain), keep **`STOREFRONT_URL`** and **`ADMIN_URL`** aligned to that same HTTPS origin in `.env` (`TRD.md` §11.2).

Customer phone OTP auth contract:

- Phone OTP login: `POST /api/v1/auth/send-otp` + `POST /api/v1/auth/verify-otp`
- Phone OTP signup (phone required, profile optional): `POST /api/v1/auth/signup-phone` with `phone`, `otp`, and optional `firstName`, `lastName`, `email`

Invoice serving policy (required):
- Customer invoice download: `GET /api/v1/orders/:id/invoice.pdf` (authenticated customer only)
- Admin invoice download: `GET /api/v1/admin/orders/:id/invoice.pdf` (authenticated admin with `orders:read`)
- No public/signed invoice URLs should be exposed in API payloads (`invoice.hasPdf` metadata only).

**Admin permission enforcement:** keep **`ADMIN_SCOPE_ENFORCEMENT`** enabled in production so operation-level admin scopes stay enforced (`TRD.md` §6.3; `src/common/guards/admin-permissions.guard.ts`). Canonical role model is two-role only: `merchant` (business `/api/v1/admin/*`) and `developer` (platform `/api/v1/ops/*`). Set enforcement to `false` only for controlled non-prod or incident response — never as a default on a live store.

### 13.1 Frontend deployment contract (for AI-generated frontends)

Before switching traffic, verify frontend implementation follows backend integration invariants:

> Execute and attach: `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` (frontend) + `docs/BACKEND_GO_LIVE_CHECKLIST.md` (backend release gates + full env-to-implementation parity across core/auth/data/providers/webhooks/risk/features/notifications/ops/observability).

Provider lifecycle controls for this stage:
- `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md`
- `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md`

| Check | Pass criteria |
| --- | --- |
| API env naming | Frontend uses `NEXT_PUBLIC_API_BASE_URL` (includes `/api/v1`) and `NEXT_PUBLIC_STOREFRONT_URL` |
| Frontend rules sync | Frontend repo copies latest `frontend-agent-rules.md` to `.agents/rules/dev-rules.md` and verifies via `diff` before release |
| Response parser | Handles both success modes (enveloped/raw) via `FEATURE_RESPONSE_ENVELOPE_ENABLED` |
| Mutation idempotency | Critical order/payment/admin writes send `idempotency-key` |
| Checkout split | PREPAID uses `/payments/initiate` + `/payments/verify`; COD skips Razorpay init path |
| Webhook boundary | No browser calls to `/payments/webhook` or `/shipping/webhook` |
| Auth refresh | On first `401`, frontend performs single refresh + retry policy |
| Production provider posture | Frontend/release docs explicitly forbid `PAYMENT_PROVIDER=noop` and `SHIPPING_PROVIDER=noop` in production |

---

## 14. Postman monitor compatibility note

Postman monitors run from Postman cloud, not from this VPS shell context. If the Postman environment uses `127.0.0.1` or `localhost` as `baseUrl`, monitor runs will fail with DNS/network errors by design. Use a reachable host URL for monitor runs, and classify localhost monitor failures as **config/env blocker** in compliance reports.

---

## 15. Observability and ops metrics

- Prometheus-format metrics: **`GET /api/v1/ops/metrics`** — production access requires a valid **`OPS_METRICS_TOKEN`**; allowlist is defense-in-depth (`src/common/plugins/observability.plugin.ts`).
- SLO / alert rule files under **`observability/`** (e.g. `observability/slo-rules.yml`, `observability/alert-routing.yml`) — wire your scraper and alertmanager to match your hosting.
- Webhook SLO expectation: handlers should return **200** quickly (<200ms target) while async work runs in queues; executable alerting currently monitors `slo:webhook_latency:p95_5m` with threshold `0.5s` (`observability/slo-rules.yml`).

### 15.1 Layer C operator-only controls runbook

| Control | Owner | Change path | Rollback |
|---|---|---|---|
| Load shed mode (`normal/reduced/emergency`) | Platform ops | `POST /api/v1/ops/load-shed` with platform scope | Revert mode to `normal` |
| Metrics exposure auth (`OPS_METRICS_*`) | Platform ops | Rotate env + restart | Restore prior env values |
| Redis/Postgres credentials | Platform ops | Secret manager + rolling restart | Restore previous secret version |

Merchant admin UI may display diagnostics, but must not expose mutation controls for these Layer C settings.

### 15.2 First-time ops identity invite bootstrap (mandatory)

Run from backend path on the VPS only, after env and migrations are ready:

```bash
cd /var/www/<client-id>/backend
npm run ops:newuser -- --email=<ops@email> --name="Primary Ops" --ip-allowlist="<cidr>" --setup-base-url="https://<client-domain>" --yes
```

`--setup-base-url` must be base origin only (for example, `https://<client-domain>`), not `https://<client-domain>/ops/setup`. Backend appends `/ops/setup?token=...`.

Pre-checks:
- `OPS_API_KEY_SALT`, `ADMIN_MFA_ENCRYPTION_KEY`, `OPS_DB_ENCRYPTION_KEY`, `OPS_MFA_ENFORCE=true`, and `OPS_DUAL_APPROVAL_WINDOW_MINUTES` are configured.
- Command is executed from a trusted operator shell (not CI logs, not shared terminal sessions).
- Invite email must not already exist in `User` (customer/admin) domain; cross-domain email reuse fails closed with `409 CONFLICT`.

Post-checks:
- Invite email is received and setup is completed from `https://<client-domain>/ops/setup?...` within 10 minutes.
- Runtime credentials are stored in vault after setup completion.
- Connectivity validation from allowlisted network succeeds on `GET /api/v1/ops/session`.
- Expired unconsumed invites are cleaned and logged in ops audit timeline.

Compromise/loss runbook:
- Deactivate compromised `OpsUser` record immediately.
- Issue replacement invite via `ops:newuser`.
- Rotate any downstream secret references that used old key material.
- Re-verify `/api/v1/ops/*` access only from intended CIDRs.

### 15.3 First-time merchant admin invite bootstrap (mandatory)

Run this after ops bootstrap is verified and before client admin panel go-live:

```bash
cd /var/www/<client-id>/backend
npm run admin:newuser -- --email=<admin@email> --name="Merchant Admin" --setup-base-url="https://<client-domain>" --yes
```

`--setup-base-url` must be base origin only (for example, `https://<client-domain>`), not `https://<client-domain>/admin/setup`. Backend appends `/admin/setup?token=...`.

Optional flags:

- `--permissions=products:read,orders:read,...`
- `--created-by-email=<ops-user-email>`

Pre-check:

- Invite email must not already exist in `OpsUser` domain; cross-domain email reuse fails closed with `409 CONFLICT`.

Post-checks:

- Invite email is received and setup is completed from `https://<client-domain>/admin/setup?...` within 10 minutes.
- Merchant admin can login via `POST /api/v1/auth/admin/login`.
- Admin JWT permissions include merchant-only scopes (no ops/developer scopes).
- Invite lifecycle is auditable (`CREATED -> EMAIL_SENT -> CONSUMED`) and expired invite cleanup path remains available.

Production policy:

- Do not use `scripts/seed-admin.mjs` for VPS production onboarding.
- Use invite-based provisioning (`admin:newuser` or ops-authenticated admin invite API) only.

---

## 16. Edge security and numeric gate checklist (pass/fail)

| Gate | Pass criteria |
| --- | --- |
| TLS protocol floor | Nginx serves only `TLSv1.2` and `TLSv1.3` |
| Security headers | HTTPS block includes: `Strict-Transport-Security` (HSTS 2yr + preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-XSS-Protection: 1; mode=block`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` |
| TLS hardening | `ssl_ciphers` ECDHE-only AEAD, `ssl_session_cache shared:SSL:10m`, `ssl_session_timeout 1d`, `ssl_session_tickets off`, `ssl_stapling on/verify on` |
| Rate-limit context | `limit_req_zone` in `http {}` (top-level `nginx.conf`), per-route `limit_req` in `location` blocks (not `if`) |
| Request body limit | `client_max_body_size 20M` in active server block |
| Auth route limit | `limit_req_zone api_auth rate=20r/m` with `burst=8` |
| Checkout route limit | `limit_req_zone api_checkout rate=35r/m` with `burst=12` |
| Admin route limit | `limit_req_zone api_admin rate=60r/m` with `burst=15` |
| Catalog route limit | `limit_req_zone api_catalog rate=240r/m` with `burst=40` |
| Cart route limit | `limit_req_zone api_cart rate=90r/m` with `burst=20` |
| Webhook route limit | `limit_req_zone api_webhook rate=300r/m` with `burst=30` |
| Fastify plugin order parity | `helmet -> cors -> jwt -> rate-limit -> multipart -> swagger(dev) -> prisma -> redis -> bullmq -> error-handler -> observability -> load-shed -> modules -> response-envelope` |
| Fastify app-layer limiter | `@fastify/rate-limit` is active with tiered route profiles, not edge-only limiting |
| Container auto-restart | `docker compose` services use `restart: unless-stopped` (supports BRD recovery expectation for container crashes) |

---

## 17. Quality gates before calling it “deployed”

Run from the backend repo (same commands as CI subsets):

> Recommended: execute and archive `docs/BACKEND_GO_LIVE_CHECKLIST.md` as the release evidence wrapper for this section, including complete environment-to-implementation parity validation.

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript strict |
| `npm run test:unit:coverage` | Unit coverage confidence for touched domains |
| `npm run coverage:ratchet` | Coverage floor gate |
| `npm run test:security` | Security-focussed tests |
| `npm run route:discipline-check` | Route structure guardrail |
| `npm run serializer:exposure-check` | Serializer leak guardrail |
| `npm run test:guardrails` | Tests for the scripts above |
| `npm run contract:admin` | Admin contract smoke checks |

Full release parity (when infra available): `npm run ci:reliability-gates` (`package.json`).

CI also runs **Security Scans** (`.github/workflows/security.yml`): CodeQL, npm audit (`--omit=dev`, critical/high blocks), OSV Scanner (respects `osv-scanner.toml` at repo root for dev-group ignores), and Trivy container scan. See `MASTER_DEPLOYMENT_PLAYBOOK.md` Appendix G.0 for details.

Important parity note: CI includes additional build/reliability workflows beyond this local subset; passing local checks does not guarantee full CI parity.

Safety note: run `contract:admin` only against a controlled non-production target because it executes authenticated admin mutations.

---

## 18. Backup, DR, and operations

- **Postgres:** daily `pg_dump` (or managed backup) **off** the VPS; periodic restore test (`ECOM_MASTER.md` / `TRD.md` DR themes; repo scripts `npm run dr:*`).
- **Artifacts:** record image tag, git SHA, **non-secret** env checksum in a deploy manifest.
- **Queues:** if jobs backlog, check **`workers`** container, Redis memory, and provider outages (`TRD.md` §10).

---

## 19. Failure patterns (quick diagnosis)

| Symptom | Likely cause |
| --- | --- |
| Webhook **401** spikes | Wrong `RAZORPAY_WEBHOOK_SECRET` / shipping provider token; clock skew; allowlist mismatch |
| Payments stuck **PENDING_PAYMENT** | Workers down; Redis down; queue failure — check workers logs and Bull Board |
| **502** from Nginx | Backend container not listening on `BACKEND_PORT` |
| Duplicate charges / emails | Idempotency — verify Redis and worker idempotency keys (`BRD.md` AC-05) |
| Wrong client data | Isolation breach — wrong `DATABASE_URL` or shared Redis between clients |

### 19.1 API error-code triage for frontend + VPS ops

Use this when frontend reports API failures after deployment.

| HTTP | `error.code` | First-response action (frontend) | VPS/operator checks |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Show field errors; block submit | Confirm frontend request schema matches `TRD.md` and route schema. |
| 401 | `TOKEN_EXPIRED` | Refresh once then retry once | Verify cookie domain/secure flags and `/api/v1/auth/refresh` behavior. |
| 401 | `UNAUTHORISED` / `INVALID_CREDENTIALS` | Re-authenticate user | Check auth headers/cookies forwarding through Nginx and backend env secrets. |
| 403 | `FORBIDDEN` | Hide/disable action | Verify JWT role/permission grants (`AdminPermissionGrant` or ops permissions). |
| 404 | `NOT_FOUND` | Show not-found state | Validate tenant data/IDs and route path correctness in frontend client. |
| 409 | `CONFLICT` | Refresh state and retry safe actions | Check CAS/idempotency conflicts; for identity flows, verify cross-domain email boundary (`User` vs `OpsUser`). |
| 422 | `PINCODE_NOT_SERVICEABLE` | Block checkout for that address | Verify shipping serviceability config/provider availability. |
| 429 | `RATE_LIMIT_EXCEEDED` | Backoff + cooldown UX | Inspect rate-limit policy and burst traffic from client/IP. |
| 500/502/503 | `INTERNAL_ERROR` (or upstream failure) | Show generic retry-safe error + support path | Inspect backend and worker logs, provider health, Redis/Postgres connectivity, and recent deploy/env changes. |

Operational notes:

- Frontend must branch on `error.code`, not free-form error message text.
- Webhook routes are provider-only ingress; never call `/api/v1/payments/webhook`, `/api/v1/shipping/webhook`, or `/api/v1/notifications/webhook/*` from browser clients.
- During incident triage, correlate frontend failure timestamps with backend logs and queue health before retrying destructive mutations.
- For webhook anomaly triage, inspect Prometheus metrics `webhook_events_total` and `webhook_processing_duration_seconds` by labels `provider`, `event`, and `result`:
  - invalid signature/token spikes -> `result="rejected"`
  - replay/dedupe activity -> `result="duplicate"`
  - enqueue pressure/failures -> `result="enqueue_failed"`

---

## 20. Migration note for existing `/srv/...` installs

If you currently deploy under `/srv/...`, standardize to `/var/www/...` on the next controlled maintenance window to align all runbooks and onboarding instructions with `ECOM_MASTER.md`. Keep symlinks temporarily if needed, but update systemd/nginx/deploy scripts to the `/var/www/...` canonical paths.

---

## 21. Doc map (read in this order for deployment)

1. `ECOM_MASTER.md` — §5 VPS layout, §12 per-client checklist, §11 security pipeline diagram  
2. `TRD.md` — §3 infrastructure, §4.2 plugin order, §7 API and webhooks, §10 queues  
3. `BRD.md` — §12 Phase 6 acceptance (maps to `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md`)  
4. Repo: `docker-compose.yml`, `Dockerfile`, `nginx/client.conf.template`, `.env.example`, `src/main.ts`, `queues/workers/`
5. `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` + `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md` — provider setup, dry-run, rotation, compromise drill, and evidence register

Next.js integration for storefront/admin is **`docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md`**.

**Frontend delivery model requirement:** Before go-live, frontend/admin/ops delivery must follow **simultaneous build + integration via contract-first vertical slices**. UI-only page completion is not accepted as release evidence. Each slice must have: real backend route integration, permission-aware UX, `idempotency-key` on critical writes, and passing integration + UI tests. See `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` §1.2 and `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` §8.1 for the mandatory gate checklist.

Canonical matrix note: route/control and permission ownership matrices remain canonical in `TRD.md`; this VPS guide intentionally references that source instead of duplicating full matrices.

---

> **Starting a new client deployment?** Use **[`docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md`](CLIENT_ONBOARDING_EXECUTION_ORDER.md)** as the top-level sequenced runbook. It covers all 13 phases (intake → credentials → VPS baseline → backend config → dry-runs → frontend build → VPS deploy → ops bootstrap → admin provisioning → frontend deploy → webhook registration → go-live validation → DNS cutover → post-handoff) with evidence gates and links back to this guide and every other canonical doc. Do not use this VPS guide alone to sequence a first-time deployment.
