#!/usr/bin/env bash
# =============================================================================
# install-maintenance-page.sh — install (or repair) the static maintenance.html
# that nginx's `error_page 502 503 /maintenance.html;` directive expects.
#
# Symptom this script fixes: the storefront returns the BARE nginx 503 page
# ("503 Service Temporarily Unavailable" with `nginx/1.x (Ubuntu)` footer)
# during maintenance instead of the branded "We'll be back shortly" page.
# Root cause: `/etc/nginx/maintenance/maintenance.html` is missing on disk.
#
# Run on the VPS from the backend directory:
#
#   sudo bash scripts/install-maintenance-page.sh
#
# Idempotent: the script compares source vs destination and only writes when
# they differ. Safe to run on every deploy or whenever you've updated the
# branded page in `nginx/maintenance.html`.
#
# As of the 2026-05-26 hardening, the nginx template ALSO includes an inline
# fallback (`@maintenance_inline` in client.conf.template) that serves a
# minimal branded page even when this file is missing. This script is what
# upgrades that minimal fallback to the full styled experience.
# =============================================================================

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$BACKEND_DIR/nginx/maintenance.html"
DST_DIR="/etc/nginx/maintenance"
DST="$DST_DIR/maintenance.html"

log() {
  echo "[install-maintenance-page] $*"
}

if [ "$(id -u)" -ne 0 ]; then
  log "ERROR: must be run as root (use 'sudo bash scripts/install-maintenance-page.sh')."
  log "  The destination ($DST) is owned by root and requires elevated permissions."
  exit 1
fi

if [ ! -f "$SRC" ]; then
  log "ERROR: source file not found: $SRC"
  log "  Expected layout: <backend repo root>/nginx/maintenance.html"
  log "  If you cloned the backend repo elsewhere, run this script from there."
  exit 1
fi

mkdir -p "$DST_DIR"

if [ -f "$DST" ] && cmp -s "$SRC" "$DST"; then
  log "Already in sync: $DST matches $SRC. Nothing to do."
  exit 0
fi

cp "$SRC" "$DST"
chmod 644 "$DST"

# Sanity check: nginx must be able to read the file. /etc/nginx/* is normally
# world-readable but a tightened umask on the runner could land 600.
if ! [ -r "$DST" ]; then
  log "WARNING: $DST is not readable (permissions changed). Forcing 644."
  chmod 644 "$DST"
fi

log "Installed: $DST"

# Verify the live nginx config references /maintenance.html. If a stale config
# doesn't have the directive, copying the file alone won't fix the symptom —
# the operator still needs to re-render and reload client.conf.template.
if command -v nginx >/dev/null 2>&1; then
  CLIENT_ID="${CLIENT_ID:-}"
  if [ -z "$CLIENT_ID" ] && [ -f "$BACKEND_DIR/.env" ]; then
    CLIENT_ID="$(grep -E '^CLIENT_ID=' "$BACKEND_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)"
  fi
  if [ -n "$CLIENT_ID" ]; then
    CONF="/etc/nginx/sites-enabled/${CLIENT_ID}.conf"
    [ -f "$CONF" ] || CONF="/etc/nginx/sites-available/${CLIENT_ID}.conf"
    if [ -f "$CONF" ]; then
      if grep -qE 'error_page[[:space:]]+502[[:space:]]+503[[:space:]]+/maintenance\.html' "$CONF"; then
        log "Live nginx config ($CONF) references /maintenance.html — good."
      else
        log "WARNING: live nginx config ($CONF) does NOT contain the"
        log "  'error_page 502 503 /maintenance.html;' directive. Even with the file"
        log "  installed, the maintenance page won't be served until you re-render"
        log "  the client.conf.template and reload nginx. See CLIENT_VPS_SETUP_GUIDE §19.3."
      fi
    fi
  fi
fi

log "Done. Trigger a 503 (e.g. set maintenance mode) and curl https://<domain>/ — you should see the branded page."
