/**
 * Weekly review feed tests: frontend/src/lib/weeklyReviews.js turns /articles/weekly/index.json (model output,
 * untrusted) into homepage items. Only edition-pipeline weekly reviews are listed; legacy mock runs are not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWeeklyIndex, formatReviewDate } from '../frontend/src/lib/weeklyReviews.js';

const review = (overrides = {}) => ({
  title: 'AI Hype Fails to Lift Indian Equities; Volatility Rises',
  date: '2026-11-24',
  timestamp: 1795487190858,
  excerpt: 'Indian benchmarks closed flat to negative over the past five sessions.',
  fileName: 'swarm-weekly-1795487190676.html',
  type: 'article',
  frequency: 'weekly',
  edition: 'weekly',
  stance: 'cautious',
  ...overrides,
});

// The four shapes of legacy entry in the live index on 24 Nov 2026.
const LEGACY = [
  { title: 'WEEKLY   Apex Institutional', timestamp: 1784707116848, excerpt: '[DRY-RUN MOCK CONTENT]: ...', fileName: 'swarm-weekly-1784707116824.html', frequency: 'weekly' },
  { title: 'Institutional Strategic Report: 3/31/2026', timestamp: '2026-03-31T07:50:54.657Z' },
  { title: 'Weekly Pulse: GLOBAL MACRO STRATEGY', timestamp: 1774817805103, fileName: 'pulse-2026-03-29-weekly-1774817799817.html', frequency: 'weekly' },
];

test('lists edition weekly reviews with a safe link, IST date, stance and trimmed text', () => {
  const [item] = parseWeeklyIndex([review()]);
  assert.deepEqual(item, {
    href: '/articles/weekly/swarm-weekly-1795487190676.html',
    timestamp: 1795487190858,
    date: '24 Nov 2026',
    title: 'AI Hype Fails to Lift Indian Equities; Volatility Rises',
    excerpt: 'Indian benchmarks closed flat to negative over the past five sessions.',
    stance: 'cautious',
  });
});

test('drops legacy and mock entries that the edition pipeline did not write', () => {
  assert.deepEqual(parseWeeklyIndex([...LEGACY, review()]).map((i) => i.href), ['/articles/weekly/swarm-weekly-1795487190676.html']);
  assert.deepEqual(parseWeeklyIndex(LEGACY), []);
});

test('rejects file names that could leave the weekly folder or carry markup', () => {
  for (const fileName of ['../../admin.html', 'swarm-weekly-1.html?x=1', 'javascript:alert(1)', 'swarm-weekly-12.html/evil', 'swarm-daily-12.html', 'SWARM-WEEKLY-12.HTML']) {
    assert.deepEqual(parseWeeklyIndex([review({ fileName })]), [], fileName);
  }
});

test('rejects bad timestamps, other frequencies, empty titles and unknown stances', () => {
  assert.deepEqual(parseWeeklyIndex([review({ timestamp: 'soon' })]), []);
  assert.deepEqual(parseWeeklyIndex([review({ timestamp: -1 })]), []);
  assert.deepEqual(parseWeeklyIndex([review({ frequency: 'daily' })]), []);
  assert.deepEqual(parseWeeklyIndex([review({ title: '   ' })]), []);
  assert.equal(parseWeeklyIndex([review({ stance: '<b>bullish</b>' })])[0].stance, null);
});

test('collapses whitespace and caps title and excerpt length', () => {
  const [item] = parseWeeklyIndex([review({ title: `  A\n\n${'t'.repeat(300)}`, excerpt: 'e '.repeat(400) })]);
  assert.ok(item.title.length <= 141 && item.title.startsWith('A t') && item.title.endsWith('…'));
  assert.ok(item.excerpt.length <= 241 && item.excerpt.endsWith('…'));
  assert.ok(!/\s{2}/.test(item.excerpt));
});

test('newest first, de-duplicated by file, limited', () => {
  const items = parseWeeklyIndex([
    review({ fileName: 'swarm-weekly-1.html', timestamp: 1000 }),
    review({ fileName: 'swarm-weekly-3.html', timestamp: 3000 }),
    review({ fileName: 'swarm-weekly-3.html', timestamp: 3000 }),
    review({ fileName: 'swarm-weekly-2.html', timestamp: 2000 }),
  ], { limit: 2 });
  assert.deepEqual(items.map((i) => i.timestamp), [3000, 2000]);
});

test('malformed indexes give an empty list instead of throwing', () => {
  for (const index of [null, undefined, {}, 'x', 42, [null, 7, 'x', []]]) assert.deepEqual(parseWeeklyIndex(index), []);
});

test('formatReviewDate is the IST calendar date', () => {
  assert.equal(formatReviewDate(Date.UTC(2026, 10, 23, 20, 0)), '24 Nov 2026'); // 01:30 IST next day
});
