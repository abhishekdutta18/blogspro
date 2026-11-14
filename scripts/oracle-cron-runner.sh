#!/usr/bin/env bash
set -e
cd /var/www/blogspro
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

FREQ="${1:-hourly}"
TYPE="${2:-briefing}"

LOGFILE="/var/log/blogspro-pipeline.log"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting BlogsPro Pulse: freq=${FREQ}, type=${TYPE}..." >> "$LOGFILE"

# 1. Generate institutional research
node scripts/generate-institutional-tome.js --freq="${FREQ}" --type="${TYPE}" --force >> "$LOGFILE" 2>&1 || {
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Warning: Tome generation finished with non-zero exit" >> "$LOGFILE"
}

# 2. Rebuild static pages and sitemap
node scripts/build-static.js >> "$LOGFILE" 2>&1 || true
node scripts/generate-sitemap.js >> "$LOGFILE" 2>&1 || true

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] BlogsPro Pulse completed." >> "$LOGFILE"
