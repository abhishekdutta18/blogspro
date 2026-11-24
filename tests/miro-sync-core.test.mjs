// Tests for scripts/lib/miro-sync-core.js — the shared MiroSync bridge used by the DO and the VPS service.
// Run: node --test tests/miro-sync-core.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import { MiroSyncCore, nextProgressEntry, DOC_KEY } from '../scripts/lib/miro-sync-core.js';

const cores = [];
after(() => cores.forEach((c) => c.destroy()));
const track = (core) => { cores.push(core); return core; };
const quiet = { info() {}, warn() {}, error() {} };

function memoryStore() {
  const data = new Map();
  return { data, get: async (k) => data.get(k), put: async (k, v) => { data.set(k, v); } };
}

const req = (path, init) => new Request(`http://local${path}`, init);
const push = (core, body, headers = {}) => core.handleRequest(req('/push', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
}));

test('nextProgressEntry seeds a SWARM_PROGRESS entry and appends trace without mutating the previous one', () => {
  const first = nextProgressEntry(undefined, { source: 'SWARM_PROGRESS', stage: 'INGEST', trace: { stepId: 'a' } }, 'j1', 't1');
  assert.deepEqual(first, { jobId: 'j1', stages: [], logs: [], trace: [{ stepId: 'a' }], timestamp: 't1', stage: 'INGEST', message: 'Telemetry Sync...' });
  const second = nextProgressEntry(first, { source: 'SWARM_PROGRESS', trace: { stepId: 'b' } }, 'j1', 't2');
  assert.equal(first.trace.length, 1);
  assert.deepEqual(second.trace.map((t) => t.stepId), ['a', 'b']);
  assert.equal(second.stage, 'INGEST');
});

test('nextProgressEntry handles metric sources and ignores unknown ones', () => {
  const metrics = nextProgressEntry(undefined, { source: 'MIRO_METRICS', logicChain: [1] }, 'j', 't');
  assert.equal(metrics.swarmSentiment, 50);
  assert.deepEqual(metrics.logicChain, [1]);
  const ghost = nextProgressEntry({ jobId: 'j', timestamp: 't0' }, { source: 'GHOST_PREDICTION', summary: 's' }, 'j', 't');
  assert.equal(ghost.ghostProjection.summary, 's');
  assert.equal(nextProgressEntry(undefined, { source: 'MiroFish Swarm | Task: x' }, 'j', 't'), null);
});

test('/telemetry returns the newest five jobs with CORS, OPTIONS answers preflight', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore() }).load());
  const progress = core.doc.getMap('swarm-progress');
  for (let i = 0; i < 7; i++) progress.set(`job-${i}`, { jobId: `job-${i}`, timestamp: new Date(2026, 0, i + 1).toISOString() });

  const res = await core.handleRequest(req('/telemetry'));
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(Object.keys(await res.json()), ['job-6', 'job-5', 'job-4', 'job-3', 'job-2']);

  const pre = await core.handleRequest(req('/telemetry', { method: 'OPTIONS' }));
  assert.equal(pre.status, 200);
  assert.equal(pre.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
});

test('/telemetry/charts is null with no jobs and renders panels for the newest job', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore() }).load());
  assert.equal(await (await core.handleRequest(req('/telemetry/charts'))).json(), null);
  core.doc.getMap('swarm-progress').set('j', { jobId: 'j', timestamp: new Date().toISOString(), trace: [{ stepId: 'swarm_a', duration: 300 }] });
  const charts = await (await core.handleRequest(req('/telemetry/charts'))).json();
  assert.ok(charts && typeof charts === 'object');
  assert.match(charts.latency, /<svg/);
});

test('/terminal serves the terminal page', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore() }).load());
  const res = await core.handleRequest(req('/terminal'));
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /fetch\('\/telemetry\/charts'\)/);
});

test('/push updates the doc, /check-step reads completed trace steps', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore() }).load());
  const res = await push(core, { source: 'SWARM_PROGRESS', jobId: 'daily-1', trace: { stepId: 'sector_7', status: 'COMPLETED' } });
  assert.deepEqual(await res.json(), { status: 'success' });
  const done = await (await core.handleRequest(req('/check-step?jobId=daily-1&stepId=sector_7'))).json();
  const pending = await (await core.handleRequest(req('/check-step?jobId=daily-1&stepId=sector_8'))).json();
  assert.equal(done.status, 'COMPLETED');
  assert.equal(pending.status, 'PENDING');
});

