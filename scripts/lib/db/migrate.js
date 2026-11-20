/**
 * Plain-SQL migration runner for the BlogsPro Postgres database.
 *
 * Applies `NNN_name.sql` files from `dir` in filename order, each inside its
 * own transaction, and records the version (the filename without `.sql`) in
 * `schema_migrations`. Already-applied versions are skipped, so running it
 * again is safe. A failing file is rolled back completely and nothing after it
 * runs.
 *
 * `client` must be ONE connection (a `pg.Client` or a PGlite instance), not a
 * pool, because BEGIN/COMMIT must reach the same session.
 *
 * On the VPS, migrations run as `postgres` with `role: 'blogspro_owner'`, so
 * new tables are owned by that role and pick up the default privileges that
 * install-postgres.sh grants to the pipeline.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

// PGlite runs multi-statement scripts through exec(); pg.Client.query() accepts
// them as long as no parameters are passed.
function runScript(client, sql) {
  return typeof client.exec === 'function' ? client.exec(sql) : client.query(sql);
}

function pendingMigrations(dir, applied) {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, version: basename(file, '.sql') }))
    .filter(({ version }) => !applied.has(version));
}

async function applyOne(client, dir, { file, version }, role) {
  const sql = readFileSync(join(dir, file), 'utf8');
  await client.query('begin');
  try {
    if (role) await client.query(`set local role ${role}`);
    await runScript(client, sql);
    if (role) await client.query('reset role');
    await client.query('insert into schema_migrations (version) values ($1)', [version]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw new Error(`migrate: ${file} failed: ${error.message}`, { cause: error });
  }
}

/**
 * @param {{ query: Function, exec?: Function }} client  single connection
 * @param {{ dir: string, role?: string }} options
 * @returns {Promise<string[]>} versions applied by this call, in order
 */
export async function migrate(client, { dir, role } = {}) {
  if (!dir) throw new Error('migrate: dir is required');
  if (role !== undefined && !IDENTIFIER.test(role)) {
    throw new Error('migrate: role must be a plain lower-case identifier');
  }

  await client.query(
    `create table if not exists schema_migrations (
       version text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const { rows } = await client.query('select version from schema_migrations');
  const applied = new Set(rows.map((row) => row.version));

  const done = [];
  for (const migration of pendingMigrations(dir, applied)) {
    await applyOne(client, dir, migration, role);
    done.push(migration.version);
  }
  return done;
}
