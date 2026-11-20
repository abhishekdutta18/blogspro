/**
 * Behaviour tests for deploy/vps/postgres/backup.sh.
 *
 * The script is run for real with bash, but pg_dump, pg_dumpall, pg_restore,
 * psql, createdb, dropdb, age and rclone are replaced by stub executables on
 * PATH. Each stub records its argv to calls.log and can be told to fail via
 * FAIL_<NAME>=1, so every test asserts on observable effects: exit code,
 * which commands ran, and which files are left on disk.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, chmodSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'backup.sh');
const STUBBED = ['pg_dump', 'pg_dumpall', 'pg_restore', 'psql', 'createdb', 'dropdb', 'age', 'rclone'];

// One stub body serves every command; behaviour branches on the invoked name.
const STUB = `#!/usr/bin/env bash
name=$(basename "$0")
echo "$name $*" >> "$STUB_LOG"
flag="FAIL_$(echo "$name" | tr 'a-z' 'A-Z')"
if [ "\${!flag:-}" = "1" ]; then echo "$name: forced failure" >&2; exit 1; fi
case "$name" in
  pg_dump)  out=""; while [ $# -gt 0 ]; do [ "$1" = "-f" ] && out="$2"; shift; done; echo dump > "$out" ;;
  pg_dumpall) echo "-- globals" ;;
  psql)
    # The script asks for the table list of the live and the restored database.
    db=""; while [ $# -gt 0 ]; do [ "$1" = "-d" ] && db="$2"; shift; done
    if [ "$db" = "$RESTORE_DB_NAME" ]; then printf '%s' "\${TABLES_RESTORED-public.posts
public.users}"; else printf '%s' "\${TABLES_LIVE-public.posts
public.users}"; fi ;;
  age) out=""; in=""; while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; -r) shift;; *) in="$1";; esac; shift; done; cp "$in" "$out" ;;
esac
exit 0
`;

let root;
let env;

function run(extraEnv = {}) {
  const result = spawnSync('bash', [SCRIPT], { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  const log = existsSync(env.STUB_LOG) ? readFileSync(env.STUB_LOG, 'utf8') : '';
  return { ...result, calls: log.split('\n').filter(Boolean) };
}

const called = (calls, name) => calls.some((line) => line.startsWith(`${name} `));
const plaintextLeft = () => readdirSync(env.BACKUP_DIR).filter((f) => !f.endsWith('.age'));

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pg-backup-test-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const name of STUBBED) {
    const path = join(bin, name);
    writeFileSync(path, STUB);
    chmodSync(path, 0o755);
  }
  env = {
    PATH: `${bin}:/usr/bin:/bin`,
    HOME: root,
    STUB_LOG: join(root, 'calls.log'),
    PGDATABASE: 'blogspro',
    RESTORE_DB_NAME: 'blogspro_restore_check',
    BACKUP_DIR: join(root, 'backups'),
    STATE_DIR: join(root, 'state'),
    AGE_RECIPIENT: 'age1testrecipientxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    RCLONE_REMOTE: 'r2:blogspro-pg-backups/daily',
    KEEP_LOCAL: '3',
  };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('backup.sh happy path', () => {
  it('dumps, verifies a restore, encrypts, uploads and records success', () => {
    const res = run();

    expect(res.status, res.stderr).toBe(0);
    expect(called(res.calls, 'pg_dump')).toBe(true);
    expect(res.calls.find((c) => c.startsWith('pg_restore '))).toContain('blogspro_restore_check');
    expect(res.calls.find((c) => c.startsWith('age '))).toContain(env.AGE_RECIPIENT);
    expect(res.calls.find((c) => c.startsWith('rclone '))).toMatch(/copyto .*blogspro-\d{8}T\d{6}Z\.tar\.age r2:blogspro-pg-backups\/daily\/blogspro-\d{8}T\d{6}Z\.tar\.age/);
    expect(existsSync(join(env.STATE_DIR, 'last-success'))).toBe(true);
  });

  it('drops the scratch restore database afterwards', () => {
    const res = run();
    const drops = res.calls.filter((c) => c.startsWith('dropdb ') && c.includes('blogspro_restore_check'));
    expect(drops.length).toBeGreaterThanOrEqual(2); // before (stale) and after
  });

  it('leaves only encrypted files in the backup directory', () => {
    run();
    expect(plaintextLeft()).toEqual([]);
    expect(readdirSync(env.BACKUP_DIR).filter((f) => f.endsWith('.age'))).toHaveLength(1);
  });

  it('dumps globals without role passwords', () => {
    const res = run();
    expect(res.calls.find((c) => c.startsWith('pg_dumpall '))).toMatch(/--globals-only.*--no-role-passwords|--no-role-passwords.*--globals-only/);
  });
});

describe('backup.sh failures never upload and never record success', () => {
  for (const [what, extra] of [
    ['pg_dump fails', { FAIL_PG_DUMP: '1' }],
    ['the restore check fails', { FAIL_PG_RESTORE: '1' }],
    ['the restored table set differs from live', { TABLES_RESTORED: 'public.posts' }],
    ['the live database has no tables', { TABLES_LIVE: '', TABLES_RESTORED: '' }],
    ['encryption fails', { FAIL_AGE: '1' }],
  ]) {
    it(`when ${what}`, () => {
      const res = run(extra);
      expect(res.status).not.toBe(0);
      expect(called(res.calls, 'rclone')).toBe(false);
      expect(existsSync(join(env.STATE_DIR, 'last-success'))).toBe(false);
      expect(plaintextLeft()).toEqual([]);
    });
  }

  it('when the upload fails, exits non-zero and keeps the encrypted file for retry', () => {
    const res = run({ FAIL_RCLONE: '1' });
    expect(res.status).not.toBe(0);
    expect(existsSync(join(env.STATE_DIR, 'last-success'))).toBe(false);
    expect(readdirSync(env.BACKUP_DIR).filter((f) => f.endsWith('.age'))).toHaveLength(1);
    expect(plaintextLeft()).toEqual([]);
  });
});

describe('backup.sh configuration', () => {
  for (const key of ['AGE_RECIPIENT', 'RCLONE_REMOTE', 'PGDATABASE']) {
    it(`fails fast without ${key}`, () => {
      const res = run({ [key]: '' });
      expect(res.status).not.toBe(0);
      expect(res.stderr).toContain(key);
      expect(res.calls).toEqual([]);
    });
  }

  it('refuses a restore database name equal to the live database', () => {
    const res = run({ RESTORE_DB_NAME: 'blogspro' });
    expect(res.status).not.toBe(0);
    expect(called(res.calls, 'dropdb')).toBe(false);
  });
});

describe('backup.sh local retention', () => {
  it('keeps only the newest KEEP_LOCAL encrypted files', () => {
    mkdirSync(env.BACKUP_DIR, { recursive: true });
    const old = ['blogspro-20250101T000000Z.tar.age', 'blogspro-20250102T000000Z.tar.age', 'blogspro-20250103T000000Z.tar.age'];
    old.forEach((f, i) => {
      const p = join(env.BACKUP_DIR, f);
      writeFileSync(p, 'x');
      const t = new Date(Date.UTC(2025, 0, 1 + i)).getTime() / 1000;
      utimesSync(p, t, t);
    });

    const res = run();

    expect(res.status, res.stderr).toBe(0);
    const left = readdirSync(env.BACKUP_DIR).sort();
    expect(left).toHaveLength(3);
    expect(left).not.toContain('blogspro-20250101T000000Z.tar.age');
  });
});
