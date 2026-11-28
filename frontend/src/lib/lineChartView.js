/**
 * A responsive line chart for the homepage's yield curve, macro charts and forecasts. One figure holds:
 *   [data-lc-plot] > svg[data-lc-svg], .mc-tip[data-lc-tip] (> [data-lc-tip-title], [data-lc-tip-detail]),
 *   [data-lc-empty]
 * createLineChart(figure, { height }) -> { draw(spec), unavailable(message) }, where spec is
 *   { series: [{ cls, points: [[x, y]], end? }], bands: [{ points: [[x, lo, hi]] }], dots: [[x, y]],
 *     xTicks: [{ x, label }], yFormat, hover: [{ x, y, title, detail }], label }
 * The crosshair snaps to the nearest hover point (pointer, or arrow keys once focused). Text goes in with
 * textContent; colours come from the .lc-* and .mc-* classes in global.css.
 */
import { scaleLinear, linePath, valueTicks } from './marketChart.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = Object.freeze({ top: 10, right: 60, bottom: 24, left: 4 });
const MIN_WIDTH = 220;
const Y_TICKS = 4;
const DOMAIN_PAD = 0.08;
const TIP_GAP = 12;

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** [min, max] over every y in the spec, padded, or null with no data. */
export function specDomain(spec) {
  const ys = [
    ...spec.series.flatMap((s) => s.points.map((p) => p[1])),
    ...(spec.bands ?? []).flatMap((b) => b.points.flatMap((p) => [p[1], p[2]])),
    ...(spec.dots ?? []).map((d) => d[1]),
  ].filter(Number.isFinite);
  if (ys.length === 0) return null;
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  const pad = (hi - lo) * DOMAIN_PAD || Math.abs(hi) * 0.01 || 1;
  return [lo - pad, hi + pad];
}

/** [min, max] over every x in the spec. */
function xDomain(spec) {
  const xs = [...spec.series.flatMap((s) => s.points.map((p) => p[0])), ...(spec.dots ?? []).map((d) => d[0]), ...(spec.bands ?? []).flatMap((b) => b.points.map((p) => p[0]))];
  return [Math.min(...xs), Math.max(...xs)];
}

function bandPath(points, x, y) {
  const upper = points.map(([px, , hi]) => [px, hi]);
  const lower = points.map(([px, lo]) => [px, lo]).reverse();
  return `${linePath(upper, x, y)}${linePath(lower, x, y).replace('M', 'L')}Z`;
}

function drawSpec(svg, spec, width, height) {
  const plot = { left: MARGIN.left, right: width - MARGIN.right, top: MARGIN.top, bottom: height - MARGIN.bottom };
  const x = scaleLinear(xDomain(spec), [plot.left, plot.right]);
  const [lo, hi] = specDomain(spec);
  const y = scaleLinear([lo, hi], [plot.bottom, plot.top]);
  const grid = valueTicks(lo, hi, Y_TICKS).flatMap((v) => [
    svgEl('line', { class: 'mc-grid', x1: plot.left, x2: plot.right, y1: y(v), y2: y(v) }),
    svgEl('text', { class: 'mc-label', x: plot.right + 8, y: y(v), 'dominant-baseline': 'middle' }, spec.yFormat(v)),
  ]);
  const ticks = (spec.xTicks ?? []).map((t) => svgEl('text', { class: 'mc-label', x: x(t.x), y: plot.bottom + 16, 'text-anchor': 'middle' }, t.label));
  const bands = (spec.bands ?? []).filter((b) => b.points.length > 1).map((b) => svgEl('path', { class: 'lc-band', d: bandPath(b.points, x, y) }));
  const lines = spec.series.filter((s) => s.points.length > 1).flatMap((s) => {
    const marks = [svgEl('path', { class: `lc-line ${s.cls ?? ''}`, d: linePath(s.points, x, y) })];
    if (s.end) marks.push(svgEl('circle', { class: `lc-end ${s.cls ?? ''}`, cx: x(s.points.at(-1)[0]), cy: y(s.points.at(-1)[1]), r: 4 }));
    return marks;
  });
  const dots = (spec.dots ?? []).map(([dx, dy]) => svgEl('circle', { class: 'lc-dot', cx: x(dx), cy: y(dy), r: 4 }));
  const cross = svgEl('g', { class: 'mc-cross', visibility: 'hidden', 'data-export': 'skip' });
  const crossLine = svgEl('line', { class: 'mc-cross-line', y1: plot.top, y2: plot.bottom });
  const crossDot = svgEl('circle', { class: 'lc-end', r: 4 });
  cross.append(crossLine, crossDot);
  const hit = svgEl('rect', { class: 'mc-hit', x: plot.left, y: 0, width: plot.right - plot.left, height, 'data-export': 'skip' });
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.replaceChildren(svgEl('line', { class: 'mc-grid', x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom }), ...grid, ...ticks, ...bands, ...lines, ...dots, cross, hit);
  return { x, y, plot, cross, crossLine, crossDot };
}

