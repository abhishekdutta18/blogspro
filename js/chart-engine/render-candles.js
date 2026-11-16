// render-candles.js — Candlestick and OHLC price charts. Direction uses the CVD-validated
// polarity pair (blue up, red down), never green/red. Each period has a full-height transparent
// hit area so a tap anywhere in its column shows open/high/low/close.
import { formatFull } from './format.js';
import { buildFrame, renderAxes } from './frame.js';
import { renderReferenceBands, renderReferenceLines } from './render-references.js';
import { WIDE, r1, tip } from './svg.js';

const BODY_FILL = 0.6; // share of each band a candle body occupies
const MAX_BODY_WIDTH = 14;
const MIN_BODY_HEIGHT = 1; // a doji (open == close) still shows as a line

function candle({ x, open, high, low, close, color }, body) {
  const wick = `<line class="bp-wick" x1="${r1(x)}" x2="${r1(x)}" y1="${r1(high)}" y2="${r1(low)}" stroke="${color}" stroke-width="1"/>`;
  const top = Math.min(open, close);
  const height = Math.max(MIN_BODY_HEIGHT, Math.abs(close - open));
  return wick + `<rect class="bp-candle" x="${r1(x - body / 2)}" y="${r1(top)}" width="${r1(body)}" height="${r1(height)}" fill="${color}"/>`;
}

function ohlcBar({ x, open, high, low, close, color }, body) {
  const half = body / 2;
  const d = `M${r1(x)},${r1(high)}V${r1(low)}M${r1(x - half)},${r1(open)}H${r1(x)}M${r1(x)},${r1(close)}H${r1(x + half)}`;
  return `<path class="bp-ohlc" d="${d}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
}

/**
 * Render a candlestick ChartSpec (series: Open, High, Low, Close) to an SVG body.
 * @param {import('./normalize.js').ChartSpec} spec
 * @param {import('./theme.js').DARK_THEME} theme
 * @param {import('./svg.js').WIDE} [layout]
 * @returns {string}
 */
export function renderCandles(spec, theme, layout = WIDE) {
  const frame = buildFrame(spec, { legend: null, directLabels: false }, layout);
  const [opens, highs, lows, closes] = spec.series.map(s => s.values);
  const body = Math.min(MAX_BODY_WIDTH, Math.max(1, frame.band * BODY_FILL));
  const draw = spec.candle === 'ohlc' ? ohlcBar : candle;
  const price = v => formatFull(v, spec.unit);
  const marks = spec.categories.map((c, i) => {
    const color = closes[i] >= opens[i] ? theme.positive : theme.negative;
    const mark = draw({ x: frame.center(i), open: frame.value(opens[i]), high: frame.value(highs[i]), low: frame.value(lows[i]), close: frame.value(closes[i]), color }, body);
    const summary = `${c} · O ${price(opens[i])} · H ${price(highs[i])} · L ${price(lows[i])} · C ${price(closes[i])}`;
    const hit = `<rect x="${r1(frame.bandStart(i))}" y="${frame.plot.top}" width="${r1(frame.band)}" height="${r1(frame.plot.bottom - frame.plot.top)}" fill="transparent">${tip(summary)}</rect>`;
    return mark + hit;
  }).join('');
  return [renderAxes(spec, frame, theme), renderReferenceBands(spec, frame, theme), marks, renderReferenceLines(spec, frame, theme)].join('');
}
