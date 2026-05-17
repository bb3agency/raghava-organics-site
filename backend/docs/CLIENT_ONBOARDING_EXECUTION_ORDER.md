# Client Onboarding Execution Order

> **This is the master sequencing runbook.** It defines the exact ordered steps to take a new client from "nothing" to a live, production-validated e-commerce deployment on the shared VPS. Every step references the authoritative document that governs it. Read those references — do not guess.
>
> **Canonical source of truth:** `ECOM_MASTER.md`  
> **Business acceptance gates:** `BRD.md` §12 (AC-01–AC-15)  
> **Full deployment detail:** `docs/MASTER_DEPLOYMENT_PLAYBOOK.md`  
> **Conflict resolution:** `ECOM_MASTER.md` wins over all other documents.
>
> **Lifecycle:** This is a **Client-Main runbook**. For post-development usage precedence and related client-facing references, start from `docs/CLIENT_HANDOFF_INDEX.md`.

---

## Core delivery model

> **Dev-first. VPS only after everything passes locally.**

The non-negotiable sequence is:

1. **All local development and testing is done first** — backend configured, frontend fully built and integrated, all providers dry-run tested, full local E2E passes with no gaps or leaks.
2. **Only then** is the VPS touched for the first time for this client.
3. VPS deployment is a mechanical promotion of already-validated work, not a debugging environment.

This means: **do not provision VPS directories, do not run `docker compose up` on the VPS, do not configure Nginx, do not obtain TLS certs — until Phase 6.** Everything before Phase 6 happens entirely on your dev laptop against a local Docker environment.

---

## How to use this runbook

Work through each phase top-to-bottom. Each phase contains:

- **What you are doing** — purpose of the phase.
- **Prerequisites** — what must be true before you start.
- **Execution steps** — exact actions to take.
- **Evidence gate** — what proof confirms the phase is complete before you proceed.

Do **not** skip phases. Do **not** proceed past a phase without clearing its evidence gate. Skipping a phase and trying to fix problems in a later phase costs significantly more time than doing it in order.

### Development and deployment trackers (recommended)

Use these three tracker files when you need explicit phase-by-phase progress and handoff visibility.

| Log file | Template | Create at | Close at |
|---|---|---|---|
| `client-<id>/CLIENT_DEV_LOG.md` | `docs/CLIENT_DEV_LOG_TEMPLATE.md` | Phase 0 start | Phase 5 cleared |
| `client-<id>/frontend/docs/FRONTEND_DEV_LOG.md` | `docs/FRONTEND_DEV_LOG_TEMPLATE.md` | Phase 4 start | Phase 5 cleared |
| `client-<id>/CLIENT_VPS_DEPLOYMENT_LOG.md` | `docs/CLIENT_VPS_DEPLOYMENT_LOG_TEMPLATE.md` | Phase 6 start (only after Phase 5 cleared) | Phase 14 cleared |

- `CLIENT_DEV_LOG.md` tracks backend config, provider dry-runs, and frontend milestone progress for Phases 0–5.
- `FRONTEND_DEV_LOG.md` tracks slice-level progress for Phase 4.
- `CLIENT_VPS_DEPLOYMENT_LOG.md` tracks VPS execution progress for Phases 6–14.

---

## Phase 0 — Client intake and scoping

**What you are doing:** Define the client's exact requirements so every downstream decision is made correctly from the start.

**Prerequisites:** Nothing — this is the first step.

**Execution steps:**

1. Confirm the client's **domain name(s)**: storefront domain (e.g. `client1.com`) and whether admin is a sub-path or subdomain.
2. Confirm **payment provider**: Razorpay (default) or COD-only. If Razorpay, confirm whether live keys are ready or test keys only (staging vs production).
3. Confirm **shipping provider**: Delhivery or Shiprocket (or noop for staging only — must be replaced for production).
4. Confirm **notification channels**: email (`RESEND_API_KEY`), SMS provider (`SMS_PROVIDER`: `msg91` or `fast2sms`), WhatsApp (`META_WHATSAPP_ACCESS_TOKEN`). If MSG91, confirm DLT registration status.
5. Confirm **VPS slot availability**: which backend port (`3000+N`) and storefront port (`3100+N`) will be assigned. See `docs/CLIENT_VPS_SETUP_GUIDE.md` §3 (Port assignment).
6. Confirm **`CLIENT_ID`** slug (e.g. `foodstore`, `fashionhub`) — must be unique across all clients on this VPS.
7. Confirm **feature flags**: which optional modules the client needs active at launch. Record each flag and its value:
   - `FEATURE_COUPONS_ENABLED` — enable only when the client plans to run promo/discount campaigns. When enabled, the full coupon admin (create/edit/pause/soft-delete/restore/audit) is available and counts against per-admin rate limits.
   - `FEATURE_REVIEWS_ENABLED` — enable when the storefront review module is active.
   - `FEATURE_WISHLIST_ENABLED` — enable for higher-intent repeat-browse categories.
   - `FEATURE_GST_INVOICING_ENABLED` — always `true` for Indian clients.
8. Record all of the above in a scoping note before touching any code or config.

7. **Create `CLIENT_DEV_LOG.md`** for this client:
   ```
   cp docs/CLIENT_DEV_LOG_TEMPLATE.md client-<client-id>/CLIENT_DEV_LOG.md
   ```
   Fill in the Project Identity section immediately with the values confirmed above.

**Evidence gate:** Scoping note exists with domain, providers, ports, and `CLIENT_ID` confirmed. `CLIENT_DEV_LOG.md` created and Project Identity section filled.

---

## Phase 1 — Third-party account setup

**What you are doing:** Create and configure all external provider accounts so credentials are ready before any backend config or frontend build begins. Credentials obtained late are the single most common cause of blocked vertical slices.

**Prerequisites:** Phase 0 complete.

**Full runbook:** `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md`  
**Credential register template:** `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md`

