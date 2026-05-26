#!/usr/bin/env bash
# =============================================================================
# vps-deploy.sh — VPS-side deploy script for automated CI/CD
#
# Executed locally by the self-hosted GitHub Actions runner installed on this VPS.
# The runner pulls the job from GitHub via outbound HTTPS and runs this script
# directly — no inbound SSH connection is opened.
#
# Should NOT be run manually during a live store incident — use
# the ops system restart flow instead (POST /api/v1/ops/system/restart).
#
# Usage:
#   bash scripts/vps-deploy.sh <CLIENT_PATH> <COMMIT_SHA>
#
# Arguments:
#   CLIENT_PATH  Absolute path to the client backend directory on VPS
#                e.g. /var/www/foodstore/backend
#   COMMIT_SHA   The git commit SHA that CI validated (for verification)
#
# Requirements on VPS:
#   - Self-hosted GitHub Actions runner installed and registered (see §22)
#   - git, docker, docker compose plugin
#   - .env is already present at CLIENT_PATH (never written by this script)
# =============================================================================

set -euo pipefail

CLIENT_PATH="${1:?CLIENT_PATH argument is required}"
EXPECTED_SHA="${2:?COMMIT_SHA argument is required}"
HEALTH_RETRIES=30
HEALTH_INTERVAL=2

log() { echo "[deploy] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"; }
fail() { echo "[deploy] ERROR: $*" >&2; exit 1; }

# Self-hosted runner systemd jobs often have a minimal PATH (no global npx).
# After npm ci, always prefer the project-local Prisma CLI.
run_host_prisma() {
  local cli="$CLIENT_PATH/node_modules/.bin/prisma"
  if [ -x "$cli" ]; then
    "$cli" "$@"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    npx prisma "$@"
    return 0
  fi
  if command -v npm >/dev/null 2>&1; then
    npm exec -- prisma "$@"
    return 0
  fi
  fail "Prisma CLI not found. Run npm ci in $CLIENT_PATH first."
}

# ---------------------------------------------------------------------------
# 0. Validate environment
# ---------------------------------------------------------------------------
log "Starting deploy to $CLIENT_PATH (expected SHA: $EXPECTED_SHA)"

[ -d "$CLIENT_PATH" ] || fail "Client path not found: $CLIENT_PATH"
[ -f "$CLIENT_PATH/.env" ] || fail ".env not found at $CLIENT_PATH — deploy aborted. Secrets must be present on VPS."
[ -f "$CLIENT_PATH/docker-compose.yml" ] || fail "docker-compose.yml not found at $CLIENT_PATH"

cd "$CLIENT_PATH"
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$CLIENT_PATH")

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)
[ -f docker-compose.prod.yml ] || fail "docker-compose.prod.yml not found — required for VPS (host Postgres)"
COMPOSE_PROJECT="${CLIENT_ID:-$(grep -E '^CLIENT_ID=' .env | cut -d= -f2 | tr -d '[:space:]')}"
[ -n "$COMPOSE_PROJECT" ] || COMPOSE_PROJECT="client-backend"

# ---------------------------------------------------------------------------
# 1. Pull latest code from main
# ---------------------------------------------------------------------------
log "Pulling latest code from git root: $GIT_ROOT"
cd "$GIT_ROOT"
git fetch origin main
git checkout main 2>/dev/null || git checkout -B main origin/main
git pull origin main --ff-only

# Verify the pulled commit matches what CI validated
CURRENT_SHA=$(git rev-parse HEAD)
cd "$CLIENT_PATH"
if [ "$CURRENT_SHA" != "$EXPECTED_SHA" ]; then
  fail "SHA mismatch after pull. Expected $EXPECTED_SHA, got $CURRENT_SHA. Aborting deploy."
fi
log "SHA verified: $CURRENT_SHA"

# ---------------------------------------------------------------------------
# 1.25 Install lockfile-pinned dependencies (prevents Prisma CLI drift)
# ---------------------------------------------------------------------------
log "Installing lockfile-pinned dependencies..."
npm ci

# ---------------------------------------------------------------------------
# 1.5 Strict env preflight before build/swap
# ---------------------------------------------------------------------------
log "Running strict env preflight..."
node scripts/verify-client-bootstrap-env.mjs

