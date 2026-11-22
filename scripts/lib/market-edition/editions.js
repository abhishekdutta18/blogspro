/**
 * Market editions — the three daily briefings (08:00, 16:00, 22:00 IST) that replaced the hourly pulse.
 * Each edition has a fixed focus so the writer prompt and the page header agree on what the reader gets.
 * The systemd timer fires at the edition hours; a manual run at any other time picks the nearest edition.
 */

export const EDITIONS = Object.freeze([
  {
    id: 'morning',
    hourIst: 8,
    label: 'Morning brief',
    focus:
      'Pre-market setup for India. Lead with how US and European markets closed overnight and how Asia is trading now, ' +
      'then what that implies for the Indian open (Nifty, Bank Nifty, rupee). End with the events and data due today.',
  },
  {
    id: 'close',
    hourIst: 16,
    label: 'Market close',
    focus:
      'Indian market close. Lead with how Nifty 50, Sensex, Bank Nifty and Nifty IT finished and why, using the day\'s news. ' +
      'Cover volatility (India VIX), the rupee and commodities, then what it sets up for tomorrow.',
  },
  {
    id: 'evening',
    hourIst: 22,
    label: 'Evening wrap',
    focus:
      'Global evening wrap. Lead with how Europe closed and how the US session is trading, plus bonds, the dollar, oil, gold ' +
      'and crypto. Connect it back to how Indian markets are likely to open tomorrow.',
  },
]);

const IST_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });

/** Edition by id, or null for an unknown id. */
export function getEdition(id) {
  return EDITIONS.find((e) => e.id === id) || null;
}

/** The edition whose hour is closest to `date` in IST (wrapping round midnight). */
export function resolveEdition(date = new Date()) {
  const hour = Number(IST_HOUR.format(date)) % 24;
  const distance = (e) => Math.min(Math.abs(e.hourIst - hour), 24 - Math.abs(e.hourIst - hour));
  return EDITIONS.reduce((best, e) => (distance(e) < distance(best) ? e : best));
}