**Execution steps:**

1. **Razorpay** (if payment provider is `razorpay`):
   - Create a Razorpay business account or use the client's existing account.
   - Obtain `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (test keys for staging, live keys for production).
   - Create a webhook endpoint (URL: `https://<domain>/api/v1/payments/webhook`) and note `RAZORPAY_WEBHOOK_SECRET`.
   - Note the Razorpay egress IPs for `RAZORPAY_WEBHOOK_ALLOWLIST_CIDR`.
   - Reference: `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §2 (Razorpay).

2. **Shipping provider** (Delhivery or Shiprocket):
   - **Delhivery:** Obtain `DELHIVERY_API_KEY` from the Delhivery partner portal. Note `DELHIVERY_BASE_URL` (sandbox vs production). Create a webhook endpoint (`https://<domain>/api/v1/shipping/webhook`).
   - **Shiprocket:** Obtain `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD`. Create a webhook endpoint. Note egress IPs for `SHIPROCKET_WEBHOOK_ALLOWLIST_CIDR`.
   - Reference: `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §3 (Shipping).

3. **SMS provider** (MSG91 or Fast2SMS):
   - **If MSG91:** Obtain `MSG91_AUTH_KEY` from MSG91 dashboard. Register DLT-approved SMS templates; note template IDs.
   - **If Fast2SMS:** Obtain `FAST2SMS_API_KEY` from Fast2SMS dashboard.
   - Reference: `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §4 (MSG91) or §2.5 (Fast2SMS).

4. **Resend** (transactional email):
   - Create a Resend account, add and verify the sending domain (`RESEND_FROM_EMAIL` domain).
   - Obtain `RESEND_API_KEY`.
   - Reference: `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §5 (Resend).

5. **File all credentials** in the per-client credential register (`docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md`):
   - Owner, vault path, creation date, rotation date, expiry date, last tested date.
   - Store secrets in a password manager or secrets vault — **never** in git.

6. **Ops config contract policy confirmation** (mandatory before frontend ops slice):
   - Confirm `OPS_DB_ENCRYPTION_KEY` is planned in runtime env.
   - Confirm developer ops UI/API scope is contract-driven by `src/modules/ops/ops-config-contract.ts`.
   - Confirm contract-listed infra/security keys are intentionally editable only through ops auth + OTP + encrypted persistence flow.

**Evidence gate:**
- All required provider accounts exist with test/live credentials in hand.
- Credential register is filled in for all active providers.
- No credential is only stored in chat, email, or a note file — all are in the vault.

### Invoice delivery contract (cross-phase requirement)

Before Phase 5 sign-off and again during Phase 12 go-live validation, verify:
- Customer invoice route: `GET /api/v1/orders/:id/invoice.pdf` (owner-only auth).
- Admin invoice route: `GET /api/v1/admin/orders/:id/invoice.pdf` (`orders:read`).
- Order payload behavior uses `invoice.hasPdf` only (no direct/public/signed invoice URLs).

---

## Phase 2 — Backend clone, configure, and local validation

**What you are doing:** Clone the backend template for this client, fill in all environment variables, and verify it builds and passes local checks. Everything here runs on your dev laptop — no VPS involvement yet.

**Prerequisites:** Phase 1 complete (credentials ready). Phase 0 complete (CLIENT_ID, ports, domain confirmed).

**Full runbook:** `docs/MASTER_DEPLOYMENT_PLAYBOOK.md` Phase 2 (Clone & configure backend).  
**Environment reference:** `.env.example` (90+ variables — every variable has a comment).

**Execution steps:**

1. **Clone the template** into the client project folder on your dev laptop:
   ```bash
   git clone https://github.com/your-org/ecom-backend-template client-<client-id>/backend
   cd client-<client-id>/backend
   ```

2. **Copy `.env.example` to `.env`** and fill every required variable:
   ```bash
   cp .env.example .env
   ```
   Key variables to fill (non-exhaustive — read all comments in `.env.example`):
   - `CLIENT_ID=<client-id>`
   - `BACKEND_PORT=<assigned port>`
   - `NODE_ENV=production` (for production; `staging` for staging)
   - `DATABASE_URL=postgresql://<user>:<pass>@host.docker.internal:5432/<client-db>`
   - `REDIS_URL=redis://:<redis-password>@redis:6379`
   - `REDIS_PASSWORD=<generated secret>`
   - `JWT_SECRET=<generated secret>` — must be unique per client
   - `JWT_REFRESH_SECRET=<generated secret>` — must be unique per client, different from `JWT_SECRET`
   - `ADMIN_MFA_ENCRYPTION_KEY=<generated secret>` — distinct from `JWT_REFRESH_SECRET`
   - `STOREFRONT_URL=https://<domain>`
   - `ADMIN_URL=https://<domain>/admin` (or subdomain)
   - `PAYMENT_PROVIDER=razorpay` (never `noop` in production)
   - `SHIPPING_PROVIDER=delhivery` or `shiprocket` (never `noop` in production)
   - All Razorpay, shipping provider, SMS provider (MSG91 or Fast2SMS), Resend credentials from Phase 1.
   - `OPS_API_KEY_SALT=<generated secret>`
   - `OPS_MFA_ENFORCE=true`
   - `TRUSTED_PROXY_ALLOWLIST_CIDR=127.0.0.1/32` (or your Nginx/load-balancer IP)

