# Architectural Decisions

> **Format:** each entry is `[date] Title — Decision. Rationale. Alternatives considered. Affects.`

---

## [2026-05-25] System restart drains BullMQ queues with explicit pause + active-count poll + resume, in addition to PENDING_PAYMENT drain

**Context:** Until this change, the `scheduled-process-restart` worker drained only `Order.status='PENDING_PAYMENT'` orders before publishing the restart pub/sub signal. Other BullMQ queues (`notifications`, `shipping`, `refunds`, `inventory-alerts`, `analytics`, `cart-cleanup`, `reconciliation`, `outbox-dispatch`) were left to natural `Worker.close()` drain on `process.exit(0)`. While at-least-once semantics ensured no work was lost (BullMQ stalled-job detection re-queues interrupted handlers on the post-restart workers), this meant:

1. In-flight handlers that were near completion got interrupted and restarted from scratch on the new workers — wasted compute, longer effective downtime.
2. The outbox-dispatch worker could be mid-fan-out when workers exit, leaving the operator unable to easily verify which downstream jobs survived the restart.
3. Operator-facing telemetry to confirm "queues are drained" required reading worker logs across two container generations.

**Decision — Add a two-phase queue pause + active-count drain + resume protocol to the `scheduled-process-restart` handler:**

1. Pause `outbox-dispatch` queue FIRST. This is the primary fan-out producer (the recurring `publish-pending` scheduler that claims rows from the `OutboxMessage` table and adds jobs to every downstream queue). Stopping it first halts the influx of new work.
2. Wait a configurable grace period (default 1500 ms via `RESTART_QUEUE_PAUSE_GRACE_MS`) for any in-flight outbox-dispatch iteration to complete its fan-out.
3. Pause every producer queue except `dead-letter`. The `dead-letter` queue stays active so failure alerts continue to flow during the drain.
4. Poll `Queue.getActiveCount()` on every paused queue every 1 s, waiting for the sum to reach 0. Capped by `RESTART_QUEUE_DRAIN_TIMEOUT_MS` (default 60 s). On timeout, a `ProcessRestartQueueDrainTimeout` alert is sent and the restart proceeds — BullMQ stalled-job detection re-queues any interrupted handlers on the post-restart workers (at-least-once preserved).
5. Run the existing PENDING_PAYMENT drain unchanged.
6. Resume every paused queue BEFORE publishing the restart signal, so post-restart workers boot with queues in resumed state and immediately process the backlog accumulated during the pause window.
7. Publish the restart signal and exit as before.

The protocol is feature-flagged via `RESTART_PAUSE_AND_DRAIN_QUEUES_ENABLED` (default `true`) for emergency rollback to the legacy `PENDING_PAYMENT`-only behaviour without code revert.

**Rationale:**
- Allows in-flight queue handlers to complete naturally (within 60 s) rather than being interrupted and re-run on the new workers. Reduces effective downtime and avoids duplicate work for non-idempotent handlers.
- Makes drain status explicitly observable via `Queue.getActiveCount()` rather than inferring from worker logs across container generations.
- Preserves at-least-once semantics — `Queue.pause()` does not drop jobs, `Queue.add()` calls during the pause window land jobs in waiting state, outbox messages keep accumulating as `PENDING` in the DB.
- Zero impact on storefront browsing: `Queue.pause()` is a queue-layer state in Redis that affects only worker consumption. HTTP serving and DB writes are completely unaffected.

**Alternatives considered:**
- Pause queues but skip the active-count poll, relying solely on stalled-detection retry. Rejected — defeats the point of the change (we want in-flight handlers to *finish*, not get retried).
- Call `Queue.drain()` to remove waiting + delayed jobs before restart. Rejected — drops legitimate work, violates at-least-once contract.
- Stop the outbox-dispatch scheduler permanently and rely on direct `Queue.add()` from API handlers. Rejected — out of scope, transactional outbox pattern is the right design.
- Pause queues but skip the resume step and let new workers resume on boot. Rejected — requires changes to every worker's bootstrap code and creates a race window where the wrong worker resumes first.

**Affects:**
- `backend/queues/workers/cart-cleanup.worker.ts` — added Step 0 (pause + drain) and Step 2.5 (resume) inside the `scheduled-process-restart` handler. Injected `createQueueRegistry`, `queueDrainTimeoutMs`, `queuePauseGraceMs`, `pauseAndDrainQueuesEnabled` deps for testability.
- `backend/queues/workers/cart-cleanup.worker.test.ts` — added 10 new test cases covering pause order, grace period, drain polling, drain timeout, resume-before-publish, queue close, single-pause-failure non-blocking, resume-failure terminal alert, feature flag disable, and registry-creation-failure fallback.
- `backend/docs/HARDENING_HISTORY.md` and `backend/docs/OPS_CONTROL_PLANE_GUIDE.md` — operator documentation of the new protocol, environment variables, and failure modes.

**Validation:**
- Backend typecheck passes.
- `backend npm run test:unit` → 650/650 tests pass across 135 files (28/28 in `cart-cleanup.worker.test.ts`).

---

## [2026-05-25] Idempotent OTP verification retry for critical ops actions + structured restart scheduling failures

**Context:** Operators were blocked by a two-step failure loop on `POST /api/v1/ops/system/restart`:

1. First submit could fail after OTP verification because of transient infra issues (Redis/BullMQ/Prisma), resulting in generic `INTERNAL_ERROR`.
2. Retrying the same UI state immediately then failed with `409 CONFLICT` (`OTP challenge is not pending`) because OTP status was already moved to `VERIFIED` by the first attempt.

This produced a bad operator experience under transient faults and encouraged repeated manual page refresh + OTP request churn.

**Decision 1 — `verifyEmailOtp` supports idempotent retry for VERIFIED challenges:**  
When challenge state is already `VERIFIED`, verification now succeeds if:
- submitted OTP hash matches stored challenge hash, and
- challenge TTL has not expired.

All other non-pending states still return structured conflict with explicit hint keys (`ops_otp_challenge_not_pending`, `ops_otp_challenge_consumed_concurrently`) and remediation.

**Decision 2 — `scheduleRestart` returns structured failure envelopes and performs load-shed rollback:**  
`scheduleRestart` no longer throws raw queue/audit errors. It now emits `AppError(INTERNAL_ERROR, 503)` with specific `hintKey` values:
- `ops_restart_queue_unavailable`
- `ops_restart_load_shed_set_failed`
- `ops_restart_audit_failed`
- `ops_restart_enqueue_failed`

On failures after switching load-shed to `emergency`, the previous mode is restored (best-effort) so the system does not stay degraded due to a failed restart schedule request.

**Rationale:**
- Converts ambiguous UI "something went wrong" into actionable backend contracts.
- Prevents OTP-consumed dead-end after transient failures.
- Preserves payment-safe restart semantics while improving operator recovery time.

**Alternatives considered:**
- Keep strict single-use OTP and force a fresh OTP request after every transient failure. Rejected — operationally noisy and fragile under incident conditions.
- Auto-restart directly from API when queue fails. Rejected — bypasses payment-drain safeguards and weakens restart orchestration guarantees.

**Affects:** `backend/src/modules/ops/ops.service.ts`, `backend/src/modules/ops/ops.service.test.ts`, `backend/docs/OPS_CONTROL_PLANE_GUIDE.md`, `backend/docs/HARDENING_HISTORY.md`.

---

## [2026-05-25] `COMPOSE_FILE` + `COMPOSE_PROJECT_NAME` in VPS `.env` so bare `docker compose` always uses the prod overlay

**Context:** `backend/docker-compose.yml` declares a containerised `postgres` service that publishes port `5432:5432` to the host — needed for local dev where there is no host PostgreSQL, harmful on the VPS where the native PostgreSQL already owns `5432`. The `docker-compose.prod.yml` overlay handles VPS reality by (a) dropping the `postgres` `depends_on` from `backend`/`workers` via `depends_on: !reset` and (b) hiding the `postgres` service behind a `compose-local-postgres-only` profile.

`backend/scripts/vps-deploy.sh` (CD path) already passes `-f docker-compose.yml -f docker-compose.prod.yml -p $CLIENT_ID` explicitly, so automated deploys are correct. Manual ops commands (`docker compose -p <client-id> up -d backend workers`), however, default to the base file only. On a VPS this causes:
1. First attempt: `failed to bind host port 0.0.0.0:5432/tcp: address already in use` because the containerised Postgres collides with the host's native Postgres.
2. Second attempt: Compose reports all containers "Healthy" — but the `<client-id>-postgres` container is only bound to the internal docker bridge network, never to the host port. The backend uses `host.docker.internal:5432` (the real host Postgres). A stale, useless `<client-id>-postgres` container now exists and reappears on every manual restart.

Operators hit this trap whenever they SSH in to do anything outside CD.

**Decision:** Add `COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml` and `COMPOSE_PROJECT_NAME=<client-id>` to `/var/www/<client-id>/backend/.env` on every VPS. Docker Compose v2 reads these special variables from the `.env` in the working directory, so every bare `docker compose ...` command run from that directory automatically merges both files and uses the right project name — `up`, `down`, `ps`, `logs`, `restart`, `pull`, `build`, all of it. No flags to remember; no orphan containers.

The repo `backend/.env.example` ships these lines **commented** with an inline explanation (VPS-only — local dev usually wants only the base file). `backend/scripts/vps-deploy.sh` continues to pass `-f`/`-p` explicitly, so CD is unchanged and the new defaults can be rolled out per-VPS without touching the script.

**Rationale:**
- Single-source-of-truth for the VPS compose configuration (one `.env`, every command picks it up).
- Robust against operator memory — no `-f` flags to forget under pressure.
- No code change required; purely an operational hygiene fix.
- Preserves the asymmetry between local dev (containerised Postgres OK) and VPS (host Postgres mandatory) without making the base compose file behave differently.

**Alternatives considered:**
- Move the `ports: 5432:5432` into a profile in the base `docker-compose.yml`. Rejected — breaks local dev's "just run `docker compose up -d postgres redis`" muscle memory.
- Replace `docker-compose.prod.yml` with a `docker-compose.override.yml` (which Compose auto-loads when present). Rejected — `override.yml` is a magic filename that local devs would inadvertently inherit if they pull the wrong branch, and conflicts with the "two-file explicit" semantics the deploy script uses.
- A `scripts/vps-compose.sh` wrapper. Rejected — yet another file to remember; the `.env` solution requires zero new files.
- Rewriting the deploy script to remove `-f` flags. Rejected — defense-in-depth; the script must work even on a VPS where someone hasn't applied the `.env` change yet.

**Affects:** `backend/.env.example`, `backend/docs/OPS_CONTROL_PLANE_GUIDE.md` (new §6.10 + cross-references), `backend/docs/PHASE7_VPS_DEPLOY_INCIDENT_PLAYBOOK.md` §3, `backend/docs/CLIENT_VPS_SETUP_GUIDE.md` §10 (verification list updated — no `${CLIENT_ID}-postgres` container expected on VPS).

---

## [2026-05-25] Explicit `git pull` of VPS monorepo root as a visible workflow step

**Context:** The `.github/workflows/deploy.yml` deploy jobs (`deploy-backend`, `deploy-frontend`) delegated all git operations to `backend/scripts/vps-deploy.sh` and `backend/scripts/vps-frontend-deploy.sh`. Both scripts pulled at the resolved git root (the monorepo root `/var/www/<client-id>/` for monorepo layouts), but only **after** validating `.env`, `docker-compose.yml`, and `docker-compose.prod.yml` existed. If any preflight check failed, the on-disk source at the monorepo root stayed stale, even though the Actions job appeared to have "run". From the Actions UI alone, an operator could not tell whether the VPS source tree was current.

**Decision:** Promote the monorepo-root pull to an explicit, visible workflow step that runs **before** the deploy script in every job. The step resolves the git root from `VPS_CLIENT_PATH` (or `VPS_FRONTEND_PATH` for the frontend job), runs `git fetch --prune origin main && git pull origin main --ff-only`, and logs the resolved root path plus expected/actual SHA. The deploy script's internal pull stays as defense-in-depth (idempotent on a current tree). Applied to both `.github/workflows/deploy.yml` (monorepo) and `backend/.github/workflows/deploy.yml` (backend-only template) so future client clones inherit it.