# ---------------------------------------------------------------------------
# 1.75 Sweep Dead/orphan containers from previous deploys
#
# Why: When Docker images are replaced (every deploy rebuilds backend/workers),
# the old containers occasionally end up in the `Dead` state instead of being
# cleanly removed — usually because an `image prune` reaped the underlying
# image while the container record still referenced it. These tombstones live
# in /var/lib/docker/containers/<id>/ and keep showing up in
# `docker ps -a --filter label=com.docker.compose.project=<this>`. Subsequent
# `docker compose up` runs then enter a broken rename-on-recreate path:
# they rename the ghost to `<old-id>_<service>`, create a new canonical
# container, and finally try to also start the original ghost ID — which
# Docker can't find, and CD fails with exit code 1 even though the new
# canonical containers are live.
#
# This step finds every Dead container for the current compose project,
# force-removes them, and (when running with sudo) drops their on-disk
# directory so the Docker daemon's next scan doesn't reintroduce the
# tombstone. If a tombstone CANNOT be cleaned (no sudo, no daemon restart
# permission), this step ABORTS the deploy with explicit recovery
# instructions — silently proceeding here is what produces the
# "phantom container kept trying to start" failure mode that wastes 10+
# minutes of every deploy.
# ---------------------------------------------------------------------------
log "Sweeping Dead/orphan containers for project=$COMPOSE_PROJECT..."

# Snapshot the set of stale containers before doing anything destructive.
STALE_BEFORE="$( {
  docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=dead"    --format '{{.ID}}' 2>/dev/null || true
  docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=exited"  --format '{{.ID}}' 2>/dev/null || true
  docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=created" --format '{{.ID}}' 2>/dev/null || true
  docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=removing" --format '{{.ID}}' 2>/dev/null || true
} | awk 'NF' | sort -u)"

if [ -n "$STALE_BEFORE" ]; then
  log "Found stale containers for this project:"
  echo "$STALE_BEFORE" | sed 's/^/    /'

  echo "$STALE_BEFORE" | while read -r cid; do
    [ -z "$cid" ] && continue
    STATUS="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo unknown)"
    FULL_ID="$(docker inspect -f '{{.Id}}' "$cid" 2>/dev/null || echo "$cid")"
    log "  - $cid (status=$STATUS) — removing"
    docker rm -f "$cid" >/dev/null 2>&1 || true
    # Drop the on-disk container directory if it survived the rm.
    # /var/lib/docker/containers/<full-id>/ is what makes Dead containers
    # persistent across `docker rm -f` — the runtime record is gone but
    # the directory survives until removed (root-owned).
    if [ -d "/var/lib/docker/containers/$FULL_ID" ]; then
      if [ "$(id -u)" -eq 0 ]; then
        rm -rf "/var/lib/docker/containers/$FULL_ID" 2>/dev/null || true
      else
        sudo -n rm -rf "/var/lib/docker/containers/$FULL_ID" 2>/dev/null || true
      fi
    fi
  done

  # Verify the sweep actually cleared the tombstones. If not, abort: we'd
  # rather fail the deploy here with explicit instructions than press on
  # and hit the rename-on-recreate failure later (which exits 1 anyway but
  # with a misleading "No such container" trace).
  STALE_AFTER="$( {
    docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=dead"     --format '{{.ID}}' 2>/dev/null || true
    docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=exited"   --format '{{.ID}}' 2>/dev/null || true
    docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=created"  --format '{{.ID}}' 2>/dev/null || true
    docker ps -a --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter "status=removing" --format '{{.ID}}' 2>/dev/null || true
  } | awk 'NF' | sort -u)"

  if [ -n "$STALE_AFTER" ]; then
    log "ERROR: Tombstone containers still present after sweep:"
    echo "$STALE_AFTER" | sed 's/^/    /'
    log ""
    log "These are Dead/Exited containers whose on-disk metadata at"
    log "/var/lib/docker/containers/<id>/ survived 'docker rm -f' because the CI"
    log "runner does not have passwordless sudo to delete those directories."
    log ""
    log "Recovery (run ONCE on the VPS as a user with sudo):"
    log ""
    log "  cd $CLIENT_PATH"
    log "  bash scripts/cleanup-stale-compose-state.sh $COMPOSE_PROJECT"
    log ""
    log "That script will remove the tombstones, restart the Docker daemon to"
    log "refresh its container index, and bring back live containers via"
    log "restart: unless-stopped. After it completes, re-run this deploy."
    log ""
    log "To make this automatic in future deploys, grant the CI runner user"
    log "passwordless sudo on the following commands (see CLIENT_VPS_SETUP_GUIDE §22):"
    log "  /usr/bin/rm -rf /var/lib/docker/containers/*"
    log "  /usr/bin/systemctl restart docker     (optional, only if you want auto-recovery)"
    fail "Deploy aborted: Dead-container tombstones detected and could not be fully cleaned automatically."
  fi
  log "Sweep complete — tombstones cleared."
