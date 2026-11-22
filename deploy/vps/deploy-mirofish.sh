#!/usr/bin/env bash
# Deploy the MiroFish backend (mirofish/backend) to the pipeline VPS as the
# `mirofish` systemd service on 127.0.0.1:5001. Idempotent: re-run to update.
#
# Usage (from the repo root):  deploy/vps/deploy-mirofish.sh
# Env overrides: MIROFISH_HOST (default ubuntu@130.210.53.134), SSH_KEY.
#
# Dependencies come from mirofish/backend/uv.lock, except torch: the lock's
# Linux build pulls ~3 GB of CUDA libraries, so the same torch version is taken
# from the PyTorch CPU index instead and the CUDA/triton packages are skipped.
set -euo pipefail

HOST="${MIROFISH_HOST:-ubuntu@130.210.53.134}"
KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")
REPO_ROOT="$(git rev-parse --show-toplevel)"
UNIT="$REPO_ROOT/deploy/vps/mirofish.service"

echo "==> Shipping mirofish/backend at $(git -C "$REPO_ROOT" rev-parse --short HEAD) to $HOST"
"${SSH[@]}" 'sudo mkdir -p /opt/mirofish/app'
git -C "$REPO_ROOT" archive --format=tar HEAD:mirofish/backend \
  | "${SSH[@]}" 'sudo tar -x --no-same-owner -C /opt/mirofish/app'
"${SSH[@]}" 'sudo tee /etc/systemd/system/mirofish.service >/dev/null' < "$UNIT"

echo "==> Installing on the VPS"
"${SSH[@]}" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
BASE=/opt/mirofish
TORCH_CPU_INDEX=https://download.pytorch.org/whl/cpu

command -v python3 >/dev/null
# gcc: the locked psutil 5.9.8 has no linux-aarch64 wheel and builds from source.
for pkg in python3.12-venv python3-dev gcc; do
  dpkg -s "$pkg" >/dev/null 2>&1 || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$pkg"
done
id mirofish >/dev/null 2>&1 \
  || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin mirofish
mkdir -p "$BASE/app/uploads"
chown -R mirofish:mirofish "$BASE"
cd "$BASE"

as_mf() { sudo -u mirofish env HOME="$BASE" UV_NO_CONFIG=1 UV_CACHE_DIR="$BASE/.cache/uv" "$@"; }

[ -x "$BASE/tools/bin/uv" ] || { as_mf python3 -m venv "$BASE/tools"; as_mf "$BASE/tools/bin/pip" install -q uv; }
[ -x "$BASE/venv/bin/python" ] || as_mf "$BASE/tools/bin/uv" venv -q --python /usr/bin/python3 "$BASE/venv"

cd "$BASE/app"
as_mf "$BASE/tools/bin/uv" export --frozen --no-dev --no-hashes --no-emit-project \
  -o "$BASE/requirements.lock.txt" >/dev/null
TORCH_VERSION="$(grep -oP '^torch==\K[^ ;]+' "$BASE/requirements.lock.txt")"
grep -vE '^(torch|triton|nvidia-|cuda-)' "$BASE/requirements.lock.txt" > "$BASE/requirements.cpu.txt"

UVPIP=(as_mf "$BASE/tools/bin/uv" pip install -q --python "$BASE/venv/bin/python")
"${UVPIP[@]}" --no-deps --index-url "$TORCH_CPU_INDEX" "torch==$TORCH_VERSION"
# --no-deps: the export is the full resolved closure, so this installs exactly the lock.
"${UVPIP[@]}" --no-deps -r "$BASE/requirements.cpu.txt"
as_mf "$BASE/tools/bin/uv" pip check --python "$BASE/venv/bin/python" \
  || echo "WARN: pip check reported issues (expected only for skipped CUDA extras)"

systemctl daemon-reload
systemctl enable --now mirofish.service
systemctl restart mirofish.service

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:5001/health; then echo; break; fi
  sleep 2
done
systemctl --no-pager --lines=0 status mirofish.service | head -5
ss -ltnp | grep ':5001' || { echo "ERROR: nothing listening on :5001"; exit 1; }
REMOTE
