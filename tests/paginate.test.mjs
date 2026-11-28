/** Research pagination maths (frontend/src/lib/paginate.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, clampPage, pageRange, pageList } from '../frontend/src/lib/paginate.js';

test('pageCount and clampPage keep the page in range', () => {
  assert.deepEqual([pageCount(0, 5), pageCount(5, 5), pageCount(6, 5), pageCount(23, 5)], [1, 1, 2, 5]);
  assert.deepEqual([clampPage(0, 23, 5), clampPage(9, 23, 5), clampPage('x', 23, 5), clampPage(3, 23, 5)], [1, 5, 1, 3]);
});

test('pageRange slices five at a time, the last page partly', () => {
  assert.deepEqual(pageRange(1, 23, 5), [0, 5]);
  assert.deepEqual(pageRange(5, 23, 5), [20, 23]);
  assert.deepEqual(pageRange(1, 0, 5), [0, 0]);
});

test('pageList shows ends, neighbours and gaps', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(pageList(6, 12), [1, 'gap', 5, 6, 7, 'gap', 12]);
  assert.deepEqual(pageList(1, 12), [1, 2, 'gap', 12]);
  assert.deepEqual(pageList(1, 4), [1, 2, 3, 4], 'no gap for a single page');
  assert.deepEqual(pageList(4, 4), [1, 2, 3, 4]);
  assert.deepEqual(pageList(1, 5), [1, 2, 'gap', 5]);
});
