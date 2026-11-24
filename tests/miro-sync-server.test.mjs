// Tests for scripts/miro-sync-server.js — the VPS Node host (HTTP routes, Yjs WebSocket sync, restart persistence).
// Run: node --test tests/miro-sync-server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as Y from 'yjs';
import * as sync from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { encoding, decoding } from 'lib0';
import WebSocket from 'ws';
import { startServer } from '../scripts/miro-sync-server.js';
import { miroSyncFetch } from '../scripts/lib/miro-sync-client.js';

const quiet = { info() {}, warn() {}, error() {} };

async function boot(t, { env = {}, dataDir } = {}) {
  const dir = dataDir || await mkdtemp(path.join(os.tmpdir(), 'miro-sync-'));
  const svc = await startServer({ port: 0, host: '127.0.0.1', dataDir: dir, env, logger: quiet });
  if (!dataDir) t.after(() => rm(dir, { recursive: true, force: true }));
  return { ...svc, dir, base: `http://127.0.0.1:${svc.port}` };
}

const postJson = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Minimal y-protocols client: syncs into `doc`, resolves `synced` once step 2 arrives. */
function yClient(base, doc) {
  const ws = new WebSocket(base.replace('http', 'ws'));
  ws.binaryType = 'arraybuffer';
  const awareness = new awarenessProtocol.Awareness(doc);
  const received = { awareness: [] };
  const synced = new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('message', (data) => {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      const type = decoding.readVarUint(decoder);
      if (type === 1) {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, 'server');
        received.awareness.push(update);
        return;
      }
      const reply = encoding.createEncoder();
      encoding.writeVarUint(reply, 0);
      const kind = sync.readSyncMessage(decoder, reply, doc, 'server');
      if (encoding.length(reply) > 1) ws.send(encoding.toUint8Array(reply));
      if (kind === sync.messageYjsSyncStep2) resolve();
    });
    ws.on('open', () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      sync.writeSyncStep1(enc, doc);
      ws.send(encoding.toUint8Array(enc));
    });
  });
  doc.on('update', (update, origin) => {
    if (origin === 'server') return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    sync.writeUpdate(enc, update);
    ws.send(encoding.toUint8Array(enc));
  });
  const close = () => { awareness.destroy(); ws.close(); };
  return { ws, awareness, synced, received, close };
}

const waitFor = async (check, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('HTTP routes: /terminal, /healthz, /telemetry (+OPTIONS), /telemetry/charts', async (t) => {
  const svc = await boot(t);
  t.after(() => svc.close());

  const page = await fetch(`${svc.base}/terminal`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Institutional Swarm Terminal/);

  assert.deepEqual(await (await fetch(`${svc.base}/healthz`)).json(), { ok: true, sessions: 0, jobs: 0 });
  assert.equal(await (await fetch(`${svc.base}/telemetry/charts`)).json(), null);

  for (let i = 0; i < 6; i++) await postJson(`${svc.base}/push`, { source: 'SWARM_PROGRESS', jobId: `job-${i}`, trace: { stepId: 'swarm_x', duration: 100 + i } });
  const tele = await fetch(`${svc.base}/telemetry`);
  assert.equal(tele.headers.get('access-control-allow-origin'), '*');
  assert.equal(Object.keys(await tele.json()).length, 5);

  const charts = await (await fetch(`${svc.base}/telemetry/charts`)).json();
  assert.match(charts.latency, /<svg/);

  const pre = await fetch(`${svc.base}/telemetry`, { method: 'OPTIONS' });
  assert.equal(pre.headers.get('access-control-allow-headers'), '*');
});

test('state survives a restart on the same data dir', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miro-sync-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const first = await boot(t, { dataDir: dir });
  await postJson(`${first.base}/push`, { source: 'SWARM_PROGRESS', jobId: 'durable', stage: 'FINALIZE' });
  await first.close(); // flushes the debounced write, like SIGTERM does

  const second = await boot(t, { dataDir: dir });
  t.after(() => second.close());
  const jobs = await (await fetch(`${second.base}/telemetry`)).json();
  assert.equal(jobs.durable.stage, 'FINALIZE');
});

test('WebSocket clients sync the swarm-progress map both ways and get HTTP pushes live', async (t) => {
  const svc = await boot(t);
  t.after(() => svc.close());
  await postJson(`${svc.base}/push`, { source: 'SWARM_PROGRESS', jobId: 'before-connect' });

  const docA = new Y.Doc();
  const a = yClient(svc.base, docA);
  t.after(() => a.close());
  await a.synced;
  assert.ok(docA.getMap('swarm-progress').has('before-connect'), 'initial state arrives over sync');

  await postJson(`${svc.base}/push`, { source: 'SWARM_PROGRESS', jobId: 'after-connect' });
  await waitFor(() => docA.getMap('swarm-progress').has('after-connect'));

  docA.getMap('swarm-progress').set('from-client', { jobId: 'from-client', timestamp: new Date().toISOString() });
  await waitFor(() => svc.core.doc.getMap('swarm-progress').has('from-client'));
});

test('awareness updates are relayed to other peers', async (t) => {
  const svc = await boot(t);
  t.after(() => svc.close());
  const a = yClient(svc.base, new Y.Doc());
  const b = yClient(svc.base, new Y.Doc());
  t.after(() => { a.close(); b.close(); });
  await Promise.all([a.synced, b.synced]);

  a.awareness.setLocalStateField('user', { name: 'swarm-terminal' });
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 1);
  encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(a.awareness, [a.awareness.clientID]));
  a.ws.send(encoding.toUint8Array(enc));

  await waitFor(() => b.awareness.getStates().get(a.awareness.clientID)?.user?.name === 'swarm-terminal');
});

test('miroSyncFetch targets MIRO_SYNC_URL with the bearer token', async (t) => {
  const svc = await boot(t, { env: { MIRO_SYNC_TOKEN: 'tok' } });
  t.after(() => svc.close());

  const denied = await postJson(`${svc.base}/push`, { source: 'SWARM_PROGRESS', jobId: 'x' });
  assert.equal(denied.status, 401);

  const env = { MIRO_SYNC_URL: `${svc.base}/`, MIRO_SYNC_TOKEN: 'tok' };
  const ok = await miroSyncFetch(env, '/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'SWARM_PROGRESS', jobId: 'via-client' }) });
  assert.equal(ok.status, 200);
  const step = await (await miroSyncFetch(env, '/check-step?jobId=via-client&stepId=none')).json();
  assert.equal(step.status, 'PENDING');
});

test('miroSyncFetch falls back to the Durable Object binding when no URL is set', async () => {
  const calls = [];
  const env = { MIRO_SYNC_DO: { idFromName: (n) => n, get: () => ({ fetch: async (url) => { calls.push(url); return new Response('{}'); } }) } };
  await miroSyncFetch(env, '/check-step?jobId=a&stepId=b');
  assert.deepEqual(calls, ['https://sync/check-step?jobId=a&stepId=b']);
  await assert.rejects(() => miroSyncFetch({}, '/push'), /not configured/);
});