3. **CRITICAL: Set PostgreSQL password BEFORE first container start:**
   > The Postgres Docker volume persists the password hash from first initialization. If you change `POSTGRES_PASSWORD` later without updating the DB user, you'll get P1000 authentication errors.
   
   ```env
   # .env — set ONCE before docker compose up
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=YourStrongPassword
   POSTGRES_DB=ecom_template
   DATABASE_URL=postgresql://postgres:YourStrongPassword@localhost:5432/ecom_template
   ```
   > URL-encode special characters: `@` → `%40`, `#` → `%23`
   
   **Verification after `docker compose up -d postgres`:**
   ```bash
   # Check container env matches
   docker exec ecom-postgres printenv POSTGRES_USER
   docker exec ecom-postgres printenv POSTGRES_DB
   
   # Test Prisma connection
   npx prisma migrate status --schema prisma/schema.prisma
   ```
   
   **If P1000 error appears:** Password mismatch between `.env` and container volume. Fix without wiping:
   ```bash
   docker exec ecom-postgres psql -U postgres -d ecom_template -c "ALTER USER postgres WITH PASSWORD 'YourNewPassword';"
   ```
   
   See `docs/MASTER_DEPLOYMENT_PLAYBOOK.md` Appendix H.4 for full troubleshooting.

4. **Generate all random secrets** using a cryptographically secure method:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
   Run once per secret. Never reuse across clients.

5. **Install dependencies and build:**
   ```bash
   npm ci
   npm run build
   ```

6. **Run local validation scripts:**
   ```bash
   npm run validate:env
   npm run validate:schema
   npm run lint
   npm run type-check
   ```

7. **Run the Postman E2E simulation** to verify the full order lifecycle locally:
   ```bash
   # Terminal 1 — server
   npm run dev:e2e
   # Terminal 2 — workers
   npm run dev:e2e:workers
   ```
   Then run the Postman collection (`docs/postman/E2E-Flow-Simulation.postman_collection.json`) with folders 0→1→2→3.  
   Reference: `README.md` §E2E Simulation.

   > This is **not optional**. The E2E simulation is the baseline proof that the backend wiring is correct before you build any frontend against it.

**Evidence gate:**
- `npm run build` passes with no errors.
- All local validation scripts pass.
- No placeholder secrets remain in `.env`.
- Postman E2E simulation completes folders 0→1→2→3 with all steps passing.

---

## Phase 3 — Third-party staging dry-runs

**What you are doing:** Validate every provider credential against its sandbox/test environment before deploying to production. This is mandatory — a misconfigured provider will silently fail in production and is very hard to debug under live traffic pressure. All dry-runs happen **locally on your dev laptop**, not on the VPS.

**Prerequisites:** Phase 2 complete (backend running locally). Phase 1 complete (credentials in `.env`).

**Full runbook:** `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §0.1 (Integration timing) and per-provider sections.

**Execution steps:**

Perform each dry-run as part of the vertical slice that builds the relevant frontend feature (Phase 4). Do not batch all dry-runs at the end — each one is part of that slice's integration evidence.

1. **Razorpay test payment cycle:**
   - Start local backend with `PAYMENT_PROVIDER=razorpay` and Razorpay **test** keys.
   - Place a test order from the local storefront, initiate payment, complete with Razorpay test card.
   - Verify `PAYMENT_CAPTURED` event hits `/api/v1/payments/webhook` locally.
   - Confirm order transitions to `CONFIRMED`.
   - Record evidence in credential register.

2. **Shipping provider dry-run:**
   - Start local backend with the target shipping provider.
   - Trigger `POST /api/v1/admin/orders/:id/ship` for a confirmed test order.
   - Confirm AWB is created and tracking state is correct.
   - Send a test shipping webhook to the local backend and verify order state transitions.
   - Record evidence in credential register.

3. **Email (Resend) dry-run:**
   - Trigger an order confirmation for a test order locally.
   - Confirm confirmation email arrives at a test inbox.
   - Record evidence in credential register.

4. **SMS dry-run:**
   - Trigger a notification locally with the active SMS provider (`SMS_PROVIDER`).
   - Confirm delivery to a test phone number.
   - Record evidence in credential register.

**Evidence gate:**
 - Every enabled provider has one successful local dry-run with evidence recorded.

---

## Phase 4 — Frontend build (contract-first vertical slices)

**What you are doing:** Build the complete frontend against the local backend using contract-first slices.

**Prerequisites:** Phase 2 and Phase 3 complete.

**Canonical implementation details:**
- `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md`
- `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`
- `CO_DEVELOPMENT_SYNC_GUIDE.md` (for template-worthy backend upstreams)

**Execution steps (condensed):**
1. Create frontend repo and sync rules (`frontend-agent-rules.md` -> `.agents/rules/dev-rules.md`).
2. Configure `.env.local` with local backend base URL (`NEXT_PUBLIC_API_BASE_URL` including `/api/v1`).
3. Build slices in strict order: Foundation -> Ops -> Admin read -> Admin mutation -> Reliability -> Storefront.
4. For each slice: lock contract -> typed client -> UI states -> real backend integration -> provider dry-run -> checklist ticks.
5. Upstream reusable backend fixes via `CO_DEVELOPMENT_SYNC_GUIDE.md`; keep client-specific backend changes local.

**Evidence gate:**
- All contracted frontend pages and admin views are built and integrated against the **local** backend (not mocked, not deferred).
- `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` is fully ticked.
- All API calls use `NEXT_PUBLIC_API_BASE_URL` — no hardcoded URLs.
- No `noop` provider behavior relied upon for any production-bound feature.

---

## Phase 5 — Full local integration testing (mandatory gate before any VPS work)

**What you are doing:** Run a complete end-to-end test of the entire client site — backend + frontend + all providers — on your local dev environment. This phase is the **mandatory quality gate**. Nothing goes to the VPS until this phase is fully passed. This is where you find gaps, leaks, edge cases, and integration failures — not on the VPS under time pressure.

**Prerequisites:** Phase 2 complete (backend built and E2E baseline passes). Phase 3 complete (all provider dry-runs pass). Phase 4 complete (all frontend slices built and integrated locally).

**Full runbook:** `docs/BACKEND_GO_LIVE_CHECKLIST.md`, `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`, `README.md` §E2E Simulation.

**Execution steps:**

1. **Start the full local stack** with real provider credentials (not noop):
   ```bash
   # Terminal 1 — server
   npm run dev:e2e
   # Terminal 2 — workers
   npm run dev:e2e:workers
   ```

2. **Run the Postman E2E collection end-to-end** (`docs/postman/E2E-Flow-Simulation.postman_collection.json`) folders 0→1→2→3. All steps must pass — no warnings treated as acceptable for go-live.

3. **Manually walk every user-facing flow in the browser** against `http://localhost:<STOREFRONT_PORT>`:
   - Guest: catalog browse → product detail → add to cart → checkout (prepaid Razorpay test payment) → order confirmation page → confirmation email received.
   - Guest: same flow with COD if enabled for this client.
   - Registered user: login → order history → order detail.
   - Admin: login → order list → view order → ship action → AWB returned → shipping webhook received → order status updated → mark delivered.
   - Admin: initiate refund → confirm refund is queued → refund worker processes → order status reflects refund.
   - Ops: ops API responds 200 from local test, ops audit log entries are chained correctly.

