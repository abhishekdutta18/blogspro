/**
 * Page maths for client-side lists (the Research section): which slice of the matching items to show and
 * which page buttons to draw. Pure, tested in tests/paginate.test.mjs.
 */

/** Total pages for `count` items (at least 1, so an empty result still has a page to show). */
export const pageCount = (count, size) => Math.max(1, Math.ceil(count / size));

/** `page` clamped into 1..pageCount. */
export const clampPage = (page, count, size) => Math.min(Math.max(1, Math.trunc(page) || 1), pageCount(count, size));

/** [start, end) indexes of the items on `page`. */
export function pageRange(page, count, size) {
  const current = clampPage(page, count, size);
  return [(current - 1) * size, Math.min(current * size, count)];
}

/**
 * Page buttons to show: always the first and last, the current page and `around` pages either side, with
 * 'gap' where two or more pages are skipped (a gap never hides just one page: that page is shown instead).
 * e.g. (6, 12) -> [1, 'gap', 5, 6, 7, 'gap', 12]; (1, 4) -> [1, 2, 3, 4].
 */
export function pageList(current, total, around = 1) {
  const kept = (p) => p === 1 || p === total || Math.abs(p - current) <= around;
  const pages = [];
  for (let p = 1; p <= total; p += 1) {
    if (kept(p) || (kept(p - 1) && kept(p + 1))) pages.push(p);
    else if (pages.at(-1) !== 'gap') pages.push('gap');
  }
  return pages;
}
