#!/usr/bin/env bash
# BlogsPro pulse runner for blogspro-ai-vps (Oracle A1, 24 GB).
# Started by blogspro-pulse@<hourly|daily|weekly|pages>.service. Steps:
#   1. reinstall node_modules when package-lock.json changes
#   2. generate the tome under a hard time limit (pushes to GitHub via GH_PAT from .env); skipped for "pages"
#   3. rebuild static pages + sitemap, rsync the web root to blogspro-web-vps
# A failed generation or page build still syncs what exists, but the run exits non-zero.
# "pages" is the 08:15 UTC catch-up: page builds read Firestore, whose free quota resets at midnight Pacific
# (07:00/08:00 UTC), so every build between 00Z and 07Z fails and the night's pages wait for this run.
set -euo pipefail

readonly WEB_ROOT=/var/www/blogspro
readonly WEB_VPS=ubuntu@10.0.0.159
readonly STATE_DIR=/var/lib/blogspro-pulse
readonly KILL_GRACE=60s
readonly RSYNC_EXCLUDES=(.git node_modules '.env' '.env.*' '*.pem' '*.key' '*adminsdk*.json' '*service-account*.json')

FREQ="${1:?usage: run-pulse.sh <hourly|daily|weekly|pages>}"
# TYPE: tome type (empty: no generation). GEN_LIMIT: generation time limit, so a stuck run cannot eat the next slot.
# LOCK_WAIT: seconds to wait for another run to release the web root before skipping.
case "$FREQ" in
  hourly) TYPE=briefing GEN_LIMIT=45m LOCK_WAIT=600 ;;
  daily)  TYPE=article  GEN_LIMIT=2h  LOCK_WAIT=3300 ;;
  weekly) TYPE=tome     GEN_LIMIT=5h  LOCK_WAIT=3300 ;;
  pages)  TYPE=''       GEN_LIMIT=''  LOCK_WAIT=1800 ;;
  *) echo "unknown frequency: $FREQ" >&2; exit 64 ;;
esac

log() { echo "[$(date -u +%FT%TZ)] [$FREQ] $*"; }

ensure_deps() {
  local hash stamp="$STATE_DIR/lock-hash"
  hash=$(sha256sum package-lock.json | cut -d' ' -f1)
  if [[ -d node_modules && -f "$stamp" && "$(cat "$stamp")" == "$hash" ]]; then return; fi
  log "package-lock.json changed: npm ci"
  PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund
  echo "$hash" > "$stamp"
}

sync_web() {
  local excludes=() pattern
  for pattern in "${RSYNC_EXCLUDES[@]}"; do excludes+=(--exclude="$pattern"); done
  rsync -az "${excludes[@]}" -e "ssh -o BatchMode=yes" "$WEB_ROOT/" "$WEB_VPS:$WEB_ROOT/"
}

main() {
  exec 9>"$STATE_DIR/run.lock"
  flock -w "$LOCK_WAIT" 9 || { log "ERROR: web root busy for ${LOCK_WAIT}s; skipping"; exit 75; }
  cd "$WEB_ROOT"
  ensure_deps

  local status=0
  if [[ -n "$TYPE" ]]; then
    log "Generating freq=$FREQ type=$TYPE (limit $GEN_LIMIT)"
    timeout --kill-after="$KILL_GRACE" "$GEN_LIMIT" \
      node scripts/generate-institutional-tome.js --freq="$FREQ" --type="$TYPE" --force || status=$?
    case "$status" in
      0) log "Generation OK" ;;
      124) log "ERROR: generation exceeded $GEN_LIMIT and was stopped" ;;
      *) log "ERROR: generation exited $status" ;;
    esac
  fi

  # Page builds read Firestore and fail when its quota is spent; still ship what was generated.
  local build_status=0
  node scripts/build-static.js || build_status=$?
  node scripts/generate-sitemap.js || build_status=$?
  (( build_status == 0 )) || log "ERROR: page build failed ($build_status); syncing existing pages"

  sync_web
  log "Synced to $WEB_VPS"
  (( status != 0 )) && exit "$status"
  exit "$build_status"
}

main
