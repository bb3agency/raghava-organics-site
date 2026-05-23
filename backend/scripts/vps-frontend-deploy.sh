#!/usr/bin/env bash
# =============================================================================
# vps-frontend-deploy.sh - VPS-side deploy script for Next.js frontend
#
# Executed locally by the self-hosted GitHub Actions runner installed on this VPS.
# The runner pulls the job from GitHub via outbound HTTPS and runs this script
# directly - no inbound SSH connection is opened.
#
# Performs a zero-downtime deploy via PM2 reload (graceful worker drain + swap).
# Skips build steps if no frontend-relevant files changed since the last deploy.
#
# Usage:
#   bash scripts/vps-frontend-deploy.sh <FRONTEND_PATH> <COMMIT_SHA>
#
# Arguments:
#   FRONTEND_PATH  Absolute path to the client frontend directory on VPS
#                  e.g. /var/www/foodstore/frontend
#   COMMIT_SHA     The git commit SHA that CI validated (for verification)
#
# Requirements on VPS:
#   - Self-hosted GitHub Actions runner installed and registered (see §22)
#   - git, node, npm, pm2 (installed globally: npm install -g pm2)
#   - PM2 process already started once manually (pm2 start -> pm2 save -> pm2 startup)
#   - .env.local (or .env.production.local) present at FRONTEND_PATH (never written here)
#   - CLIENT_ID env var set in .env.local (used to derive pm2 process name)
# =============================================================================

set -euo pipefail

resolve_storefront_port() {
  local base_path="$1"
  local env_file=""
  local port=""
  for env_file in .env.local .env.production.local .env.production; do
    if [ -f "$base_path/$env_file" ]; then
      port=$(grep -E '^STOREFRONT_PORT=' "$base_path/$env_file" | head -1 | cut -d= -f2- | tr -d '"' | xargs || true)
      if [ -n "$port" ]; then
        echo "$port"
        return 0
      fi
    fi
  done
  echo "3101"
}

# ---------------------------------------------------------------------------
# 0. Arguments and validation
# ---------------------------------------------------------------------------
FRONTEND_PATH="${1:-}"
COMMIT_SHA="${2:-}"

if [ -z "$FRONTEND_PATH" ] || [ -z "$COMMIT_SHA" ]; then
  echo "::error::Usage: vps-frontend-deploy.sh <FRONTEND_PATH> <COMMIT_SHA>"
  exit 1
fi

if [ ! -d "$FRONTEND_PATH" ]; then
  echo "::error::FRONTEND_PATH does not exist: $FRONTEND_PATH"
  exit 1
fi

if [ ! -f "$FRONTEND_PATH/package.json" ]; then
  echo "::error::No package.json found at $FRONTEND_PATH - is this a Next.js project?"
  exit 1
fi

SHA_RECORD="$FRONTEND_PATH/.last-frontend-deploy-sha"

echo "===== Frontend deploy started ====="
echo "Path:   $FRONTEND_PATH"
echo "SHA:    $COMMIT_SHA"
echo "Time:   $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# ---------------------------------------------------------------------------
# 1. Pull latest code and verify SHA
# ---------------------------------------------------------------------------
echo ""
echo "----- Step 1: git pull -----"
cd "$FRONTEND_PATH"
git fetch --quiet origin main
git reset --hard "origin/main"

ACTUAL_SHA=$(git rev-parse HEAD)
if [ "$ACTUAL_SHA" != "$COMMIT_SHA" ]; then
  echo "::error::SHA mismatch - expected $COMMIT_SHA, got $ACTUAL_SHA"
  echo "Another push may have landed mid-deploy. Failing safely."
  exit 1
fi
echo "SHA verified: $ACTUAL_SHA"

# ---------------------------------------------------------------------------
# 2. Detect whether frontend-relevant files actually changed
# ---------------------------------------------------------------------------
echo ""
echo "----- Step 2: change detection -----"
SKIP_BUILD=false

