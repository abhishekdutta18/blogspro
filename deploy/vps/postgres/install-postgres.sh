#!/usr/bin/env bash
# Install and configure Postgres 16 for BlogsPro on blogspro-ai-vps. Idempotent.
#
#   sudo deploy/vps/postgres/install-postgres.sh
#
# Network: Postgres listens on localhost and its unix socket only. The host
# firewall already rejects 5432; this is the second lock. No role has a
# password, so TCP logins are impossible; local logins use peer auth:
#   OS user ubuntu        -> role blogspro_pipeline  (pulse runs as ubuntu)
#   OS user blogspro-api  -> role blogspro_api       (existing API service)
#
# Does NOT touch the pulse timers, /var/lib/blogspro-pulse or nginx.
set -euo pipefail

PG_VERSION=16
PG_ETC="/etc/postgresql/$PG_VERSION/main"
HERE="$(cd "$(dirname "$0")" && pwd)"
MARK_BEGIN="# >>> blogspro managed block >>>"
MARK_END="# <<< blogspro managed block <<<"

die() { echo "install-postgres: $*" >&2; exit 1; }
log() { echo "install-postgres: $*"; }
psql_admin() { sudo -u postgres psql -X -v ON_ERROR_STOP=1 "$@"; }

# Replaces (or prepends) a marked block in a config file, keeping a backup.
write_managed_block() {
  local file="$1" body="$2" tmp
  cp -p "$file" "$file.bak-blogspro"
  tmp=$(mktemp)
  { printf '%s\n%s\n%s\n' "$MARK_BEGIN" "$body" "$MARK_END"
    sed "/^$MARK_BEGIN\$/,/^$MARK_END\$/d" "$file"; } > "$tmp"
  install -o postgres -g postgres -m 0640 "$tmp" "$file"
  rm -f "$tmp"
}

install_packages() {
  log "installing postgresql-$PG_VERSION, age, rclone"
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q "postgresql-$PG_VERSION" age rclone
}

configure_server() {
  log "writing $PG_ETC/conf.d/10-blogspro.conf"
  local conf
  conf=$(mktemp)
  cat > "$conf" <<'EOF'
# Managed by deploy/vps/postgres/install-postgres.sh
listen_addresses = 'localhost'
password_encryption = 'scram-sha-256'
# The box also runs ollama and llama-server; keep Postgres modest.
shared_buffers = '1GB'
effective_cache_size = '4GB'
log_min_duration_statement = '2s'
EOF
  install -o postgres -g postgres -m 0644 "$conf" "$PG_ETC/conf.d/10-blogspro.conf"
  rm -f "$conf"
  write_managed_block "$PG_ETC/pg_ident.conf" \
"blogspro  ubuntu        blogspro_pipeline
blogspro  blogspro-api  blogspro_api"
  write_managed_block "$PG_ETC/pg_hba.conf" \
"local  blogspro  blogspro_pipeline,blogspro_api  peer  map=blogspro"
  systemctl enable --quiet postgresql
  systemctl restart postgresql
}

create_database() {
  log "creating roles and database"
  psql_admin -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blogspro_owner') THEN CREATE ROLE blogspro_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blogspro_pipeline') THEN CREATE ROLE blogspro_pipeline LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'blogspro_api') THEN CREATE ROLE blogspro_api LOGIN; END IF;
END $$;
SQL
  if [ -z "$(psql_admin -d postgres -At -c "select 1 from pg_database where datname = 'blogspro'")" ]; then
    sudo -u postgres createdb -O blogspro_owner blogspro
  fi
  # Stage 1 migrations run as postgres with SET ROLE blogspro_owner, so the
  # default privileges below apply to every table they create.
  psql_admin -d blogspro <<'SQL'
REVOKE ALL ON DATABASE blogspro FROM PUBLIC;
GRANT CONNECT ON DATABASE blogspro TO blogspro_pipeline, blogspro_api;
ALTER SCHEMA public OWNER TO blogspro_owner;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO blogspro_pipeline, blogspro_api;
SET ROLE blogspro_owner;
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO blogspro_pipeline;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO blogspro_pipeline;
GRANT SELECT ON public.schema_migrations TO blogspro_pipeline;
RESET ROLE;
SQL
}

install_backup() {
  log "installing backup script and timer"
  install -d -o root -g root -m 0755 /opt/blogspro-pg
  install -o root -g root -m 0755 "$HERE/backup.sh" "$HERE/restore.sh" /opt/blogspro-pg/
  install -d -o postgres -g postgres -m 0700 /var/backups/blogspro-pg
  install -d -o root -g postgres -m 0750 /etc/blogspro
  if [ ! -f /etc/blogspro/pg-backup.env ]; then
    install -o root -g postgres -m 0640 "$HERE/pg-backup.env.example" /etc/blogspro/pg-backup.env
    log "created /etc/blogspro/pg-backup.env from the example; set AGE_RECIPIENT"
  fi
  install -m 0644 "$HERE/blogspro-pg-backup.service" "$HERE/blogspro-pg-backup.timer" /etc/systemd/system/
  systemctl daemon-reload
  # The timer is enabled only once the R2 token and age key are in place.
  if grep -q '^AGE_RECIPIENT=age1' /etc/blogspro/pg-backup.env && [ -f /etc/blogspro/rclone.conf ]; then
    systemctl enable --now blogspro-pg-backup.timer
  else
    log "backup timer NOT enabled yet: add AGE_RECIPIENT and /etc/blogspro/rclone.conf, then re-run"
  fi
}

# The existing blogspro-api service reads /etc/blogspro-api.env, not this file,
# and the pulse runs as its owner, so 0600 only removes access for other users.
harden_pipeline_env() {
  if [ -f /var/www/blogspro/.env ]; then
    chmod 0600 /var/www/blogspro/.env
    log "set /var/www/blogspro/.env to 0600"
  fi
}

main() {
  [ "$(id -u)" = 0 ] || die "run with sudo"
  install_packages
  configure_server
  create_database
  install_backup
  harden_pipeline_env
  log "done; now run: sudo $HERE/verify-postgres.sh"
}

main "$@"
