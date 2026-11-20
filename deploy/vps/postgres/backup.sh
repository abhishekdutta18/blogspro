#!/usr/bin/env bash
# Nightly Postgres backup for blogspro-ai-vps (runs as the postgres user).
#
#   pg_dump  ->  restore into a scratch database and compare table sets
#            ->  tar with globals  ->  age-encrypt to an offline public key
#            ->  upload to Cloudflare R2 with rclone  ->  prune local copies
#
# Plaintext never outlives the run. "last-success" is written only after the
# encrypted file is uploaded, so a stale timestamp means backups are failing.
#
# Settings (from /etc/blogspro/pg-backup.env via systemd EnvironmentFile):
#   PGDATABASE       database to back up                     (required)
#   AGE_RECIPIENT    age public key; private key stays off the VPS (required)
#   RCLONE_REMOTE    e.g. r2:blogspro-pg-backups/daily       (required)
#   RCLONE_CONFIG    rclone config holding the R2 token      (read by rclone)
#   BACKUP_DIR       local encrypted copies  (default /var/backups/blogspro-pg)
#   STATE_DIR        last-success marker     (default /var/lib/blogspro-pg-backup)
#   RESTORE_DB_NAME  scratch database        (default blogspro_restore_check)
#   KEEP_LOCAL       encrypted copies kept locally (default 3)
set -euo pipefail

: "${BACKUP_DIR:=/var/backups/blogspro-pg}"
: "${STATE_DIR:=/var/lib/blogspro-pg-backup}"
: "${RESTORE_DB_NAME:=blogspro_restore_check}"
: "${KEEP_LOCAL:=3}"

IDENTIFIER_RE='^[a-z_][a-z0-9_]*$'

die() { echo "backup: $*" >&2; exit 1; }
log() { echo "backup: $*"; }

# Fails fast, before any command runs, when a required setting is empty.
require_settings() {
  local key
  for key in "$@"; do
    [ -n "${!key:-}" ] || die "missing required setting $key"
  done
}

# Guards against dropping the live database and against shell injection via names.
validate_settings() {
  [[ "$PGDATABASE" =~ $IDENTIFIER_RE ]] || die "PGDATABASE is not a plain identifier"
  [[ "$RESTORE_DB_NAME" =~ $IDENTIFIER_RE ]] || die "RESTORE_DB_NAME is not a plain identifier"
  [ "$RESTORE_DB_NAME" != "$PGDATABASE" ] || die "RESTORE_DB_NAME must differ from PGDATABASE"
  [[ "$KEEP_LOCAL" =~ ^[1-9][0-9]*$ ]] || die "KEEP_LOCAL must be a positive integer"
}

# Prints user tables as schema.table, one per line, sorted.
list_tables() {
  psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" -c \
    "select schemaname || '.' || tablename from pg_tables
     where schemaname not in ('pg_catalog', 'information_schema') order by 1"
}

# Restores the dump into a scratch database and checks it has the live table set.
verify_restore() {
  local dump="$1" live restored
  dropdb --if-exists "$RESTORE_DB_NAME"
  RESTORE_STARTED=1
  createdb "$RESTORE_DB_NAME"
  pg_restore --exit-on-error -d "$RESTORE_DB_NAME" "$dump"

  live=$(list_tables "$PGDATABASE")
  restored=$(list_tables "$RESTORE_DB_NAME")
  [ -n "$live" ] || die "live database has no tables; refusing to ship an empty backup"
  [ "$live" = "$restored" ] || die "restored table set differs from live database"

  dropdb --if-exists "$RESTORE_DB_NAME"
  log "restore check passed ($(echo "$live" | wc -l | tr -d ' ') tables)"
}

# Deletes all but the newest KEEP_LOCAL encrypted backups.
prune_local() {
  ls -1t "$BACKUP_DIR"/blogspro-*.tar.age 2>/dev/null \
    | tail -n +"$((KEEP_LOCAL + 1))" \
    | while IFS= read -r old; do rm -f -- "$old"; log "pruned $(basename "$old")"; done
}

cleanup() {
  rm -rf -- "${WORK_DIR:-}"
  if [ "${RESTORE_STARTED:-0}" = 1 ]; then
    dropdb --if-exists "$RESTORE_DB_NAME" >/dev/null 2>&1 || true
  fi
}

main() {
  require_settings PGDATABASE AGE_RECIPIENT RCLONE_REMOTE
  validate_settings

  umask 077
  mkdir -p "$BACKUP_DIR" "$STATE_DIR"
  WORK_DIR=$(mktemp -d "$BACKUP_DIR/.work.XXXXXX")
  trap cleanup EXIT

  local name="blogspro-$(date -u +%Y%m%dT%H%M%SZ)"
  local encrypted="$BACKUP_DIR/$name.tar.age"

  log "dumping $PGDATABASE"
  pg_dump --format=custom -d "$PGDATABASE" -f "$WORK_DIR/$name.dump"
  pg_dumpall --globals-only --no-role-passwords > "$WORK_DIR/globals.sql"

  verify_restore "$WORK_DIR/$name.dump"

  tar -C "$WORK_DIR" -cf "$WORK_DIR/$name.tar" "$name.dump" globals.sql
  age -r "$AGE_RECIPIENT" -o "$WORK_DIR/$name.tar.age" "$WORK_DIR/$name.tar"
  mv -- "$WORK_DIR/$name.tar.age" "$encrypted"

  log "uploading $(basename "$encrypted") to $RCLONE_REMOTE"
  rclone --s3-no-check-bucket copyto "$encrypted" "$RCLONE_REMOTE/$name.tar.age"

  prune_local
  date -u +%Y-%m-%dT%H:%M:%SZ" $name" > "$STATE_DIR/last-success.tmp"
  mv -- "$STATE_DIR/last-success.tmp" "$STATE_DIR/last-success"
  log "done"
}

main "$@"
