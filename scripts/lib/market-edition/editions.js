/**
 * Market editions — the three daily briefings (08:00, 16:00, 22:00 IST) that replaced the hourly pulse.
 * Each edition has a fixed focus so the writer prompt and the page header agree on what the reader gets.
 * The systemd timer fires at the edition hours; a manual run at any other time picks the nearest edition.
 * REPORTS are the daily and weekly pieces built by the same pipeline (same fixed ~6 AI calls) with their own
 * focus; they have no hour, so resolveEdition never picks them — they are chosen by id.
 */
import { PERIODS } from './market-data.js';

const session = (edition) => Object.freeze({ ...edition, period: PERIODS.session });

export const EDITIONS = Object.freeze([
  session({
    id: 'morning',
    hourIst: 8,
    label: 'Morning brief',
    focus:
      'Pre-market setup for India. Lead with how US and European markets last closed and how Asia is trading (or last closed), ' +
      'then what that implies for the Indian open (Nifty, Bank Nifty, rupee). End with the events and data due today.',
  }),
  session({
    id: 'close',
    hourIst: 16,
    label: 'Market close',
    focus:
      'Indian market close. Lead with how Nifty 50, Sensex, Bank Nifty and Nifty IT finished and why, using the day\'s news. ' +
      'Cover volatility (India VIX), the rupee, G-Sec yields and commodities, then what it sets up for the next session.',
  }),
  session({
    id: 'evening',
    hourIst: 22,
    label: 'Evening wrap',
    focus:
      'Global evening wrap. Lead with how Europe closed and the US session (live if its quotes are live, otherwise its last close), plus Treasury and G-Sec yields, the dollar, oil, gold ' +
      'and crypto. Connect it back to how Indian markets are likely to open in their next session.',
  }),
]);

export const REPORTS = Object.freeze([
  Object.freeze({
    id: 'daily',
    label: 'Daily strategy',
    period: PERIODS.session,
    focus:
      'Daily strategy note, written before the Indian open. Recap the last full Indian session (Nifty 50, Sensex, Bank Nifty, ' +
      'sector breadth, India VIX) and the last US and European closes, then the rupee, yields, oil and gold. ' +
      'Explain what changed in the market narrative and set out positioning and the events that matter for the day ahead.',
  }),
  Object.freeze({
    id: 'weekly',
    label: 'Weekly review',
    period: PERIODS.week,
    focus:
      'Weekly review for Indian investors. Every move in MARKET DATA is over the last 5 sessions, not one day. ' +
      'Explain the week: which Indian sectors led and lagged, how global markets, the rupee, yields and commodities moved, ' +
      'and which themes from this week\'s editions mattered and which faded. Close with the view and the calendar for next week.',
  }),
]);

const IST_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });

/** Edition or report by id, or null for an unknown id. */
export function getEdition(id) {
  return EDITIONS.find((e) => e.id === id) || REPORTS.find((r) => r.id === id) || null;
}

/** The edition whose hour is closest to `date` in IST (wrapping round midnight). */
export function resolveEdition(date = new Date()) {
  const hour = Number(IST_HOUR.format(date)) % 24;
  const distance = (e) => Math.min(Math.abs(e.hourIst - hour), 24 - Math.abs(e.hourIst - hour));
  return EDITIONS.reduce((best, e) => (distance(e) < distance(best) ? e : best));
}
