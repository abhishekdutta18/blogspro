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

function parseRbi(raw) {
  const rates = Array.isArray(raw?.rates) ? raw.rates.map(toRate).filter(Boolean) : [];
  if (rates.length === 0 || !time(raw.fetchedAt)) return null;
  const usdInr = Number(raw.usdInr);
  return {
    fetchedAt: raw.fetchedAt,
    rates,
    usdInr: usdInr > 0 ? usdInr : null,
    releases: Array.isArray(raw.releases) ? raw.releases.map(toRelease).filter(Boolean) : [],
  };
}

function parseCalendar(raw) {
  if (!Array.isArray(raw?.events) || !time(raw.fetchedAt)) return null;
  return { fetchedAt: raw.fetchedAt, events: raw.events.map(toEvent).filter(Boolean).sort((a, b) => a.time - b.time) };
}

/** { rbi, calendar } from the published file (either may be null), or null when neither is usable. */
export function parsePolicy(json) {
  const rbi = parseRbi(json?.rbi);
  const calendar = parseCalendar(json?.calendar);
  return rbi || calendar ? { rbi, calendar } : null;
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
