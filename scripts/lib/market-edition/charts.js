/**
 * Edition charts — drawn on the server from the quote data, with no chart library or external script.
 * - Diverging bars (day moves): plain HTML/CSS so labels stay full-size on phones. Blue = up, red = down
 *   (palette validated for colour-vision deficiency); the +/− sign and the side of the zero line carry the
 *   same meaning, so colour is never the only cue. Each row has a native tooltip and the tables give the data.
 * - Line charts (one-month closes): inline SVG, one series and one axis per chart, 2px ink line (not the up
 *   colour, which would misread on a falling month), end-point marker and label, hover targets on every close.
 * Every label is escaped; values are numbers computed here.
 */

const PCT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PRICE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Longest bar per side, as % of the track: leaves room for its value label on a phone-width track.
const MAX_BAR_PCT = 28;

const signedPct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${PCT.format(Math.abs(v))}%`;

/**
 * Diverging horizontal bars for day moves. `items`: [{ label, value }] (value in %); non-finite values are
 * dropped. Bars are sorted strongest-up first and scaled to the largest absolute move.
 */
export function divergingBarChart({ title, caption, items }) {
  const rows = items.filter((i) => Number.isFinite(i.value)).sort((a, b) => b.value - a.value);
  if (rows.length === 0) return '';
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  const body = rows.map((r) => {
    const dir = r.value > 0 ? 'pos' : r.value < 0 ? 'neg' : 'zero';
    const width = ((Math.abs(r.value) / maxAbs) * MAX_BAR_PCT).toFixed(2);
    return `<div class="bar-row" title="${esc(r.label)}: ${signedPct(r.value)}">` +
      `<span class="bar-label">${esc(r.label)}</span>` +
      `<span class="bar-track"><span class="bar ${dir}" style="width:${width}%"></span>` +
      `<span class="bar-value ${dir}" style="--w:${width}%">${signedPct(r.value)}</span></span></div>`;
  }).join('');
  return `<figure class="chart"><figcaption><strong>${esc(title)}</strong>${caption ? ` <span>${esc(caption)}</span>` : ''}</figcaption>` +
    `<div class="bars" role="img" aria-label="${esc(title)}: ${rows.map((r) => `${esc(r.label)} ${signedPct(r.value)}`).join(', ')}">${body}</div></figure>`;
}

/** Two to four round tick values spanning [min, max]. */
export function niceTicks(min, max, count = 3) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

const W = 360;
const H = 190;
const PAD = { top: 14, right: 64, bottom: 24, left: 52 };

/**
 * One-month line chart of daily closes. `points`: [{ t (ms), close }] in time order. Returns '' when there
 * are fewer than two points.
 */
export function lineChart({ title, points }) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.close);
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const padY = (maxY - minY) * 0.08 || maxY * 0.01;
  const [lo, hi] = [minY - padY, maxY + padY];
  const x = (t) => PAD.left + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.close).toFixed(1)}`).join('');
  const ticks = niceTicks(lo, hi).filter((v) => v >= lo && v <= hi);
  const grid = ticks.map((v) => `<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
    `<text class="tick" x="${PAD.left - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${PRICE.format(v)}</text>`).join('');
  const first = points[0];
  const last = points[points.length - 1];
  const change = ((last.close - first.close) / first.close) * 100;
  const xLabels = `<text class="tick" x="${PAD.left}" y="${H - 6}">${DAY.format(first.t)}</text>` +
    `<text class="tick" x="${W - PAD.right}" y="${H - 6}" text-anchor="end">${DAY.format(last.t)}</text>`;
  const hits = points.map((p) => `<circle class="hit" cx="${x(p.t).toFixed(1)}" cy="${y(p.close).toFixed(1)}" r="8">` +
    `<title>${DAY.format(p.t)}: ${PRICE.format(p.close)}</title></circle>`).join('');
  const end = `<circle class="end" cx="${x(last.t).toFixed(1)}" cy="${y(last.close).toFixed(1)}" r="4"/>` +
    `<text class="end-label" x="${(x(last.t) + 8).toFixed(1)}" y="${(y(last.close) + 4).toFixed(1)}">${PRICE.format(last.close)}</text>`;
  const label = `${title}, one month: ${PRICE.format(first.close)} to ${PRICE.format(last.close)} (${signedPct(change)})`;
  return `<figure class="chart"><figcaption><strong>${esc(title)}</strong> <span>1 month, ${signedPct(change)}</span></figcaption>` +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${xLabels}` +
    `<path class="line" d="${path}"/>${end}${hits}</svg></figure>`;
}

/** Chart CSS for the edition page (uses the page's colour tokens). */
export const CHART_STYLES = `
.charts{display:grid;gap:1.5rem;margin:1rem 0 2rem}@media (min-width:40rem){.charts.two{grid-template-columns:1fr 1fr}}
.chart{margin:0}.chart figcaption{font-size:.9rem;margin-bottom:.5rem;color:var(--ink-2)}.chart figcaption span{color:var(--ink-3)}
.bar-row{display:grid;grid-template-columns:minmax(6.5rem,32%) 1fr;align-items:center;gap:.5rem;min-height:1.9rem;font-size:.85rem}
.bar-label{color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-track{position:relative;height:1.4rem;border-left:0;background:linear-gradient(var(--axis),var(--axis)) 50% 0/1px 100% no-repeat}
.bar{position:absolute;top:.3rem;height:.8rem;max-height:24px}.bar.pos{left:50%;background:var(--pos);border-radius:0 4px 4px 0}
.bar.neg{right:50%;background:var(--neg);border-radius:4px 0 0 4px}.bar.zero{left:50%;width:2px!important;background:var(--axis)}
.bar-value{position:absolute;top:.05rem;font-variant-numeric:tabular-nums;color:var(--ink-2);font-size:.78rem;white-space:nowrap}
.bar-value.pos,.bar-value.zero{left:calc(50% + var(--w) + .3rem)}.bar-value.neg{right:calc(50% + var(--w) + .3rem)}
.chart svg{width:100%;height:auto;overflow:visible}.chart .grid{stroke:var(--grid);stroke-width:1}
.chart .tick{fill:var(--ink-3);font-size:11px;font-variant-numeric:tabular-nums}.chart .line{fill:none;stroke:var(--ink-2);stroke-width:2;stroke-linejoin:round}
.chart .end{fill:var(--ink-2);stroke:var(--bg);stroke-width:2}.chart .end-label{fill:var(--ink);font-size:12px;font-weight:600}
.chart .hit{fill:transparent}.chart .hit:hover{fill:var(--ink-2);fill-opacity:.25}`;