4. **Check for no gaps or leaks:**
   - No API call returns unexpected 404, 500, or schema mismatch.
   - No browser console errors that indicate broken API integration.
   - No hardcoded data visible in the UI (all content comes from backend).
   - No `noop` payment or shipping provider active.
   - Auth guard works: unauthenticated requests to protected routes return 401, not 200 with empty data.
   - Admin permission guard works: user without permission cannot access admin routes.
   - CORS is correct: no CORS errors in browser dev tools.

5. **Run all backend validation scripts one final time:**
   ```bash
   npm run validate:env
   npm run validate:schema
   npm run lint
   npm run type-check
   npm run test
   ```
   
6. **Verify race-condition hardening:**
   - Confirm CAS-hardened services pass targeted tests:
     ```bash
     npx vitest run ops.service.test.ts auth.service.mfa-refresh.test.ts admin-invites.service.test.ts reconciliation.worker.test.ts idempotency.test.ts idempotency.security.test.ts
     ```
   - All tests pass confirming atomic operations and TOCTOU prevention are active.

7. **Verify `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`** is fully ticked from Phase 4. Any unticked item must be resolved before proceeding.

8. **Confirm no placeholder secrets** remain in `.env`:
   ```bash
   # Windows
   findstr /i "replace_with" .env
   # Must return no results
   ```

**Evidence gate — all of the following must be true before Phase 6 begins:**
- Postman E2E all folders pass with no errors.
- Every user-facing flow manually verified in browser with no broken integrations.
- No 500s, schema mismatches, or console errors.
- All backend validation scripts pass clean.
- `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` fully ticked.
- No placeholder secrets in `.env`.
- All provider dry-run evidence is logged in credential register.

> **If anything fails this gate, fix it locally and re-run. Do not proceed to VPS.**

---

## Phase 6 — VPS baseline provisioning

**What you are doing:** Ensure the VPS host is correctly set up to receive the client deployment. This is the **first time you touch the VPS** for this client.

> **Before starting Phase 6:** Confirm `CLIENT_DEV_LOG.md` Phase 5 gate row shows a cleared date and sign-off. Create `CLIENT_VPS_DEPLOYMENT_LOG.md` now:
> ```
> cp docs/CLIENT_VPS_DEPLOYMENT_LOG_TEMPLATE.md client-<client-id>/CLIENT_VPS_DEPLOYMENT_LOG.md
> ```
> Copy Project Identity values from `CLIENT_DEV_LOG.md` into the new log. This is done once per VPS (not once per client) — if the VPS already hosts other clients, verify the baseline still meets requirements but skip steps already done.

**Prerequisites:** Phase 5 complete — **full local integration testing passed**. SSH access to VPS.

**Full runbook:** `docs/CLIENT_VPS_SETUP_GUIDE.md` §2 (VPS baseline) and §4 (Directory layout).

**Execution steps:**

1. **OS and packages:** Confirm Ubuntu 22.04 LTS. Install (if not present): Docker Engine + Compose plugin, Nginx 1.24+, Certbot (nginx plugin), PostgreSQL 16, Node.js 22, `jq`.
   ```bash
   docker --version && docker compose version
   nginx -v
   certbot --version
   psql --version
   node --version
   ```

2. **Non-root deploy user:** Confirm a non-root user with sudo exists for deployments.

3. **PostgreSQL 16 host service:** Confirm it is running on the host (not only in Docker). Containers reach it via `host.docker.internal`.

4. **Firewall:** Ports 80 and 443 open inbound. Backend/storefront ports (3001–3099, 3101–3199) NOT exposed publicly — proxied only by Nginx.

5. **NTP / time sync:** Confirm `systemd-timesyncd` or equivalent is active.
   ```bash
   timedatectl status
   ```

6. **Host hardening checks (once per VPS):**
   - `PermitRootLogin no` and `PasswordAuthentication no` in `/etc/ssh/sshd_config`
   - `ufw` allows only `22`, `80`, `443`
   - `fail2ban` running
   - `unattended-upgrades` enabled

7. **Capacity signals (record before onboarding each new client):**
   - RAM sustained usage target: <75%
   - CPU sustained usage target: <70%
   - Disk usage target: <70%
   - If above thresholds, stabilize/resize before adding another client

8. **Create per-client directories:**
   ```bash
   sudo mkdir -p /var/www/<client-id>/backend
   sudo mkdir -p /var/www/<client-id>/frontend
   sudo chown -R <deploy-user>:<deploy-user> /var/www/<client-id>
   ```

**Evidence gate:**
- All required packages installed and version checks pass.
- Non-root deploy user exists.
- PostgreSQL 16 running on host.
- Firewall blocks raw backend ports from public access.
- NTP active.
- Host hardening checks pass (SSH, UFW, fail2ban, unattended upgrades).
- Capacity signals recorded and within target or explicitly mitigated.
- Client directory structure created.

---

## Phase 7 — VPS backend deployment

