#!/usr/bin/env bash
# Homepage market figures on blogspro-ai-vps (run by blogspro-markets.timer every 10 minutes):
#   1. fetch the homepage quotes and write <web root>/data/markets.json atomically (no AI involved)
#   2. copy that one file to blogspro-web-vps, which serves it at https://blogspro.in/data/markets.json
# The pulse runner's full rsync also carries the file, so a missed copy here heals on the next pulse.
# A failed fetch leaves the previous file in place and exits non-zero (visible in systemctl status).
set -euo pipefail

readonly WEB_ROOT=/var/www/blogspro
readonly WEB_VPS=ubuntu@10.0.0.159
readonly OUT=data/markets.json

cd "$WEB_ROOT"
node scripts/publish-home-markets.js --out "$OUT"
# rsync writes to a temp file and renames it, so the web server never serves a partial file.
rsync -a --mkpath -e "ssh -o BatchMode=yes -o ConnectTimeout=10" "$OUT" "$WEB_VPS:$WEB_ROOT/$OUT"
