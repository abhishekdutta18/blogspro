import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBriefingStore, COLLECTION } from '../src/store/briefings.js';
// Contract check: the server's own code must read what the swarm writes.
import { openDatabase } from '../../server/src/db.js';
import { createDocumentRepository } from '../../server/src/documents.js';
import { PUBLIC_COLLECTIONS } from '../../server/src/permissions.js';

const withTempDb = fn => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-store-'));
  try {
    return fn(join(dir, 'blogspro.db'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const briefing = (id, title = 'T') => ({ id, frequency: 'hourly', title, summary: 'S', sections: [], published: true });

test('the server reads a swarm briefing back through its document repository', () => withTempDb(path => {
  const store = openBriefingStore(path);
  store.save(briefing('H_2026-11-15_07', 'Crude climbs'));
  store.close();

  const repo = createDocumentRepository(openDatabase(path));
  const doc = repo.get(COLLECTION, 'H_2026-11-15_07');
  assert.equal(doc.title, 'Crude climbs');
  assert.equal(doc.id, 'H_2026-11-15_07');
  assert.ok(doc.createdAt);
  assert.ok(PUBLIC_COLLECTIONS.has(COLLECTION), 'pulse_briefings must stay publicly readable');
}));

test('saving the same slot twice replaces the content and keeps createdAt', () => withTempDb(path => {
  const store = openBriefingStore(path);
  store.save(briefing('H_2026-11-15_07', 'first'));
  const repo = createDocumentRepository(openDatabase(path));
  const firstCreated = repo.get(COLLECTION, 'H_2026-11-15_07').createdAt;

  store.save(briefing('H_2026-11-15_07', 'second'));
  const docs = repo.list(COLLECTION);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'second');
  assert.equal(docs[0].createdAt, firstCreated);
  store.close();
}));

test('pruneHourly keeps the newest hourly briefings and never touches daily ones', () => {
  const store = openBriefingStore(':memory:');
  ['H_2026-11-14_23', 'H_2026-11-15_05', 'H_2026-11-15_06', 'H_2026-11-15_07', 'D_2026-11-14'].forEach(id => store.save(briefing(id)));
  assert.equal(store.pruneHourly(2), 2);
  assert.equal(store.pruneHourly(2), 0);
  store.close();
});
