#!/usr/bin/env bash
# Phase 7 — Backend deploy for raghava-organics (run on VPS after Phase 6)
set -euo pipefail

CLIENT_ID="${CLIENT_ID:-raghava-organics}"
BACKEND_PATH="${BACKEND_PATH:-/var/www/raghava-organics/backend}"
COMPOSE_PROJECT="${CLIENT_ID}"

log() { echo "[phase7] $*"; }

[ -d "$BACKEND_PATH" ] || { log "Missing $BACKEND_PATH — clone repo first"; exit 1; }
[ -f "$BACKEND_PATH/.env" ] || { log "Missing $BACKEND_PATH/.env — copy from vault"; exit 1; }

cd "$BACKEND_PATH"

log "Ensure Redis is not published publicly (comment ports: in docker-compose.yml for redis service)."

log "Starting Redis..."
docker compose -p "$COMPOSE_PROJECT" up -d redis

log "Prisma generate + migrate..."
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma

log "Building and starting backend + workers..."
docker compose -p "$COMPOSE_PROJECT" up -d --build backend workers

BACKEND_PORT=$(grep -E '^BACKEND_PORT=' .env | cut -d= -f2 | tr -d '[:space:]')
BACKEND_PORT="${BACKEND_PORT:-3001}"
HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/api/v1/health"

log "Health check: $HEALTH_URL"
for i in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" | grep -q '"database":"connected"'; then
    curl -fsS "$HEALTH_URL"
    log "Phase 7 backend health OK"
    exit 0
  fi
  sleep 2
done

docker compose -p "$COMPOSE_PROJECT" logs --tail=40 backend
exit 1