**What you are doing:** Deploy the locally validated backend to the VPS. Configure database, Nginx, TLS, and bring up the Docker Compose stack.

**Prerequisites:** Phase 5 complete (full local testing passed). Phase 6 complete (VPS baseline ready).

**Full runbook:** `docs/CLIENT_VPS_SETUP_GUIDE.md` §5–§12  
**Master playbook:** `docs/MASTER_DEPLOYMENT_PLAYBOOK.md`

### 7.1 — Database setup

```bash
# On VPS, as postgres superuser or admin
psql -U postgres
CREATE USER <client-db-user> WITH PASSWORD '<generated>';
CREATE DATABASE <client-db-name> OWNER <client-db-user>;
\q
```

Reference: `docs/CLIENT_VPS_SETUP_GUIDE.md` §5.

### 7.2 — Backend deployment

```bash
# On VPS, as deploy user
cd /var/www/<client-id>/backend
git clone https://github.com/your-org/ecom-backend-template .
# OR git pull if re-deploying

# Copy .env from secure source (never git)
# scp from local, or pull from secrets vault

npm ci --omit=dev
npm run prisma:migrate:deploy    # applies all migrations
docker compose -p <client-id> up -d --build
```

Reference: `docs/CLIENT_VPS_SETUP_GUIDE.md` §6–§7.

### 7.3 — Nginx configuration

1. Copy `nginx/client.conf.template` from the backend repo to `/etc/nginx/sites-available/<client-id>.conf`.
2. Replace all template variables: `<domain>`, `<BACKEND_PORT>`, `<STOREFRONT_PORT>`, `<client-id>`.
3. Verify the six mandatory security headers are present in the HTTPS server block:
   - `Strict-Transport-Security` (2-year max-age, `includeSubDomains`, `preload`)
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `X-XSS-Protection: 1; mode=block`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`
4. Verify TLS hardening: `ssl_ciphers` ECDHE-only AEAD suite, `ssl_session_cache`, `ssl_session_tickets off`, `ssl_stapling on`, `ssl_stapling_verify on`.
5. Verify `limit_req_zone` directives are in `http {}` (top-level `nginx.conf`), not inside `server {}`.
6. Enable the site: `sudo ln -s /etc/nginx/sites-available/<client-id>.conf /etc/nginx/sites-enabled/`
7. Test and reload: `sudo nginx -t && sudo systemctl reload nginx`

Reference: `docs/BACKEND_GO_LIVE_CHECKLIST.md` §2.1 (Nginx checklist items).

### 7.4 — TLS certificate

```bash
# Obtain certificate (first time)
sudo certbot --nginx -d <domain> -d www.<domain>

# Verify auto-renewal is scheduled
sudo systemctl status certbot.timer
# OR
sudo certbot renew --dry-run
```

Certbot will auto-patch the Nginx config. Verify HTTPS redirect from HTTP is active after cert issuance.

### 7.5 — Smoke test post-deploy

```bash
# Health check
curl -s https://<domain>/api/v1/health | jq .

# Metrics endpoint (requires OPS_METRICS_TOKEN)
curl -s -H "x-ops-token: <OPS_METRICS_TOKEN>" https://<domain>/api/v1/ops/metrics | head -30

# Container health
docker ps --filter "name=<client-id>"
docker compose -p <client-id> logs backend --tail=50
docker compose -p <client-id> logs workers --tail=50
```

**Evidence gate:**
- All containers running (`docker ps` shows `Up`).
- `/api/v1/health` returns 200.
- `/api/v1/ops/metrics` returns 200 with Prometheus text format.
- Nginx HTTPS active; HTTP redirects to HTTPS.
- TLS certificate valid (check with browser or `openssl s_client -connect <domain>:443`).
- No errors in backend or workers container logs at startup.

---

## Phase 8 — Ops control plane invite bootstrap

**What you are doing:** Create the first ops invite, complete setup from email, and confirm the ops control plane is accessible from the designated IP.

**Prerequisites:** Phase 7 complete (VPS backend running with HTTPS).

**Mandatory frontend dependency before starting Phase 8:**
- Client frontend already includes working `/ops/setup` page that consumes invite token and completes setup against backend invite API.
- If `/ops/setup` is not deployed, do not run `ops:newuser` yet (invites expire in 10 minutes).

**Full runbook:** `docs/OPS_CONTROL_PLANE_GUIDE.md`

**Execution steps:**

1. **Create ops invite** via trusted host CLI (not a public open bootstrap endpoint):
   ```bash
   cd /var/www/<client-id>/backend
   npm run ops:newuser -- \
     --email ops@<client-id>.internal \
     --name "Primary Ops" \
     --ip-allowlist "your.office.ip/32,your.home.ip/32" \
     --setup-base-url "https://<client-domain>" \
     --yes
   ```
   Reference: `docs/OPS_CONTROL_PLANE_GUIDE.md` §4 (Invite bootstrap).

2. **Complete setup from invite email** at `https://<client-domain>/ops/setup?...` within 10 minutes.

3. **Store runtime credentials in vault** once setup finishes and API credentials are issued.

4. **Test ops access:**
   ```bash
   curl -s -X GET https://<domain>/api/v1/ops/session \
     -H "x-ops-key-id: <keyId>" \
     -H "x-ops-api-key: <apiKey>" \
     -H "x-ops-mfa-code: <email-otp-if-required>"
   ```
   Expected: 200 with ops session payload.

5. **Verify IP allowlist enforcement:** Attempt an ops call from an IP **not** in the allowlist — must return 403.

6. **Record ops user** in the credential register with keyId, vault path, IP allowlist, creation date.
7. **Verify cleanup policy:** expired unconsumed invites are removed and lifecycle events are visible in ops audit logs.

**Evidence gate:**
- Ops invite is completed before expiry and resulting API credentials are stored in vault.
- Email OTP-based ops verification is functional for privileged write actions.
- Ops status endpoint returns 200 from allowlisted IP.
- 403 confirmed from non-allowlisted IP.

