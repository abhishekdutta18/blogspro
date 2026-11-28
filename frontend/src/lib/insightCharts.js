/**
 * Chart specs (see lib/lineChartView.js) for the yield curve, the macro series and the instrument
 * forecasts, built from the parsed files in lib/insights.js and lib/policy.js. Pure functions: tested in
 * tests/insight-charts.test.mjs.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURVE_TICKS = [1, 5, 10, 15, 20, 30, 40];
const SHOWN_SESSIONS = 60;
const X_LABELS = 6;

export const pct = (v) => `${v.toFixed(2)}%`;
const pct1 = (v) => `${v.toFixed(1)}%`;
const bp = (d) => `${d < 0 ? '-' : '+'}${Math.abs(Math.round(d * 100))} bp`;

/** "Oct 2026" / "Oct 26" for 'YYYY-MM'. */
export const monthName = (key, short = false) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${short ? key.slice(2, 4) : key.slice(0, 4)}`;

/** "3 mo", "1y", "7.5y" for a maturity in years. */
export const maturityLabel = (m) => (m < 1 ? `${Math.round(m * 12)} mo` : `${Number(m.toFixed(1))}y`);

/** About `count` evenly spread labels from `labels` (indexed by x), always ending on the last. */
export function spreadTicks(labels, count = X_LABELS) {
  const last = labels.length - 1;
  const every = Math.max(1, Math.ceil(labels.length / count));
  return labels.map((label, x) => ({ x, label })).filter((t) => t.x === last || (t.x % every === 0 && last - t.x >= every / 2));
}

export function yieldCurveSpec(bonds) {
  const { latest, previous } = bonds;
  const prevAt = new Map((previous?.curve ?? []).map(([m, y]) => [m, y]));
  const maxM = latest.curve.at(-1)[0];
  return {
    series: [
      ...(previous ? [{ cls: 'lc-compare', points: previous.curve }] : []),
      { cls: 'lc-accent', points: latest.curve },
    ],
    dots: bonds.benchmarks.map((b) => [b.years, b.yield]),
    xTicks: CURVE_TICKS.filter((m) => m <= maxM).map((m) => ({ x: m, label: `${m}y` })),
    yFormat: pct,
    hover: latest.curve.map(([m, y]) => {
      const before = prevAt.get(m);
      return { x: m, y, title: `${maturityLabel(m)}: ${pct(y)}`, detail: Number.isFinite(before) ? `${bp(y - before)} vs ${previous.date}` : latest.date };
    }),
    label: `India government bond zero-coupon yield curve on ${latest.date}: ${pct(latest.curve[0][1])} at ${maturityLabel(latest.curve[0][0])}, `
      + `${pct(latest.curve.at(-1)[1])} at ${maturityLabel(maxM)}.${previous ? ` Grey line: ${previous.date}.` : ''} Use the arrow keys to read yields.`,
  };
}

/**
 * History plus forecast on one index axis: the forecast line starts at the last actual point and the 80%
 * band opens from it, so the projection visibly continues the series.
 */
function withForecast(values, forecast) {
  const last = values.length - 1;
  const lastValue = values[last];
  return {
    actual: values.map((v, i) => [i, v]),
    projected: forecast.length ? [[last, lastValue], ...forecast.map((f, i) => [last + 1 + i, f.value])] : [],
    band: forecast.length ? [[last, lastValue, lastValue], ...forecast.map((f, i) => [last + 1 + i, f.lower, f.upper])] : [],
  };
}

const forecastDetail = (f, fmt) => `TimesFM forecast · 80%: ${fmt(f.lower)} to ${fmt(f.upper)}`;

export function macroSpec(series, forecast = []) {
  const values = series.points.map((p) => p[1]);
  const periods = [...series.points.map((p) => p[0]), ...forecast.map((f) => f.period)];
  const { actual, projected, band } = withForecast(values, forecast);
  const hover = [
    ...series.points.map(([period, v], i) => ({ x: i, y: v, title: `${monthName(period)}: ${pct1(v)}`, detail: 'MoSPI' })),
    ...forecast.map((f, i) => ({ x: values.length + i, y: f.value, title: `${monthName(f.period)}: ${pct1(f.value)}`, detail: forecastDetail(f, pct1) })),
  ];
  return {
    series: [{ cls: 'lc-accent', points: actual, end: !forecast.length }, ...(projected.length ? [{ cls: 'lc-accent lc-dash', points: projected, end: true }] : [])],
    bands: band.length ? [{ points: band }] : [],
    xTicks: spreadTicks(periods.map((p) => monthName(p, true)), 4),
    yFormat: pct1,
    hover,
    label: `${series.label}, ${monthName(series.points[0][0])} to ${monthName(series.points.at(-1)[0])}: latest ${pct1(values.at(-1))}.`
      + (forecast.length ? ` Forecast for ${monthName(forecast.at(-1).period)}: ${pct1(forecast.at(-1).value)}.` : ''),
  };
}

/** `format` turns a value into the instrument's style (see lib/marketChart.js formatChartValue). */
export function dailyForecastSpec(name, entry, format) {
  const history = entry.history.slice(-SHOWN_SESSIONS);
  const values = history.map((p) => p[1]);
  const { actual, projected, band } = withForecast(values, entry.forecast);
  const labels = [...history.map(([d]) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`), ...entry.forecast.map((f) => `+${f.step}`)];
  return {
    series: [{ cls: 'lc-accent', points: actual }, { cls: 'lc-accent lc-dash', points: projected, end: true }],
    bands: [{ points: band }],
    xTicks: spreadTicks(labels, 5),
    yFormat: format,
    hover: [
      ...history.map(([d, v], i) => ({ x: i, y: v, title: format(v), detail: `Close ${labels[i]} ${d.slice(0, 4)}` })),
      ...entry.forecast.map((f, i) => ({ x: values.length + i, y: f.value, title: format(f.value), detail: `Session +${f.step}: ${forecastDetail(f, format)}` })),
    ],
    label: `${name}: ${history.length} daily closes to ${history.at(-1)[0]}, last ${format(values.at(-1))}; `
      + `TimesFM forecast for ${entry.forecast.length} sessions ahead ends at ${format(entry.forecast.at(-1).value)}.`,
  };
}
