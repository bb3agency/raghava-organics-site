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

# ---------------------------------------------------------------------------
# 0. Validate environment
# ---------------------------------------------------------------------------
log "Starting deploy to $CLIENT_PATH (expected SHA: $EXPECTED_SHA)"

[ -d "$CLIENT_PATH" ] || fail "Client path not found: $CLIENT_PATH"
[ -f "$CLIENT_PATH/.env" ] || fail ".env not found at $CLIENT_PATH — deploy aborted. Secrets must be present on VPS."
[ -f "$CLIENT_PATH/docker-compose.yml" ] || fail "docker-compose.yml not found at $CLIENT_PATH"

cd "$CLIENT_PATH"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml)
[ -f docker-compose.prod.yml ] || fail "docker-compose.prod.yml not found — required for VPS (host Postgres)"

# ---------------------------------------------------------------------------
# 1. Pull latest code from main
# ---------------------------------------------------------------------------
log "Pulling latest code..."
git fetch origin main
git checkout main
git pull origin main --ff-only

# Verify the pulled commit matches what CI validated
CURRENT_SHA=$(git rev-parse HEAD)
if [ "$CURRENT_SHA" != "$EXPECTED_SHA" ]; then
  fail "SHA mismatch after pull. Expected $EXPECTED_SHA, got $CURRENT_SHA. Aborting deploy."
fi
log "SHA verified: $CURRENT_SHA"

# ---------------------------------------------------------------------------
# 2. Build new Docker image (old containers remain live during build)
# ---------------------------------------------------------------------------
log "Building Docker image..."
docker compose "${COMPOSE_FILES[@]}" build

# ---------------------------------------------------------------------------
# 3. Run database migrations (before container swap)
#    Migrations must be backward-compatible so the running container stays healthy
#    during the migration window.
# ---------------------------------------------------------------------------
log "Running Prisma migrations..."
# Generate client inside a temporary builder container to pick up any new models
MIGRATE_DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2- | sed 's/host\.docker\.internal/127.0.0.1/')"
log "Prisma migrate on host Postgres (127.0.0.1)..."
DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy --schema prisma/schema.prisma

docker compose "${COMPOSE_FILES[@]}" run --rm --no-deps --entrypoint "" backend \
  sh -c "npx prisma generate"

# ---------------------------------------------------------------------------
# 4. Swap containers (minimal-downtime restart)
#    Nginx maintenance page handles the ~3–5s window automatically.
# ---------------------------------------------------------------------------
log "Restarting containers..."
docker compose "${COMPOSE_FILES[@]}" up -d redis
docker compose "${COMPOSE_FILES[@]}" up -d backend workers

# ---------------------------------------------------------------------------
# 5. Health check — retry until backend is responding or timeout
# ---------------------------------------------------------------------------
BACKEND_PORT=$(grep -E '^BACKEND_PORT=' .env | cut -d= -f2 | tr -d '[:space:]')
BACKEND_PORT="${BACKEND_PORT:-3000}"
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1/health"

log "Waiting for backend health at $HEALTH_URL..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    log "Health check passed (attempt $i/${HEALTH_RETRIES})"
    break
  fi
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    log "Health check failed after ${HEALTH_RETRIES} attempts — dumping container logs"
    docker compose "${COMPOSE_FILES[@]}" logs --tail=50 backend || true
    docker compose "${COMPOSE_FILES[@]}" logs --tail=50 workers || true
    fail "Backend did not become healthy after deploy. Manual intervention required."
  fi
  sleep "$HEALTH_INTERVAL"
done

# ---------------------------------------------------------------------------
# 6. Verify workers are up
# ---------------------------------------------------------------------------
WORKERS_STATUS=$(docker compose "${COMPOSE_FILES[@]}" ps workers --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('State','unknown'))" 2>/dev/null || echo "unknown")
if [ "$WORKERS_STATUS" != "running" ]; then
  log "WARNING: workers container may not be in running state (status: $WORKERS_STATUS)"
  log "Check: docker compose logs workers"
fi

# ---------------------------------------------------------------------------
# 7. Clean up dangling images from previous builds
# ---------------------------------------------------------------------------
log "Pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

log "Deploy complete. SHA=$CURRENT_SHA Port=$BACKEND_PORT"