---

## Phase 9 — Admin provisioning

**What you are doing:** Create the first merchant admin through the invite-only `/admin/setup` flow and verify ecommerce admin access.

**Prerequisites:** Phase 7 complete (VPS backend running).

**Execution steps:**

1. **Create merchant admin invite** from an authenticated ops context:
   - Backend route: `POST /api/v1/admin/invites`
   - Required ops auth: `x-ops-key-id`, `x-ops-api-key`, MFA when enforced.
   - Required permission: `ops:write`.
   - Endpoint policy: Layer C developer/ops control surface, not merchant admin self-service.
   - Body: `email`, `name`, `setupBaseUrl`, optional merchant-only `permissions`.
   - The generated setup link targets `/admin/setup?token=...` and expires in 10 minutes.

2. **Complete merchant setup** at `/admin/setup`:
   - Frontend calls `POST /api/v1/admin/invites/consume` with `token`, `password`, and optional `name`.
   - Backend creates `User(role=ADMIN)`, marks the invite consumed, and inserts merchant `AdminPermissionGrant` rows.
   - Default grants cover dashboard, products, categories, inventory, coupons, settings, reviews, analytics, orders, exports, notifications, and users read.
   - Developer permissions (`ops:*`, `queues:inspect`, `developer:*`) are not granted by this flow.
   - Invite token is accepted once; expired or consumed invites require a fresh ops-created invite.

3. **Verify admin login** via `POST /api/v1/auth/admin/login`. Confirm token contains expected merchant permissions.

4. **Verify MFA enrollment** if `ADMIN_MFA_ENFORCE=true`.

5. **Confirm admin permission snapshot caveat** is in your ops SOP: permission grant/revoke changes are token-issuance scoped. Mid-session changes require session revocation or logout/re-auth for immediate effect.

6. **Clean expired admin invites** when needed from an authenticated ops context:
   - Backend route: `POST /api/v1/admin/invites/cleanup-expired`
   - Required permission: `ops:write`.
   - Use this for operational cleanup evidence; it must not be exposed as a merchant admin UI action.

**Evidence gate:**
- Merchant admin invite was consumed before 10-minute expiry.
- Admin user exists and can log in.
- Admin permissions are explicitly granted through `AdminPermissionGrant` rows created by invite consumption.
- MFA enrolled if enforced.
- Admin JWT checked for expected `permissions` claim.
- Expired invite cleanup route is verified from ops context or scheduled SOP.

---

## Phase 10 — Frontend deployment and domain wiring

**What you are doing:** Deploy the locally validated Next.js frontend to the VPS and wire it to the live domain and production API base URL. You are promoting the already-tested local build — not building or debugging anything new here.

**Prerequisites:** Phase 5 complete (full local integration testing passed). Phase 7.3–7.4 complete (Nginx + TLS active for domain).

**Full guide:** `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` §1 (Base URLs and environment variables).

**Execution steps:**

1. **Build the frontend for production** with live env variables (swap from local values used in Phase 4):
   ```bash
   cd client-<client-id>/frontend
   NEXT_PUBLIC_API_BASE_URL=https://<domain>/api/v1 \
   NEXT_PUBLIC_STOREFRONT_URL=https://<domain> \
   NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxx \
   npm run build
   ```

2. **Deploy to VPS** (if self-hosted Next.js):
   ```bash
   # Copy build output to VPS
   rsync -avz .next/ <deploy-user>@<vps-ip>:/var/www/<client-id>/frontend/.next/
   rsync -avz public/ <deploy-user>@<vps-ip>:/var/www/<client-id>/frontend/public/
   # Start Next.js server (use PM2 or Docker)
   pm2 start npm --name "<client-id>-frontend" -- start -- -p <STOREFRONT_PORT>
   ```
   OR deploy to Vercel/Netlify with env variables set in their dashboard.

3. **Update Nginx** to proxy storefront traffic to `http://127.0.0.1:<STOREFRONT_PORT>`. Reload Nginx.

4. **Verify domain routing:**
   - `https://<domain>/` → storefront
   - `https://<domain>/api/v1/health` → backend (200)
   - `https://<domain>/admin` → admin UI

**Evidence gate:**
- Storefront homepage loads over HTTPS.
- Admin UI loads at `/admin` (or subdomain).
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` is the **live** key (not test key).
- No `NEXT_PUBLIC_API_BASE_URL` pointing to `localhost`.

---

## Phase 11 — Provider webhook endpoint registration

**What you are doing:** Register the live VPS webhook URLs with all payment and shipping providers. This must happen after the live HTTPS domain exists (Phase 7). During local development (Phases 3–5), webhooks were tested locally — now you register the live URL.

**Prerequisites:** Phase 7 complete (HTTPS domain active). Phase 10 complete (frontend deployed).

**Execution steps:**

1. **Razorpay webhook:**
   - Go to Razorpay Dashboard → Settings → Webhooks.
   - Update (or create) the webhook URL to: `https://<domain>/api/v1/payments/webhook`.
   - Confirm active events: `payment.captured`, `payment.failed`, `refund.created`, `refund.failed`.
   - Confirm `RAZORPAY_WEBHOOK_SECRET` in backend `.env` matches the webhook secret in dashboard.

2. **Delhivery webhook:**
   - Go to Delhivery partner portal → Webhooks.
   - Register: `https://<domain>/api/v1/shipping/webhook`.
   - Confirm `DELHIVERY_WEBHOOK_ALLOWLIST_CIDR` in backend `.env` includes Delhivery egress IPs.

3. **Shiprocket webhook** (if used):
   - Go to Shiprocket settings → Webhooks.
   - Register: `https://<domain>/api/v1/shipping/webhook`.
   - Confirm `SHIPROCKET_WEBHOOK_ALLOWLIST_CIDR` in backend `.env` includes Shiprocket egress IPs.

