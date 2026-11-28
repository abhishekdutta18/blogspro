/**
 * Tests for the briefing feed parser that renders /briefings/<frequency>/index.json on the site.
 * The index is written by the generator from model output, so it is treated as untrusted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBriefingIndex, formatBriefingTime } from '../frontend/src/lib/briefings.js';

const entry = (over = {}) => ({
  title: 'HOURLY   Nexus Institutional Terminal',
  timestamp: 1795201410621,
  excerpt: 'Liquidity friction persists across funding markets.',
  fileName: 'swarm-hourly-1795201410613.html',
  frequency: 'hourly',
  ...over,
});

test('returns the newest briefings first, limited, with site-relative links', () => {
  const index = [entry({ timestamp: 1, fileName: 'swarm-hourly-1.html' }), entry({ timestamp: 3, fileName: 'swarm-hourly-3.html' }), entry({ timestamp: 2, fileName: 'swarm-hourly-2.html' })];
  const items = parseBriefingIndex(index, { frequency: 'hourly', limit: 2 });
  assert.deepEqual(items.map((i) => i.href), ['/briefings/hourly/swarm-hourly-3.html', '/briefings/hourly/swarm-hourly-2.html']);
});

test('drops entries whose file name is not a generated briefing page', () => {
  const index = [
    entry({ fileName: 'javascript:alert(1)' }),
    entry({ fileName: '../../login.html' }),
    entry({ fileName: 'https://evil.example/x.html' }),
    entry({ fileName: 'swarm-hourly-42.html', timestamp: 42 }),
  ];
  assert.deepEqual(parseBriefingIndex(index, { frequency: 'hourly' }).map((i) => i.href), ['/briefings/hourly/swarm-hourly-42.html']);
});

test('drops entries for another frequency and entries without a usable timestamp', () => {
  const index = [entry({ frequency: 'daily' }), entry({ timestamp: 'soon' }), entry()];
  assert.equal(parseBriefingIndex(index, { frequency: 'hourly' }).length, 1);
});

test('keeps excerpt text as plain text, trimmed and length-capped', () => {
  const [item] = parseBriefingIndex([entry({ excerpt: `  <img src=x onerror=alert(1)> ${'a'.repeat(400)}  ` })], { frequency: 'hourly' });
  assert.ok(item.excerpt.startsWith('<img src=x onerror=alert(1)>'), 'text is passed through for textContent, never parsed');
  assert.ok(item.excerpt.length <= 241);
  assert.ok(item.excerpt.endsWith('…'));
});

test('tolerates a missing or malformed index', () => {
  assert.deepEqual(parseBriefingIndex(null, { frequency: 'hourly' }), []);
  assert.deepEqual(parseBriefingIndex({ not: 'an array' }, { frequency: 'hourly' }), []);
  assert.deepEqual(parseBriefingIndex([null, 7, 'x'], { frequency: 'hourly' }), []);
});

test('formats times in India Standard Time', () => {
  assert.equal(formatBriefingTime(Date.UTC(2026, 10, 20, 20, 0)), '21 Nov 2026, 01:30 IST');
});

test('labels market editions and shows their title and stance; older entries stay plain briefings', () => {
  const [edition, legacy] = parseBriefingIndex([
    entry({ timestamp: 2, fileName: 'swarm-hourly-2.html', edition: 'close', stance: 'cautious', title: 'Nifty slips as banks drag' }),
    entry({ timestamp: 1, fileName: 'swarm-hourly-1.html' }),
  ]);
  assert.deepEqual([edition.label, edition.headline, edition.stance], ['Market close', 'Nifty slips as banks drag', 'cautious']);
  assert.deepEqual([legacy.label, legacy.headline, legacy.stance], ['Briefing', '', null]);
});

test('ignores unknown editions and stances from the index', () => {
  const [item] = parseBriefingIndex([entry({ edition: '__proto__', stance: '<b>moon</b>' })]);
  assert.deepEqual([item.label, item.headline, item.stance], ['Briefing', '', null]);
});
