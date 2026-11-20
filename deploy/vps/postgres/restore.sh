#!/usr/bin/env bash
# Restore a BlogsPro backup made by backup.sh into a NEW database.
#
#   restore.sh <blogspro-*.tar.age> <age-identity-file> <target-db>
#
# The age identity (private key) is kept off the VPS; bring it only for the
# duration of a restore and delete it afterwards. Roles are not restored from
# globals.sql: run install-postgres.sh first, which creates the same roles, so
# object ownership in the dump resolves. The target database must not exist,
# which makes it impossible to overwrite the live database by accident.
set -euo pipefail

IDENTIFIER_RE='^[a-z_][a-z0-9_]*$'

die() { echo "restore: $*" >&2; exit 1; }
usage() { die "usage: restore.sh <backup.tar.age> <age-identity-file> <target-db>"; }

database_exists() {
  [ -n "$(psql -X -A -t -v ON_ERROR_STOP=1 -d postgres -c \
    "select datname from pg_database where datname = '$1'")" ]
}

main() {
  [ $# -eq 3 ] || usage
  local archive="$1" identity="$2" target="$3"
  [ -f "$archive" ] || die "backup file not found: $archive"
  [ -f "$identity" ] || die "age identity file not found: $identity"
  [[ "$target" =~ $IDENTIFIER_RE ]] || die "target database must be a plain identifier"
  if database_exists "$target"; then die "database $target already exists; pick a new name"; fi

  umask 077
  WORK_DIR=$(mktemp -d)
  trap 'rm -rf -- "$WORK_DIR"' EXIT

  age -d -i "$identity" -o "$WORK_DIR/backup.tar" "$archive"
  tar -C "$WORK_DIR" -xf "$WORK_DIR/backup.tar"
  local dump
  dump=$(ls "$WORK_DIR"/blogspro-*.dump 2>/dev/null | head -n 1)
  [ -n "$dump" ] || die "archive contains no blogspro-*.dump"

  createdb "$target"
  pg_restore --exit-on-error -d "$target" "$dump"
  echo "restore: restored $(basename "$dump") into $target"
}

main "$@"
