# Postgres on blogspro-ai-vps (Stage 0 of the Firestore removal)

Postgres 16 holds BlogsPro's data on the same Oracle A1 box that runs the pulse.
See `docs/plans/firestore-to-postgres.md` for the whole migration.

## Where things listen

| Component | Address | Reached by |
|---|---|---|
| Postgres | `127.0.0.1:5432` and unix socket only | pipeline (as `ubuntu`) and `blogspro-api` (as `blogspro-api`), peer auth |
| Data API (Stage 2) | existing `blogspro-api.service`, `127.0.0.1:8787` | nginx `blogspro.in/api/*` behind Cloudflare |

- Postgres has two locks: `listen_addresses = 'localhost'`, and the host
  firewall rejects every port except 22, 80 and 443 (and 11434 from the VCN).
- No database role has a password, so a TCP login is impossible even from the
  box itself.
- No new public port and no new subdomain. Stage 2 extends the API that nginx
  already proxies at `/api/` and `/auth/`, so auth cookies stay same-origin.
- Proxying through blogspro-web-vps was rejected: this box already serves
  `blogspro.in` on 443, so an extra hop would add a dependency without removing
  any exposure.
- `install-postgres.sh` sets `/var/www/blogspro/.env` to 0600. The API runs as
  its own user and reads only `/etc/blogspro-api.env`. Before this change, that
  user could read every pipeline secret.

## Backups

Nightly at 03:00 IST (21:30 UTC), clear of the :00 pulse runs. The job:

1. Runs `pg_dump` (custom format) plus `pg_dumpall --globals-only --no-role-passwords`.
2. Restores the dump into the scratch database `blogspro_restore_check`. The run
   fails unless the restored table set matches live. Every night is therefore a
   restore test.
3. Builds a tar of both files and encrypts it with `age` to a public key. The
   private key never touches the VPS, so a box compromise or a leaked R2 token
   can't read old backups.
4. Uploads to Cloudflare R2, a different provider from Oracle, so an OCI account
   problem doesn't take the backups with it.
5. Keeps the last 3 encrypted copies in `/var/backups/blogspro-pg` and writes
   `/var/lib/blogspro-pg-backup/last-success`.

Plaintext dumps never outlive a run, and any failure means no upload and no
`last-success`. The tests are `npm test` → `deploy/vps/postgres/__tests__/`.

## One-time setup (owner only: needs your accounts and keys)

1. **age key pair, on your own machine:**
   ```bash
   age-keygen -o ~/blogspro-pg-backup.key
   ```
   - Store the key file in your password manager. It is the only way to read a
     backup.
   - The `Public key: age1…` line is what goes on the VPS.
2. **R2 bucket** `blogspro-pg-backups` in the Cloudflare dashboard:
   - Add a lifecycle rule that deletes objects after 30 days.
   - Add a **bucket lock** (retention) of 14 days. With it, a compromised VPS
     can't delete recent backups.
   - Create an R2 API token with *Object Read & Write* on this bucket only.
3. **On the VPS, as yourself:**
   ```bash
   sudo rclone config --config /etc/blogspro/rclone.conf
   ```
   - Create a remote named `r2` of type `s3`, provider `Cloudflare`, with your
     token and endpoint.
   - Then run `sudo chown root:postgres /etc/blogspro/rclone.conf` and
     `sudo chmod 640 /etc/blogspro/rclone.conf`.
4. Put the public key in `AGE_RECIPIENT=` in `/etc/blogspro/pg-backup.env`.

## Install or update

```bash
sudo deploy/vps/postgres/install-postgres.sh   # idempotent; re-run after steps 3–4 to enable the timer
sudo deploy/vps/postgres/verify-postgres.sh    # must print "all checks passed"
```

## Restore test (Stage 0 sign-off, then quarterly)

```bash
sudo systemctl start blogspro-pg-backup && journalctl -u blogspro-pg-backup -n 20 --no-pager
# on your machine, with the private key:
LATEST=$(rclone lsf r2:blogspro-pg-backups/daily | sort | tail -n 1)
rclone copy "r2:blogspro-pg-backups/daily/$LATEST" . && \
  age -d -i ~/blogspro-pg-backup.key "$LATEST" | tar -t
# full restore into a new database (key brought to the VPS only for this, then shredded):
LATEST=$(sudo ls -1t /var/backups/blogspro-pg | head -n 1)
sudo -u postgres /opt/blogspro-pg/restore.sh "/var/backups/blogspro-pg/$LATEST" /tmp/key.txt blogspro_drill
```

## Operate

```bash
systemctl list-timers 'blogspro-pg-*'
cat /var/lib/blogspro-pg-backup/last-success      # older than ~26 h means backups are failing
journalctl -u blogspro-pg-backup -n 50 --no-pager
```

Known gap: a failed backup only shows in `systemctl --failed` and through a
stale `last-success`. Alerting (Sentry cron monitor or Telegram) comes with
Stage 1's telemetry work.
