/**
 * Tests for the plain-SQL migration runner and the initial schema.
 * Runs against PGlite (Postgres compiled to WASM) so no server is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../migrate.js';

const REAL_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

let db;
let dir;

const tableExists = async (name) =>
  (await db.query(`select to_regclass($1) is not null as ok`, [`public.${name}`])).rows[0].ok;
const appliedVersions = async () =>
  (await db.query('select version from schema_migrations order by version')).rows.map((r) => r.version);

beforeEach(async () => {
  db = new PGlite();
  dir = mkdtempSync(join(tmpdir(), 'migrations-'));
});

afterEach(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('migrate()', () => {
  it('applies .sql files in filename order and records each version', async () => {
    writeFileSync(join(dir, '002_b.sql'), 'alter table a add column note text;');
    writeFileSync(join(dir, '001_a.sql'), 'create table a (id int primary key);');
    writeFileSync(join(dir, 'README.md'), 'not a migration');

    const applied = await migrate(db, { dir });

    expect(applied).toEqual(['001_a', '002_b']);
    expect(await appliedVersions()).toEqual(['001_a', '002_b']);
    expect(await tableExists('a')).toBe(true);
  });

  it('is a no-op the second time', async () => {
    writeFileSync(join(dir, '001_a.sql'), 'create table a (id int primary key);');
    await migrate(db, { dir });

    expect(await migrate(db, { dir })).toEqual([]);
  });

  it('rolls back a failing migration completely and names the file', async () => {
    writeFileSync(join(dir, '001_ok.sql'), 'create table ok (id int);');
    writeFileSync(join(dir, '002_bad.sql'), 'create table half (id int); select * from missing_table;');

    await expect(migrate(db, { dir })).rejects.toThrow(/002_bad/);

    expect(await appliedVersions()).toEqual(['001_ok']);
    expect(await tableExists('half')).toBe(false);
  });

  it('creates tables as the given role so default privileges apply', async () => {
    // Mirrors install-postgres.sh, where blogspro_owner owns the public schema.
    await db.exec('create role blogspro_owner nologin; grant usage, create on schema public to blogspro_owner;');
    writeFileSync(join(dir, '001_a.sql'), 'create table owned (id int);');

    await migrate(db, { dir, role: 'blogspro_owner' });

    const owner = (await db.query(`select tableowner from pg_tables where tablename = 'owned'`)).rows[0].tableowner;
    expect(owner).toBe('blogspro_owner');
  });

  it('rejects a role that is not a plain identifier', async () => {
    await expect(migrate(db, { dir, role: 'x; drop table y' })).rejects.toThrow(/role/);
  });
});

describe('001_init schema', () => {
  beforeEach(async () => {
    await migrate(db, { dir: REAL_MIGRATIONS });
  });

  it('creates every table the pipeline and site need', async () => {
    for (const t of ['users', 'posts', 'comments', 'subscribers', 'kv', 'telemetry_events', 'swarm_fragments', 'audits', 'pulse_briefings']) {
      expect(await tableExists(t), t).toBe(true);
    }
  });

  it('only allows the four known user roles', async () => {
    await db.query(`insert into users (id, email, role) values ('u1', 'a@example.com', 'editor')`);
    await expect(db.query(`insert into users (id, email, role) values ('u2', 'b@example.com', 'superuser')`)).rejects.toThrow();
  });

  it('treats emails case-insensitively for uniqueness', async () => {
    await db.query(`insert into users (id, email) values ('u1', 'A@Example.com')`);
    await expect(db.query(`insert into users (id, email) values ('u2', 'a@example.com')`)).rejects.toThrow();
    await db.query(`insert into subscribers (email) values ('X@Example.com')`);
    await expect(db.query(`insert into subscribers (email) values ('x@example.com')`)).rejects.toThrow();
  });

  it('enforces unique post slugs and keeps unknown fields in extra', async () => {
    await db.query(`insert into posts (id, slug, title, content, extra) values ('p1', 'hello', 'Hello', 'body', '{"seoScore": 7}')`);
    await expect(db.query(`insert into posts (id, slug, title, content) values ('p2', 'hello', 'Dup', 'body')`)).rejects.toThrow();
    const row = (await db.query(`select extra->>'seoScore' as s, published, views from posts where id = 'p1'`)).rows[0];
    expect(row).toEqual({ s: '7', published: false, views: 0 });
  });

  it('deletes a post\'s comments with it', async () => {
    await db.query(`insert into posts (id, slug, title, content) values ('p1', 'hello', 'Hello', 'body')`);
    await db.query(`insert into comments (post_id, body) values ('p1', 'nice')`);
    await db.query(`delete from posts where id = 'p1'`);
    expect((await db.query('select count(*)::int as n from comments')).rows[0].n).toBe(0);
  });

  it('stores telemetry details as jsonb with an occurred_at index', async () => {
    await db.query(`insert into telemetry_events (event, details) values ('SWARM_QA_COMPLETE', '{"score": 0.9}')`);
    const row = (await db.query(`select details->>'score' as score, status, frequency from telemetry_events`)).rows[0];
    expect(row).toEqual({ score: '0.9', status: 'info', frequency: 'unknown' });
    const idx = (await db.query(`select indexname from pg_indexes where tablename = 'telemetry_events'`)).rows.map((r) => r.indexname);
    expect(idx).toContain('telemetry_events_occurred_at_idx');
  });

  it('keys kv by namespace and key', async () => {
    await db.query(`insert into kv (namespace, key, value) values ('site', 'config', '{"a": 1}')`);
    await expect(db.query(`insert into kv (namespace, key, value) values ('site', 'config', '{}')`)).rejects.toThrow();
  });
});
