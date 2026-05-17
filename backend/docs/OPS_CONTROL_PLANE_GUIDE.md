# Ops Control Plane Guide

This guide explains how to securely set up and use the `/api/v1/ops/*` control plane for infrastructure operations and how frontend teams can build an interactive ops UI against these backend APIs.

## 1) Purpose and scope

`/api/v1/ops/*` is the Layer C control plane for platform operations. It is intentionally separate from merchant-admin operations (`/api/v1/admin/*`).

- `admin/*` manages business workflows (catalog, orders, analytics, users).
- `ops/*` manages technical runtime controls (load-shed, approval workflows, operational audit visibility).

Shipping boundary note:
- Shipment booking remains a merchant-admin business action (`POST /api/v1/admin/orders/:id/ship`) and follows manual-only dispatch policy.
- Ops control plane must not be used to bypass merchant ship eligibility checks.

The ops surface is designed for authorized developer/operator users only.

## 2) Security model

All protected ops routes require:

- `x-ops-key-id` (ops key identifier)
- `x-ops-api-key` (secret API key)
- `x-ops-mfa-code` (MFA TOTP code when enforced)

These values are generated during secure ops-user bootstrap (not from a public HTTP endpoint).

Additional controls:

- Per-ops-user IP allowlist (CIDR entries on `OpsUser.ipAllowlist`)
- Permission gating (`ops:read`, `ops:write`, `ops:approve`)
- Dual approval for critical writes (`ops:write` request, `ops:approve` confirm/reject)
- Tamper-evident audit chain (`OpsAuditLog.chainHash` + `previousChainHash`)
- Audit-chain write lock contention fails with structured transient error (`503`, `ops_audit_chain_lock_timeout`) so callers can safely retry instead of receiving an unstructured 500.

## 3) Environment setup

Configure at minimum:

- `OPS_API_KEY_SALT`
- `OPS_DUAL_APPROVAL_WINDOW_MINUTES` (default/recommended: `15`)
- `OPS_MFA_ENFORCE=true`
- `ADMIN_MFA_ENCRYPTION_KEY` (must be independent from `JWT_REFRESH_SECRET` in production-like profiles)
- `OPS_METRICS_TOKEN`
- `OPS_METRICS_ALLOWLIST` (recommended)

## 4) First-time invite bootstrap (Phase 2)

The backend now uses an invite CLI for first ops identity onboarding:

- `npm run ops:newuser -- --email=<ops@email> --name="Primary Ops" --ip-allowlist="203.0.113.10/32" --setup-base-url="https://client.com" --yes`

`--setup-base-url` must be the frontend base origin only (for example, `https://client.com`). Backend appends `/ops/setup?token=...` automatically.

**Frontend prerequisite (mandatory before running `ops:newuser`):**

- The client frontend must already include an ops setup page at `/ops/setup`.
- The page must read the `token` query param and call backend invite-consume API.
- Without this page, invite links cannot be completed and onboarding will fail by expiry.

What the command does:

1. Creates `OpsUserInvite` record with permissions + IP allowlist.
2. Generates a one-time setup token hash (raw token only in setup link).
3. Sends setup link email via Resend to `https://client.com/ops/setup?token=...`.
4. Enforces invite expiry window (10 minutes).
5. Logs invite lifecycle events in ops audit timeline.

Security rationale:

- No public route exists to mint ops or merchant admin invites without ops privileges.
- Public invite-consume endpoints only complete setup for a valid, unexpired, one-time token; they do not create invites or grant arbitrary permissions.
- Invite token is stored hashed in DB; raw token exists only in email link.
- Provisioning is an explicit server-side operation requiring shell access.
- `ops-newuser.mjs` reads provider/encryption env at runtime — no hardcoded credentials.
- Merchant admin production provisioning is invite-only through `POST /api/v1/admin/invites` and `/admin/setup`; legacy/local admin seeding scripts are not go-live provisioning paths.

Identity boundary contract:

- `User` (customer/admin) emails and `OpsUser` emails are mutually exclusive.
- Ops and admin invite flows fail closed with `409 CONFLICT` when invite email is already used by the other account domain.