**Rationale:**
- Visibility — operators see the resolved root + SHA in the GitHub Actions step log, immediately diagnose stale-clone problems.
- Resilience — a missing `.env` or mis-mounted `docker-compose.prod.yml` no longer blocks the source pull, so the next deploy after a fix has a clean slate.
- `--ff-only` protects against accidental rebase/force-push history landing on the VPS without a conflict signal.

**Alternatives considered:**
- A separate `sync-monorepo-root` job that both deploy jobs `needs:`. Rejected because it adds queue latency on the single-runner case for no benefit — the per-job step is fast and idempotent, and self-hosted runners on a single VPS already process jobs sequentially by default.
- Removing the internal pull from the deploy scripts. Rejected to preserve defense-in-depth: the scripts can also be invoked manually (`bash scripts/vps-deploy.sh ...`) without GitHub Actions, and the internal pull keeps that path self-contained.

**Affects:** `.github/workflows/deploy.yml`, `backend/.github/workflows/deploy.yml`, `backend/docs/GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md`.

---

## [2026-05-25] Incremental Ops config save + boot tolerance for incomplete provider chains

**Context:** During Phase 8 ops bootstrap on Raghava Organics, two related failure modes surfaced:
1. `POST /api/v1/ops/config/save` would reject saves of 1–5 keys with errors like `SMS_PROVIDER is required for the current draft context`, `RAZORPAY_WEBHOOK_SECRET is required…` even though those keys were not part of the submitted batch. Operators could not fill credentials incrementally.
2. After restarting the API to apply saved overlay keys, the API crash-looped on `Missing required env var: RAZORPAY_KEY_ID` (and similar) because `validateConditionalEnv` called `requireEnv` on the full provider chain at boot — even when only the provider selector had been saved so far. Crash-loop → nginx returned 502 on every storefront request.

**Decision 1 — `validateConfigDraft` is batch-scoped.** The validator no longer calls `computeRequiredOpsConfigKeys()` to fail on unrelated missing keys. It validates only the keys present in `values`: allowlist membership, bootstrap rejection, provider enum (when `PAYMENT_PROVIDER`/`SHIPPING_PROVIDER`/`SMS_PROVIDER` is in the batch), and placeholder safety in strict profile. Full go-live coverage stays at `GET /api/v1/health/ready` via `findMissingStrictOpsConfigKeys`.

