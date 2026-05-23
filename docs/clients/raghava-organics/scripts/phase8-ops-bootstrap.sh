#!/usr/bin/env bash
# Phase 8 — Ops bootstrap (run on VPS after Phase 7 health passes)
set -euo pipefail

BACKEND_PATH="${BACKEND_PATH:-/var/www/raghava-organics/backend}"
OPS_EMAIL="${OPS_EMAIL:?Set OPS_EMAIL}"
SETUP_BASE_URL="${SETUP_BASE_URL:?Set SETUP_BASE_URL e.g. https://your-domain}"

cd "$BACKEND_PATH"

if grep -q 'replace_with_resend' .env 2>/dev/null; then
  echo "RESEND_API_KEY still placeholder in .env — fix before ops:newuser"
  exit 1
fi

npm run ops:newuser -- \
  --email="$OPS_EMAIL" \
  --name="Primary Ops" \
  --setup-base-url="$SETUP_BASE_URL" \
  --yes

echo "Complete /ops/setup in browser, then save provider keys via Ops UI and restart:"
echo "  docker compose -p raghava-organics up -d backend workers"
