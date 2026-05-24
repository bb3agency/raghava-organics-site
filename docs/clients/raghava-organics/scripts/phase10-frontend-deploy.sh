#!/usr/bin/env bash
# Phase 10 - Frontend PM2 deploy (run on VPS after backend + Nginx)
set -euo pipefail

FRONTEND_PATH="${FRONTEND_PATH:-/var/www/raghava-organics/frontend}"
CLIENT_ID="${CLIENT_ID:-raghava-organics}"

if [ ! -d "$FRONTEND_PATH" ]; then
  echo "Missing $FRONTEND_PATH"
  exit 1
fi

if [ ! -f "$FRONTEND_PATH/.env.production.local" ]; then
  echo "Copy frontend/.env.production.example to .env.production.local and set PRODUCTION_DOMAIN"
  exit 1
fi

cd "$FRONTEND_PATH"
npm ci
npm run build

STOREFRONT_PORT=$(grep -E '^STOREFRONT_PORT=' .env.production.local | cut -d= -f2 | tr -d '[:space:]')
STOREFRONT_PORT="${STOREFRONT_PORT:-3101}"

if pm2 describe "${CLIENT_ID}-frontend" >/dev/null 2>&1; then
  pm2 reload "${CLIENT_ID}-frontend" --update-env
else
  # package.json already passes -p 3101; extra -p from PM2 is redundant but harmless
  pm2 start npm --name "${CLIENT_ID}-frontend" -- start
fi
pm2 save

HEALTH_URL="http://127.0.0.1:${STOREFRONT_PORT}/"
MAX_RETRIES=20
RETRY_DELAY=2
for i in $(seq 1 "$MAX_RETRIES"); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" =~ ^(200|301|302|307|308)$ ]]; then
    echo "[phase10] Frontend reachable on $HEALTH_URL (HTTP $HTTP_CODE after ${i} attempt(s))"
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "[phase10] Frontend did not respond on $HEALTH_URL (last HTTP $HTTP_CODE) — inspect: pm2 logs ${CLIENT_ID}-frontend"
    exit 1
  fi
  sleep "$RETRY_DELAY"
done

echo "Frontend listening on port $STOREFRONT_PORT - verify via Nginx and https://<domain>/"