**Decision 2 — `validateConditionalEnv` is boot-tolerant.** `src/config/app.config.ts` no longer calls `requireEnv` on the full provider dependency chain at startup. Boot now only:
- rejects unsupported `PAYMENT_PROVIDER` / `SHIPPING_PROVIDER` / `SMS_PROVIDER` values (enum check),
- rejects `noop` providers in production-like profiles,
- rejects placeholder values **only for keys that are actually set** (via `assertEnvNotPlaceholderIfPresent`),
- still requires `OPS_DB_ENCRYPTION_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `OTEL_EXPORTER_OTLP_ENDPOINT` (when tracing is enabled) — these are infrastructure-level, not provider-level.

**Decision 3 — CD readiness gate is warning-only.** `backend/scripts/vps-deploy.sh` no longer fails the deploy when `/health/ready` reports `not_ready` or non-empty `runtimeConfigMissingKeys`. It logs a warning and lets the deploy complete. Reason: during Phase 8 the operator is iterating on config; CD must still ship code fixes even when the readiness payload is incomplete. Go-live readiness is verified via the dedicated `BACKEND_GO_LIVE_CHECKLIST.md` / `FRONTEND_AI_GO_LIVE_CHECKLIST.md` gates before opening to customers, not as a per-deploy block.

**Decision 4 — Restart after config save is manual, no automatic prompt.** The ops save response keeps returning `requiresRestart: true`, but the UI no longer claims a restart "prompt" will appear. The frontend `OpsConfigEditor` shows a static info banner linking to `/ops/system` (OTP-protected restart) and documents the VPS `docker compose up -d backend workers` equivalent. There is no modal, popup, or automatic trigger.

**Rationale:** All four changes collapse to one principle — **save/boot/CD should accept incremental state, readiness/go-live checklist enforce completeness.** Mixing those layers caused the Raghava incident: an Ops save was blocked by global readiness requirements, and a boot crash made the site return 502 instead of letting the operator finish setup.

*Alternatives considered:*
- Two endpoints — `/config/save?strict=true` and a lenient `/config/save?incremental=true`. Rejected: more API surface for no real benefit; readiness already provides strictness from a single place.
- Allow CD readiness gate to stay blocking but add a `?bypassReadiness=1` query. Rejected: the gate's purpose is "is this safe to serve traffic" — that's a go-live decision, not a per-deploy decision.

*Affects:* `src/modules/ops/ops.service.ts` (`validateConfigDraft`), `src/config/app.config.ts` (`validateConditionalEnv`, `validateProductionProviderSafetyEnv`, new `assertEnvNotPlaceholderIfPresent`), `backend/scripts/vps-deploy.sh`, `frontend/components/ops/OpsConfigEditor.tsx`, `frontend/components/shared/BackendStatus.tsx`, `backend/src/modules/ops/ops.service.test.ts`, `backend/src/config/app.config.test.ts`, docs (`OPS_CONTROL_PLANE_GUIDE.md`, `ENV_VS_DB_CONFIG_REFERENCE.md`, `HARDENING_HISTORY.md`, `PHASE7_VPS_DEPLOY_INCIDENT_PLAYBOOK.md`, `BACKEND_GO_LIVE_CHECKLIST.md`, `FRONTEND_AI_GO_LIVE_CHECKLIST.md`, `GITHUB_CD_SELF_HOSTED_RUNNER_GUIDE.md`).

---

## [2026-05-24] Ops OTP action binding, batch config save, readiness 503 payload

**Decision 1 — OTP challenges are bound to a single critical `action`.**  
`POST /api/v1/ops/otp/request` accepts only `config-save`, `load-shed-change`, `user-deactivate`, `system-restart`, `invite-revoke`. Each critical mutation passes `expectedAction` into `verifyEmailOtp()`; reusing a challenge across operations returns `403 FORBIDDEN`.  
*Rationale:* Prevents a challenge issued for a low-risk action from authorising a higher-risk mutation.

**Decision 2 — `POST /api/v1/ops/config/save` supports optional `domain` and overlay deactivation.**  
When `domain` is omitted, each key's domain is resolved from `ops-config-contract.ts`. Empty/null values set `OpsConfigSecret.isActive = false` instead of storing blank ciphertext.  
*Rationale:* One OTP flow can persist cross-domain go-live keys; operators can clear rotated secrets without DB deletes.

**Decision 3 — `/health/ready` returns diagnostic payload on 503.**  
Not-ready responses use `error.code: CONFIG_NOT_READY` and include the full readiness object in envelope `data` so CD scripts and ops UI can read `runtimeConfigMissingKeys` without custom error parsing.

---

## [2026-05-21] Admin permissions required at invite creation; queue routes moved to ops plane

**Decision 1 — `permissions` is now required at admin invite creation.**  
Removed the silent `MERCHANT_DEFAULT_PERMISSIONS` fallback from `normalizeInvitePermissions`. Ops must now explicitly declare every permission when creating an admin invite via HTTP (`POST /admin/invites`) or `admin-newuser.mjs`. An invite with an empty or missing `permissions` array is rejected at schema validation.  
*Rationale:* The previous silent fallback was a privilege escalation footgun — forgetting to specify permissions accidentally created a fully-privileged merchant admin. Explicit-only provisioning is consistent with the fail-closed model used everywhere else.

**Decision 2 — `queues:inspect` removed from admin permission surface; queue inspection moved to ops plane.**  
`queues:inspect` has been removed from `ADMIN_PERMISSIONS` and all dependent sets. The BullMQ dashboard and DLQ summary routes have moved from `/api/v1/admin/queues/*` to `/api/v1/ops/queues/*`, guarded by `opsAuthGuard + opsPermissionGuard('ops:read')`.  
*Rationale:* Queue inspection is a developer/platform concern, not a merchant business concern. Admin users are merchant operators; they have no need to see job counts, failed job payloads, or dead-letter breakdowns. Placing these routes on the ops plane aligns with the principle that ops = platform control, admin = business control.  
*Alternatives considered:* Keeping the route on admin but restricting it to a new `platform:inspect` permission — rejected because it adds a permission type for a single route and keeps developer tooling mixed into the merchant panel.

---

## [2026-05-21] Final route-guard audit — print-label classification, analytics replay guards, permission-set completeness

**Context:** Systematic audit of every admin POST/PATCH/DELETE route revealed three gaps: (1) `POST /admin/orders/:id/print-label` was configured as a read route despite mutating DB state; (2) two analytics replay-preview POST routes were throttled at read-level; (3) `MERCHANT_INVITE_ALLOWED_PERMISSIONS`, `ops-newuser.mjs`, and `admin-newuser.mjs` had stale or incomplete permission sets.

**Decision 1 — `print-label` uses `orders:read` permission but `adminWrite` rate limit and idempotency guards:**

Permission (`orders:read`) governs *who is authorised* — any admin who can view orders should be able to request a label; no separate elevated grant is needed. Rate limit and idempotency guards govern *what the operation does* — `adminPrintLabel()` calls an external courier provider and then executes `prisma.shipment.update({ data: { labelUrl } })`, mutating DB state. Treating it as a read-level operation left it vulnerable to duplicate external provider calls and unthrottled replay. The rule "permission reflects access level, rate limit and middleware reflect operation risk" is now explicit in this codebase.

*Alt: elevate permission to `orders:write` (rejected — unnecessarily restricts read-only admins who legitimately need to print labels; the permission/guard split is the correct model here).*

**Decision 2 — Analytics replay-preview routes use `adminWrite` rate limit + `idempotencyPreHandler`:**

`POST …/replay-preview` routes enqueue a BullMQ preview job — they are POST routes with side effects, not reads. Using `adminRead` throttle allowed higher replay frequency than intended. Corrected to `adminWrite` + `idempotencyPreHandler` to deduplicate replay submissions.

*Alt: keep as read throttle with a note (rejected — observable side effect; correct throttle level is mandatory for all mutating routes).*

**Decision 3 — `queues:inspect` removed entirely; queue routes moved to ops plane (supersedes earlier patch):**

`queues:inspect` no longer exists as an `AdminPermission`. It has been removed from `ADMIN_PERMISSIONS`, `ADMIN_CONTROL_POLICY_REGISTRY`, `MERCHANT_INVITE_ALLOWED_PERMISSIONS`, `merchantAdminPermissionSchema`, and all bootstrap scripts. The two queue routes (`GET /api/v1/admin/queues`, `GET /api/v1/admin/queues/dlq/summary`) have moved to `GET /api/v1/ops/queues` and `GET /api/v1/ops/queues/dlq/summary`, guarded by `opsAuthGuard + opsPermissionGuard('ops:read')`. Queue inspection is a developer/platform concern — not a merchant admin concern. See the `[2026-05-21] Admin permissions required at invite creation` ADR for full rationale.

*Alt: keep `queues:inspect` as a grantable admin permission (rejected — developer tooling does not belong in the merchant admin permission surface; the separation of concerns is cleaner with all queue ops behind the ops plane).*

*Affects:* `src/modules/orders/orders.routes.ts`, `src/modules/analytics/analytics.routes.ts`, `src/modules/auth/admin-invites.service.ts`, `scripts/ops-newuser.mjs`, `scripts/admin-newuser.mjs`, `docs/HARDENING_HISTORY.md`, `docs/ROUTE_SURFACE_COMPLETE_REFERENCE.md`, `docs/API_ENDPOINT_INDEX.md`.

---

## [2026-05-20] Mock-detection dance elimination — Round 11 & 12 (P13–P21)

Final sweep removing all legacy compatibility shims that conditionally branched on whether a Prisma delegate exposed `updateMany`. These patterns originated from the May 2026 Race-Condition Audit where test mocks didn't initially implement `updateMany`, so production code fell back to single-row `update`. The mocks have since been updated; the shims are now dead code and a maintenance hazard.

**Decisions:**
- **Eliminate all `if (delegate.updateMany)` / `preferUpdateForMock` patterns:** Dead code; all real Prisma delegates and all current test mocks provide `updateMany`. Keeping them obfuscates the true code path, silently degrades atomicity guarantees in test environments, and makes future test authors think `update` fallback is intended. *Alt: keep shims indefinitely (rejected — permanent dead code + misleading fallback semantics).*
- **Call `updateMany` unconditionally everywhere:** `consumeOpsInvite`, `verifyEmailOtp` (both expiry and success paths), `revokeOpsInvite`, `auth.service.ts` refresh token — all now use direct `updateMany` with 409 on `count === 0`. Consistent with `deactivateOpsUser`, `resolveActiveOpsInviteOrThrow`, `createOpsInvite`, and every invite consumption path across the codebase.
- **Fix test harness instead of reverting service code:** The four failing tests (`admin-invites.service.test.ts`) used stale assertions referencing the old `update`-based API and a `tx` mock that only provided `adminUserInvite.update`. Updated harness to match the service: `tx.adminUserInvite.updateMany` (returns `{ count: 1 }`), and all assertions migrated to `adminUserInviteUpdateMany`. *Alt: revert service to use `update` to match old tests (rejected — would re-introduce TOCTOU races; tests must follow the production code, not the reverse).*
- **OTP `pattern` constraint on all 7 input fields:** `verifyOtpSchema`, `signupPhoneSchema`, `adminInviteConsumeSchema`, and `ops.routes.ts` `otpCode` now all enforce `'^[0-9]{6}$'`. Previously some fields only had `minLength`/`maxLength`, allowing non-numeric strings (e.g. `"abcdef"`) to pass schema validation and reach the OTP hash-comparison logic. Pattern enforcement rejects these at the Fastify schema layer before any service code runs. *Alt: rely on hash comparison alone (rejected — schema is the outermost input gate; defence in depth).*

*Affects:* `src/modules/ops/ops.service.ts`, `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.schemas.ts`, `src/modules/auth/admin-invites.service.test.ts`, `src/modules/ops/ops.routes.ts`, `docs/HARDENING_HISTORY.md`.

---

## [2026-05-20] Ops service final CAS hardening — GAP-3, GAP-4, GAP-5

Final production-readiness pass on `ops.service.ts`: three gaps in atomic state-transition correctness and audit-trail integrity.

**Gap decisions:**
- **GAP-3 — `resolveActiveOpsInviteOrThrow` hard-delete replaced with `EXPIRED_CLEANED` update:** Hard-deleting expired invites destroys the audit trail — `GET /ops/invites?status=EXPIRED_CLEANED` cannot surface invites expired via the inline path. This is inconsistent with both `cleanupExpiredInvites` (which already uses `updateMany`) and `AdminInvitesService.resolveActiveInviteOrThrow` (same pattern). Using `updateMany` with `EXPIRED_CLEANED` preserves forensic records and makes invite lifecycle status queryable across all paths. *Alt: leave hard-delete as-is (rejected — destroys audit trail and creates path inconsistency).*
- **GAP-4 — `deactivateOpsUser` CAS `updateMany`:** Plain `update` after a non-atomic `isActive` read allows two concurrent deactivation requests (e.g. two operator sessions racing) to both succeed silently. The second update is a no-op data-wise but does not signal the race — the caller receives a false `{ deactivated: true }`. CAS `updateMany({ where: { isActive: true } })` with a zero-count check converts this into an explicit `409 CONFLICT`, making the race observable and preventing silent double-acknowledgements. *Alt: advisory lock (rejected — infra dependency); optimistic retry (rejected — wrong semantics; deactivation is idempotent only for the first caller).*
- **GAP-5 — `rotateOpsUserKey` CAS `updateMany`:** *(Superseded — `rotateOpsUserKey` has since been deleted along with the API key auth path. This entry is retained for historical reference.)* Same pattern as GAP-4. A concurrent deactivation racing a key rotation could result in a key being rotated for a user who was simultaneously deactivated. CAS `updateMany({ where: { isActive: true } })` guaranteed rotation fails if deactivation won the race.

**Interface decisions:**
- `OpsPrismaLike.opsUser.updateMany` added: required for GAP-4/GAP-5. Aligns `opsUser` with `opsUserInvite` and `opsOtpChallenge` which already had `updateMany`.
- `OpsPrismaLike.opsUserInvite.delete`/`deleteMany` removed: no code path hard-deletes invites anymore. Removing them from the interface enforces this at compile time — any future regression will fail the type-checker. *Alt: leave dead declarations (rejected — dead interface surface invites future misuse).*

**Test harness decisions:**
- All three new `updateMany` mocks (`opsUserUpdateMany`, `opsUserInviteUpdateMany`, `opsOtpChallengeUpdateMany`) return `{ count: 1 }` by default so happy-path tests don't need to set up the mock explicitly.
- `opsUserInvite.count` added to harness defensively (used by `listOpsInvites`; absent mock would cause `TypeError` if any future test calls that method).

*Affects:* `src/modules/ops/ops.service.ts`, `src/modules/ops/ops.service.test.ts`, `docs/HARDENING_HISTORY.md`.

---

## [2026-05-20] Admin/ops deep-dive hardening — gaps A–L + BR-NOTIF-05 completion

Comprehensive production-readiness audit of all `/admin` and `/ops` routes, services, guards, and error paths. Twelve gaps patched across two rounds followed by a full BR-NOTIF-05 alert-coverage sweep.

**Gap decisions:**
- **A — `revokeOpsInvite` status `CANCELLED`:** Revoked invites must be distinguishable from `EXPIRED_CLEANED` in audit logs and UI. Using a separate enum value prevents false positive "expired" interpretations of intentional revocations. *Alt: single EXPIRED status (rejected — loses the operator-intent signal).*
- **B — `listAuditLogs` `actionType` in select/return:** `actionType` was omitted from `select`, so the field was silently dropped before reaching the caller. Response schema and service type both updated to guarantee the field is always present. Required for frontend audit timeline filtering.
- **C — `rejectLoadShedChange` `approvedByOpsUserId` removed:** The field name `approvedByOpsUserId` is semantically incorrect on a rejection audit log — the rejector is not an approver. Removed to avoid misleading forensic reads.
- **D — `verifyLoginOtp` service-layer IP allowlist:** Guard-layer IP check can be bypassed if OTP is obtained from an allowlisted IP and session is then issued from a different IP on the same Redis OTP. Service-layer check ensures session issuance from a non-allowlisted IP is blocked regardless of guard timing.
- **E — `verifyLoginOtp` audit on failure:** Failed OTP attempts were silent in the audit chain — impossible to detect brute-force attempts in the audit log. Now emits `OTP_CHALLENGE_FAILED / FAILED` entry on every failed verification.
- **F/J — Explicit `select` on `listOpsUsers` + `getOpsUserById`:** Prisma default-select returns all columns including `apiKeyHash`, `apiKeyId`, `mfaSecretEncrypted`. Explicit `select` on both methods ensures no credential material can leak even if serializer guards are misconfigured.
- **K — `/ops/audit/logs` `actionType` querystring + response schema:** Missing from route schema meant `actionType` was stripped by Fastify serializer even though the service now returns it; the filter was also unwired. Fixed both — schema and handler are now consistent.
- **L — `validateConfigDraft` `ENV_READ` not `ENV_UPDATE`:** Dry-run validation does not write config. Logging `ENV_UPDATE` would produce false-positive config-change audit entries. Corrected to `ENV_READ`. `ENV_UPDATE` is reserved exclusively for `saveConfigDraft`.

**BR-NOTIF-05 gap decisions:**
- **`inventory.service.ts` adjustment history:** `inventoryAdjustment.create` failure silently swallowed — no ops/admin notification. Added alert. Best-effort (fire-and-forget `void`) to match pattern of surrounding non-critical writes.
- **`main.ts` restart subscriber error:** Redis error on the restart subscriber means restart signals will not be received — the system is stuck until manually restarted. This qualifies as a critical infra failure requiring immediate ops notification. *Alt: let it remain a warn-only log (rejected — operators would not know the restart channel is broken).*

*Affects:* `src/modules/ops/ops.service.ts`, `src/modules/ops/ops.routes.ts`, `src/modules/auth/admin-invites.service.ts`, `src/modules/auth/auth.routes.ts`, `src/modules/inventory/inventory.service.ts`, `src/main.ts`, `docs/ROUTE_SURFACE_COMPLETE_REFERENCE.md`, `docs/OPS_CONTROL_PLANE_GUIDE.md`, `docs/HARDENING_HISTORY.md`, `TRD.md`.

---

## [2026-05-18] Ops process restart route + pre-exit alert notification

Adds `POST /api/v1/ops/system/restart` to the ops control plane and a proactive pre-exit alert so developers are notified before the process exits.

- **Route:** `POST /api/v1/ops/system/restart` (`ops:write`). Body: `{ delayMinutes, challengeId, otpCode }` (0–1440 minutes, requires OTP). Returns `{ jobId, scheduledFor }`. `delayMinutes=0` = restart as soon as the BullMQ worker picks up the job. Positive values defer the restart. Max 1440 minutes (24 hours).
- **BullMQ job:** `scheduleRestart` in `ops.service.ts` enqueues a `scheduled-process-restart` job in the `cartCleanup` queue with `delay: delayMs`. Job ID is `ops-restart:<uuid>`. The job **persists in Redis and survives ops user logout** — a scheduled restart fires regardless of whether any session is active at execution time.
- **Worker handler (`cart-cleanup.worker.ts`):** When the job fires: (1) **payment-safe drain** — polls `prisma.order.count({ where: { status: 'PENDING_PAYMENT' } })` every 5 s until count = 0 or drain timeout elapses (default 5 min, override via `RESTART_PAYMENT_DRAIN_TIMEOUT_MS`); if timeout fires with pending orders, emits a drain-timeout `sendTechnicalFailureAlert` (`terminalFailure: false`) and proceeds; (2) calls `sendProcessRestartAlert()` (wrapped in its own `try/catch` — never blocks restart); (3) creates a short-lived ioredis publisher and calls `publishRestartSignal()` on the `system:restart` Redis pub/sub channel — if publish throws, emits a publish-failure `sendTechnicalFailureAlert` (`terminalFailure: true`) alerting ops that the API process requires manual restart; (4) unconditionally calls `process.exit(0)` to exit the worker process. Docker restarts the `workers` container.
- **API process subscriber (`src/main.ts`):** After `fastify.listen()`, the API process creates a dedicated ioredis subscriber connection and subscribes to `system:restart`. On receipt, it calls `fastify.close()` (which drains all in-flight HTTP requests via Node `server.close()`) then `process.exit(0)`. Docker restarts the `backend` container. This is what actually applies the new config to the HTTP layer.
- **Worker process subscriber (`queues/workers/index.ts`):** `bootstrapWorkers()` creates a `workerRedis.duplicate()` subscriber after all workers are started. On receipt of the same `system:restart` message, it calls `shutdown()` (gracefully closes all 10 BullMQ workers and all queue connections) then `process.exit(0)`. Docker restarts the `workers` container.
- **Shared restart module (`src/common/restart/system-restart.ts`):** Single source of truth for `SYSTEM_RESTART_CHANNEL`, `RestartSignalPayload` type, and `publishRestartSignal()`. All three files import from here.
- **Active user safety:** `fastify.close()` drains in-flight HTTP requests before exit. Cart/order state is Postgres-durable — no data loss for users mid-browse or mid-checkout. Mid-payment users are safe — Razorpay retries webhooks and the idempotency record pattern deduplicates any retry. BullMQ jobs are durable in Redis — in-flight jobs re-queue on worker restart. Downtime window is ~3–5s.
- **Pre-exit alert (`sendProcessRestartAlert`):** Best-effort email to all recipients. Wrapped in its own independent `try/catch` — a send failure never blocks the restart signal publish or `process.exit(0)`.
- **Payment drain timeout (`RESTART_PAYMENT_DRAIN_TIMEOUT_MS`):** Env var override for the default 5-minute payment drain timeout. Set to a smaller value (e.g. `10000`) in test/staging environments to avoid long waits. Poll interval is fixed at 5 s.
- **Failure alerting:** Two distinct failure paths: (a) drain timeout — `terminalFailure: false`, restart proceeds and may need manual order reconciliation; (b) publish failure — `terminalFailure: true`, worker exits but API process must be restarted manually. Both alerts use `failureStage: PROCESS_RESTART`.
- **Testability deps:** `createCartCleanupWorker` accepts `createPublisher`, `sleep`, and `paymentDrainTimeoutMs` as injectable deps so tests can mock Redis, control sleep timing, and force timeout scenarios without real infrastructure.
- **New email template `ProcessRestartAlert`:** Separate from `NotificationDeliveryFailure` to avoid the recursive-alert guard. Subject: `[ACTION REQUIRED] Process restart triggered — <clientName>`.
- **`TechnicalFailureStage` extended:** Added `PROCESS_RESTART`.
- **Audit:** `CONTAINER_RESTART` `OpsActionType` logged immediately on scheduling via `appendAuditLog`.
- **Policy registry:** Route registered at `POST /api/v1/ops/system/restart` with `ops:write` permission.

- **Gap fixes (May 2026 audit):** Three gaps were identified and patched post-implementation: (1) `RESTART_PAYMENT_DRAIN_TIMEOUT_MS` was absent from `scripts/env-runtime-contract.js` (`envExampleRequired` + `composeRequiredByService.workers`) — CI parity gate would have failed; (2) `docker-compose.yml` `workers` service had no `RESTART_PAYMENT_DRAIN_TIMEOUT_MS` environment entry — per project rule every new env var must appear in `docker-compose.yml`; (3) `restartSubscriber` ioredis connection was leaked on SIGINT/SIGTERM in both `src/main.ts` and `queues/workers/index.ts` — subscriber was only closed inside the restart-message handler `.finally()`, not on normal signal shutdown. Fixed by hoisting `restartSubscriber` declaration before each `shutdown()` / `gracefulShutdown()` function and including `restartSubscriber?.quit()` in the Redis cleanup block of each shutdown function.

*Alt: Restart via SSH/Docker CLI only (rejected — no audit trail, no scheduling, not accessible from ops UI); alert blocks exit until send confirmed (rejected — if Resend is down the server would never restart); direct SIGTERM to API PID from worker (rejected — PIDs differ across containers; no shared IPC without extra infrastructure); single-process restart only (rejected — worker container must also restart to pick up new config); block restart indefinitely until payments clear (rejected — could deadlock if Razorpay webhook never fires; timeout + alert is the correct trade-off).* **Affects:** `src/common/restart/system-restart.ts` (new), `src/main.ts`, `queues/workers/index.ts`, `queues/workers/cart-cleanup.worker.ts`, `queues/workers/cart-cleanup.worker.test.ts`, `src/modules/ops/ops.routes.ts`, `src/modules/ops/ops.service.ts`, `src/modules/notifications/notification-failure-alert.ts`, `src/modules/notifications/templates/email-template-components.ts`, `src/modules/notifications/templates/email-templates.ts`, `src/common/auth/admin-endpoint-policy-registry.ts`, `src/modules/ops/ops.routes.test.ts`, `scripts/route-discipline-check.js`, `scripts/env-runtime-contract.js`, `docker-compose.yml`, `docs/API_ENDPOINT_INDEX.md`, `docs/OPS_CONTROL_PLANE_GUIDE.md`, `docs/ROUTE_SURFACE_COMPLETE_REFERENCE.md`, `docs/HARDENING_HISTORY.md`, `docs/ENV_VS_DB_CONFIG_REFERENCE.md`.

---

## [2026-05-18] Admin login migrated to 2-step email OTP flow — TOTP removed

Replaced the single-step `POST /api/v1/auth/admin/login` (password-only) + TOTP MFA flow with a mandatory 2-step email OTP flow. TOTP/authenticator-app MFA has been fully removed from the admin auth path.

- **Step 1 — `POST /api/v1/auth/admin/login/request-otp` (public):** Body: `{ email, password }`. Verifies credentials against the admin account. On success, generates a 6-digit time-limited OTP (TTL 300 s), stores it hashed in Redis, and sends it to the admin's registered email. Returns `{ expiresAt }`. Does **not** issue a JWT. Anti-enumeration: generic error on credential failure.
- **Step 2 — `POST /api/v1/auth/admin/login/verify-otp` (public):** Body: `{ email, otp }`. Verifies OTP against the active challenge (max 5 attempts before lockout). On success, issues JWT access token (short-lived) + refresh token (sets `httpOnly` secure cookie). Returns `{ accessToken, admin }`. Anti-enumeration: generic error on OTP failure.
- **TOTP removal:** `User.mfaSecretEncrypted`, `User.mfaEnabled`, and all TOTP-related service methods (`setupAdminMfa`, `confirmAdminMfaSetup`, `disableAdminMfa`, `verifyAdminMfa`) remain in the schema and service as legacy fields — they are retained for data-migration safety but the login flow no longer uses them. `ADMIN_MFA_ENCRYPTION_KEY` and `ADMIN_MFA_ENFORCE` env vars have been fully removed from the codebase.
- **Rationale:** Email OTP is simpler to operate (no authenticator-app provisioning step for merchant admins), eliminates TOTP backup-code complexity, and reuses the same OTP infrastructure already in place for ops browser login. The 2-step model preserves security (credential check + out-of-band OTP challenge) without adding device dependencies.
- **`ADMIN_MFA_ENFORCE` env var:** Removed from the codebase. Email OTP challenge is always mandatory in the 2-step flow.

*Alt: Keep TOTP MFA with optional email-OTP fallback (rejected — two parallel MFA paths create provisioning and support complexity); remove MFA entirely (rejected — admin login must have an out-of-band second factor); TOTP mandatory (rejected — TOTP provisioning is a friction point for non-technical merchant admins).* **Affects:** `src/modules/auth/auth.routes.ts`, `src/modules/auth/auth.service.ts`, `src/modules/auth/admin-invites.service.ts`, `src/modules/auth/auth.schemas.ts`, `docs/ROUTE_SURFACE_COMPLETE_REFERENCE.md` §3, `docs/OPS_CONTROL_PLANE_GUIDE.md`, `docs/BACKEND_GO_LIVE_CHECKLIST.md` §2.3.

---

## [2026-05-18] Ops browser login — email OTP + httpOnly cookie session

Adds a secure browser-based login flow for the ops control plane UI. The API-key-header path was subsequently removed (see May 2026 API key path removal entry below); browser session is now the **only** auth path.

- **Flow:** `POST /ops/auth/login/request-otp` (public, rate-limited `authSensitive`) sends a 6-digit OTP to the registered ops user email via the existing `OpsActionOtp` notification template. OTP hashed (SHA-256) and stored in Redis with TTL (`OPS_LOGIN_OTP_TTL_SECONDS`, default 300s). **Anti-enumeration:** response is identical regardless of whether the email is registered.
- **Verification:** `POST /ops/auth/login/verify-otp` (public) checks the hashed OTP; after 5 failed attempts the OTP is invalidated. On success, a `opssess_` session token is generated, stored hashed in Redis (`ops:browser-session:<hash>`) with TTL (`OPS_BROWSER_SESSION_TTL_SECONDS`, default 3600s), and set as an `httpOnly; SameSite=Strict; path=/api/v1/ops` cookie (`ops_session`). Plaintext token never stored anywhere.
- **Guard:** `opsAuthGuard` checks `ops_session` cookie → resolves Redis session → **live `isActive` DB check** (catches deactivation immediately) → attaches `request.opsUser`.
- **Logout:** `POST /ops/auth/logout` (guarded `ops:read`) deletes the Redis session key, clears the cookie, and audit-logs `OPS_USER_LOGGED_OUT`.
- **New `OpsActionType` enum values:** `OPS_USER_LOGGED_IN`, `OPS_USER_LOGGED_OUT` via migration `20260518193000_ops_browser_login`.
- **New env vars:** `OPS_COOKIE_SECRET` (cookie signing secret), `OPS_BROWSER_SESSION_TTL_SECONDS`, `OPS_LOGIN_OTP_TTL_SECONDS`. All in `env-runtime-contract.js` backend service list.

*Alt: JWT short-lived tokens in localStorage (rejected — XSS risk); persistent DB sessions (rejected — no TTL enforcement, harder to revoke); single-path API key only (rejected — unusable in browser without secret exposure).* **Affects:** `src/common/plugins/cookie.plugin.ts`, `src/main.ts`, `src/modules/ops/ops.service.ts`, `src/modules/ops/ops.routes.ts`, `src/common/guards/ops-auth.guard.ts`, `prisma/schema.prisma`, `prisma/migrations/20260518193000_ops_browser_login/migration.sql`, `src/common/auth/admin-endpoint-policy-registry.ts`, `scripts/env-runtime-contract.js`, `.env.example`, `docs/API_ENDPOINT_INDEX.md`.

---

## [2026-05-18] Ops control plane expanded — user management, invite management, OTP visibility, audit filter

Extended the ops control plane with full lifecycle management capabilities for operators and invites:

- **Invite management (`GET /ops/invites`, `POST /ops/invites/:inviteId/revoke`):** Ops users with `ops:read` can now list all invites with status/pagination filters. `ops:write` holders can revoke pending (CREATED/EMAIL_SENT) invites before consumption. Revocation uses a CAS `updateMany` guard matching the existing invite-consumption atomicity pattern — concurrent consume races return `409 CONFLICT` rather than silently succeeding. Audit logged as `INVITE_REVOKED`. Replaces the previous manual-DB-only incident response path.
- **Ops user management (`GET /ops/users`, `GET /ops/users/:opsUserId`, `POST .../deactivate`):** `ops:read` can enumerate and inspect all ops users (credentials never returned). `ops:write` can deactivate a user (self-deactivation blocked with `403`; already-deactivated returns `409`). Mutations audit logged (`USER_DEACTIVATED`). *(Note: `POST .../rotate-key` was also added here but has since been removed along with the API key auth path.)*
- **OTP pending visibility (`GET /ops/otp/pending`):** `ops:read` can list the caller's currently active (PENDING, non-expired) OTP challenges. Supports UI countdown badges and debugging stuck challenge state.
- **Audit log `opsUserId` filter (`GET /ops/audit/logs?opsUserId=`):** Added actor-scoped filtering to the tamper-evident audit chain endpoint. Critical for incident investigation — fetch all actions taken by a compromised operator in a single query.
- **`ops/config/validate` permission corrected:** Route was incorrectly guarded with `ops:write`; changed to `ops:read` to match its read-only dry-run contract. Policy registry and rate-limit profile updated consistently.
- **New `OpsActionType` enum values:** `INVITE_REVOKED`, `USER_DEACTIVATED`, `USER_KEY_ROTATED` added to Prisma schema and applied via migration `20260518120000_ops_user_mgmt_routes`. *(Note: `USER_KEY_ROTATED` has since been removed from the enum — superseded by the May 2026 API key path removal.)*

*Alt: manual DB intervention for compromised operator (rejected — no audit trail, not role-gated, error-prone); single "ops admin" superuser role for all lifecycle operations (rejected — violates least-privilege; all mutations use `ops:write`).* **Affects:** `src/modules/ops/ops.routes.ts`, `src/modules/ops/ops.service.ts`, `prisma/schema.prisma`, `prisma/migrations/20260518120000_ops_user_mgmt_routes/migration.sql`, `src/common/auth/admin-endpoint-policy-registry.ts`, `src/modules/ops/ops.routes.test.ts`, `docs/API_ENDPOINT_INDEX.md`, `docs/OPS_CONTROL_PLANE_GUIDE.md`, `docs/ROUTE_SURFACE_COMPLETE_REFERENCE.md`.

---

## [2026-05-17] Per-template primary notification channel — DB-backed with no fallback

Per-template primary notification channel configuration moved from environment variables to DB-backed `StoreSettings.primaryNotificationChannels` JSON field. Each of the 13 supported templates (`OrderConfirmed`, `PaymentFailed`, `OrderShipped`, `OutForDelivery`, `OrderDelivered`, `OrderCancelled`, `LowStockAlert`, `OtpVerification`, `NotificationDeliveryFailure`, `PasswordReset`, `AdminInviteSetup`, `OpsInviteSetup`, `OpsActionOtp`) can be independently configured with primary channel `EMAIL`, `SMS`, or `WHATSAPP`. No fallback to alternate channels — if the configured primary channel fails (disabled, missing credentials, provider error), notification fails immediately and triggers alert.

- **DB storage:** `StoreSettings.primaryNotificationChannels` stores mapping as `{ "TemplateName": "EMAIL" | "SMS" | "WHATSAPP" }`. Schema migration adds JSONB column with nullable default.
- **Settings contract:** `NotificationSettingsResponse` and `UpdateNotificationSettingsInput` extended with `primaryChannels: Record<string, PrimaryNotificationChannel>`. Admin UI calls `GET /api/v1/admin/settings/notifications` to read current mapping and `PATCH` with `primaryChannels` payload to update.
- **Normalization:** `SettingsService.normalizePrimaryChannels()` validates template names against `supportedEmailTemplates` registry and channel values against `EMAIL | SMS | WHATSAPP` enum. Invalid entries ignored; missing templates default to `EMAIL`.
- **Worker routing:** `send-primary` job handler in `notifications.worker.ts` resolves channel from DB mapping via `flags.primaryChannels` (fetched in `resolveEffectiveNotificationFlags()`). Removed dependency on `NOTIFY_PRIMARY_CHANNEL` and `NOTIFY_PRIMARY_CHANNEL_OVERRIDES` environment variables.
- **No fallback enforcement:** Worker dispatches only to the resolved primary channel. If that channel is disabled or provider unavailable, job fails with `NotificationLog` status `FAILED` and emits `sendNotificationFailureAlert`. No automatic retry on alternate channels.
- **Alerting on failure:** All notification delivery failures emit structured alerts to active Ops identities and verified Admin users per the system-wide alerting rules.

*Alt: Global primary channel env var with per-template overrides (rejected — env-driven config contradicts DB-backed runtime config pattern already established for `smsTemplates` and ops secrets); fallback to secondary channel (rejected — violates explicit merchant intent when they select SMS/WhatsApp as primary).* **Affects:** `prisma/schema.prisma`, `settings.types.ts`, `settings.schemas.ts`, `settings.service.ts`, `notifications.worker.ts`, `email-templates.ts`, `ops-config-contract.ts` (removed `NOTIFY_PRIMARY_CHANNEL` keys).

---

## [2026-05-17] System-wide technical failure alerting — centralised email pipeline

All technical error paths across `src/modules/`, `src/common/plugins/`, `queues/workers/`, and process-level handlers now emit structured alerts via `sendTechnicalFailureAlert()` to active Ops identities and verified Admin users. Notification-specific failures use `sendNotificationFailureAlert()` for backward-compatible channel-aware alerting.

- **Failure stage taxonomy:** Ten stages categorise every alert for routing and prioritisation. Severity tiers: `critical` (always delivered, never deduped for terminal events), `high` (delivered, deduped per cooldown window), `suppressed` (never emailed — logged only).
  - `PROCESS_RESTART` — `critical` — unhandled rejection / uncaught exception at process boundary.
  - `WORKER_TERMINAL` — `critical` — BullMQ job exhausted all retries.
  - `WEBHOOK_PROCESSING` — `critical` — inbound webhook verification or processing failure.
  - `PROVIDER_RUNTIME` — `critical` — third-party provider (Razorpay, Resend, etc.) runtime error.
  - `WORKER_STALL` — `high` — BullMQ job stalled (lock expired, worker silently crashed mid-job); operationally significant as it signals silent job loss without exhausting retries.
  - `ROUTE_HANDLER` — `high` — HTTP handler caught exception.
  - `QUEUE_ENQUEUE` — `high` — BullMQ enqueue failure.
  - `OUTBOX_DISPATCH` — `high` — outbox publish or dispatch failure.
  - `CORE_LOGIC` — `high` — infrastructure or business-logic errors (Redis, BullMQ scheduler, audit chain); **promoted from `suppressed`** — these represent silent infra failures that require ops visibility.
  - `WORKER_DELIVERY` — `suppressed` — individual non-terminal job failure; already recorded in `NotificationLog`, email noise not warranted.
- **DB-first metadata:** `resolveClientMetadata()` reads `StoreSettings.storeName` and `StoreSettings.websiteUrl` from DB with env fallbacks (`STORE_LEGAL_NAME`, `STOREFRONT_URL`), ensuring alert emails carry client-identifying context.
- **Recipient scope:** Alerts deliver to all active ops identities (`opsUser.isActive = true`) and verified admin users (`User.role = ADMIN`, `User.isVerified = true`, email present). This ensures platform operators and merchant admins both receive critical failure notifications.
- **Transport resilience:** Alert sending is best-effort — transport failures are intentionally swallowed to prevent cascading failures from alert infrastructure itself.
- **Worker integration:** `attachWorkerLogging` extended with `onDlqFailure` (dead-letter queue enqueue failures → `QUEUE_ENQUEUE`) and `onStall` (job stall detection → `WORKER_STALL`) callbacks. All 10 workers wired with three handlers: `failureAlertHandler`, `dlqFailureAlertHandler`, `stallAlertHandler`.
- **Process boundary coverage:** API process (`main.ts`) and worker process (`index.ts`) both emit alerts on `unhandledRejection` and `uncaughtException` before graceful shutdown.
- **Dedup mechanism:** `resolveDedupDecision()` centralises dedup key logic: `suppressed` stages return `false` (skip entirely); terminal events (`PROCESS_RESTART` or `terminalFailure: true`) return `null` (always fire, no dedup); all other stages return a string key `<stage>:<domain>:<component>` checked against `alertCooldownCache` (15-minute TTL). `recordAlertSent()` is called **after** `Promise.allSettled()` to prevent race-condition silent suppression — a failed send no longer poisons the dedup key.
- **Cache hygiene:** `evictStaleCacheEntries()` is called on every `recordAlertSent()` invocation, scanning and removing expired entries from `alertCooldownCache` to prevent unbounded `Map` growth in long-running worker processes.

*Alt: per-module ad-hoc alerting (rejected — inconsistent coverage); Prometheus Alertmanager only (rejected — requires external infra; email is universally available); log-based alerting (rejected — passive, no active push).* **Affects:** `notification-failure-alert.ts`, `orders.service.ts`, `products.service.ts`, `cart.service.ts`, `inventory.service.ts`, `coupons.service.ts`, `analytics.service.ts`, `redis.plugin.ts`, `bullmq.plugin.ts`, `observability.plugin.ts`, `worker-logging.ts`, `workers/index.ts`, `main.ts`.

## [2026-05-15] SQL injection prevention — repository-wide unsafe raw query elimination

Comprehensive security sweep eliminated all SQL-injection footguns related to Prisma raw query APIs:

- **Removed unsafe APIs:** All `prisma.$executeRawUnsafe()` and `prisma.$queryRawUnsafe()` calls removed from production code. The only remaining raw queries use parameterized tagged-template literals (`prisma.$executeRaw\`...\`` / `prisma.$queryRaw\`...\``) with Prisma's template variable interpolation, which safely parameterizes all variables.
- **Guardrail script:** Added `scripts/sql-injection-guard.js` that scans `src/`, `queues/`, and `scripts/` for forbidden patterns: `$executeRawUnsafe`, `$queryRawUnsafe`, and `Prisma.raw()`. CI gate fails build if any unsafe pattern is detected.
- **Test coverage:** Added `scripts/sql-injection-guard.test.js` with 3 test cases covering detection of unsafe APIs and passing safe parameterized SQL.
- **Wired into CI:** New npm script `security:sql-injection-guard` runs in `test:guardrails` and `ci:reliability-gates`.

*Alt: eslint rule (rejected — pattern detection across template boundaries is complex); code review only (rejected — insufficient for security).* **Affects:** `scripts/seed-flash-sale-fixtures.js`, `scripts/sql-injection-guard.js`, `scripts/sql-injection-guard.test.js`, `package.json`.

## [2026-05-15] Final worker/service CAS hardening — inventory, outbox dispatch, coupon increment, MFA tests
Four remaining TOCTOU surfaces identified in a final pass and hardened:

- **Inventory service (`inventory.service.ts`):** `updateInventory` now uses CAS `updateMany({ where: { variantId, updatedAt: currentTimestamp }, data: { quantity, updatedAt: new Date() } })` instead of a non-guarded `update`. If zero rows are updated a `409 CONFLICT` is thrown. *(Note: the `preferUpdateForMock` shim that was originally added here was removed in Round 11/12 hardening — the inventory test mock now provides `updateMany` directly.)* This prevents stale-read overwrites under concurrent admin stock adjustments.
- **Inventory alerts worker (`inventory-alerts.worker.ts`):** Added per-item atomic claim `updateMany({ where: { id, lowStockAlerted: false } })` before sending the low-stock notification and creating the alert event. A zero-count result skips the item, preventing duplicate alerts when two worker replicas race.
- **Outbox-dispatch worker (`outbox-dispatch.worker.ts`):** Added per-message atomic claim `updateMany({ where: { id, status: 'PUBLISHED' } })` before enqueuing the event onto the target BullMQ queue. A zero-count result skips the message, preventing duplicate event publishes under concurrent dispatcher instances.
- **Order-processing worker coupon `usesCount` (`order-processing.worker.ts`):** Coupon usage increment at order confirmation now uses CAS `updateMany({ where: { id: couponId, usesCount: { lt: maxUses } } })` to prevent overshooting the cap under concurrent order confirmations for the same coupon. Added a unified post-capture recovery path that rolls back both inventory and coupon side effects atomically on failure. *(Note: the mock-compatibility fallback `update` originally added here was removed in Round 11/12 hardening.)*
- **Admin contract check script (`scripts/admin-contract-check.js`):** Replaced hardcoded admin email + password literals with `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables. Script startup hard-fails when either is absent, preventing accidental contract-smoke runs against production with leaked test credentials.
- **Auth MFA test coverage (`auth.service.mfa-refresh.test.ts`):** Added test for `disableAdminMfa` CAS `updateMany` path and `409 CONFLICT` race-loss scenario. Fixed incorrect expected string on `confirmAdminMfaSetup` success assertion (matched new response shape). Auth domain line coverage ratchet re-established after test addition.
*Alt: database-level advisory locks (rejected — adds infra dependency); optimistic retry loops (rejected — simpler to fail with 409 and let the caller retry).* **Affects:** `src/modules/inventory/inventory.service.ts`, `queues/workers/inventory-alerts.worker.ts`, `queues/workers/outbox-dispatch.worker.ts`, `queues/workers/order-processing.worker.ts`, `scripts/admin-contract-check.js`, `src/modules/auth/auth.service.mfa-refresh.test.ts`.

## [2026-05-14] Race-Condition Codebase Audit — Atomic CAS Operations and Distributed Locking
Comprehensive audit of race-condition classes (audit logs, outbox/inbox replay, idempotency, ops state transitions) with TOCTOU vulnerability elimination via Prisma `updateMany` Compare-And-Swap (CAS) pattern and Redis-distributed locks. Key fixes:
- **Idempotency:** `idempotencyPreHandler` now uses atomic `create` + unique-conflict catch + `updateMany` status-guard transition (PROCESSING/COMPLETED/FAILED) instead of race-prone read-then-upsert. Added compatibility fallbacks for test mocks lacking `updateMany`.
- **Admin Invites:** Invite expiry marking and consumption use atomic `updateMany` with `status in ['CREATED', 'EMAIL_SENT']` guard. *(vi.fn fallback to `update` was removed in Round 11/12 — test harness now provides `updateMany` directly.)*
- **Auth Refresh Tokens:** Token consumption uses atomic `updateMany` with `consumedAt: null` guard to prevent double-consumption races. *(vi.fn fallback to `update` was removed in Round 11/12.)*
- **Ops control plane (`ops.service.ts`):** Invite expiry deletion and OTP verification use CAS-guarded `updateMany`/`deleteMany`. Redis distributed lock (`OPS_AUDIT_LOCK_TTL_MS=5000`) serializes audit chain writes preventing hash-chain corruption under concurrent ops mutations.
- **Reconciliation Worker:** Order status transitions (REFUNDED, CANCELLED) use atomic `updateMany` with status guards. *(Worker test mock fallback to `update` removed in Round 11/12.)*
- **Orders Webhook Inbox:** `claimWebhookInboxEvent` uses atomic `create` + unique-violation catch + CAS `updateMany` for FAILED→PROCESSING reclamation.
- **Analytics Replay:** Outbox dead-letter and inbox failure replays use `updateMany` with status guards (PENDING↔FAILED).
- **Compatibility Strategy (superseded):** At initial implementation, CAS paths detected mock delegates via `'mock' in delegate.method` and fell back to single-row `update`/`delete`. All these shims were removed in Round 11/12 hardening — all test mocks now provide `updateMany` directly. Production and test execution paths are identical. *Alt: full test mock rewrite (originally rejected for time/scope; later executed in Round 11/12); database-level row locking (rejected — Prisma abstraction leak).* **Affects:** `src/common/idempotency/idempotency.ts`, `src/modules/auth/admin-invites.service.ts`, `src/modules/auth/auth.service.ts`, `src/modules/ops/ops.service.ts`, `queues/workers/reconciliation.worker.ts`, `src/modules/orders/orders.service.ts`, `src/modules/analytics/analytics.service.ts`, `TRD.md` §11.6, `ECOM_MASTER.md` §11.

## [2026-05-14] Coupon audit log tamper-evident hash chain
Each `CouponAuditLog` row carries `chainHash` (SHA-256 of `previousChainHash + canonicalised payload`) and `previousChainHash`; first entry per coupon uses sentinel `'GENESIS'`. Mirrors `OpsAuditLog` pattern for offline forensic verification without an external notary. Separate per-model chains avoid cross-table hash drift. *Alt: plain audit only; shared chain with OpsAuditLog.* **Affects:** `prisma/schema.prisma`, `coupons.service.ts`, migration `20260514080941_add_coupon_audit_hash_chain`.

## [2026-05-14] Per-admin sliding-window rate limiting for coupon mutations
Coupon write routes enforce per-admin-ID sliding-window limits via `AdminRateLimitStore` singleton (Redis + bounded in-memory fallback): create 10/min, update/status 20/min, delete/restore 5/min → 429 `RATE_LIMIT_EXCEEDED`. Global IP-based limits don't protect against single compromised admin credentials. *Alt: global Fastify rate-limit only.* **Affects:** `src/common/rate-limit/admin-rate-limit.store.ts` (new), `coupons.routes.ts`.

## [2026-05-12] Phase-2 ops: invite-based onboarding, email OTP, contract-driven config management
Replaced legacy ops bootstrap CLI with invite-based onboarding (`ops:newuser`), email OTP MFA for privileged writes, and contract-driven encrypted DB config. `OpsUserInvite` (10-min expiry), `OpsOtpChallenge` (6-digit, 3 attempts), `OpsConfigSecret` (AES-256-GCM). Drift detection CI script. All actions audit-logged with tamper-evident chain. *Alt: keep TOTP CLI + ad-hoc env.* **Affects:** `ops.routes/service.ts`, `ops-config-contract.ts`, `ops-config-crypto.ts`, schema, `scripts/ops-newuser.mjs`.

## [2026-05-10] Simultaneous build + integration mandatory for all surfaces
All frontend delivery must follow contract-first vertical slices (freeze contract → typed client → UI states → real integration → permissions + idempotency → close). Deferred API integration traced to go-live regressions. Security boundary: merchant on `/admin/*`, platform on `/ops/*`. **Affects:** all canonical docs, `starter-prompt.md`, `frontend-agent-rules.md`.

## [2026-05-10] Final documentation cross-cutting synchronization
Synchronized crash observability (`process_crash_total`), MFA key isolation, admin auth semantics (fail-closed + token-scoped), circuit-breaker process-locality, Prisma drift lifecycle, ops MFA nullable guard, and deferred refund lifecycle across all go-live/deployment guides. **Affects:** `README.md`, `BRD.md`, `TRD.md`, `ECOM_MASTER.md`, all `docs/` guides.

## [2026-05-10] Six worker-layer bug fixes (final audit)
🔴 **Refunds TOCTOU double-refund** — split into Phase 1 atomic CAS gate (DB transaction) + Phase 2 external call; compensating decrement on provider failure. 🟡 **Reconciliation auto-heal state-machine bypass** — replaced raw `order.update` with canonical `process-order-update` job enqueue. 🟡 **Static auto-heal set** — replaced with `resolveAutoHealSet()` reading `RECONCILIATION_AUTO_HEAL_ISSUES` env at runtime. 🟡 **Module-level prisma variable** — scoped to factory, passed explicitly to helpers. 🟡 **Missing jobId on credit note fallback path** — added for idempotency parity. 🟡 **`createShipment()` inside DB transaction** — split into validate → external call → short write transaction phases; idempotency guard on `awbNumber`. **Affects:** `refunds`, `reconciliation`, `order-processing`, `shipping` workers.

## [2026-05-10] `process-order-update` centralised order confirmation job
Single canonical job replaces scattered `confirm-order`, `deduct-inventory`, and `payment-webhook` handlers. All downstream side effects (inventory, coupon usesCount, cart release, invoice, analytics, notifications) execute from one path. All enqueue paths use deterministic `jobId` for BullMQ deduplication. Reconciliation auto-heal uses same path. **Affects:** `order-processing.worker.ts`, `reconciliation.worker.ts`, `metrics.ts`.

## [2026-05-10] Final hardening closeout: security, edge drift, queue/observability
`security.yml` re-blocked on findings; worker Redis lifecycle tracks Shiprocket refresh queue on shutdown; nginx split into `rate-zones.conf.template` (`http{}`) + `client.conf.template` (`server{}`); queue load-shed deduplication removed (global hook covers it); reconciliation ignores `PARTIALLY_REFUNDED` for full-refund mismatch; outbox dead-letter emits `queue_dlq_growth_total`; observability plugin serialises Redis chain-head updates with short lock. **Affects:** `security.yml`, `workers/index.ts`, nginx templates, `reconciliation.worker.ts`, `outbox-dispatch.worker.ts`, `observability.plugin.ts`.

## [2026-05-10] CI security scan fixes + test environment hardening
npm audit JSON parsing fixed for npm v10+ (`| tonumber` + fallback); `osv-scanner.toml` ignores dev-group packages (stripped from Docker image); `order-processing.worker.test.ts` missing `invoiceStorageAdapter` env stubs added; `queues.routes.test.ts` missing Redis mock added. **Affects:** `security.yml`, `osv-scanner.toml`, two test files.

## [2026-05-10] Audits 9–13: exhaustive schema, env-contract, nginx, and FK fixes
- **13th:** `Review.orderId` + `CreditNote.orderId` missing `@relation(onDelete: Restrict)`; `REPLAY_AUDIT_RETENTION_DAYS` backfilled; nginx frontend `location /` missing `proxy_http_version 1.1` + `X-Correlation-Id`.
- **12th:** 5 missing `@@index` on FK columns; 14 env vars backfilled; nginx `/api/v1/ops/` dedicated location block with admin-tier rate limit.
- **11th:** `Review @@index([orderId])` + `Cart @@index([couponId])`; 3 env vars backfilled.
- **10th:** Turnstile fetch `AbortSignal.timeout(10s)`; `Category` self-relation `onDelete: SetNull`; 27 env vars backfilled into contract.
- **9th:** 9 bare `as any` Prisma casts → `prisma-drift-delegates.ts` helper; `@updatedAt` added to 3 models; `onDelete: Restrict` explicit on 16 relations; 3 missing alert promtool tests.

## [2026-05-09] Audits 4–8: Docker, nginx, observability, type safety, dependency hygiene
- **8th:** Workers container command `npm` → `node bootstrap-workers.js` (npm stripped in prod image); `AbortSignal.timeout(10s)` on 5 provider adapters; Grafana `sre-reliability.json` missing SLO panels added.
- **7th:** `prisma` CLI moved to `devDependencies`; dead `jest` dependency removed.
- **6th:** Notifications worker SMS fall-through bug (missing `return`); `npm prune --omit=dev` in Dockerfile; `$executeRawUnsafe` → `$executeRaw` in order-processing; 12 env vars backfilled.
- **5th:** `.dockerignore` excluded `tsconfig.production.json` (broke container startup); `cross-env` removed; `$executeRawUnsafe` → `$executeRaw` in `orders.service.ts`.
- **4th:** nginx rate-limit zones moved to `http{}` context; TLS hardening (ECDHE-only, HSTS, session tickets off, OCSP stapling); `Permissions-Policy` header; 4 missing Grafana dashboard panels; `.dockerignore` created; `@types/jsonwebtoken` to devDeps.

## [2026-05-09] Audits 1–3: deep module security + script sweep
- **3rd:** `scripts/upsert-admin.js` hardcoded credentials → env vars; 2 missing promtool alert tests; 5 nginx security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, XSS-Protection).
- **2nd:** `jwt.plugin.ts` `process.env.JWT_SECRET as string` → fail-fast; `cart.service.ts` `!` non-null assertions → explicit guards; `products.service.ts` `data.slug as string` → `input.slug`; queues admin route missing `loadShedGuard` + rate limit.
- **1st:** `auth.service.ts` `JWT_REFRESH_SECRET as string` → `resolveRefreshSecret()` fail-fast; `orders.service.ts` structural casts replacing `as any`.

## [2026-05-09] Config / startup hardening (multiple small decisions)
- Unknown `PAYMENT_PROVIDER`/`SHIPPING_PROVIDER` values rejected at startup in all profiles.
- `fastify.d.ts` uses canonical `AdminPermission`, `AdminDutyRole`, `OpsPermissionValue` types instead of inline string unions.
- `database.config.ts` + `redis.config.ts` use `requireEnv()` — fail-fast on missing URL.
- Prisma global client cache scoped to `development`/`test` only (was `!== production`).
- Webhook IP allowlists throw (not warn) in production-like profiles.
- Queue DLQ alert: added `slo:queue_dlq_total_depth:max_5m` recording rule; BullMQ metric labels use actual queue names.
- Flash-sale invariant gating: `FLASH_SALE_ENFORCE_INVARIANTS=true` exits non-zero on unmet fixture preconditions.

## [2026-05-09] Shipment dispatch manual-only (auto-ship removed)
Shipment creation requires explicit `POST /admin/orders/:id/ship`. Removed `AUTO_SHIP_ON_CONFIRM` worker behavior. `canShipNow`/`shipBlockReason`/`shippingMode: MANUAL` are computed response fields. Merchant dispatch notifications (SMS + WhatsApp when enabled) fire on admin ship action. **Affects:** `orders.service.ts`, `orders.routes.ts`, `order-processing.worker.ts`.

## [2026-05-07] Ops control plane: first-identity bootstrap via secure CLI
`scripts/ops-bootstrap.mjs` (later superseded by `ops-newuser.mjs`): generates `apiKeyId` + raw key, bcrypt-hashes, creates encrypted MFA secret, prints key once. No public route can mint ops credentials. IP-allowlisted + permission-gated. Superseded by Phase-2 invite flow. **Affects:** `ops-bootstrap.mjs`, `ops-auth.guard.ts`.

## [2026-05-07] Webhook raw body forwarded as Buffer (not UTF-8 string)
`addContentTypeParser` for webhook routes calls `done(null, payload)` (Buffer). Prevents byte-sequence alteration on UTF-8 roundtrip invalidating Razorpay HMAC. Downstream code already handles both types. **Affects:** `src/main.ts`.

## [2026-05-07] Production-like startup guard rejects noop/placeholder providers
Hard-fail in non-`development`/`test` profiles when `PAYMENT_PROVIDER=noop`, `SHIPPING_PROVIDER=noop`, or any placeholder secret (`replace_with_*`, `change_me*`, `<...>`) is detected. **Affects:** `app.config.ts`.

## [2026-05-07] Periodic housekeeping: IdempotencyRecord, OutboxMessage, RefreshToken
Three scheduled cleanup jobs on `cart-cleanup` queue: `purge-expired-idempotency-records` (daily 3AM), `purge-published-outbox-messages` (weekly Sun 4AM, 7-day retention), `purge-expired-refresh-tokens` (daily 3AM). All target indexed columns. **Affects:** `cart-cleanup.worker.ts`, `bullmq.plugin.ts`.

## [2026-05-07] JWT algorithm pinned to HS256 + Redis readiness timeout
`@fastify/jwt` and `jsonwebtoken` both pinned to `HS256` for sign + verify. Redis bootstrap rejects after `REDIS_READY_TIMEOUT_MS = 20_000` instead of hanging. **Affects:** `jwt.plugin.ts`, `auth.service.ts`, `redis.plugin.ts`.

## [2026-05-07] Idempotent dev orchestrator scripts (dev:e2e / dev:e2e:workers)
`scripts/dev-up.cmd` + `dev-up-workers.cmd` start containers, poll `redis-cli ping`, poll `pg_isready` (up to 30s — prevents EPERM DLL-rename failures when Postgres container starts but server isn't ready), kill all stale `node.exe` processes + port-3000 PID *before* Prisma bootstrap (prevents `EPERM rename query_engine-windows.dll.node` on Windows when old tsx watch holds the DLL), ensure Prisma target DB exists from `DATABASE_URL`, run `prisma generate` + `prisma migrate deploy`, set noop env, run `tsx watch`. Solves ECONNREFUSED/EADDRINUSE/missing-db/EPERM-DLL/env-chain failure modes. CMD (not Node) required because orchestrator must run before Node. **Affects:** `scripts/dev-up.cmd`, `scripts/dev-up-workers.cmd`, `scripts/dev-ensure-prisma-ready.js`, `package.json`.

## [2026-05-06] Shipping webhook noop bypass + dynamic Postman idempotency keys
`processShippingWebhook` accepts any non-empty `Authorization` header when `SHIPPING_PROVIDER=noop` or Delhivery key is placeholder. Order-creation Postman steps use `Date.now()` idempotency keys. Ship idempotency keys tied to current `orderId`. **Affects:** `orders.service.ts`, Postman collection.

## [2026-05-05] Noop providers fully functional for E2E simulation
`NoopShippingAdapter.checkServiceability` returns `serviceable: true`; `calculateDeliveryRate` returns `0 paise / 3 days`. `NoopPaymentAdapter.createOrder` returns mock order; `verifyWebhookSignature` returns `true`. `CartService` falls back to pincode `500001` + clamps weight to 1g in noop mode. `createShipment`/`trackShipment` still throw 503. **Affects:** noop adapters, `cart.service.ts`, `orders.service.ts`.

## [2026-05-05] India D2C: COD, cancellation window, return requests
`CodPaymentAdapter` implements `PaymentProviderAdapter` — skips online payment, moves order to `CONFIRMED` directly. `cancellationWindowHours` on `StoreSettings`. `ReturnRequest` + `CreditNote` models. HSN/GST fields on `ProductVariant`; GSTIN on `Address`. **Affects:** `prisma/schema.prisma`, payment adapters, `orders.service.ts`, `settings.service.ts`.

## [2026-05-05] Test mocking: vi.spyOn + DI replaces vi.mock (vmForks incompatibility)
Service tests use `vi.spyOn(ServiceClass.prototype, 'methodName')`; payment provider mocked via `razorpayAdapter` monkey-patch. Worker tests accept optional `deps` bag for injecting mock `Worker`, `PrismaClient`, `Queue`. `vi.mock` incompatible with Vitest `vmForks` pool. **Affects:** all `*.service.*.test.ts`, all `*.worker.ts` + `*.worker.test.ts`.

## [2026-05-03] searchVector removed from Prisma schema
`Unsupported("tsvector")` cannot represent `GENERATED ALWAYS AS` columns — Prisma generates a failing drift migration on every `prisma migrate dev`. Column managed entirely by raw SQL migration. **Affects:** `prisma/schema.prisma`.

## [2026-05-03] Docker Compose switched from inline env passthrough to env_file
Replaced 80+ `- KEY=${KEY}` lines with `env_file: .env`. Added `postgres` service, `depends_on` with health conditions, `NODE_ENV=production` override. Eliminates "variable is not set" warnings. **Affects:** `docker-compose.yml`.

## [2026-05-02] AST migration complete for all route-parsing guardrails
All governance scripts use `parseFastifyRouteConfigsFromAst` (shared utility). Regex-based parsing was brittle under formatting changes. **Affects:** `admin-layer-drift-check.js`.

## [2026-05-02] Parity scorecard enhanced with evidence artifact linkage
`parity-scorecard.js` tracks `evidenceArtifacts` + `lastEvidenceTimestamp` per axis. Distinguishes "gate exists" from "gate ran recently". Still `informationalOnly: true`. **Affects:** `parity-scorecard.js`.

## [2026-05-19] Admin route surface expansion — new permissions, customer moderation, bulk inventory, variant delete

Extended the admin API surface with new routes and permissions identified during the comprehensive route-test gap audit.

- **New permissions:** `users:write` (ban/unban customers, create/delete admin notes), `shipments:read` (global shipment list), `payments:read` (global payment list) added to `ADMIN_PERMISSIONS`, `MERCHANT_DEFAULT_PERMISSIONS`, and `ADMIN_CONTROL_POLICY_REGISTRY` in `admin-permissions.ts`.
- **Customer moderation:** `PATCH /admin/users/:id/ban` and `DELETE /admin/users/:id/ban` gate on `users:write`. Ban sets `isBanned`, `bannedAt`, `bannedReason` on `User`. Unban clears those fields. Cannot ban admins or already-banned users. Banning does not cascade to cancel existing orders.
- **Admin notes:** `GET /admin/users/:id/notes` (`users:read`), `POST /admin/users/:id/notes` and `DELETE /admin/users/:id/notes/:noteId` (`users:write`). Notes stored as `UserAdminNote` records, tagged with admin ID. Internal-only — never surfaced to the customer.
- **Customer order history:** `GET /admin/users/:id/orders` (`users:read`) — paginated order history for a specific customer, separated from the heavy `GET /admin/users/:id` detail endpoint.
- **Bulk inventory update:** `POST /admin/inventory/bulk-update` (`inventory:write`) — up to 100 variants in one `$transaction`. Each item creates an `InventoryAdjustment` audit row. Entire transaction rolls back on any failure.
- **Inventory adjustment history:** `GET /admin/inventory/history/:variantId` (`inventory:read`) — paginated `InventoryAdjustment` rows for a variant.
- **Variant delete:** `DELETE /admin/products/:id/variants/:variantId` (`products:write`) — blocked with 400 if the target is the last variant on the product.
- **Global shipment/payment lists:** `GET /admin/shipments` (`shipments:read`) and `GET /admin/payments` (`payments:read`) — cross-order paginated views with provider/status filters.
- **Return request detail:** `GET /admin/return-requests/:id` (`orders:read`) — full detail for a single return request.
- **Review hard-delete:** `DELETE /admin/reviews/:id` (`reviews:moderate`) — permanent removal; guarded by `loadShedGuard` + `idempotencyPreHandler`.
- **Route-test audit:** Full static audit of all admin route registrations vs. route-test assertions revealed 8 gap groups across 5 test files. All gaps patched (assertions added; no route logic changed). Two test URL slugs corrected (singular `outbox-dead-letter`, `/audit` not `/audit-logs`).

*Alt: Re-use `users:read` for write operations (rejected — violates least-privilege; read and write access must be independently grantable). Global shipments/payments via order-level sub-resources only (rejected — CRM/reconciliation use cases require cross-order views without an order ID anchor).* **Affects:** `admin-permissions.ts`, `admin-endpoint-policy-registry.ts`, `users.service.ts`, `users.routes.ts`, `products.service.ts`, `products.schemas.ts`, `products.routes.ts`, `orders.service.ts`, `orders.schemas.ts`, `orders.routes.ts`, `inventory.service.ts`, `inventory.types.ts`, `inventory.schemas.ts`, `inventory.routes.ts`, `reviews.routes.ts`, `ECOM_MASTER.md`, `BRD.md`, `TRD.md`, `docs/API_ENDPOINT_INDEX.md`, `docs/ROUTE_SURFACE_COMPLETE_REFERENCE.md`, `docs/NEXTJS_FRONTEND_INTEGRATION_GUIDE.md`, `docs/HARDENING_HISTORY.md`.

---

## [2026-05-01] Layered admin ownership: `/admin` vs `/ops` split enforced
Central endpoint policy registry + layer-aware admin permission guard. Merchant operations on `/api/v1/admin/*`; platform mutations on `/api/v1/ops/*`. **Affects:** `admin-permissions.ts`, `admin-endpoint-policy-registry.ts`, `admin-permissions.guard.ts`.

## [2026-04-29] Compliance guardrails: route discipline + serializer exposure CI gates
Static anti-drift scripts (`route:discipline-check`, `serializer:exposure-check`) with script-level tests and CI wiring. SOC2/ISO/DPIA readiness documented as evidence matrix in TRD, not certification claims. **Affects:** `scripts/route-discipline-check.js`, `scripts/serializer-exposure-check.js`, CI.

## [2026-04-29] Backend admin control-plane: DB-scoped permissions + append-audited mutations
Admin permissions resolve from `AdminPermissionGrant` (DB) first, env fallback. Refund-sensitive flows require `orders:refund`. All mutating `/admin/*` requests persisted in `AdminAuditLog`. **Affects:** `prisma/schema.prisma`, `admin-permissions.ts`, `auth.service.ts`, `observability.plugin.ts`.

## [2026-04-29] CheckoutRiskAssessmentPort for pluggable fraud providers
External scoring replaces `CheckoutRiskService` by implementing `CheckoutRiskAssessmentPort` and decorating `fastify.checkoutRisk` before `registerOrdersRoutes`. Default falls back if unset. **Affects:** `checkout-risk.service.ts`, `orders.service.ts`, `orders.routes.ts`.

## [2026-04-29] Enterprise maturity controls (Redis keys, webhooks, risk, queues)
HMAC-derived guest coupon Redis keys (v2 + dual-read migration); static queue enqueue regression test; optional IPv4 webhook allowlists; Razorpay `created_at` skew checks; pluggable checkout risk port with optional Redis velocity. **Affects:** `cart.service.ts`, `orders.service.ts`, `webhook-allowlist.ts`, `queue-enqueue.contract.security.test.ts`.

## [2026-05-XX] Migration history squashed to single 0_init baseline
All 26 incremental migration folders replaced with a single `prisma/migrations/0_init/migration.sql` generated via `prisma migrate diff --from-empty --to-schema-datamodel`. No live client databases were deployed at squash time. Fresh client deployments run `prisma migrate deploy` against the single baseline. Any future DB already built from the old migrations must be resolved with `npx prisma migrate resolve --applied 0_init` to mark baseline as applied without re-running SQL. `migrate dev` during template development will append new dated folders on top of `0_init` as normal. **Affects:** `prisma/migrations/`.

## [2026-05-XX] Fastify FSTDEP022 deprecation resolved
`ignoreTrailingSlash: true` moved from top-level Fastify options into `routerOptions: { ignoreTrailingSlash: true }` as required by Fastify 5. Eliminates `FSTDEP022` startup warning. **Affects:** `src/main.ts`.

## [2026-05-XX] DB-backed runtime config overlay for provider secrets
Provider API secrets and webhook tokens are now resolved at call time via `resolveRuntimeConfig()` in `OrdersService` and `NotificationsWebhookService`. The method decrypts values from `OpsConfigSecret` (DB overlay) first, falling back to `process.env`. Provider factories (`createPaymentProvider`, `createShippingProvider`) accept an injected `runtimeConfig` parameter (default `process.env`) so the resolved overlay propagates to provider adapters without restarting. Bootstrap-only keys (`DATABASE_URL`, `REDIS_URL`, `OPS_DB_ENCRYPTION_KEY`) are never loaded from DB. **Rationale:** Eliminates direct `process.env` reads in runtime webhook paths, enabling zero-downtime secret rotation via Ops UI without container redeploy. **Affects:** `orders.service.ts`, `notifications-webhook.service.ts`, `notifications-webhook.routes.ts`, `payment-provider.ts`, `shipping-provider.ts`, `cart.service.ts`, `orders.routes.ts`.

## [2026-05-XX] Fast2SMS as selectable SMS provider
`SMS_PROVIDER` env/ops config key now accepts `msg91` (DLT-compliant, existing), `fast2sms` (no DLT registration required, Quick SMS + OTP routes), or `noop`. WhatsApp is always handled by `MetaWhatsAppAdapter` (Meta Cloud API direct) and is fully decoupled from SMS provider selection. Fast2SMS uses `FAST2SMS_API_KEY`; MSG91 uses `MSG91_AUTH_KEY` + `MSG91_SENDER_ID` + `MSG91_ROUTE`. **Rationale:** Clients without DLT registration can use Fast2SMS immediately; DLT-registered clients use MSG91 for higher throughput and template control. **Affects:** `notifications/adapters/fast2sms.adapter.ts`, `notification-provider.ts`, `prisma/schema.prisma` (`NotificationLog.provider` now includes `fast2sms`).

## [2026-05-XX] Merchant SMS templates stored in StoreSettings
Added `smsTemplates Json?` to `StoreSettings` Prisma model. Merchant-configurable SMS template strings (for order updates, OTP, shipment alerts) are stored in DB and override default notification templates at runtime without a code deploy. Store legal name for invoice fallback also reads from `StoreSettings` via `STORE_LEGAL_NAME` / DB field. **Affects:** `prisma/schema.prisma`, notifications worker, `settings.service.ts`.

## [2026-04-29] Delhivery webhook timestamp skew enforcement
`occurredAt` ISO-8601 parse failures → 400; outside `DELHIVERY_WEBHOOK_MAX_SKEW_SECONDS` → 401. Missing `occurredAt` skips skew check. **Affects:** `orders.service.ts`.

## [2026-05-18] Env→DB enforcement — overlay authoritative, no env fallbacks in production

All mutable runtime configuration (provider keys/toggles, webhook tokens/allowlists, skew limits) is DB-backed via encrypted `OpsConfigSecret` overlay and editable through Ops UI/API (`requiresRestart`). Merchant-facing settings (store profile, GST/FSSAI, notification primary channels/templates) are DB-backed via `StoreSettings`. Production code no longer reads `process.env` for these DB-backed values; missing values raise `sendTechnicalFailureAlert` and fail closed. `.env.example` pruned to list only bootstrap/infra and minimal wiring; DB-managed runtime keys removed. Unit tests (`NODE_ENV=test`) keep limited shims to stay overlay-independent.

- **Affects:** `.env.example`, `docs/ENV_VS_DB_CONFIG_REFERENCE.md` (new), `queues/workers/notifications.worker.ts`, `src/modules/notifications-webhook/notifications-webhook.service.ts`, `src/modules/orders/orders.service.ts`, `queues/workers/order-processing.worker.ts`, `src/modules/ops/ops-config-contract.ts`, `queues/workers/index.ts`, `src/config/app.config.ts`, tests, and associated docs.

## [2026-05-18] dbOverlay parity-check model — commented stubs in .env.example

**Context:** After enforcing DB-overlay for mutable runtime keys, `.env.example` needed a way to document the existence of those keys without requiring or exposing live values. Simply removing them from `.env.example` would break the parity guardrail and lose discoverability.

**Decision:** Introduce a two-tier `.env.example` layout enforced by `scripts/config-runtime-parity-check.js`:
- Bootstrap/infra keys (`dbOverlay: false` in `env-runtime-contract.js`) appear as **live values** with placeholder text — parity check fails if absent or empty.
- DB-overlay keys (`dbOverlay: true`) appear as **commented stubs** (`# KEY=`) — parity check passes for these even without a live value.

**Implementation:**
- `scripts/env-runtime-contract.js`: each entry in `envExampleRequired` carries an optional `dbOverlay: true` flag. `requiredEnv()` helper accepts this option.
- `scripts/config-runtime-parity-check.js`: `parseEnvExampleKeys()` captures both live-value keys and commented-stub keys as separate sets. `collectConfigRuntimeParityErrors()` skips the "must have non-empty value" check for `dbOverlay` entries as long as they appear as a commented stub.
- `scripts/ops-config-contract-drift-check.js`: cross-validates `ops-config-contract.ts` keys against `env-runtime-contract.js` to prevent silent divergence between the two classification sources.
- `.env.example`: all 44 `dbOverlay: true` keys (payments, shipping, notifications, ops-security) appear as commented stubs; 38 bootstrap keys remain as live values.

**Rationale:** Preserves operator discoverability (all keys documented in one file) while eliminating the risk of operators accidentally relying on `.env` values for DB-managed config. The parity check enforces the layout in CI — a `dbOverlay` key appearing as a live value in `.env.example` causes the check to fail.

**Alternatives rejected:**
- Remove `dbOverlay` keys from `.env.example` entirely: loses discoverability and creates confusion when operators look for expected keys.
- Keep all keys as live values: contradicts the DB-overlay enforcement model — operators might populate `.env` with provider credentials that would be silently ignored at runtime.

**Affects:** `scripts/env-runtime-contract.js`, `scripts/config-runtime-parity-check.js`, `.env.example`, `docs/ENV_VS_DB_CONFIG_REFERENCE.md`.


## [2026-04-29] Reliability parity v4–v7 controls (CI-enforced operational gates)
Iterative series (Apr 29–May 2): v4 codified CI reliability gates, coverage/test-topology boundaries, outbox replay, auth abuse escalation, hot-SKU admission, DR scripts, parity scorecard. v5 added API flash-sale stress evidence, domain-aware ratchets, approval-gated replay governance. v6 enforced DR drills, live error-budget release policy, deterministic flash-sale drills, security CI parity. v7 promoted queue failure taxonomy to retryable/terminal/DLQ metrics; deterministic inbox re-drive; stricter security CI thresholds. **Affects:** `.github/workflows/ci+security.yml`, `scripts/*`, `observability/*`, `src/common/*`, workers, core modules.

## [2026-04-28] Reliability parity foundations behind backward-compatible contracts
Observability metrics, load-shed, idempotency-by-header, outbox/inbox persistence, reconciliation worker, cart reservation TTL — all added without breaking API contracts. **Affects:** `src/common/observability/*`, `src/common/idempotency/*`, `bullmq.plugin.ts`, `orders/*`, `cart/*`, `prisma/schema.prisma`.

## [2026-04-28] Rate limiting: tiered policy + progressive auth lockout
Endpoint-criticality tiers (auth/catalog/cart/checkout/webhook/admin/health). Progressive account+IP lockout on failed logins with `Retry-After`. **Affects:** `rate-limit.plugin.ts`, `rate-limit-policies.ts`, `auth.service.ts`.

## [2026-04-27] Inventory restock restricted to cancellation transitions
Admin status updates restock only on `CANCELLED` for captured payments — prevents stock inflation on forward transitions. **Affects:** `orders.service.ts`.

## [2026-05-23] Push-to-deploy via per-repo self-hosted GitHub Actions runner

**Decision:** Each client production VPS runs exactly **one** GitHub Actions self-hosted runner registered to **that client's GitHub repository**, with a unique runner label (`<client-id>-vps`). Deploy jobs use `runs-on: ${{ vars.VPS_RUNNER_LABEL || 'self-hosted' }}` so multiple clients on one physical VPS cannot receive each other's deploy jobs.

**Flow (unchanged from CLIENT_VPS_SETUP_GUIDE §22):** `git push` to `main` → `Reliability CI` (GitHub-hosted) → on success `Deploy to VPS` (`workflow_run`) → runner on VPS executes `vps-deploy.sh` and optionally `vps-frontend-deploy.sh` locally. The runner polls GitHub via outbound HTTPS; no inbound SSH or webhook to the VPS is required.

**Monorepo adjustment:** For client repos that contain `backend/` + `frontend/` at the root (e.g. `raghava-organics-site`), workflow files must live at **repository root** `.github/workflows/` (`reliability-ci.yml`, `deploy.yml`) with `defaults.run.working-directory: backend` for CI. Backend-only template clones continue to use `backend/.github/workflows/`. Deploy scripts always live under `backend/scripts/`; frontend deploy is invoked as `$VPS_CLIENT_PATH/scripts/vps-frontend-deploy.sh $VPS_FRONTEND_PATH`.

**Opt-in:** `VPS_DEPLOY_ENABLED=true` (repository Variable) on the client repo only. Template/backend baseline repos leave it unset.

*Alt: SSH pull on post-receive hook (rejected — inbound access, no CI gate, no audit in GitHub Actions); shared runner without per-client label (rejected — cross-client deploy misfire on multi-tenant VPS); Vercel for API/workers (rejected — BullMQ workers and Dockerized backend require VPS).*

**Affects:** `.github/workflows/`, `backend/.github/workflows/deploy.yml`, `backend/scripts/vps-deploy.sh`, `backend/scripts/vps-frontend-deploy.sh`, `docs/CLIENT_VPS_SETUP_GUIDE.md` §22, `docs/clients/*/GITHUB_CD_SETUP.md`.

---

## [2026-05-23] Phase 7 VPS deploy must fail-fast on strict env + host DB routing prerequisites
Adopted a deterministic Phase 7 preflight model after live incident replay:
- `npm ci` before any Prisma command (avoid accidental Prisma major drift from floating `npx`),
- strict env verification before container startup,
- host-side Prisma migrate uses `127.0.0.1` mapping,
- production startup uses compose overlay (`docker-compose.prod.yml`) so host PostgreSQL remains authoritative and compose `postgres` is not started,
- explicit troubleshooting playbook canonicalized in `docs/PHASE7_VPS_DEPLOY_INCIDENT_PLAYBOOK.md`.

This decision prevents restart-loop troubleshooting from starting after container launch; failures are now surfaced as preflight errors.

## [2026-04-27] Payment verify + webhook: cross-entry dedupe + atomic status claim
Webhook + verify flows share Redis/JobId dedup. Worker atomically claims `PENDING_PAYMENT → CONFIRMED`. `POST /payments/verify` returns success for already-confirmed same-provider payment (idempotent). **Affects:** `orders.service.ts`, `order-processing.worker.ts`.

## [2026-04-27] Coupon `maxUsesPerUser` nullable; notification toggles from DB; route + schema hygiene
`maxUsesPerUser = null` means unlimited. Notification flags resolve from `StoreSettings` first, env fallback. Category routes registered before `GET /products/:slug` (precedence fix). `FEATURE_GUEST_CHECKOUT_ENABLED` removed (auth-only checkout is final). Reviews disabled → 200 + empty payload (stable read contract). Webhook routes hard-require raw payload type. Workers resolve providers via public module factories. Shipment schemas exported from inventory. `searchVector` marked reversed (see 2026-05-03). Secure data-flow defaults hardened across routes/queues/admin. Product search uses PostgreSQL FTS + GIN. Product list Redis 60s cache with shared invalidation helper. **Affects:** `prisma/schema.prisma`, `coupons/*`, `settings.service.ts`, `products.routes.ts`, `feature-flags.ts`, `reviews.service.ts`, `orders.routes.ts`, workers.