if [ -f "$SHA_RECORD" ]; then
  LAST_SHA=$(cat "$SHA_RECORD")
  echo "Last deployed SHA: $LAST_SHA"

  CHANGED=$(git diff --name-only "$LAST_SHA" "$COMMIT_SHA" 2>/dev/null || echo "UNKNOWN")
  if [ "$CHANGED" = "UNKNOWN" ]; then
    echo "Could not diff against last SHA (force-push or first deploy). Proceeding with full build."
  elif echo "$CHANGED" | grep -qE '^(app/|pages/|components/|lib/|hooks/|styles/|public/|next\.config|package\.json|package-lock\.json|tsconfig|tailwind\.config|postcss\.config)'; then
    echo "Frontend-relevant files changed - full build required."
  else
    echo "No frontend-relevant files changed. Skipping build."
    SKIP_BUILD=true
  fi
else
  echo "No previous deploy SHA recorded. Proceeding with full build."
fi

# ---------------------------------------------------------------------------
# 3. Install dependencies and build
# ---------------------------------------------------------------------------
if [ "$SKIP_BUILD" = "false" ]; then
  echo ""
  echo "----- Step 3: npm ci -----"
  npm ci --prefer-offline 2>&1

  echo ""
  echo "----- Step 4: npm run build -----"
  npm run build 2>&1
  echo "Build complete."
else
  echo ""
  echo "----- Steps 3-4: skipped (no relevant changes) -----"
fi

# ---------------------------------------------------------------------------
# 5. Derive PM2 process name from CLIENT_ID in env
# ---------------------------------------------------------------------------
echo ""
echo "----- Step 5: PM2 reload -----"

CLIENT_ID=""
for env_file in .env.local .env.production.local .env.production; do
  if [ -f "$FRONTEND_PATH/$env_file" ]; then
    CLIENT_ID=$(grep -E '^CLIENT_ID=' "$FRONTEND_PATH/$env_file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)
    if [ -n "$CLIENT_ID" ]; then
      break
    fi
  fi
done

if [ -z "$CLIENT_ID" ]; then
  CLIENT_ID=$(basename "$(dirname "$FRONTEND_PATH")")
  echo "::warning::CLIENT_ID not found in env files. Using directory-derived name: $CLIENT_ID"
fi

PM2_NAME="${CLIENT_ID}-frontend"
echo "PM2 process name: $PM2_NAME"

if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  pm2 reload "$PM2_NAME" --update-env
  echo "PM2 reload issued for $PM2_NAME"
else
  echo "::warning::PM2 process '$PM2_NAME' not found."
  echo "Run the one-time setup first:"
  echo "  pm2 start npm --name '$PM2_NAME' -- start -- -p <STOREFRONT_PORT>"
  echo "  pm2 save && pm2 startup"
  echo "Attempting cold start (port from STOREFRONT_PORT env or 3101)..."
  STOREFRONT_PORT=$(resolve_storefront_port "$FRONTEND_PATH")
  pm2 start npm --name "$PM2_NAME" -- start -- -p "$STOREFRONT_PORT"
  pm2 save
fi

# ---------------------------------------------------------------------------
# 6. Health check - verify frontend is responding
# ---------------------------------------------------------------------------
echo ""
echo "----- Step 6: health check -----"

STOREFRONT_PORT=$(resolve_storefront_port "$FRONTEND_PATH")
HEALTH_URL="http://127.0.0.1:${STOREFRONT_PORT}/"
MAX_RETRIES=20
RETRY_DELAY=3

for i in $(seq 1 $MAX_RETRIES); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" =~ ^(200|301|302|307|308)$ ]]; then
    echo "Health check passed (HTTP $HTTP_CODE) after $i attempt(s)."
    break
  fi
  if [ "$i" -eq "$MAX_RETRIES" ]; then
    echo "::error::Frontend health check failed after $MAX_RETRIES attempts (last HTTP $HTTP_CODE)."
    echo "PM2 logs:"
    pm2 logs "$PM2_NAME" --lines 30 --nostream 2>/dev/null || true
    exit 1
  fi
  echo "  Attempt $i/$MAX_RETRIES - HTTP $HTTP_CODE. Retrying in ${RETRY_DELAY}s..."
  sleep "$RETRY_DELAY"
done

# ---------------------------------------------------------------------------
# 7. Record deployed SHA
# ---------------------------------------------------------------------------
echo "$COMMIT_SHA" > "$SHA_RECORD"
echo "Deployed SHA recorded."

echo ""
echo "===== Frontend deploy complete ====="
echo "Process: $PM2_NAME"
echo "SHA:     $COMMIT_SHA"
echo "Time:    $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
