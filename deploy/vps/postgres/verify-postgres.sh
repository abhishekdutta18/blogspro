#!/usr/bin/env bash
# Post-install checks for the BlogsPro Postgres setup. Read-only; exits non-zero
# on the first broken guarantee so it can gate the Stage 0 sign-off.
#
#   sudo deploy/vps/postgres/verify-postgres.sh
set -uo pipefail

failures=0
pass() { echo "  ok    $*"; }
fail() { echo "  FAIL  $*"; failures=$((failures + 1)); }
check() { local desc="$1"; shift; if "$@" >/dev/null 2>&1; then pass "$desc"; else fail "$desc"; fi; }

# Every 5432 listener must be loopback.
only_loopback_listeners() {
  local addrs
  addrs=$(ss -ltnH 'sport = :5432' | awk '{print $4}')
  [ -n "$addrs" ] || return 1
  ! echo "$addrs" | grep -vqE '^(127\.0\.0\.1|\[::1\]):5432$'
}

as_pipeline() { sudo -u ubuntu psql -X -A -t -v ON_ERROR_STOP=1 -d blogspro -U blogspro_pipeline "$@"; }

echo "network"
check "postgres is running" systemctl is-active --quiet postgresql
check "5432 listens on loopback only" only_loopback_listeners
check "listen_addresses is localhost" test "$(sudo -u postgres psql -X -At -c 'show listen_addresses')" = localhost
check "TCP login without password is refused" \
  bash -c '! sudo -u ubuntu psql -X -w -h 127.0.0.1 -U blogspro_pipeline -d blogspro -c "select 1"'

echo "roles"
check "ubuntu maps to blogspro_pipeline" test "$(as_pipeline -c 'select current_user')" = blogspro_pipeline
check "pipeline can read schema_migrations" as_pipeline -c 'select count(*) from schema_migrations'
check "pipeline cannot create tables" bash -c '! sudo -u ubuntu psql -X -v ON_ERROR_STOP=1 -d blogspro -U blogspro_pipeline -c "create table verify_probe(x int)"'
check "no blogspro role has a password" \
  test "$(sudo -u postgres psql -X -At -c "select count(*) from pg_authid where rolname like 'blogspro%' and rolpassword is not null")" = 0

echo "backups"
check "backup script installed" test -x /opt/blogspro-pg/backup.sh
check "backup dir is postgres-only" test "$(stat -c '%U %a' /var/backups/blogspro-pg)" = "postgres 700"
check "backup env is root:postgres 640" test "$(stat -c '%U:%G %a' /etc/blogspro/pg-backup.env)" = "root:postgres 640"
if [ -f /etc/blogspro/rclone.conf ]; then
  check "rclone.conf is root:postgres 640" test "$(stat -c '%U:%G %a' /etc/blogspro/rclone.conf)" = "root:postgres 640"
  check "backup timer enabled" systemctl is-enabled --quiet blogspro-pg-backup.timer
else
  fail "/etc/blogspro/rclone.conf missing (R2 token not configured yet)"
fi

echo "secrets and neighbours"
check "pipeline .env is 0600" test "$(stat -c '%a' /var/www/blogspro/.env)" = 600
for t in hourly daily weekly; do
  check "blogspro-pulse@$t.timer still active" systemctl is-active --quiet "blogspro-pulse@$t.timer"
done

echo
if [ "$failures" -eq 0 ]; then echo "verify-postgres: all checks passed"; else echo "verify-postgres: $failures check(s) failed"; fi
exit "$failures"
