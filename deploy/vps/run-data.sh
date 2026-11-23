#!/usr/bin/env bash
# Homepage data files on blogspro-ai-vps, one per name (no AI involved in either):
#   markets  blogspro-markets.timer, every 10 min  -> data/markets.json (Yahoo quotes)
#   policy   blogspro-policy.timer,  every 30 min  -> data/policy.json  (RBI rates + releases, Forex Factory calendar)
# Each run writes <web root>/data/<name>.json atomically and copies it to blogspro-web-vps, which serves it
# at https://blogspro.in/data/<name>.json. The pulse runner's full rsync also carries these files.
# A run where every source failed leaves the previous file in place and exits non-zero.
set -euo pipefail

readonly WEB_ROOT=/var/www/blogspro
readonly WEB_VPS=ubuntu@10.0.0.159

name="${1:-}"
case "$name" in
  markets | policy) ;;
  *) echo "usage: $0 markets|policy" >&2; exit 2 ;;
esac
readonly OUT="data/${name}.json"

cd "$WEB_ROOT"
node "scripts/publish-home-${name}.js" --out "$OUT"
# rsync writes to a temp file and renames it, so the web server never serves a partial file.
rsync -a --mkpath -e "ssh -o BatchMode=yes -o ConnectTimeout=10" "$OUT" "$WEB_VPS:$WEB_ROOT/$OUT"
