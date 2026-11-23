#!/usr/bin/env bash
# Homepage data files on blogspro-ai-vps, one job per name:
#   markets    blogspro-markets.timer,           every 5 min  -> data/markets.json   (Yahoo quotes, intraday points)
#   policy     blogspro-policy.timer,            every 30 min -> data/policy.json    (RBI, Forex Factory, MoSPI macro + history)
#   bonds      blogspro-data@bonds.timer,        hourly       -> data/bonds.json     (CCIL yield curve, tenor yields)
#   movers     blogspro-data@movers.timer,       every 15 min -> data/movers.json    (index best/worst 5; idles while markets are shut)
#   forecasts  blogspro-data@forecasts.timer,    daily        -> data/forecasts.json (TimesFM via BigQuery)
#   charts     blogspro-data@charts.timer,       hourly       -> data/charts/*.svg   (standalone SVG charts from the files above)
# Each run writes its output atomically under <web root>/data and copies it to blogspro-web-vps, which serves it
# at https://blogspro.in/data/. The pulse runner's full rsync also carries these files.
# A run where every source failed leaves the previous output in place and exits non-zero.
set -euo pipefail

readonly WEB_ROOT=/var/www/blogspro
readonly WEB_VPS=ubuntu@10.0.0.159
readonly STATE_DIR=/var/lib/blogspro-pulse

name="${1:-}"
extra=()
case "$name" in
  markets | policy | bonds | forecasts) OUT="data/${name}.json" ;;
  movers) OUT="data/movers.json"; extra=(--state "$STATE_DIR/constituents.json") ;;
  charts) OUT="data/charts" ;;
  *) echo "usage: $0 markets|policy|bonds|movers|forecasts|charts" >&2; exit 2 ;;
esac
readonly OUT

cd "$WEB_ROOT"
node "scripts/publish-home-${name}.js" --out "$OUT" "${extra[@]}"
# rsync writes to a temp file and renames it, so the web server never serves a partial file. A directory is
# copied by its contents (trailing slash) so charts land in data/charts/, not data/charts/charts/.
if [[ -d "$OUT" ]]; then
  rsync -a --mkpath -e "ssh -o BatchMode=yes -o ConnectTimeout=10" "$OUT/" "$WEB_VPS:$WEB_ROOT/$OUT/"
else
  rsync -a --mkpath -e "ssh -o BatchMode=yes -o ConnectTimeout=10" "$OUT" "$WEB_VPS:$WEB_ROOT/$OUT"
fi
