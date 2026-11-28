/**
 * Homepage data beyond quotes and policy, all published on the server (deploy/vps/README.md):
 *   /data/bonds.json      CCIL zero-coupon yield curve (today and the previous day) and benchmark yields
 *   /data/movers.json     best and worst five members of each index today
 *   /data/forecasts.json  TimesFM forecasts for the instruments and the MoSPI macro series
 * Every file is network data: each parser keeps only well-formed values and returns null when nothing is
 * usable. Rendering code uses textContent only.
 */

const TEXT_MAX = 80;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const SYMBOL = /^[A-Za-z0-9:^.\-]{1,24}$/;
const INDEX_IDS = Object.freeze(['nifty50', 'sensex', 'niftyBank', 'sp500', 'nasdaq100', 'nikkei225']);

const text = (value, max = TEXT_MAX) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const arr = (value) => (Array.isArray(value) ? value : []);

/** [[x, y]] pairs whose x passes `isX` and y is a finite number. */
const pairs = (raw, isX) => arr(raw).filter((p) => Array.isArray(p) && isX(p[0]) && num(p[1]) !== null).map(([x, y]) => [x, y]);

function toCurve(raw) {
  const date = DAY.test(raw?.date) ? raw.date : null;
  const curve = pairs(raw?.curve, (m) => num(m) !== null && m > 0 && m <= 50).filter(([, y]) => y > 0 && y < 30);
  return date && curve.length >= 2 ? { date, curve } : null;
}

/** { latest, previous, benchmarks, asOn } from bonds.json, or null without a usable curve. */
export function parseBonds(raw) {
  const latest = toCurve(raw?.zcyc?.latest);
  if (!latest) return null;
  const benchmarks = arr(raw?.tenors?.gsec)
    .map((t) => ({ years: num(t?.years), yield: num(t?.yield), bucket: text(t?.bucket, 16), security: text(t?.security) }))
    .filter((t) => t.years > 0 && t.years <= 50 && t.yield > 0 && t.yield < 30 && t.bucket)
    .sort((a, b) => a.years - b.years);
  return { latest, previous: toCurve(raw?.zcyc?.previous), benchmarks, asOn: DAY.test(raw?.tenors?.asOn) ? raw.tenors.asOn : null };
}

function toMover(raw) {
  const symbol = SYMBOL.test(raw?.symbol) ? raw.symbol : null;
  const name = text(raw?.name);
  const changePct = num(raw?.changePct);
  return symbol && name && changePct !== null && Math.abs(changePct) < 100 ? { symbol, name, price: num(raw?.price), changePct } : null;
}

function toIndex(raw) {
  const name = text(raw?.name, 40);
  const fetchedAt = num(raw?.fetchedAt);
  if (!INDEX_IDS.includes(raw?.id) || !name || !(fetchedAt > 0)) return null;
  return {
    id: raw.id, name, fetchedAt,
    note: text(raw?.note, 120),
    currency: /^[A-Z]{3}$/.test(raw?.currency) ? raw.currency : null,
    count: num(raw?.count), advancers: num(raw?.advancers), decliners: num(raw?.decliners),
    gainers: arr(raw?.gainers).map(toMover).filter((m) => m && m.changePct > 0).slice(0, 5),
    losers: arr(raw?.losers).map(toMover).filter((m) => m && m.changePct < 0).slice(0, 5),
  };
}

/** { generatedAt, indices } from movers.json in display order, or null. */
export function parseMovers(raw) {
  const indices = arr(raw?.indices).map(toIndex).filter(Boolean).sort((a, b) => INDEX_IDS.indexOf(a.id) - INDEX_IDS.indexOf(b.id));
  return indices.length ? { generatedAt: num(raw?.generatedAt), indices } : null;
}

function toSteps(raw) {
  return arr(raw)
    .map((f) => ({ step: num(f?.step), period: PERIOD.test(f?.period) ? f.period : null, value: num(f?.value), lower: num(f?.lower), upper: num(f?.upper) }))
    .filter((f) => f.value !== null && f.lower !== null && f.upper !== null && f.lower <= f.upper);
}

/** { model, confidence, daily: Map(symbol -> { history, forecast }), macro: Map(key -> forecast) }, or null. */
export function parseForecasts(raw) {
  const daily = new Map();
  arr(raw?.daily?.series).forEach((s) => {
    const history = pairs(s?.history, (d) => DAY.test(d));
    const forecast = toSteps(s?.forecast).filter((f) => f.step > 0);
    if (SYMBOL.test(s?.id) && history.length >= 2 && forecast.length) daily.set(s.id, { history, forecast });
  });
  const macro = new Map();
  arr(raw?.macro?.series).forEach((s) => {
    const forecast = toSteps(s?.forecast).filter((f) => f.period);
    if (typeof s?.key === 'string' && forecast.length) macro.set(s.key, forecast);
  });
  const confidence = num(raw?.confidence);
  if (daily.size === 0 && macro.size === 0) return null;
  return { model: text(raw?.model, 120) ?? 'TimesFM', confidence: confidence > 0 && confidence < 1 ? confidence : null, generatedAt: num(raw?.generatedAt), daily, macro };
}

const pending = new Map();

/** The parsed file at `url`, fetched once per page; null when it cannot be loaded or parsed. */
export function loadOnce(url, parse) {
  if (!pending.has(url)) {
    pending.set(url, fetch(url, { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(parse)
      .catch((error) => {
        console.warn(`[insights] ${url} unavailable:`, error);
        return null;
      }));
  }
  return pending.get(url);
}

export const loadBonds = () => loadOnce('/data/bonds.json', parseBonds);
export const loadMovers = () => loadOnce('/data/movers.json', parseMovers);
export const loadForecasts = () => loadOnce('/data/forecasts.json', parseForecasts);
