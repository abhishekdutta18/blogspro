/**
 * Homepage Policy section data — reads /data/policy.json, published every 30 minutes on the server by
 * scripts/publish-home-policy.js from the RBI website and the Forex Factory calendar feed. The file comes
 * over the network, so every field is validated here and rendered with textContent only; links must
 * point to rbi.org.in.
 */

const POLICY_URL = '/data/policy.json';
const TEXT_MAX = 160;
const VALUE_MAX = 16;
const MAX_RATE = 30;
const RBI_LINK = /^https:\/\/(?:www\.)?rbi\.org\.in\//;
const IST_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});

const text = (value, max) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);
const time = (value) => (Number.isFinite(value) && value > 0 ? value : null);

function toRate(raw) {
  const label = text(raw?.label, TEXT_MAX);
  const value = Number(raw?.value);
  return label && value > 0 && value <= MAX_RATE ? { label, value } : null;
}

function toRelease(raw) {
  const title = text(raw?.title, TEXT_MAX);
  const href = text(raw?.href, 400);
  return title && href && RBI_LINK.test(href) && time(raw.time) ? { title, href, time: raw.time } : null;
}

function toEvent(raw) {
  const title = text(raw?.title, TEXT_MAX);
  const country = /^[A-Z]{3}$/.test(String(raw?.country)) ? raw.country : null;
  if (!title || !country || !time(raw.time)) return null;
  return { title, country, time: raw.time, forecast: text(raw.forecast, VALUE_MAX) || '—', previous: text(raw.previous, VALUE_MAX) || '—' };
}

const list = (value, toItem) => (Array.isArray(value) ? value.map(toItem).filter(Boolean) : []);

function toGsec(raw) {
  const rate = toRate(raw);
  const maturity = Number(raw?.maturity);
  return rate && Number.isInteger(maturity) && maturity > 2000 && maturity < 2100 ? { ...rate, maturity } : null;
}

function parseMarkets(raw) {
  const gsecs = list(raw?.gsecs, toGsec);
  const tbills = list(raw?.tbills, toRate);
  return gsecs.length || tbills.length ? { gsecs, tbills, asOn: time(raw.asOn) } : null;
}

function parseRbi(raw) {
  const rates = list(raw?.rates, toRate);
  if (rates.length === 0 || !time(raw.fetchedAt)) return null;
  const usdInr = Number(raw.usdInr);
  return {
    fetchedAt: raw.fetchedAt,
    rates,
    usdInr: usdInr > 0 ? usdInr : null,
    markets: parseMarkets(raw.markets),
    releases: list(raw.releases, toRelease),
  };
}

// Display order of the MoSPI indicators; unknown keys are ignored.
const MACRO_ORDER = Object.freeze(['cpi', 'cpiFood', 'wpi', 'iip', 'gdp', 'unemployment']);

function toIndicator(raw) {
  const label = text(raw?.label, 60);
  const period = text(raw?.period, 20);
  const value = Number(raw?.value);
  if (!MACRO_ORDER.includes(raw?.key) || !label || !period || raw.unit !== '%' || !Number.isFinite(value) || Math.abs(value) >= 100) return null;
  return { key: raw.key, label, value, period };
}

function parseMacro(raw) {
  if (!time(raw?.fetchedAt)) return null;
  const indicators = list(raw.indicators, toIndicator).sort((a, b) => MACRO_ORDER.indexOf(a.key) - MACRO_ORDER.indexOf(b.key));
  return indicators.length ? { fetchedAt: raw.fetchedAt, indicators } : null;
}

/** The G-Sec closest to ten years from `now`'s year (the 10-year benchmark), or null. */
export function benchmarkGsec(gsecs, now = Date.now()) {
  const target = new Date(now).getUTCFullYear() + 10;
  return [...gsecs].sort((a, b) => Math.abs(a.maturity - target) - Math.abs(b.maturity - target))[0] ?? null;
}

function parseCalendar(raw) {
  if (!Array.isArray(raw?.events) || !time(raw.fetchedAt)) return null;
  return { fetchedAt: raw.fetchedAt, events: raw.events.map(toEvent).filter(Boolean).sort((a, b) => a.time - b.time) };
}

/** { rbi, macro, calendar } from the published file (any may be null), or null when none is usable. */
export function parsePolicy(json) {
  const rbi = parseRbi(json?.rbi);
  const macro = parseMacro(json?.macro);
  const calendar = parseCalendar(json?.calendar);
  return rbi || macro || calendar ? { rbi, macro, calendar } : null;
}

/** "19 Nov 2026" for a UTC calendar date in ms. */
export function formatDay(ms) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms));
}

/** "+6.09%" style for growth and inflation figures (sign shown), "4.90%" for levels. */
export function formatIndicator(value, { signed = true } = {}) {
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** "Wed 25 Nov, 19:00 IST" for an epoch-millisecond time. */
export function formatIst(ms) {
  const part = Object.fromEntries(IST_FORMAT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return `${part.weekday} ${part.day} ${part.month}, ${part.hour}:${part.minute} IST`;
}

/** "5.50%" for a policy rate. */
export const formatRate = (value) => `${value.toFixed(2)}%`;

let pending = null;

/** The parsed file, fetched once per page; null when it cannot be loaded. */
export function loadPolicy() {
  pending ??= fetch(POLICY_URL, { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then(parsePolicy)
    .catch((error) => {
      console.warn('[policy] policy data unavailable:', error);
      return null;
    });
  return pending;
}