/** Index of the hover point nearest to `px` on the x axis. */
function nearest(hover, xValue) {
  let best = 0;
  hover.forEach((h, i) => { if (Math.abs(h.x - xValue) < Math.abs(hover[best].x - xValue)) best = i; });
  return best;
}

export function createLineChart(figure, { height = 220 } = {}) {
  const q = (name) => figure.querySelector(`[data-lc-${name}]`);
  const [plotBox, svg, tip, tipTitle, tipDetail, empty] = ['plot', 'svg', 'tip', 'tip-title', 'tip-detail', 'empty'].map(q);
  const state = { spec: null, geo: null, index: -1 };

  function hide() {
    state.index = -1;
    state.geo?.cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  }

  function setActive(index) {
    const { spec, geo } = state;
    if (!geo || !spec.hover?.length || index < 0) return;
    state.index = index;
    const h = spec.hover[index];
    const cx = geo.x(h.x);
    ['x1', 'x2'].forEach((a) => geo.crossLine.setAttribute(a, cx));
    geo.crossDot.setAttribute('cx', cx);
    geo.crossDot.setAttribute('cy', geo.y(h.y));
    geo.cross.setAttribute('visibility', 'visible');
    tipTitle.textContent = h.title;
    tipDetail.textContent = h.detail;
    tip.hidden = false;
    const left = cx + TIP_GAP + tip.offsetWidth > geo.plot.right ? cx - TIP_GAP - tip.offsetWidth : cx + TIP_GAP;
    tip.style.left = `${Math.max(0, Math.min(plotBox.clientWidth - tip.offsetWidth, left))}px`;
  }

  function render() {
    const ready = Boolean(state.spec && specDomain(state.spec));
    empty.hidden = ready;
    svg.toggleAttribute('hidden', !ready); // SVG elements have no .hidden property
    hide();
    state.geo = ready ? drawSpec(svg, state.spec, Math.max(plotBox.clientWidth, MIN_WIDTH), height) : null;
    if (ready) svg.setAttribute('aria-label', state.spec.label);
  }

  svg.addEventListener('pointermove', (event) => {
    const { geo, spec } = state;
    if (!geo || !spec.hover?.length) return;
    const box = svg.getBoundingClientRect();
    const [x0, x1] = xDomain(spec);
    setActive(nearest(spec.hover, scaleLinear([geo.plot.left, geo.plot.right], [x0, x1])(event.clientX - box.left)));
  });
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('focus', () => setActive((state.spec?.hover?.length ?? 0) - 1));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (event) => {
    const last = (state.spec?.hover?.length ?? 0) - 1;
    const moves = { ArrowLeft: state.index - 1, ArrowRight: state.index + 1, Home: 0, End: last };
    if (!(event.key in moves) || last < 0) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(last, moves[event.key])));
  });
  new ResizeObserver(() => { if (state.spec) render(); }).observe(plotBox);

  return {
    draw(spec) {
      state.spec = spec;
      render();
    },
    unavailable(message) {
      state.spec = null;
      empty.textContent = message;
      render();
    },
  };
}
