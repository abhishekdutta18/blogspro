// miro-sync-seed.mjs — copies the live Yjs doc out of a running MiroSync host into a state dir.
//
//   node scripts/miro-sync-seed.mjs <source-ws-url> <state-dir>
//   node scripts/miro-sync-seed.mjs wss://blogspro-miro-sync.abhishek-dutta1996.workers.dev /tmp/miro-seed
//
// Speaks y-protocols sync (step 1 -> step 2) to the source, so it works against the Durable Object,
// which has no route that returns raw doc bytes. Writes <state-dir>/doc.yjs in the format the VPS
// service loads. Run it once, right before the VPS service first starts (see docs/miro-sync-vps-cutover.md).
import * as Y from 'yjs';
import * as sync from 'y-protocols/sync';
import { encoding, decoding } from 'lib0';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createFileStore } from './lib/miro-sync-file-store.js';
import { DOC_KEY } from './lib/miro-sync-core.js';

const SEED_TIMEOUT_MS = 20000;

/** Resolves with the source's full doc once its sync step 2 arrives. */
export function pullDoc(sourceUrl, timeoutMs = SEED_TIMEOUT_MS) {
  const doc = new Y.Doc();
  const ws = new WebSocket(sourceUrl);
  ws.binaryType = 'arraybuffer';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.terminate(); reject(new Error(`No sync step 2 from ${sourceUrl} within ${timeoutMs}ms`)); }, timeoutMs);
    ws.on('error', (err) => { clearTimeout(timer); reject(err); });
    ws.on('open', () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      sync.writeSyncStep1(enc, doc);
      ws.send(encoding.toUint8Array(enc));
    });
    ws.on('message', (data) => {
      const decoder = decoding.createDecoder(new Uint8Array(data));
      if (decoding.readVarUint(decoder) !== 0) return;
      const kind = sync.readSyncMessage(decoder, encoding.createEncoder(), doc, 'seed');
      if (kind !== sync.messageYjsSyncStep2) return;
      clearTimeout(timer);
      ws.close();
      resolve(doc);
    });
  });
}

async function main([sourceUrl, stateDir]) {
  if (!sourceUrl || !stateDir) throw new Error('usage: node scripts/miro-sync-seed.mjs <source-ws-url> <state-dir>');
  const doc = await pullDoc(sourceUrl);
  const bytes = Y.encodeStateAsUpdate(doc);
  await createFileStore(stateDir).put(DOC_KEY, bytes);
  const summary = {
    bytes: bytes.byteLength,
    swarmProgress: doc.getMap('swarm-progress').size,
    swarmArchive: doc.getMap('swarm-archive').size,
    affineHealthKeys: doc.getMap('affine-health').size,
    finalManuscriptChars: doc.getText('final-manuscript').length,
  };
  process.stdout.write(`${JSON.stringify({ seeded: `${stateDir}/${DOC_KEY}.yjs`, ...summary })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`seed failed: ${err.message}\n`);
    process.exit(1);
  });
}
