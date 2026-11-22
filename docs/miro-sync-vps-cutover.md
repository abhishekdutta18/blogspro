# MiroSync: Durable Object → VPS cutover

**What moves:** the MiroSync swarm bridge (one Yjs doc: `swarm-progress`, `swarm-archive`,
`affine-health`, `final-manuscript`; HTTP routes `/push`, `/check-step`, `/telemetry`,
`/telemetry/charts`, `/terminal`, `/sync`, `/archive*`, `/snapshot`, `/styles`; y-protocols WebSocket
sync + awareness on any path).

**From:** Durable Object `MiroSyncS` in worker `blogspro-miro-sync` (`wrangler.miro-sync.toml`).
**To:** Node service `blogspro-miro-sync` on the Oracle VPS that already serves `blogspro.in`.
Host `blogspro-ai-vps`, `130.210.53.134`, user `ubuntu` (same target as `deploy.yml`); the maintainer's
Mac reaches it with `~/.ssh/id_ed25519`.
It runs under systemd on `127.0.0.1:8788` (8787 is `blogspro-api`), behind nginx at
`https://sync.blogspro.in`.

## How the switch works

All routing and Yjs logic is in `scripts/lib/miro-sync-core.js`. The DO (`scripts/miro-sync-worker.js`)
and the Node service (`scripts/miro-sync-server.js`) are thin hosts around it, so both stay deployable.

Every pusher goes through `scripts/lib/miro-sync-client.js`:

| Caller | Runs on | Calls |
|---|---|---|
| `notifyProgress` in `scripts/lib/swarm-orchestrator.js` | pulse worker, GitHub Actions, Oracle cron | `POST /push` (daily/weekly/monthly; hourly goes to Firestore) |
| sector resume check in `swarm-orchestrator.js` | same | `GET /check-step` |
| `scripts/mirofish-worker.js` | mirofish worker | `POST /push` |
| `/terminal` page | browser | relative `/telemetry`, `/telemetry/charts`, `/sync`, `/archive`, so it follows whichever host served it |

`miroSyncFetch` uses `env.MIRO_SYNC_URL` when it is set (sends `Authorization: Bearer $MIRO_SYNC_TOKEN`),
otherwise the `MIRO_SYNC_DO` binding. **Cutover = set `MIRO_SYNC_URL`. Rollback = unset it.**

Node pipeline runs (GitHub Actions, Oracle cron) never had a DO binding, so before this change their
daily/monthly progress never reached MiroSync at all. With `MIRO_SYNC_URL` set, they do.

## Phase 0: merge (no behaviour change)

`MIRO_SYNC_URL` is unset everywhere, so every caller still takes the DO path. The workflows already
pass `vars.MIRO_SYNC_URL` / `secrets.MIRO_SYNC_TOKEN`, which are empty until phase 2.

## Phase 1: stand up the VPS service

1. **DNS:** `sync.blogspro.in` A/AAAA → the VPS. If proxied through Cloudflare, WebSockets are allowed
   by default; SSL mode must be Full (strict).
2. **Code:** `SSH_TARGET="ubuntu@$VPS_HOST" SSH_KEY="$VPS_SSH_KEY" deploy/miro-sync/deploy.sh`
   (creates the `blogspro-miro-sync` system user, `/opt/blogspro-miro-sync`, and the systemd unit).
3. **Secrets:** create `/etc/blogspro-miro-sync.env` from `deploy/miro-sync/blogspro-miro-sync.env.example`
   (`root:blogspro-miro-sync`, `0640`). `MIRO_SYNC_TOKEN=$(openssl rand -hex 32)`.
   `MEDIA_DIR` (default in the template: `/var/lib/blogspro-miro-sync/media`) receives `/snapshot`,
   `FINAL_MANUSCRIPT` and archive exports plus periodic backups through `saveSnapshot`. Keep it out of
   the web root, whose `/media` nginx serves publicly. `doc.yjs` in `/var/lib/blogspro-miro-sync` is the
   source of truth; these snapshots are on the same disk, so they are history, not off-box backup.
4. **Seed (optional):** copy the DO's current doc so nothing is lost:
   ```bash
   sudo -u blogspro-miro-sync node /opt/blogspro-miro-sync/scripts/miro-sync-seed.mjs \
     wss://blogspro-miro-sync.abhishek-dutta1996.workers.dev /var/lib/blogspro-miro-sync
   ```
   Do this before the first start. On 2026-11-17 the DO doc was empty (2 bytes, 0 jobs).
