/**
 * End-to-end: the pipeline's storage bridge writing documents to the real BlogsPro API
 * (in-memory SQLite) through the service token, and files to a temporary media directory.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/src/config.js';
import { createApp } from '../server/src/app.js';
import {
  saveRecord, checkPeriodStatus, getPendingAudits, updateAuditStatus,
  saveToCloudBucket, loadFromCloudBucket, listAllManuscripts
} from '../scripts/lib/storage-bridge.js';
import { getDocument, listPublicDocuments, saveDocument } from '../scripts/lib/vps-store.js';

const TOKEN = 'svc_'.padEnd(48, 'k');
let server;
let env;
let mediaDir;

before(async () => {
  const config = loadConfig({ DB_PATH: ':memory:', SITE_ORIGIN: 'http://localhost:4321', INSECURE_COOKIES: '1', SERVICE_TOKEN: TOKEN });
  server = createServer(createApp(config).handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  mediaDir = mkdtempSync(path.join(tmpdir(), 'bp-media-'));
  env = Object.freeze({ BLOGSPRO_API_URL: `http://127.0.0.1:${server.address().port}`, BLOGSPRO_SERVICE_TOKEN: TOKEN, MEDIA_DIR: mediaDir });
});

after(() => {
  server.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

test('saveRecord upserts by id and the public route only shows published posts', async () => {
  assert.equal(await saveRecord('posts', { id: 'p1', title: 'Live', published: true }, env), true);
  assert.equal(await saveRecord('posts', { id: 'p2', title: 'Draft', published: false }, env), true);
  assert.equal(await saveRecord('posts', { id: 'p1', views: 3 }, env), true);
  const merged = await getDocument('posts', 'p1', env);
  assert.equal(merged.title, 'Live');
  assert.equal(merged.views, 3);
  assert.equal(merged.id, 'p1');
  const visible = await listPublicDocuments('posts', {}, env);
  assert.deepEqual(visible.map(post => post.id), ['p1']);
});

test('checkPeriodStatus reads run state from telemetry_logs', async () => {
  assert.deepEqual(await checkPeriodStatus('daily', '2026-11-20', env), { status: 'IDLE' });
  await saveDocument('telemetry_logs', { event: 'SWARM_START', frequency: 'daily', periodId: '2026-11-20', jobId: 'j1', timestamp: new Date().toISOString() }, env, null);
  assert.deepEqual(await checkPeriodStatus('daily', '2026-11-20', env), { status: 'ACTIVE', jobId: 'j1' });
  await saveDocument('telemetry_logs', { event: 'SWARM_COMPLETE', status: 'success', frequency: 'daily', periodId: '2026-11-20', timestamp: new Date().toISOString() }, env, null);
  assert.deepEqual(await checkPeriodStatus('daily', '2026-11-20', env), { status: 'SUCCESS' });
});

test('pending audits list newest first and a decision is recorded', async () => {
  await saveDocument('pending_audits', { status: 'PENDING', createdAt: '2026-11-01T00:00:00Z' }, env, 'a-old');
  await saveDocument('pending_audits', { status: 'PENDING', createdAt: '2026-11-02T00:00:00Z' }, env, 'a-new');
  assert.deepEqual((await getPendingAudits(env)).map(audit => audit.id), ['a-new', 'a-old']);
  assert.equal(await updateAuditStatus('a-new', 'APPROVED', 'ok', env), true);
  assert.deepEqual((await getPendingAudits(env)).map(audit => audit.id), ['a-old']);
});

test('fragments and manuscripts round-trip through the media store', async () => {
  await saveToCloudBucket('sectors/job-9/macro.json', { verticalId: 'macro', content: 'x' }, env);
  await saveToCloudBucket('sectors/job-9/rates.json', { verticalId: 'rates', content: 'y' }, env);
  await saveToCloudBucket('manuscripts/job-9.html', '<h1>t</h1>', env);
  const fragments = await loadFromCloudBucket('job-9', env);
  assert.deepEqual(fragments.map(fragment => fragment.verticalId), ['macro', 'rates']);
  assert.deepEqual(await listAllManuscripts(env), [{ name: 'manuscripts/job-9.html' }]);
  assert.equal(await saveToCloudBucket('../escape.txt', 'no', env), null);
});

test('without a service token the bridge skips writes instead of throwing', async () => {
  const offline = { BLOGSPRO_API_URL: env.BLOGSPRO_API_URL, BLOGSPRO_SERVICE_TOKEN: '' };
  const previous = process.env.BLOGSPRO_SERVICE_TOKEN;
  delete process.env.BLOGSPRO_SERVICE_TOKEN;
  try {
    assert.equal(await saveRecord('posts', { id: 'x' }, offline), false);
  } finally {
    if (previous !== undefined) process.env.BLOGSPRO_SERVICE_TOKEN = previous;
  }
});
