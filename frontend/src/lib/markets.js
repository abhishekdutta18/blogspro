/**
 * Live homepage market figures — reads /data/markets.json (published every few minutes on the server by
 * scripts/publish-home-markets.js) and swaps the figures into the market strip and Markets table, which
 * render a dated snapshot at build time. The file is fetched over the network, so every field is
 * validated and written with textContent only. If the file is missing or malformed, the built snapshot
 * stays on screen with its own date label, so nothing ever claims to be fresher than it is.
 */

const MARKETS_URL = '/data/markets.json';
const SYMBOL_PATTERN = /^[A-Z0-9:]{2,16}$/;
const TEXT_MAX = 40;
// Older than this, the label says "Last updated" so a stalled publisher is visible to readers.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const IST_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});

const text = (value) => (typeof value === 'string' && value.length > 0 && value.length <= TEXT_MAX ? value : null);
const finiteOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

// Chart data: the styles the publisher emits, and a cap well above its 120 points per instrument.
const CHART_LOCALES = new Set(['en-IN', 'en-US']);
const CHART_AFFIXES = new Set(['', '$', '%']);
const MAX_DIGITS = 6;
const MAX_POINTS = 300;

function toFormat(raw) {
  if (!raw || !CHART_LOCALES.has(raw.locale)) return null;
  if (!Number.isInteger(raw.digits) || raw.digits < 0 || raw.digits > MAX_DIGITS) return null;
  const prefix = raw.prefix ?? '';
  const suffix = raw.suffix ?? '';
  if (!CHART_AFFIXES.has(prefix) || !CHART_AFFIXES.has(suffix)) return null;
  return { locale: raw.locale, digits: raw.digits, prefix, suffix };
}

// [unixSeconds, value] pairs with strictly increasing times; anything else is dropped.
function toPoints(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-MAX_POINTS).reduce((kept, p) => {
    const ok = Array.isArray(p) && finiteOrNull(p[0]) !== null && finiteOrNull(p[1]) !== null;
    return ok && (kept.length === 0 || p[0] > kept.at(-1)[0]) ? [...kept, [p[0], p[1]]] : kept;
  }, []);
}

function toItem(raw) {
  if (!raw || typeof raw !== 'object' || !SYMBOL_PATTERN.test(String(raw.symbol))) return null;
  const price = text(raw.price);
  if (!price) return null;
  return {
    symbol: raw.symbol,
    price,
    change: text(raw.change) || '—',
    isPositive: raw.isPositive !== false,
    range: text(raw.range),
    open: text(raw.open),
    live: raw.live === true,
    last: finiteOrNull(raw.last),
    prevClose: finiteOrNull(raw.prevClose),
    fmt: toFormat(raw.fmt),
    points: toPoints(raw.points),
  };
}

/** { updatedAt, items: Map<symbol, item> } from the published file, or null when it is unusable. */
export function parseMarkets(json) {
  const updatedAt = Number(json?.generatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || !Array.isArray(json.items)) return null;
  const items = new Map(json.items.map(toItem).filter(Boolean).map((item) => [item.symbol, item]));
  return items.size > 0 ? { updatedAt, items } : null;
}

/** "Updated 23 Nov, 13:05 IST", or "Last updated …" once the file is more than six hours old. */
export function marketsLabel(updatedAt, now = Date.now()) {
  const when = `${IST_FORMAT.format(new Date(updatedAt)).replace(' at ', ', ')} IST`;
  return now - updatedAt > STALE_AFTER_MS ? `Last updated ${when}` : `Updated ${when}`;
}

function setField(row, field, value) {
  const cell = row.querySelector(`[data-field="${field}"]`);
  if (cell) cell.textContent = value ?? '—';
}

/** Writes the figures into every [data-market-symbol] row and the [data-markets-label] captions. */
export function applyMarkets(root, data, now = Date.now()) {
  root.querySelectorAll('[data-market-symbol]').forEach((row) => {
    const item = data.items.get(row.dataset.marketSymbol);
    if (!item) return;
    setField(row, 'price', item.price);
    setField(row, 'range', item.range);
    setField(row, 'open', item.open);
    const change = row.querySelector('[data-field="change"]');
    if (change) {
      change.textContent = item.change;
      change.classList.toggle('text-up', item.isPositive);
      change.classList.toggle('text-down', !item.isPositive);
    }
    row.title = item.live ? 'Market open' : 'Market closed: last traded price';
  });
  const label = marketsLabel(data.updatedAt, now);
  root.querySelectorAll('[data-markets-label]').forEach((el) => { el.textContent = label; });
}

// The server republishes every 5 minutes; checking every 2 keeps the page at most ~7 minutes behind.
const REFRESH_MS = 2 * 60 * 1000;
const listeners = new Set();
let pending = null;
let latest = null;

function fetchMarkets() {
  return fetch(MARKETS_URL, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(parseMarkets)
    .catch((error) => {
      console.warn('[markets] live figures unavailable, keeping what is on screen:', error);
      return null;
    });
}

// Applies a newer file to the page and hands it to the charts; an unchanged or older file is ignored.
function publish(root, data) {
  if (!data || (latest && data.updatedAt <= latest.updatedAt)) return;
  latest = data;
  applyMarkets(root, data);
  listeners.forEach((listener) => listener(data));
}

/** Calls `listener` with each new file, starting with the current one if it has loaded. Returns an unsubscribe. */
export function onMarkets(listener) {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => listeners.delete(listener);
}

/**
 * Loads the file once per page (both components call this), applies it, and re-checks every two minutes
 * while the tab is visible. Resolves with the first load's data, or null when it failed (the built
 * snapshot then stays on screen).
 */
export function loadLiveMarkets(root = document) {
  if (!pending) {
    pending = fetchMarkets().then((data) => {
      publish(root, data);
      return data;
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') fetchMarkets().then((data) => publish(root, data));
    }, REFRESH_MS);
  }
  return pending;
}