test('MIRO_SYNC_TOKEN gates /push but leaves reads open', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore(), env: { MIRO_SYNC_TOKEN: 's3cret' } }).load());
  assert.equal((await push(core, { source: 'SWARM_PROGRESS' })).status, 401);
  assert.equal((await push(core, { source: 'SWARM_PROGRESS' }, { Authorization: 'Bearer s3cret' })).status, 200);
  assert.equal((await core.handleRequest(req('/telemetry'))).status, 200);
});

test('a malformed /push body returns 500 JSON instead of throwing', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore(), logger: { info() {}, warn() {}, error() {} } }).load());
  const res = await core.handleRequest(req('/push', { method: 'POST', body: '{not json' }));
  assert.equal(res.status, 500);
  assert.ok((await res.json()).error);
});

test('persist + load round-trips the doc through storage (V1 encoding)', async () => {
  const store = memoryStore();
  const a = track(await new MiroSyncCore({ storage: store }).load());
  await push(a, { source: 'SWARM_PROGRESS', jobId: 'keep-me', stage: 'AUDIT' });
  const size = (await (await a.handleRequest(req('/sync', { method: 'POST' }))).json()).size;
  assert.equal(store.data.get(DOC_KEY).byteLength, size);

  const b = track(await new MiroSyncCore({ storage: store }).load());
  assert.equal(b.doc.getMap('swarm-progress').get('keep-me').stage, 'AUDIT');
});

test('archive moves records older than 90 days, exports them to MEDIA_DIR and persists', async (t) => {
  const mediaDir = await mkdtemp(path.join(os.tmpdir(), 'miro-media-'));
  t.after(() => rm(mediaDir, { recursive: true, force: true }));
  const store = memoryStore();
  const core = track(await new MiroSyncCore({ storage: store, env: { MEDIA_DIR: mediaDir }, logger: quiet }).load());
  const progress = core.doc.getMap('swarm-progress');
  progress.set('old', { jobId: 'old', timestamp: '2020-01-01T00:00:00Z' });
  progress.set('fresh', { jobId: 'fresh', timestamp: new Date().toISOString() });

  const out = await (await core.handleRequest(req('/archive', { method: 'POST' }))).json();

  assert.deepEqual(out, { archivedCount: 1, activeCount: 1 });
  assert.ok(core.doc.getMap('swarm-archive').has('old'));
  assert.ok(!progress.has('old'));
  assert.ok(store.data.has(DOC_KEY), 'archive persists the doc');
  const listed = await (await core.handleRequest(req('/archive/retrieve?id=old'))).json();
  assert.equal(listed.jobId, 'old');
  const exported = await readdir(path.join(mediaDir, 'snapshots', 'archive'), { recursive: true });
  assert.ok(exported.some((f) => f.endsWith('.json')) && exported.some((f) => f.endsWith('.yjs')));
});

test('a WS session gets sync step 1 on open and edits from one peer reach another', async () => {
  const core = track(await new MiroSyncCore({ storage: memoryStore() }).load());
  const inboxA = [];
  const inboxB = [];
  const a = core.openSession((m) => inboxA.push(m));
  core.openSession((m) => inboxB.push(m));
  assert.equal(inboxA[0][0], 0, 'first frame is a sync message');

  const peer = new Y.Doc();
  peer.getMap('swarm-progress').set('ws-job', { jobId: 'ws-job', timestamp: 't' });
  const update = Y.encodeStateAsUpdate(peer);
  // messageSync(0) + messageYjsUpdate(2) + varUint8Array(update)
  const { encoding } = await import('lib0');
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  encoding.writeVarUint(enc, 2);
  encoding.writeVarUint8Array(enc, update);
  a.receive(encoding.toUint8Array(enc));

  assert.ok(core.doc.getMap('swarm-progress').has('ws-job'));
  assert.equal(inboxB.length, 2, 'peer B received step 1 and the relayed update');
});