4. **Verify webhook receipt:** After registration, use each provider's "send test webhook" feature or trigger a test event and confirm it arrives and is processed in backend logs.

**Evidence gate:**
- All active provider webhooks point to live HTTPS URL (not staging URL, not localhost).
- Webhook secret in backend `.env` matches provider dashboard for each provider.
- At least one test webhook received and logged (no 400/500 from backend).

---

## Phase 12 — Go-live validation

**What you are doing:** Execute the full backend and frontend go-live checklists against the live VPS deployment. Most of this was already validated locally in Phase 5 — this phase confirms everything behaves identically on the VPS under real TLS, real domain, and live provider credentials.

**Prerequisites:** All phases 1–11 complete.

**Backend checklist:** `docs/BACKEND_GO_LIVE_CHECKLIST.md` — execute all sections.  
**Frontend checklist:** `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` — execute all sections.  
**Final sign-off guide:** `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md`

**Execution steps:**

1. **Fill in the release record** in `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md` §1:
   - Client name, environment, backend git SHA, storefront git SHA, deploy timestamp, on-call owner.

2. **Execute `docs/BACKEND_GO_LIVE_CHECKLIST.md`** in full:
   - Section 1: Runtime Profile & Global Environment Safety.
   - Section 2: Environment-to-Implementation Parity (all subsections: core routing, data layer, auth, payment, shipping, webhooks, risk/fraud, features, notifications, ops, observability).
   - No item may be skipped. Unticked items are blockers.

3. **Execute `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`** in full:
   - Section 1: Environment & Profile Safety.
   - Section 2: Response Contract Compliance.
   - Section 3: Auth & Session Handling.
   - Section 4: Idempotency.
   - Section 5: Checkout Flow.
   - Section 6: Webhook Boundaries.
   - Section 7: Admin Flow.
   - Section 8: Release Validation Commands.
   - No item may be skipped. Unticked items are blockers.

4. **Attach provider lifecycle evidence** from `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md`:
   - Owner, vault path, created/rotated/expiry/last-tested for every active provider.

5. **Run release validation commands** from `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` §8 against the live VPS domain.

6. **Run contract smoke tests** — verify the critical API flows end-to-end on the live deployment:
   - Storefront: catalog browse → add to cart → checkout (Razorpay test payment if on staging; live payment on production) → order confirmation email received.
   - Admin: order appears in admin panel, ship action creates AWB, shipping webhook updates order status.
   - Ops: ops endpoint responds 200 from allowlisted IP, 403 from non-allowlisted.

7. **Confirm observability is active:**
   - Prometheus scraping `/api/v1/ops/metrics` with auth token.
   - At least one alert rule configured and tested.
   - `process_crash_total` series visible in metrics.

**Evidence gate:**
- `docs/BACKEND_GO_LIVE_CHECKLIST.md` fully ticked — no open items.
- `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` fully ticked — no open items.
- Release record filled in `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md`.
- Provider credential register attached with all fields complete.
- All contract smoke tests pass on live domain.
- Observability confirmed active.

---

## Phase 13 — DNS cutover

**What you are doing:** Switch production DNS records to point to the VPS. This is the final irreversible step that exposes the client to real traffic.

**Prerequisites:** Phase 12 complete with all evidence gates passed. No open blockers.

**Execution steps:**

1. **Update DNS records** at the domain registrar:
   - `A` record for `<domain>` → VPS IP.
   - `A` record for `www.<domain>` → VPS IP (or CNAME to `<domain>`).
   - If admin is on subdomain: `A` record for `admin.<domain>` → VPS IP.

2. **Wait for DNS propagation** (typically 5–60 minutes, up to 24–48 hours for global propagation). Use `dig <domain>` or `https://dnschecker.org` to monitor.

3. **Verify after propagation:**
   - `https://<domain>/` loads storefront (HTTPS, not HTTP).
   - `https://<domain>/api/v1/health` returns 200.
   - TLS certificate is valid for the domain (no browser warnings).
   - HTTP → HTTPS redirect works.

4. **Notify client** that the site is live.

5. **Monitor logs and metrics** for the first 24–48 hours:
   ```bash
   docker compose -p <client-id> logs backend -f
   docker compose -p <client-id> logs workers -f
   ```

**Evidence gate:**
- DNS propagated globally (confirmed via DNS checker).
- HTTPS loads cleanly without cert warnings.
- `/api/v1/health` returns 200 on live domain.
- No critical errors in first-hour logs.

---

## Phase 14 — Post-go-live handoff and maintenance setup

**What you are doing:** Complete the onboarding by documenting the deployment, setting up ongoing maintenance procedures, and handing off to the client (if applicable).

**Prerequisites:** Phase 13 complete.

**Execution steps:**

1. **File all deployment artifacts:**
   - Completed `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md` (with release record and all ticks).
   - Completed `docs/BACKEND_GO_LIVE_CHECKLIST.md`.
   - Completed `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`.
   - Completed `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md`.
   - Nginx config backup.
   - Database name, user, and connection info in vault.

2. **Set up 90-day credential rotation calendar** per `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §6 (Rotation schedule):
   - Assign primary and backup owners for each credential.
   - Set calendar reminders 30 days before each rotation date.

3. **Schedule quarterly compromise drill** per `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §7 (Compromise runbook):
   - Revoke → regenerate → redeploy → verify all credentials exercise at least annually.

4. **Configure Prometheus alerting** (if not done in Phase 11) and verify alert delivery channel (email/Slack/PagerDuty).

5. **Document the client's slot** on the VPS:
   - `CLIENT_ID`, backend port, storefront port, database name, ops user email, on-call contact.
   - Store in the agency's internal ops register.

6. **Brief the client** on:
   - Admin panel URL and login process.
   - MFA requirement for admin.
   - Manual ship action workflow (shipment booking is intentionally manual — not auto-triggered).
   - Refund is asynchronous — customers may see a brief delay before refund status is final.
   - Contact protocol for production incidents.