else
  log "No stale containers found for this project — clean state."
fi

# ---------------------------------------------------------------------------
# 2. Build new Docker image (old containers remain live during build)
# ---------------------------------------------------------------------------
log "Building Docker image..."
docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" build

# ---------------------------------------------------------------------------
# 3. Run database migrations (before container swap)
#    Migrations must be backward-compatible so the running container stays healthy
#    during the migration window.
# ---------------------------------------------------------------------------
log "Running Prisma migrations..."
MIGRATE_DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/host\.docker\.internal/127.0.0.1/')"
log "Prisma migrate on host Postgres (127.0.0.1)..."
DATABASE_URL="$MIGRATE_DATABASE_URL" run_host_prisma migrate deploy --schema prisma/schema.prisma

# Prisma client is generated during `docker compose build` (Dockerfile builder stage).
# Do not run `prisma generate` in the production container: npm/npx are removed and
# node_modules/.prisma is root-owned, so generate fails with EACCES as USER app.

# ---------------------------------------------------------------------------
# 3.5 Nginx config drift detection + auto-reload (opt-in)
#
# Why: changes to `nginx/client.conf.template` in the repo do NOT automatically
# apply on the VPS — the file at `/etc/nginx/sites-available/<client>.conf`
# only updates when an operator manually `cp`s it and reloads nginx. This is
# how the May 2026 maintenance-gate `auth_request` directive missed the live
# nginx config and silently bypassed the storefront gate. To prevent that,
# this step diffs the repo template against the live nginx file and, when
# `NGINX_AUTO_RELOAD=1` is set in the env, syncs + reloads automatically.
#
# Behaviour:
#   - Default (NGINX_AUTO_RELOAD unset): logs a warning if the file differs
#     so the operator sees drift in the deploy log and can sync manually.
#   - NGINX_AUTO_RELOAD=1: copies template → live, runs `nginx -t`, and
#     `systemctl reload nginx` only if the test passes. Failure aborts the
#     deploy so a broken config never reaches production.
#
# The CI runner needs passwordless `sudo nginx` + `sudo systemctl reload
# nginx` + `sudo cp` permissions for this to work (see CLIENT_VPS_SETUP_GUIDE
# §22). If those aren't granted, leave NGINX_AUTO_RELOAD unset and reload
# manually after each deploy that touches nginx config.
# ---------------------------------------------------------------------------
NGINX_TEMPLATE="$CLIENT_PATH/nginx/client.conf.template"
NGINX_DOMAIN="$(grep -E '^STOREFRONT_URL=' .env | head -1 | cut -d= -f2- | sed -E 's,^https?://,,' | sed -E 's,/.*$,,' | tr -d '[:space:]')"
NGINX_LIVE="/etc/nginx/sites-available/${COMPOSE_PROJECT}.conf"
NGINX_MAINTENANCE_SRC="$CLIENT_PATH/nginx/maintenance.html"
NGINX_MAINTENANCE_DST="/etc/nginx/maintenance/maintenance.html"

