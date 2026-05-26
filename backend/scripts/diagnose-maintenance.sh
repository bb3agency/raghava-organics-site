#!/usr/bin/env bash
# =============================================================================
# diagnose-maintenance.sh — pinpoint why maintenance mode hasn't activated
#
# Run on the VPS from the backend directory:
#   bash scripts/diagnose-maintenance.sh
#
# Prints, in order:
#   1. Worker container status (must be Up + recent build)
#   2. Backend container status (must be Up + recent build)
#   3. Current MaintenanceState row in Postgres — the source of truth
#   4. Live state from the public /api/v1/maintenance/status endpoint
#   5. Live X-Maintenance-Active header from /api/v1/maintenance/gate
#   6. BullMQ delayed + waiting + completed counts for cart-cleanup
#   7. Worker logs filtered for `[maintenance-activation]` milestones
#   8. Whether the running Nginx config has the auth_request gate wired
#
# How to interpret the output:
#
# • Step 3 mode=normal → maintenance was never set, or operator already exited
# • Step 3 mode=maintenance phase=pending, setAt > 2 min ago → activation job stuck
# • Step 3 mode=maintenance phase=pending, pendingUntil in past, setAt fresh → drain in progress (this is normal for up to ~6 min)
# • Step 3 mode=maintenance phase=active → state IS active, problem is downstream (Nginx or banner)
# • Step 4 != Step 3 → API cache stale (rare); restart backend container
# • Step 5 header `1` but storefront still loads → Nginx config not reloaded with auth_request directive
# • Step 6 delayed=1, waiting=0 → job exists but worker hasn't picked it up yet (timing issue)
# • Step 6 delayed=0, waiting=0, completed has maintenance-activation → job completed without flipping state (worker code mismatch — rebuild required)
# • Step 6 all zero, state still pending → enqueue failed silently; check API logs
# • Step 7 empty → worker has no [maintenance-activation] log lines = worker is running old code without the handler. REBUILD WORKERS.
# • Step 8 missing auth_request → Nginx config not deployed; reload required.
# =============================================================================

set -uo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BACKEND_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $BACKEND_DIR/.env not found. Run from the backend directory on the VPS." >&2
  exit 1
fi

CLIENT_ID=$(grep -E '^CLIENT_ID=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)
[ -z "$CLIENT_ID" ] && CLIENT_ID="ecom"

HOST_DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's/host\.docker\.internal/127.0.0.1/')
if [ -z "$HOST_DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not found in .env" >&2
  exit 1
fi

COMPOSE_ARGS=()
if ! grep -qE '^COMPOSE_FILE=' .env; then
  COMPOSE_ARGS+=(-f docker-compose.yml -f docker-compose.prod.yml)
fi
if ! grep -qE '^COMPOSE_PROJECT_NAME=' .env; then
  COMPOSE_ARGS+=(-p "$CLIENT_ID")
fi

PSQL() {
  local query="$1"
  if command -v psql >/dev/null 2>&1; then
    psql "$HOST_DATABASE_URL" -A -t -c "$query" 2>&1
  else
    docker run --rm --network host postgres:16-alpine \
      psql "$HOST_DATABASE_URL" -A -t -c "$query" 2>&1
  fi
}

section() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo "  $*"
  echo "═══════════════════════════════════════════════════════════════════"
}

section "1. Worker container status (expected: Up + recent CreatedAt)"
docker compose "${COMPOSE_ARGS[@]}" ps workers 2>&1 || true

section "2. Backend container status (expected: Up + recent CreatedAt)"
docker compose "${COMPOSE_ARGS[@]}" ps backend 2>&1 || true

section "3. MaintenanceState row (source of truth)"
PSQL "SELECT mode, phase, \"pendingUntil\", \"activatedAt\", \"setAt\", \"updatedAt\", \"setByOpsUserId\" FROM \"MaintenanceState\" WHERE \"singletonKey\" = 'singleton';" || true

section "4. Live API: GET /api/v1/maintenance/status"
curl -sS -m 5 http://127.0.0.1:3001/api/v1/maintenance/status 2>&1 || echo "(failed to reach backend on 127.0.0.1:3001)"

section "5. Live API: HEAD /api/v1/maintenance/gate (look for X-Maintenance-Active)"
curl -sSI -m 5 -H "X-Original-URI: /" http://127.0.0.1:3001/api/v1/maintenance/gate 2>&1 | grep -iE "(^HTTP|X-Maintenance-Active)" || echo "(no relevant headers)"

