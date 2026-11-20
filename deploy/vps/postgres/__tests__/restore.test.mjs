/**
 * Behaviour tests for deploy/vps/postgres/restore.sh (disaster recovery).
 * Same approach as backup.test.mjs: real bash, stubbed tools on PATH.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'restore.sh');

// age -d writes a real tar (built in beforeEach) so the script's tar step is exercised.
const STUB = `#!/usr/bin/env bash
name=$(basename "$0")
echo "$name $*" >> "$STUB_LOG"
flag="FAIL_$(echo "$name" | tr 'a-z' 'A-Z')"
if [ "\${!flag:-}" = "1" ]; then echo "$name: forced failure" >&2; exit 1; fi
case "$name" in
  age) out=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done; cp "$FIXTURE_TAR" "$out" ;;
  psql) printf '%s' "\${EXISTING_DBS-}" ;;
esac
exit 0
`;

let root;
let env;
let archive;
let identity;

function run(args, extraEnv = {}) {
  const result = spawnSync('bash', [SCRIPT, ...args], { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  const log = existsSync(env.STUB_LOG) ? readFileSync(env.STUB_LOG, 'utf8') : '';
  return { ...result, calls: log.split('\n').filter(Boolean) };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pg-restore-test-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  for (const name of ['age', 'createdb', 'pg_restore', 'psql']) {
    writeFileSync(join(bin, name), STUB);
    chmodSync(join(bin, name), 0o755);
  }
  const fixture = join(root, 'fixture');
  mkdirSync(fixture);
  writeFileSync(join(fixture, 'blogspro-20261120T213000Z.dump'), 'dump');
  writeFileSync(join(fixture, 'globals.sql'), '-- globals');
  spawnSync('tar', ['-C', fixture, '-cf', join(root, 'fixture.tar'), 'blogspro-20261120T213000Z.dump', 'globals.sql']);

  archive = join(root, 'blogspro-20261120T213000Z.tar.age');
  writeFileSync(archive, 'encrypted');
  identity = join(root, 'key.txt');
  writeFileSync(identity, 'AGE-SECRET-KEY-TEST');
  env = { PATH: `${bin}:/usr/bin:/bin`, HOME: root, STUB_LOG: join(root, 'calls.log'), FIXTURE_TAR: join(root, 'fixture.tar') };
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('restore.sh', () => {
  it('decrypts with the given identity, creates the target and restores into it', () => {
    const res = run([archive, identity, 'blogspro_drill']);

    expect(res.status, res.stderr).toBe(0);
    expect(res.calls.find((c) => c.startsWith('age '))).toMatch(/-d .*-i .*key\.txt/);
    expect(res.calls).toContain('createdb blogspro_drill');
    expect(res.calls.find((c) => c.startsWith('pg_restore '))).toMatch(/--exit-on-error .*-d blogspro_drill .*blogspro-20261120T213000Z\.dump/);
  });

  it('refuses a target database that already exists', () => {
    const res = run([archive, identity, 'blogspro'], { EXISTING_DBS: 'blogspro' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('already exists');
    expect(res.calls.some((c) => c.startsWith('pg_restore '))).toBe(false);
  });

  it('prints usage and does nothing with missing arguments', () => {
    const res = run([archive]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/usage/i);
    expect(res.calls).toEqual([]);
  });

  it('rejects a target name that is not a plain identifier', () => {
    const res = run([archive, identity, 'x; drop database blogspro']);
    expect(res.status).not.toBe(0);
    expect(res.calls).toEqual([]);
  });

  it('stops before restoring when decryption fails', () => {
    const res = run([archive, identity, 'blogspro_drill'], { FAIL_AGE: '1' });
    expect(res.status).not.toBe(0);
    expect(res.calls.some((c) => c.startsWith('createdb '))).toBe(false);
  });
});
