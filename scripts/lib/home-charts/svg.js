/**
 * Standalone SVG line charts for the server-written files under data/charts/ (embeddable anywhere, so the
 * colours are literal light-theme values, not CSS variables). One renderer covers every chart:
 *   chartSvg({ title, subtitle, note, xTicks: [{ x, label }], yFormat, series, bands }) -> SVG text
 * series: [{ name, color, points: [[x, y]], dashed?, dotsOnly?, width? }]; bands: [{ color, points: [[x, lo, hi]]] }].
 * Two or more named series get a legend; text always uses ink colours, never the series colour.
 */

export const THEME = Object.freeze({
  paper: '#f7f4ee', ink: '#1b1a17', ink2: '#47443e', ink3: '#6b675f', rule: '#ddd7cb',
  accent: '#8c1d18', compare: '#6b675f', up: '#1d6b45', down: '#b42318',
});

const WIDTH = 720;
const HEIGHT = 380;
const PAD = Object.freeze({ top: 64, right: 24, bottom: 56, left: 56 });
const FONT = "font-family=\"Inter, 'Helvetica Neue', Arial, sans-serif\"";

/** Text safe inside SVG elements and attributes. */
export const escapeXml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** About `count` round tick values covering [lo, hi]. */
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const r2 = (n) => Math.round(n * 100) / 100;

function extent(values) {
  const finite = values.filter(Number.isFinite);
  return [Math.min(...finite), Math.max(...finite)];
}

function frame(series, bands, xTicks) {
  const xs = [...series.flatMap((s) => s.points.map((p) => p[0])), ...bands.flatMap((b) => b.points.map((p) => p[0])), ...xTicks.map((t) => t.x)];
  const ys = [...series.flatMap((s) => s.points.map((p) => p[1])), ...bands.flatMap((b) => b.points.flatMap((p) => [p[1], p[2]]))];
  const [x0, x1] = extent(xs);
  let [y0, y1] = extent(ys);
  const pad = (y1 - y0 || Math.abs(y1) || 1) * 0.08;
  [y0, y1] = [y0 - pad, y1 + pad];
  const plot = { left: PAD.left, right: WIDTH - PAD.right, top: PAD.top, bottom: HEIGHT - PAD.bottom };
  const sx = (x) => r2(plot.left + ((x - x0) / (x1 - x0 || 1)) * (plot.right - plot.left));
  const sy = (y) => r2(plot.bottom - ((y - y0) / (y1 - y0 || 1)) * (plot.bottom - plot.top));
  return { plot, sx, sy, yTicks: niceTicks(y0, y1) };
}

const pathOf = (points, sx, sy) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x)},${sy(y)}`).join('');

function seriesMarks(s, sx, sy) {
  if (s.dotsOnly) {
    return s.points.map(([x, y]) => `<circle cx="${sx(x)}" cy="${sy(y)}" r="4" fill="${s.color}" stroke="${THEME.paper}" stroke-width="2"/>`).join('');
  }
  const dash = s.dashed ? ' stroke-dasharray="6 4"' : '';
  const [lx, ly] = s.points.at(-1);
  const end = s.endDot === false ? '' : `<circle cx="${sx(lx)}" cy="${sy(ly)}" r="4" fill="${s.color}" stroke="${THEME.paper}" stroke-width="2"/>`;
  return `<path d="${pathOf(s.points, sx, sy)}" fill="none" stroke="${s.color}" stroke-width="${s.width ?? 2}" stroke-linejoin="round" stroke-linecap="round"${dash}/>${end}`;
}

function bandMarks(b, sx, sy) {
  const upper = b.points.map(([x, , hi]) => [x, hi]);
  const lower = b.points.map(([x, lo]) => [x, lo]).reverse();
  return `<path d="${pathOf(upper, sx, sy)}${pathOf(lower, sx, sy).replace('M', 'L')}Z" fill="${b.color}" fill-opacity="0.12" stroke="none"/>`;
}

function legend(series) {
  const named = series.filter((s) => s.name);
  if (named.length < 2) return '';
  let x = PAD.left;
  return named.map((s) => {
    const swatch = s.dotsOnly
      ? `<circle cx="${x + 6}" cy="50" r="4" fill="${s.color}"/>`
      : `<line x1="${x}" y1="50" x2="${x + 14}" y2="50" stroke="${s.color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
    const item = `${swatch}<text x="${x + 20}" y="54" font-size="12" fill="${THEME.ink2}">${escapeXml(s.name)}</text>`;
    x += 30 + s.name.length * 6.6;
    return item;
  }).join('');
}

/** A complete SVG document for one chart. */
export function chartSvg({ title, subtitle = '', note = '', xTicks = [], yFormat = (v) => String(v), series, bands = [] }) {
  const drawn = series.filter((s) => s.points.length > 0);
  if (drawn.length === 0) throw new Error(`chart "${title}" has no data`);
  const { plot, sx, sy, yTicks } = frame(drawn, bands, xTicks);
  const grid = yTicks.map((v) => `<line x1="${plot.left}" x2="${plot.right}" y1="${sy(v)}" y2="${sy(v)}" stroke="${THEME.rule}" stroke-width="1"/>`
    + `<text x="${plot.left - 8}" y="${sy(v) + 4}" text-anchor="end" font-size="11" fill="${THEME.ink3}">${escapeXml(yFormat(v))}</text>`).join('');
  const xAxis = xTicks.map((t) => `<text x="${sx(t.x)}" y="${plot.bottom + 18}" text-anchor="middle" font-size="11" fill="${THEME.ink3}">${escapeXml(t.label)}</text>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${escapeXml(`${title}. ${subtitle}`)}" ${FONT}>
<title>${escapeXml(title)}</title>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${THEME.paper}"/>
<text x="${PAD.left}" y="24" font-size="16" font-weight="600" fill="${THEME.ink}">${escapeXml(title)}</text>
<text x="${PAD.left}" y="40" font-size="12" fill="${THEME.ink3}">${escapeXml(subtitle)}</text>
${legend(drawn)}
${grid}
<line x1="${plot.left}" x2="${plot.right}" y1="${plot.bottom}" y2="${plot.bottom}" stroke="${THEME.ink3}" stroke-width="1"/>
${xAxis}
${bands.map((b) => bandMarks(b, sx, sy)).join('')}
${drawn.map((s) => seriesMarks(s, sx, sy)).join('')}
<text x="${PAD.left}" y="${HEIGHT - 12}" font-size="10.5" fill="${THEME.ink3}">${escapeXml(note)}</text>
</svg>
`;
}