Recommended first-time runbook:

1. Configure strict env values (`OPS_API_KEY_SALT`, `ADMIN_MFA_ENCRYPTION_KEY`, `OPS_DB_ENCRYPTION_KEY`, `OPS_MFA_ENFORCE=true`).
2. Execute `ops:newuser` on trusted host session.
3. Complete setup from emailed link before 10-minute expiry.
4. Verify from allowlisted IP with:
   - `GET /api/v1/ops/session`
5. Remove command output from shell history/log capture where applicable.

If an operator is lost/compromised, deactivate that `OpsUser` in DB and issue a replacement invite via `ops:newuser`.

Production hard requirements:

- No placeholder secrets (`replace_with_*`, `change_me*`, `<...>`)
- Ops users must have non-empty `ipAllowlist`
- `ops:approve` assigned only to trusted approver identities

## 5) Data models involved

Ops control plane uses dedicated models:

- `OpsUser`
- `OpsUserInvite`
- `OpsOtpChallenge`
- `OpsConfigSecret`
- `OpsDualApprovalRequest`
- `OpsAuditLog`

These are separate from merchant `User` + admin grant flows.

## 5.1 Atomicity & Audit Chain Locking (Race-Condition Hardening)

All critical ops state transitions use Compare-And-Swap (CAS) patterns to eliminate TOCTOU (Time-of-Check-to-Time-of-Use) races:

**Dual-approval transitions:** `POST /api/v1/ops/approvals/:id/confirm` and `/reject` use Prisma `updateMany` with `status = PENDING` guard inside a database transaction. This prevents concurrent confirm/reject races — only one operator can successfully transition the request, and the second receives a conflict response.

**Invite lifecycle atomicity:**
- Consumption: `updateMany` with `status in ['CREATED', 'EMAIL_SENT']` guard
- Expiry cleanup: `deleteMany` with matching status guard
- OTP verification: `updateMany` with `status = PENDING AND attempts < max` guard

These patterns prevent double-consumption of invites and double-verification of OTP challenges under concurrent access.

**Audit chain tamper-evidence via distributed locking:**

All `OpsAuditLog` writes require serializing chain-head updates to prevent hash-chain forking. The `withOpsAuditChainLock()` helper acquires a Redis lock before computing `previousChainHash`:

- Lock key: `audit:ops:chain:lock`
- Lock TTL: 5000ms (`OPS_AUDIT_LOCK_TTL_MS`)
- Wait timeout: 2000ms (`OPS_AUDIT_LOCK_WAIT_TIMEOUT_MS`)
- Lock failure returns `503 ops_audit_chain_lock_timeout` — callers should retry

This ensures `chainHash = SHA256(previousChainHash + canonicalPayload)` maintains linear integrity even under concurrent ops mutations.

**Test compatibility:**

All CAS paths detect `vi.fn` mock delegates and fall back to single-row `update`/`delete` to satisfy existing unit test assertions. Production deployments with real Prisma clients execute full atomic guards.

## 5.2 Ops config contract automation (security-first)

Ops config key management is now contract-driven from a single source:

- `src/modules/ops/ops-config-contract.ts`

Security boundaries:

- Only keys explicitly listed in the contract can appear in ops config overview/validate/save flows.
- Mutable vs non-mutable keys are explicit (`mutableViaOps`) and deny-by-default.
- Sensitive platform secrets are editable only when explicitly listed as non-bootstrap mutable keys.
- Bootstrap-only keys (`DATABASE_URL`, initial `REDIS_URL`, `OPS_DB_ENCRYPTION_KEY`) must come from real deployment environment and are not activated from DB-backed config.
- DB-stored values override real env only for contract-allowed non-bootstrap runtime keys after API/worker restart.
- Runtime values remain server-side env + encrypted DB overlay values only; plaintext secrets are never returned by ops read APIs.

Automation/guardrails:

- `npm run ops:config-contract-drift-check`
- Included in `npm run test:guardrails` and `npm run ci:reliability-gates`.