**Evidence gate:**
- All deployment artifacts filed and accessible to the team.
- 90-day rotation calendar set.
- Quarterly drill scheduled.
- Observability and alerting confirmed active.
- Client briefed and accepted handoff.

---

## Quick-reference execution summary

> **The hard boundary: Phases 0–5 are entirely on your dev laptop. The VPS is not touched until Phase 6.**

| Phase | Where | What | Key doc |
|-------|-------|------|---------|
| 0 | Dev laptop | Client intake and scoping | — |
| 1 | Browser | Third-party account setup | `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` |
| 2 | Dev laptop | Backend clone, configure, local E2E baseline | `docs/MASTER_DEPLOYMENT_PLAYBOOK.md`, `.env.example` |
| 3 | Dev laptop | Third-party staging dry-runs (per slice) | `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §0.1 |
| 4 | Dev laptop | Frontend build — simultaneous with Phase 3 | `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md`, `starter-prompt.md` |
| **5** | **Dev laptop** | **Full local integration testing — mandatory gate** | `docs/BACKEND_GO_LIVE_CHECKLIST.md`, `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` |
| 6 | **VPS** | VPS baseline provisioning (first VPS step) | `docs/CLIENT_VPS_SETUP_GUIDE.md` §2–§4 |
| 7 | **VPS** | VPS backend deployment (DB, Docker, Nginx, TLS) | `docs/CLIENT_VPS_SETUP_GUIDE.md` §5–§12 |
| 8 | **VPS** | Ops control plane bootstrap | `docs/OPS_CONTROL_PLANE_GUIDE.md` |
| 9 | **VPS** | Admin provisioning | `ECOM_MASTER.md` §12, `TRD.md` §6 |
| 10 | **VPS** | Frontend deployment and domain wiring | `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` §1 |
| 11 | **VPS** | Provider webhook endpoint registration | `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` |
| 12 | **VPS** | Go-live validation against live domain | `docs/BACKEND_GO_LIVE_CHECKLIST.md`, `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md`, `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md` |
| 13 | DNS registrar | DNS cutover | — |
| 14 | — | Post-go-live handoff and maintenance setup | `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` §6–§7 |

---

## Critical isolation rules (must never be violated)

These rules come from `ECOM_MASTER.md` §5 and `TRD.md` §2.3. They are not suggestions — violating them collapses the security and billing isolation model of the multi-client VPS:

- **Never share a database** between clients. Each client gets its own PostgreSQL database and user.
- **Never share Redis** between clients. Each client gets its own Redis container with its own password.
- **Never share JWT secrets** (`JWT_SECRET`, `JWT_REFRESH_SECRET`) between clients.
- **Never share payment/shipping credentials** between clients. Even if two clients use the same Razorpay account owner, create separate API keys.
- **Never share `OPS_API_KEY_SALT`** between clients.
- **Never share `ADMIN_MFA_ENCRYPTION_KEY`** between clients.
- Each client has its own Nginx `server {}` block(s) and its own TLS certificate.
- Each client's `.env` must **never** be committed to git.

---

## Related documents

| Document | Role in this runbook |
|----------|---------------------|
| `ECOM_MASTER.md` | Canonical architecture source of truth — all isolation rules, VPS model, and hardening notes |
| `TRD.md` | API contract, infrastructure requirements, auth model, webhook specs |
| `BRD.md` | Business acceptance criteria (AC-01–AC-15) that this process must satisfy |
| `README.md` | Quick-start orientation, documentation index, E2E simulation guide |
| `docs/MASTER_DEPLOYMENT_PLAYBOOK.md` | Detailed deployment steps with copy-paste commands |
| `docs/CLIENT_VPS_SETUP_GUIDE.md` | VPS provisioning and per-client Nginx/Docker isolation detail |
| `docs/BACKEND_GO_LIVE_CHECKLIST.md` | Local testing gate (Phase 5) + VPS go-live gate (Phase 12) |
| `docs/FRONTEND_AI_GO_LIVE_CHECKLIST.md` | Local testing gate (Phase 5) + VPS go-live gate (Phase 12) |
| `docs/CLIENT_GO_LIVE_VALIDATION_GUIDE.md` | Final sign-off record and release evidence (Phase 12) |
| `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md` | Frontend integration contract, vertical slice model (Phase 4) |
| `docs/OPS_CONTROL_PLANE_GUIDE.md` | Ops user bootstrap and API usage (Phase 8) |
| `docs/THIRD_PARTY_INTEGRATIONS_SETUP_AND_KEY_MANAGEMENT_GUIDE.md` | Provider setup, credential lifecycle, rotation (Phases 1, 3, 11, 14) |
| `docs/CLIENT_INTEGRATION_CREDENTIAL_REGISTER_TEMPLATE.md` | Per-client credential ownership record (filled across Phases 1, 3, 11) |
| `starter-prompt.md` | AI prompting playbook for frontend agent (Phase 4) |
| `frontend-agent-rules.md` | Antigravity rules to copy into frontend repo (Phase 4) |
| `.env.example` | Complete environment variable reference used in Phase 2 |
| `docs/CLIENT_DEV_LOG_TEMPLATE.md` | **Copy to `client-<id>/CLIENT_DEV_LOG.md` at Phase 0** — persistent dev context for Phases 0–5 (backend config, provider dry-runs, frontend milestones, Phase 5 gate) |
| `docs/FRONTEND_DEV_LOG_TEMPLATE.md` | **Copy to `frontend/docs/FRONTEND_DEV_LOG.md` at Phase 4 start** — frontend slice-level tracker |
| `docs/CLIENT_VPS_DEPLOYMENT_LOG_TEMPLATE.md` | **Copy to `client-<id>/CLIENT_VPS_DEPLOYMENT_LOG.md` at Phase 6 start** — VPS deployment progress log for Phases 6–14 |
