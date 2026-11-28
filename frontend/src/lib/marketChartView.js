/**
 * Draws the homepage market charts from parsed /data/markets.json items (see lib/markets.js):
 * a sparkline per Markets-table row, and one larger chart of the selected instrument with a previous-close
 * reference line, a crosshair that snaps to the nearest 5-minute close, a tooltip and arrow-key reading.
 * All text goes in with textContent; colours come from the theme tokens in global.css (.mc-* classes).
 */
import {
  scaleLinear, valueDomain, linePath, areaPath, valueTicks, timeTicks, nearestIndex,
  formatChartValue, formatIstTime, changeFromClose, direction,
} from './marketChart.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPARK = { width: 80, height: 24, pad: 3 };
const DETAIL = { height: 220, top: 12, right: 76, bottom: 24, left: 2 };
const Y_TICKS = 4;
const X_TICKS = 5;
const TIP_GAP = 12;

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
  if (text !== undefined) node.textContent = text;
  return node;
}

const toneClass = (item) => `mc-${direction(item.last, item.prevClose)}`;
const hasChart = (item) => Boolean(item) && item.points.length >= 2;

/** Today's line in a table row's <svg>, or an empty box when there are fewer than two points. */
export function renderSparkline(svg, item) {
  const { width, height, pad } = SPARK;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (!hasChart(item)) {
    svg.replaceChildren();
    return;
  }
  const { points } = item;
  const x = scaleLinear([points[0][0], points.at(-1)[0]], [pad, width - pad]);
  const y = scaleLinear(valueDomain(points, item.prevClose), [height - pad, pad]);
  const parts = [];
  if (item.prevClose !== null) {
    parts.push(svgEl('line', { class: 'mc-ref', x1: 0, x2: width, y1: y(item.prevClose), y2: y(item.prevClose) }));
  }
  const [lastT, lastV] = points.at(-1);
  parts.push(
    svgEl('path', { class: `mc-line mc-thin ${toneClass(item)}`, d: linePath(points, x, y) }),
    svgEl('circle', { class: `mc-dot ${toneClass(item)}`, cx: x(lastT), cy: y(lastV), r: 2.5 }),
  );
  svg.replaceChildren(...parts);
}

// Gridlines with value labels on the right, IST time labels along the bottom.
function axes(item, x, y, plot) {
  const [lo, hi] = valueDomain(item.points, item.prevClose);
  const grid = valueTicks(lo, hi, Y_TICKS).flatMap((v) => [
    svgEl('line', { class: 'mc-grid', x1: plot.left, x2: plot.right, y1: y(v), y2: y(v) }),
    svgEl('text', { class: 'mc-label', x: plot.right + 8, y: y(v), 'dominant-baseline': 'middle' }, formatChartValue(v, item.fmt)),
  ]);
  const times = timeTicks(item.points[0][0], item.points.at(-1)[0], X_TICKS).map((t) =>
    svgEl('text', { class: 'mc-label', x: x(t), y: plot.bottom + 16, 'text-anchor': 'middle' }, formatIstTime(t)));
  return [...grid, ...times];
}

function referenceLine(item, y, plot) {
  if (item.prevClose === null) return [];
  const at = y(item.prevClose);
  return [
    svgEl('line', { class: 'mc-ref', x1: plot.left, x2: plot.right, y1: at, y2: at }),
    // Right end, above the line: the session opens next to the previous close, so the left end is crowded.
    svgEl('text', { class: 'mc-label', x: plot.right - 4, y: at - 5, 'text-anchor': 'end' }, `Prev close ${formatChartValue(item.prevClose, item.fmt)}`),
  ];
}