# 3.5a Install / refresh the static maintenance.html the nginx config references.
#
# The nginx template has `error_page 502 503 /maintenance.html;` mapped to
# `location = /maintenance.html { root /etc/nginx/maintenance; internal; }`,
# so the live nginx process expects a file at /etc/nginx/maintenance/maintenance.html.
# When that file is missing, ANY backend 5xx — including the auth_request gate
# returning timeout — collapses to "nginx tries to serve missing maintenance.html
# → falls back to its built-in 500 page". That's an incident-grade bug because
# routine backend slowness now looks like a fatal site outage instead of a
# friendly maintenance page.
#
# This step installs the maintenance page on every deploy. Idempotent: cp only
# rewrites the file when content differs (cmp -s check), so a no-op deploy
# touches nothing. Requires the same sudoers grants as the nginx auto-reload
# below (see CLIENT_VPS_SETUP_GUIDE §22 "Optional: passwordless sudo grants").
if [ -f "$NGINX_MAINTENANCE_SRC" ]; then
  if [ ! -f "$NGINX_MAINTENANCE_DST" ] || ! cmp -s "$NGINX_MAINTENANCE_SRC" "$NGINX_MAINTENANCE_DST"; then
    log "Installing maintenance page to $NGINX_MAINTENANCE_DST"
    sudo mkdir -p "$(dirname "$NGINX_MAINTENANCE_DST")" 2>/dev/null || true
    if sudo -n cp "$NGINX_MAINTENANCE_SRC" "$NGINX_MAINTENANCE_DST" 2>/dev/null; then
      log "Maintenance page installed."
    else
      log "WARNING: could not install maintenance page (no passwordless sudo for cp)."
      log "Without it, any backend 5xx — including transient maintenance gate timeouts —"
      log "will surface as nginx's bare default 500 page instead of the friendly downtime page."
      log "Run on the VPS once to fix:"
      log "  sudo mkdir -p $(dirname "$NGINX_MAINTENANCE_DST")"
      log "  sudo cp $NGINX_MAINTENANCE_SRC $NGINX_MAINTENANCE_DST"
    fi
  else
    log "Maintenance page already in sync — no change."
  fi
else
  log "WARNING: $NGINX_MAINTENANCE_SRC not found in repo. The nginx template references"
  log "/maintenance.html via error_page — without the source file present, any 502/503 from"
  log "the backend (including auth_request gate timeouts) will fall back to nginx's"
  log "default 500 page. Ensure backend/nginx/maintenance.html exists in the repo."
fi

if [ -f "$NGINX_TEMPLATE" ] && [ -f "$NGINX_LIVE" ]; then
  # cmp is a no-op if files are byte-identical; nonzero exit indicates drift.
  if ! cmp -s "$NGINX_TEMPLATE" "$NGINX_LIVE"; then
    log "Nginx config drift detected: $NGINX_TEMPLATE differs from $NGINX_LIVE"
    if [ "${NGINX_AUTO_RELOAD:-0}" = "1" ]; then
      log "NGINX_AUTO_RELOAD=1 — syncing template to live and reloading nginx"
      sudo cp "$NGINX_TEMPLATE" "$NGINX_LIVE"
      if sudo nginx -t >/dev/null 2>&1; then
        sudo systemctl reload nginx
        log "Nginx reload succeeded."
      else
        log "Nginx config test FAILED after sync — restoring previous config and aborting deploy"
        sudo nginx -t || true
        fail "Nginx config test failed. Live config at $NGINX_LIVE not changed by this script (cp was atomic on same FS but reload was not triggered)."
      fi
    else
      log "WARNING: live nginx config is stale. Run on this VPS to sync:"
      log "  sudo cp $NGINX_TEMPLATE $NGINX_LIVE && sudo nginx -t && sudo systemctl reload nginx"
      log "Or set NGINX_AUTO_RELOAD=1 in /var/www/<client>/backend/.env to automate this."
    fi
  else
    log "Nginx config in sync with template — no reload required."
  fi
fi

# ---------------------------------------------------------------------------
# 4. Swap containers (minimal-downtime restart)
#    Nginx maintenance page handles the ~3–5s window automatically.
#
# We DELIBERATELY do NOT use `docker compose up --force-recreate`. Compose
# v2's force-recreate uses a "rename-then-create" pattern (renames the old
# container to `<old-id>_<service>` as a backup, then creates a new
# container with the canonical name). When the old container is a ghost
# tombstone the §1.75 sweep couldn't fully clear, the rename appears to
# succeed but Compose's bookkeeping still has the original ID queued for a
# final "start" call — that call then fails with "No such container: <id>"
# and the whole deploy exits 1 even though the new canonical containers
# came up correctly. We've seen this kill three deploys in a row.
#
# The safer protocol is explicit:
#   (a) docker compose stop <services>     — gracefully shut down by name
#   (b) docker rm -f <canonical-names>     — remove by name (NOT by ID), so
#                                            stale ID references can't lead
#                                            us back into the rename path
#   (c) docker compose up -d <services>    — fresh create. Compose has
#                                            nothing renamed to track, so
#                                            no phantom "start" trailer.
#
# --remove-orphans on the `up` still strips any container labeled with this
# project but no longer defined in the active compose files (e.g. the old
# `postgres` service from before host-Postgres migration; jaeger from the
# OTEL overlay if it ever ran).
# ---------------------------------------------------------------------------
log "Stopping existing service containers (graceful)..."
docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" stop backend workers redis 2>&1 | sed 's/^/  /' || true