5. **Start:** `sudo systemctl enable --now blogspro-miro-sync`.
6. **nginx + TLS:** install `deploy/miro-sync/nginx-miro-sync.conf` as a site, get the cert
   (`certbot --nginx -d sync.blogspro.in` or DNS-01), then `nginx -t && systemctl reload nginx`.

### Verify (all must pass before phase 2)

```bash
curl -fsS https://sync.blogspro.in/healthz                                  # {"ok":true,...}
curl -fsSI https://sync.blogspro.in/terminal | head -1                      # 200
curl -fsSI -X OPTIONS https://sync.blogspro.in/telemetry | grep -i access-control-allow-origin
curl -fsS -X POST https://sync.blogspro.in/push -H 'Content-Type: application/json' \
  -d '{"source":"SWARM_PROGRESS","jobId":"cutover-check"}' -o /dev/null -w '%{http_code}\n'   # 401
curl -fsS -X POST https://sync.blogspro.in/push -H "Authorization: Bearer $MIRO_SYNC_TOKEN" \
  -H 'Content-Type: application/json' -d '{"source":"SWARM_PROGRESS","jobId":"cutover-check","stage":"VERIFY"}'
curl -fsS https://sync.blogspro.in/telemetry | grep cutover-check
node scripts/miro-sync-seed.mjs wss://sync.blogspro.in /tmp/miro-ws-check   # WS through nginx: swarmProgress >= 1
sudo systemctl restart blogspro-miro-sync && curl -fsS https://sync.blogspro.in/telemetry | grep cutover-check  # survives restart
```

Open `https://sync.blogspro.in/terminal` in a browser and confirm it shows `cutover-check`.

## Phase 2: switch the clients

1. **Workers** (`pulse`, `mirofish`):
   ```bash
   npx wrangler secret put MIRO_SYNC_TOKEN --env pulse
   npx wrangler secret put MIRO_SYNC_TOKEN --env mirofish
   ```
   Add `MIRO_SYNC_URL = "https://sync.blogspro.in"` to `[env.pulse.vars]` and `[env.mirofish.vars]`
   in `wrangler.toml` and deploy both.
2. **GitHub Actions:** repo variable `MIRO_SYNC_URL=https://sync.blogspro.in`, repo secret `MIRO_SYNC_TOKEN`.
3. **Oracle cron** (`scripts/oracle-cron-runner.sh`): add both to the environment the cron job loads.
4. **Confirm:** trigger a daily run (`manual-dispatch.yml`) and watch its job appear in `/telemetry`
   and on `/terminal`. Then let it run unattended for at least a week.

## Rollback (any time during phases 1–2)

1. Remove `MIRO_SYNC_URL` from `[env.pulse.vars]` / `[env.mirofish.vars]` and redeploy both workers.
2. `gh variable delete MIRO_SYNC_URL` and drop it from the cron environment.

Callers fall straight back to the `MIRO_SYNC_DO` binding, which is still deployed and unchanged.
Progress written to the VPS during the window stays on the VPS. It is transient job telemetry, so
it is not copied back. Leave the VPS service running or `systemctl disable --now blogspro-miro-sync`.

## Phase 3: retire the Durable Object (only after phase 2 has run clean for a week)

1. Delete the `MIRO_SYNC_DO` bindings from `[env.pulse]` and `[env.mirofish]` in `wrangler.toml`
   (the `script_name = "blogspro-miro-sync"` blocks). This removes the rollback path.
2. Keep the `blogspro-miro-sync` worker itself for now: `INGESTOR_DO` and `MANUSCRIPT_DO` (stubs, still bound by
   `pulse` and used by `scripts/ingestion-worker.js`) live in it. Retiring those is a separate change
   that needs a `deleted_classes` migration.
3. Drop the `MiroSyncS` class from `scripts/miro-sync-worker.js` and add `MiroSyncS` to a new
   `deleted_classes` migration in `wrangler.miro-sync.toml` in the same deploy.

## Known gaps (not changed by the move, carried over as-is)

- WebSocket sync, `/sync` and `/archive` are unauthenticated, as they were on the DO's public
  `workers.dev` route. `/sync` and `/archive` are the terminal page's own buttons. nginx rate-limits the
  host, but anyone who finds the URL can still write to the doc over a socket.
- The terminal's client-side `renderUI` inserts telemetry strings into `innerHTML` unescaped.