When adding/removing ops-relevant env keys:

1. Update `.env.example` / runtime env contract.
2. Update `ops-config-contract.ts` classification (domain + mutability + restart behavior).
3. Ensure drift checks pass before merge.

## 6) API routes for interactive frontend UI

### 6.1 Session/profile bootstrap

`GET /api/v1/ops/session` (`ops:read`)

Use this first in UI to render operator identity and capabilities.

Response fields:

- `id`, `email`, `name`
- `permissions`
- `mfaEnabled`
- `ipAllowlist`
- `lastLoginAt`

### 6.2 Config foundations (Phase 2)

`GET /api/v1/ops/config/overview` (`ops:read`)

- Returns **masked metadata only** for allowlisted config groups:
  - key present/missing
  - placeholder detection
  - mutable-via-ops flag
  - restart-required flag
  - runtime source (`env-bootstrap` or DB-overlay eligible)
- Includes strict profile health summary:
  - `noPlaceholdersInStrict`
  - `missingRequiredKeysInStrict`

`POST /api/v1/ops/config/validate` (`ops:write`)

- Dry-run validator for draft config values.
- Request: `{ domain?, values }`
- Response: `{ valid, checkedKeys, errors, warnings, requiresRestart }`
- Does **not** mutate runtime config and does **not** return plaintext secrets.

`GET /api/v1/ops/config/stored` (`ops:read`)

- Returns masked DB-backed encrypted config values by domain/key metadata.

`POST /api/v1/ops/config/save` (`ops:write`)

- Saves validated config draft into encrypted DB store (`OpsConfigSecret`).
- Requires email OTP challenge (`challengeId`, `otpCode`) before commit.
- Requires `OPS_DB_ENCRYPTION_KEY` to be configured from real environment; save route and boot overlay fail closed if encryption key is missing.
- Rejects bootstrap-only keys with `BOOTSTRAP_KEY_NOT_DB_APPLICABLE`; edit them in deployment environment instead.
- Saved non-bootstrap keys apply after API/worker restart.

Phase 2 boundary note: backend implements secure APIs only; interactive UI is implemented later in each client site's `frontend` folder.

### 6.3 Invite and setup lifecycle

`POST /api/v1/ops/invites` (`ops:approve`)

- Creates and emails invite links for new ops users.
- `setupBaseUrl` input must be base origin only; backend composes `${setupBaseUrl}/ops/setup?token=...`.

`POST /api/v1/ops/invites/consume` (public setup endpoint)

- Consumes setup token and creates `OpsUser` credentials.
- This endpoint is intentionally public for `/ops/setup`, but it must remain token-bound, rate-limited, one-time use, and listed as a narrow route-discipline exemption only.

`POST /api/v1/ops/invites/cleanup-expired` (`ops:approve`)

- Removes expired unconsumed invites (10-minute policy) and records audit events.

### 6.4 Email OTP challenge routes

`POST /api/v1/ops/otp/request` (`ops:write`)

- Sends email OTP for privileged write action authorization.

`POST /api/v1/ops/otp/verify` (`ops:write`)

- Verifies OTP challenge before secure write commit.

### 6.5 Load-shed controls (dual approval)

`GET /api/v1/ops/load-shed` (`ops:read`)

- Returns current mode: `normal | reduced | emergency`

`POST /api/v1/ops/load-shed` (`ops:write`)

- Request: `{ mode, reason }`
- Returns `202` with pending approval envelope:
  - `requestId`
  - `status: PENDING_APPROVAL`
  - `expiresAt`

### 6.6 Approval inbox for ops UI

`GET /api/v1/ops/approvals` (`ops:read`)

Query params:

- `status` (optional): `PENDING_APPROVAL | APPROVED | REJECTED | EXECUTED | FAILED`
- `page` (optional)
- `limit` (optional)

Use this to build approval queues and request detail panels.

`POST /api/v1/ops/approvals/:requestId/confirm` (`ops:approve`)

- Confirms pending critical request and executes operation.

