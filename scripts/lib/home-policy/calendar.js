/**
 * This week's high-impact economic releases from the Forex Factory calendar export
 * (https://nfs.faireconomy.media/ff_calendar_thisweek.json). The feed has forecast and previous values
 * but no actual prints, and it answers HTTP 429 to frequent requests, so it is polled at most every
 * 30 minutes from the server and never from readers' browsers.
 */

const TEXT_MAX = 80;
const VALUE_MAX = 16;
const COUNTRY = /^[A-Z]{3}$/;

const shortText = (value, max) => (typeof value === 'string' && value.length <= max ? value.trim() : null);

function toEvent(raw) {
  if (!raw || typeof raw !== 'object' || raw.impact !== 'High') return null;
  const title = shortText(raw.title, TEXT_MAX);
  const time = Date.parse(raw.date);
  if (!title || !COUNTRY.test(String(raw.country)) || !Number.isFinite(time)) return null;
  return {
    title,
    country: raw.country,
    time,
    forecast: shortText(raw.forecast, VALUE_MAX) ?? '',
    previous: shortText(raw.previous, VALUE_MAX) ?? '',
  };
}

/** High-impact events as [{ title, country, time, forecast, previous }], oldest first. */
export function parseCalendar(json) {
  if (!Array.isArray(json)) return [];
  return json.map(toEvent).filter(Boolean).sort((a, b) => a.time - b.time);
}
