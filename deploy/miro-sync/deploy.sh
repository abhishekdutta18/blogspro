#!/usr/bin/env bash
# deploy.sh — ship the MiroSync service to the VPS.
#
#   SSH_TARGET="ubuntu@$VPS_HOST" [SSH_KEY="$VPS_SSH_KEY"] deploy/miro-sync/deploy.sh
#
# Copies only the files the service imports (repo layout preserved), installs its four runtime deps
# into /opt/blogspro-miro-sync, installs the systemd unit on first run, and restarts it.
# First-run steps that need a human (env secrets, nginx site, cert) are in docs/miro-sync-vps-cutover.md.
set -euo pipefail

: "${SSH_TARGET:?set SSH_TARGET=user@host}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[[ -n "${SSH_KEY:-}" ]] && SSH_OPTS+=(-i "$SSH_KEY")

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

FILES=(
  scripts/miro-sync-server.js
  scripts/miro-sync-seed.mjs
  scripts/lib/miro-sync-core.js
  scripts/lib/miro-sync-file-store.js
  scripts/lib/miro-terminal-html.js
  scripts/lib/miro-terminal-charts.js
  scripts/lib/storage-bridge.js
  scripts/lib/vps-store.js
  scripts/lib/media-store.js
)
for f in "${FILES[@]}"; do mkdir -p "$STAGE/$(dirname "$f")" && cp "$ROOT/$f" "$STAGE/$f"; done
mkdir -p "$STAGE/js" && cp -R "$ROOT/js/chart-engine" "$STAGE/js/chart-engine"
cp "$ROOT/deploy/miro-sync/package.json" "$ROOT/deploy/miro-sync/blogspro-miro-sync.service" "$STAGE/"

REMOTE_STAGE="/tmp/blogspro-miro-sync-$(date +%s)"
rsync -az --delete -e "ssh ${SSH_OPTS[*]}" "$STAGE/" "$SSH_TARGET:$REMOTE_STAGE/"

ssh "${SSH_OPTS[@]}" "$SSH_TARGET" REMOTE_STAGE="$REMOTE_STAGE" bash -s <<'REMOTE'
set -euo pipefail
id blogspro-miro-sync >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin blogspro-miro-sync
sudo mkdir -p /opt/blogspro-miro-sync
sudo rsync -a --delete --exclude node_modules "$REMOTE_STAGE/" /opt/blogspro-miro-sync/
sudo rm -f /opt/blogspro-miro-sync/blogspro-miro-sync.service
cd /opt/blogspro-miro-sync && sudo npm install --omit=dev --no-audit --no-fund --loglevel=error
sudo chown -R root:root /opt/blogspro-miro-sync
sudo install -m 0644 "$REMOTE_STAGE/blogspro-miro-sync.service" /etc/systemd/system/blogspro-miro-sync.service
rm -rf "$REMOTE_STAGE"
sudo systemctl daemon-reload
if [[ ! -f /etc/blogspro-miro-sync.env ]]; then
  echo "First deploy: create /etc/blogspro-miro-sync.env from blogspro-miro-sync.env.example, then: sudo systemctl enable --now blogspro-miro-sync" >&2
  exit 0
fi
sudo systemctl enable blogspro-miro-sync >/dev/null
sudo systemctl restart blogspro-miro-sync
sleep 2
systemctl is-active blogspro-miro-sync
curl -fsS http://127.0.0.1:8788/healthz
REMOTE
