#!/usr/bin/env bash
# Phase 10 — Frontend PM2 deploy (run on VPS after backend + Nginx)
set -euo pipefail

FRONTEND_PATH="${FRONTEND_PATH:-/var/www/raghava-organics/frontend}"
CLIENT_ID="${CLIENT_ID:-raghava-organics}"

[ -d "$FRONTEND_PATH" ] || { echo "Missing $FRONTEND_PATH"; exit 1; }
[ -f "$FRONTEND_PATH/.env.production.local" ] || {
  echo "Copy frontend/.env.production.example to .env.production.local and set PRODUCTION_DOMAIN"
  exit 1
}

cd "$FRONTEND_PATH"
npm ci
npm run build

STOREFRONT_PORT=$(grep -E '^STOREFRONT_PORT=' .env.production.local | cut -d= -f2 | tr -d '[:space:]')
STOREFRONT_PORT="${STOREFRONT_PORT:-3101}"

if pm2 describe "${CLIENT_ID}-frontend" >/dev/null 2>&1; then
  pm2 reload "${CLIENT_ID}-frontend" --update-env
else
  pm2 start npm --name "${CLIENT_ID}-frontend" -- start -- -p "$STOREFRONT_PORT"
fi
pm2 save

echo "Frontend listening on port $STOREFRONT_PORT — verify via Nginx and https://<domain>/"