section "6. BullMQ cart-cleanup queue — delayed/waiting/completed (last 5)"
docker compose "${COMPOSE_ARGS[@]}" exec -T backend node -e "
const IORedis = require('ioredis');
const { Queue } = require('bullmq');
(async () => {
  const r = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const q = new Queue('cart-cleanup', { connection: r });
  try {
    const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed');
    console.log('counts:', JSON.stringify(counts));
    const delayed = await q.getDelayed(0, 10);
    console.log('delayed jobs (first 10):');
    delayed.forEach(j => console.log('  -', j.name, 'id=' + j.id, 'attempt=' + (j.attemptsMade ?? 0), 'delay=' + (j.opts?.delay ?? 0) + 'ms', 'data=' + JSON.stringify(j.data ?? {})));
    const completed = await q.getCompleted(0, 5);
    const mActivations = completed.filter(j => j.name === 'maintenance-activation');
    console.log('recent completed maintenance-activation jobs (' + mActivations.length + '):');
    mActivations.forEach(j => console.log('  -', 'id=' + j.id, 'returnvalue=' + JSON.stringify(j.returnvalue), 'processedOn=' + new Date(j.processedOn ?? 0).toISOString()));
    const failed = await q.getFailed(0, 5);
    const mFailed = failed.filter(j => j.name === 'maintenance-activation');
    console.log('recent failed maintenance-activation jobs (' + mFailed.length + '):');
    mFailed.forEach(j => console.log('  -', 'id=' + j.id, 'failedReason=' + j.failedReason));
  } finally {
    await q.close();
    await r.quit();
  }
})().catch(e => { console.error('queue inspect failed:', e.message); process.exit(1); });
" 2>&1 || echo "(queue inspect failed — backend container may not be running)"

section "7. Worker logs — last 200 lines filtered for maintenance-activation"
docker compose "${COMPOSE_ARGS[@]}" logs workers --tail 500 2>&1 \
  | grep -iE "(maintenance-activation|maintenance_active|MaintenanceState|MaintenanceActivation)" | tail -n 80 \
  || echo "(no matching log lines — worker is missing the maintenance-activation handler. Rebuild required.)"

section "8. Nginx config — verify auth_request /_maintenance_gate is present"
NGINX_CONF="/etc/nginx/sites-enabled/${CLIENT_ID}.conf"
if [ -f "$NGINX_CONF" ]; then
  if grep -qE "auth_request[[:space:]]+/_maintenance_gate" "$NGINX_CONF"; then
    echo "✓ auth_request /_maintenance_gate FOUND in $NGINX_CONF"
    grep -nE "auth_request[[:space:]]+/_maintenance_gate" "$NGINX_CONF" | head -10
  else
    echo "✗ auth_request /_maintenance_gate NOT FOUND in $NGINX_CONF"
    echo "  → Nginx is using an OLDER config without the maintenance gate."
    echo "  → Redeploy backend/nginx/client.conf.template and reload nginx:"
    echo "      sudo cp backend/nginx/client.conf.template /etc/nginx/sites-available/${CLIENT_ID}.conf"
    echo "      sudo nginx -t && sudo systemctl reload nginx"
  fi
else
  echo "(no nginx config at $NGINX_CONF — check /etc/nginx/sites-enabled/ for the actual file)"
  ls -la /etc/nginx/sites-enabled/ 2>&1 | head -10 || true
fi

section "Diagnostic complete"
cat <<'EOF'

Quick action guide based on output above:

A) Step 3 shows mode=maintenance, phase=pending, AND setAt is more than
   ~7 min ago → the read-side self-heal will auto-promote to active on the
   very next API request. Refresh the storefront — it should now block.

B) Step 7 is empty (no [maintenance-activation] log lines anywhere) → the
   worker container is running an OLD build that doesn't have the
   maintenance handler. Rebuild and restart:
     docker compose -p $CLIENT_ID build workers
     docker compose -p $CLIENT_ID up -d workers
   Then click maintenance again and observe step 7 fill up.

C) Step 6 shows delayed=0 but state is stuck pending → enqueue failed
   silently. Check backend logs for "maintenance-activation enqueue
   failed" stack traces, and verify fastify.queues.cartCleanup is wired.

D) Step 8 shows the auth_request directive is missing → Nginx is using
   the previous config. The state may be active correctly but Nginx isn't
   gating because it never learned about the new directive. Reload nginx
   with the updated client.conf.template.

E) Step 5 shows `X-Maintenance-Active: 1` AND step 3 shows phase=active
   but the storefront still loads → either Nginx isn't reloaded (step 8)
   or there's an upstream proxy / browser cache caching the page. Hard-
   refresh with Ctrl+Shift+R and check from an incognito window.
EOF