// Draws the chart at `width` px and returns what the crosshair needs.
function drawDetail(svg, item, width) {
  const plot = { left: DETAIL.left, right: width - DETAIL.right, top: DETAIL.top, bottom: DETAIL.height - DETAIL.bottom };
  const { points } = item;
  const x = scaleLinear([points[0][0], points.at(-1)[0]], [plot.left, plot.right]);
  const y = scaleLinear(valueDomain(points, item.prevClose), [plot.bottom, plot.top]);
  const tone = toneClass(item);
  const [lastT, lastV] = points.at(-1);
  const cross = svgEl('g', { class: 'mc-cross', visibility: 'hidden', 'data-export': 'skip' });
  const crossLine = svgEl('line', { class: 'mc-cross-line', y1: plot.top, y2: plot.bottom });
  const crossDot = svgEl('circle', { class: `mc-dot mc-ring ${tone}`, r: 4 });
  cross.append(crossLine, crossDot);
  const hit = svgEl('rect', { class: 'mc-hit', x: plot.left, y: 0, width: plot.right - plot.left, height: DETAIL.height, 'data-export': 'skip' });
  svg.setAttribute('viewBox', `0 0 ${width} ${DETAIL.height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', DETAIL.height);
  svg.replaceChildren(
    ...axes(item, x, y, plot),
    ...referenceLine(item, y, plot),
    svgEl('path', { class: `mc-area ${tone}`, d: areaPath(points, x, y, plot.bottom) }),
    svgEl('path', { class: `mc-line ${tone}`, d: linePath(points, x, y) }),
    svgEl('circle', { class: `mc-dot mc-ring ${tone}`, cx: x(lastT), cy: y(lastV), r: 4 }),
    cross,
    hit,
  );
  return { x, y, plot, cross, crossLine, crossDot, hit };
}

function summary(name, item) {
  const values = item.points.map((p) => p[1]);
  const fmt = (v) => formatChartValue(v, item.fmt);
  const change = changeFromClose(item.last ?? values.at(-1), item.prevClose, item.fmt);
  return `${name}, today in 5-minute closes: from ${fmt(values[0])} to ${fmt(values.at(-1))}` +
    `${change ? ` (${change} on the previous close)` : ''}; high ${fmt(Math.max(...values))}, low ${fmt(Math.min(...values))}.` +
    ' Use the left and right arrow keys to read prices.';
}

/**
 * Wires the [data-market-detail] figure. Returns { show(item, name), unavailable() }; `show` redraws for a
 * new instrument or a newer file and on resize, keeping the crosshair keyboard- and pointer-driven.
 */
export function createDetailChart(figure) {
  const q = (name) => figure.querySelector(`[data-detail-${name}]`);
  const [plotBox, svg, tip, tipValue, tipLabel, empty] = ['plot', 'svg', 'tip', 'tip-value', 'tip-label', 'empty'].map(q);
  const state = { item: null, name: '', geo: null, index: -1 };

  function hideCrosshair() {
    state.index = -1;
    if (state.geo) state.geo.cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  }

  function setActive(index) {
    const { item, geo } = state;
    if (!geo || index < 0) return;
    state.index = index;
    const [t, v] = item.points[index];
    const cx = geo.x(t);
    geo.crossLine.setAttribute('x1', cx);
    geo.crossLine.setAttribute('x2', cx);
    geo.crossDot.setAttribute('cx', cx);
    geo.crossDot.setAttribute('cy', geo.y(v));
    geo.cross.setAttribute('visibility', 'visible');
    tipValue.textContent = formatChartValue(v, item.fmt);
    const change = changeFromClose(v, item.prevClose, item.fmt);
    tipLabel.textContent = `${formatIstTime(t)} IST${change ? ` · ${change}` : ''}`;
    tip.hidden = false;
    const maxLeft = plotBox.clientWidth - tip.offsetWidth;
    const left = cx + TIP_GAP + tip.offsetWidth > geo.plot.right ? cx - TIP_GAP - tip.offsetWidth : cx + TIP_GAP;
    tip.style.left = `${Math.max(0, Math.min(maxLeft, left))}px`;
  }

  function draw() {
    const { item } = state;
    const ready = hasChart(item);
    empty.hidden = ready;
    svg.toggleAttribute('hidden', !ready); // SVG elements have no .hidden property
    hideCrosshair();
    if (!ready) {
      state.geo = null;
      return;
    }
    state.geo = drawDetail(svg, item, Math.max(plotBox.clientWidth, DETAIL.right + 120));
    svg.setAttribute('aria-label', summary(state.name, item));
  }

  svg.addEventListener('pointermove', (event) => {
    const { geo, item } = state;
    if (!geo) return;
    const box = svg.getBoundingClientRect();
    const t = scaleLinear([geo.plot.left, geo.plot.right], [item.points[0][0], item.points.at(-1)[0]])(event.clientX - box.left);
    setActive(nearestIndex(item.points, t));
  });
  svg.addEventListener('pointerleave', hideCrosshair);
  svg.addEventListener('focus', () => setActive(state.item ? state.item.points.length - 1 : -1));
  svg.addEventListener('blur', hideCrosshair);
  svg.addEventListener('keydown', (event) => {
    const last = state.item ? state.item.points.length - 1 : -1;
    const moves = { ArrowLeft: state.index - 1, ArrowRight: state.index + 1, Home: 0, End: last };
    if (!(event.key in moves) || last < 0) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(last, moves[event.key])));
  });
  new ResizeObserver(() => { if (state.item) draw(); }).observe(plotBox);

  return {
    show(item, name) {
      state.item = item;
      state.name = name;
      draw();
    },
    unavailable() {
      empty.textContent = 'Intraday prices are unavailable right now.';
      empty.hidden = false;
      svg.toggleAttribute('hidden', true);
    },
  };
}