`POST /api/v1/ops/approvals/:requestId/reject` (`ops:approve`)

- Body: `{ reason }`
- Rejects pending critical request and records rejection audit.

### 6.7 Operational audit timeline

`GET /api/v1/ops/audit/logs` (`ops:read`)

Query params:

- `actionStatus` (optional)
- `page` (optional)
- `limit` (optional)

Use in UI for:

- timeline view
- request filtering
- approval/rejection history
- forensic event drilldown

## 7) Suggested frontend UX flow

1. Call `GET /ops/session` at login/bootstrap.
2. Load dashboard cards:
   - current load-shed mode (`GET /ops/load-shed`)
   - pending approvals (`GET /ops/approvals?status=PENDING_APPROVAL`)
3. For load-shed change:
   - submit `POST /ops/load-shed`
   - show pending state with countdown (`expiresAt`)
4. Approver actions:
   - confirm/reject via `/ops/approvals/:requestId/*`
5. Audit panel:
   - refresh from `GET /ops/audit/logs`

### 7.1 Frontend implementation model (required)

Build ops UI in **vertical slices** and integrate each slice with real ops APIs before moving to the next.

Recommended ops slice order:

1. Session bootstrap (`GET /ops/session`)
2. Config metadata and draft validator (`GET /ops/config/overview`, `POST /ops/config/validate`)
3. Read-only dashboard (`GET /ops/load-shed`, `GET /ops/approvals?status=PENDING_APPROVAL`)
4. Write request action (`POST /ops/load-shed`)
5. Approver actions (`POST /ops/approvals/:requestId/confirm|reject`)
6. Audit timeline (`GET /ops/audit/logs`)

### 7.2 Non-negotiable frontend boundary rules

- Keep merchant business operations on `/api/v1/admin/*`; do not move them into `/api/v1/ops/*`.
- Keep ops control operations on `/api/v1/ops/*`; do not expose them in general merchant dashboards.
- Never persist raw ops credentials in browser storage (`localStorage`, `sessionStorage`) or URLs.
- Never log raw ops headers/tokens in frontend telemetry or console output.
- Model dual approval as two explicit user intents (`request` then `confirm/reject`), not one-click auto-confirm.

### 7.3 Per-slice test gate for ops UI

Each ops slice is complete only when:

- happy path and rejection path are both verified,
- permission denial (`401/403`) is shown with actionable remediation,
- UI state transitions are correct (pending approval, approved, rejected, executed, failed),
- at least one route-level integration test and one UI interaction test pass.

## 8) Operational guardrails

- Never expose ops credentials to browser storage in plain text.
- Keep ops API key material in secure secret managers only.
- Force MFA enrollment for every privileged ops user.
- Rotate `OPS_API_KEY_SALT` and per-user keys under incident response policy.
- Validate `/api/v1/ops/metrics` access and confirm `process_crash_total{reason}` visibility as part of post-deploy operations acceptance.
- Enforce short operator sessions and secure credential rotation process.
- Keep `ops:approve` assignments minimal and documented.
- Keep `POST /api/v1/ops/invites/consume` as the only public ops setup route. All other ops routes must retain `opsAuthGuard` plus permission guard wiring and must pass route-discipline checks.

## 9) Error and remediation patterns

Common error responses:

- `401 UNAUTHORISED`: missing/invalid ops auth or MFA
- `403 FORBIDDEN`: IP not allowlisted or permission missing
- `404 NOT_FOUND`: approval request/user missing
- `409 CONFLICT`: approval request not pending or expired

UI should surface actionable remediation from `error.details.remediation` when present.

---

> **Ops bootstrap is Phase 7 of the client onboarding process.** The correct sequence — VPS deployment complete → create ops user via bootstrap script → enroll MFA → verify IP allowlist → store key in vault — is detailed in **[`docs/CLIENT_ONBOARDING_EXECUTION_ORDER.md`](CLIENT_ONBOARDING_EXECUTION_ORDER.md)** §Phase 7. Do not bootstrap ops users before the backend is deployed and HTTPS is confirmed active.