log "Removing existing service containers by name..."
# `docker rm -f` is a no-op (with stderr noise) when the container doesn't
# exist, which is exactly what we want — we just need the canonical names
# to be free before `up` creates fresh ones. Names are formed from CLIENT_ID
# per the docker-compose.yml container_name template.
for cname in "${COMPOSE_PROJECT}-backend" "${COMPOSE_PROJECT}-workers" "${COMPOSE_PROJECT}-redis"; do
  if docker container inspect "$cname" >/dev/null 2>&1; then
    log "  Removing $cname"
    docker rm -f "$cname" >/dev/null 2>&1 || true
  fi
done

log "Bringing up fresh containers..."
docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" up -d --remove-orphans redis
docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" up -d --remove-orphans backend workers

# ---------------------------------------------------------------------------
# 5. Health check — retry until backend is responding or timeout
# ---------------------------------------------------------------------------
BACKEND_PORT=$(grep -E '^BACKEND_PORT=' .env | cut -d= -f2 | tr -d '[:space:]')
BACKEND_PORT="${BACKEND_PORT:-3001}"
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1/health"
READY_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1/health/ready"

log "Waiting for backend health at $HEALTH_URL..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    log "Health check passed (attempt $i/${HEALTH_RETRIES})"
    break
  fi
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    log "Health check failed after ${HEALTH_RETRIES} attempts — dumping container logs"
    docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" logs --tail=50 backend || true
    docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" logs --tail=50 workers || true
    fail "Backend did not become healthy after deploy. Manual intervention required."
  fi
  sleep "$HEALTH_INTERVAL"
done

# ---------------------------------------------------------------------------
# 5.5 Runtime readiness check (informational — do not block deploy)
#     Ops config is filled incrementally; /health/ready may stay not_ready until
#     all keys are saved. CD must still ship code fixes (e.g. partial config save).
# ---------------------------------------------------------------------------
log "Checking readiness payload at $READY_URL (non-blocking)..."
READY_RESPONSE="$(curl -sS "$READY_URL" || true)"
if ! echo "$READY_RESPONSE" | grep -q '"status":"ready"'; then
  log "WARNING: Readiness status is not 'ready' yet. Response: $READY_RESPONSE"
  log "WARNING: Finish Ops config and restart API/workers when convenient."
elif ! echo "$READY_RESPONSE" | grep -q '"runtimeConfigMissingKeys":\[\]'; then
  log "WARNING: runtimeConfigMissingKeys is not empty. Response: $READY_RESPONSE"
  log "WARNING: CD succeeded; complete missing keys via Ops UI before go-live."
else
  log "Readiness check passed (status=ready, no missing runtime keys)."
fi

# ---------------------------------------------------------------------------
# 6. Verify workers are up
# ---------------------------------------------------------------------------
WORKERS_STATUS=$(docker compose -p "$COMPOSE_PROJECT" "${COMPOSE_FILES[@]}" ps workers --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','unknown'))" 2>/dev/null || echo "unknown")
if [ "$WORKERS_STATUS" != "running" ]; then
  log "WARNING: workers container may not be in running state (status: $WORKERS_STATUS)"
  log "Check: docker compose logs workers"
fi

# ---------------------------------------------------------------------------
# 7. Clean up dangling images and trim BuildKit cache from this deploy
#
# Why both:
#   - `docker image prune -f` removes untagged/dangling images from this build.
#   - `docker buildx prune --keep-storage 3GB` caps the BuildKit cache so
#     long-lived multi-client VPS hosts don't accumulate tens of GB of
#     intermediate build layers (observed: 20 GB cache after ~35 builds in
#     40h). The 3GB ceiling preserves enough recent layers to keep the next
#     build fast, while evicting older layers automatically.
#
# Safety: neither command touches running containers, in-use images, named
# volumes (e.g. Redis data), or any container filesystem. Only build-time
# scratch data is removed.
# ---------------------------------------------------------------------------
log "Pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

log "Trimming BuildKit cache (keep last 3GB of reusable layers)..."
docker buildx prune --force --keep-storage 3GB >/dev/null 2>&1 || true

log "Deploy complete. SHA=$CURRENT_SHA Port=$BACKEND_PORT"
