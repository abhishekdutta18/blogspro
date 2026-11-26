/**
 * Exchange trading calendar for the editions: session hours (with lunch breaks), holidays and early closes for
 * each exchange whose quotes the editions show. Quote freshness alone cannot tell a holiday from a trading day
 * (Yahoo can stamp a fresh time on an unchanged price), so the editions ask this calendar whether a market
 * traded, and every prompt carries the result so the writer never describes a closed market as moving.
 *
 * Holidays are per calendar year. 2026 dates up to 26 Nov were checked against the exchanges' daily bars
 * (weekdays with no bar); the rest come from the exchanges' published 2026 calendars. A year missing from
 * CALENDAR_YEARS is reported (`calendarKnown: false`) and weekday hours are used: add the next year's lists
 * when the exchanges publish them (NSE usually in December).
 */

export const CALENDAR_YEARS = Object.freeze([2026]);

const NYSE_HOLIDAYS = Object.freeze({
  '2026-01-01': "New Year's Day", '2026-01-19': 'Martin Luther King Jr. Day', '2026-02-16': "Washington's Birthday",
  '2026-04-03': 'Good Friday', '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)', '2026-09-07': 'Labor Day', '2026-11-26': 'Thanksgiving Day',
  '2026-12-25': 'Christmas Day',
});
const NYSE_EARLY_CLOSES = Object.freeze({ '2026-11-27': '13:00', '2026-12-24': '13:00' });

const exchange = (e) => Object.freeze({ earlyCloses: {}, ...e });

/** Exchanges by id. `sessions` are local [open, close] pairs (two pairs = lunch break); times are 'HH:MM'. */
export const EXCHANGES = Object.freeze({
  NSE: exchange({
    id: 'NSE', name: 'NSE/BSE (India)', timeZone: 'Asia/Kolkata', city: 'Mumbai', sessions: [['09:15', '15:30']],
    holidays: Object.freeze({
      '2026-01-26': 'Republic Day', '2026-03-03': 'Holi', '2026-03-26': 'Shri Ram Navami',
      '2026-03-31': 'Shri Mahavir Jayanti', '2026-04-03': 'Good Friday', '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
      '2026-05-01': 'Maharashtra Day', '2026-05-28': 'Bakri Id', '2026-06-26': 'Muharram', '2026-09-14': 'Ganesh Chaturthi',
      '2026-10-02': 'Mahatma Gandhi Jayanti', '2026-10-20': 'Dussehra', '2026-11-10': 'Diwali Balipratipada',
      '2026-11-24': 'Guru Nanak Jayanti', '2026-12-25': 'Christmas',
    }),
  }),
  NYSE: exchange({
    id: 'NYSE', name: 'NYSE/Nasdaq (US)', timeZone: 'America/New_York', city: 'New York', sessions: [['09:30', '16:00']],
    holidays: NYSE_HOLIDAYS, earlyCloses: NYSE_EARLY_CLOSES,
  }),
  // Yahoo's ^TNX is a Cboe index: NYSE holidays, Chicago hours.
  CBOE_RATES: exchange({
    id: 'CBOE_RATES', name: 'US Treasury yield indices (Cboe)', timeZone: 'America/Chicago', city: 'Chicago',
    sessions: [['07:20', '14:00']], holidays: NYSE_HOLIDAYS, earlyCloses: Object.freeze({ '2026-11-27': '12:00', '2026-12-24': '12:00' }),
  }),
  LSE: exchange({
    id: 'LSE', name: 'London Stock Exchange', timeZone: 'Europe/London', city: 'London', sessions: [['08:00', '16:30']],
    holidays: Object.freeze({
      '2026-01-01': "New Year's Day", '2026-04-03': 'Good Friday', '2026-04-06': 'Easter Monday',
      '2026-05-04': 'Early May bank holiday', '2026-05-25': 'Spring bank holiday', '2026-08-31': 'Summer bank holiday',
      '2026-12-25': 'Christmas Day', '2026-12-28': 'Boxing Day (substitute day)',
    }),
    earlyCloses: Object.freeze({ '2026-12-24': '12:30', '2026-12-31': '12:30' }),
  }),
  JPX: exchange({
    id: 'JPX', name: 'Japan Exchange (Tokyo)', timeZone: 'Asia/Tokyo', city: 'Tokyo', sessions: [['09:00', '11:30'], ['12:30', '15:30']],
    holidays: Object.freeze({
      '2026-01-01': "New Year's Day", '2026-01-02': 'New Year holiday', '2026-01-12': 'Coming of Age Day',
      '2026-02-11': 'National Foundation Day', '2026-02-23': "Emperor's Birthday", '2026-03-20': 'Vernal Equinox Day',
      '2026-04-29': 'Showa Day', '2026-05-04': 'Greenery Day', '2026-05-05': "Children's Day",
      '2026-05-06': 'Constitution Memorial Day (substitute)', '2026-07-20': 'Marine Day', '2026-08-11': 'Mountain Day',
      '2026-09-21': 'Respect for the Aged Day', '2026-09-22': "Citizens' holiday", '2026-09-23': 'Autumnal Equinox Day',
      '2026-10-12': 'Sports Day', '2026-11-03': 'Culture Day', '2026-11-23': 'Labour Thanksgiving Day',
      '2026-12-31': 'Year-end holiday',
    }),
  }),
  HKEX: exchange({
    id: 'HKEX', name: 'Hong Kong Exchanges', timeZone: 'Asia/Hong_Kong', city: 'Hong Kong', sessions: [['09:30', '12:00'], ['13:00', '16:10']],
    holidays: Object.freeze({
      '2026-01-01': 'New Year', '2026-02-17': 'Lunar New Year', '2026-02-18': 'Lunar New Year (second day)',
      '2026-02-19': 'Lunar New Year (third day)', '2026-04-03': 'Good Friday', '2026-04-06': 'Ching Ming Festival (observed)',
      '2026-04-07': 'Easter Monday (observed)', '2026-05-01': 'Labour Day', '2026-05-25': "Buddha's Birthday (observed)",
      '2026-06-19': 'Tuen Ng Festival', '2026-07-01': 'HKSAR Establishment Day', '2026-10-01': 'National Day',
      '2026-10-19': 'Chung Yeung Festival (observed)', '2026-12-25': 'Christmas Day',
    }),
    earlyCloses: Object.freeze({ '2026-12-24': '12:00', '2026-12-31': '12:00' }),
  }),
});

const PARTS = new Map();
function partsFormatter(timeZone) {
  if (!PARTS.has(timeZone)) {
    PARTS.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }));
  }
  return PARTS.get(timeZone);
}

/** Local date ('YYYY-MM-DD'), minutes since midnight and weekday (0 = Sunday) of an instant in a timezone. */
function localParts(ms, timeZone) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday };
}

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The UTC instant (ms) of a wall-clock time on a local date in a timezone, daylight saving included. */
export function zonedTimeToUtc(date, hhmm, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Math.floor(toMinutes(hhmm) / 60), toMinutes(hhmm) % 60);
  const offsetAt = (ms) => {
    const p = localParts(ms, timeZone);
    const [py, pm, pd] = p.date.split('-').map(Number);
    return Date.UTC(py, pm - 1, pd, Math.floor(p.minutes / 60), p.minutes % 60) - Math.floor(ms / 60000) * 60000;
  };
  const guess = wall - offsetAt(wall);
  return wall - offsetAt(guess);
}

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const isWeekend = (date) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
const isTradingDay = (ex, date) => !isWeekend(date) && !ex.holidays[date];

function stepTradingDay(ex, date, step) {
  let day = addDays(date, step);
  for (let i = 0; i < 14 && !isTradingDay(ex, day); i += 1) day = addDays(day, step);
  return day;
}

/** Local [open, close] pairs for a date, with an early close cutting the day short. */
function sessionsOn(ex, date) {
  const early = ex.earlyCloses[date];
  if (!early) return ex.sessions;
  return ex.sessions.filter(([open]) => open < early).map(([open, close]) => [open, close < early ? close : early]);
}

/**
 * State of an exchange at an instant: 'open' | 'lunch' | 'pre-open' | 'after-close' | 'holiday' | 'weekend',
 * with the holiday name, today's close and early close, the last completed session and the next session
 * (local dates), and whether that year's holiday list is loaded.
 * @param {keyof typeof EXCHANGES} id
 * @param {number} ms
 */
export function exchangeStatus(id, ms) {
  const ex = EXCHANGES[id];
  if (!ex) throw new Error(`Unknown exchange "${id}"`);
  const { date, minutes } = localParts(ms, ex.timeZone);
  const base = {
    id, name: ex.name, date, calendarKnown: CALENDAR_YEARS.includes(Number(date.slice(0, 4))),
    lastSession: stepTradingDay(ex, date, -1), nextSession: stepTradingDay(ex, date, 1),
  };
  if (isWeekend(date)) return { ...base, state: 'weekend' };
  if (ex.holidays[date]) return { ...base, state: 'holiday', holiday: ex.holidays[date] };
  const sessions = sessionsOn(ex, date);
  const today = { ...base, closesAt: sessions.at(-1)[1], earlyClose: ex.earlyCloses[date] || null };
  if (minutes < toMinutes(sessions[0][0])) return { ...today, state: 'pre-open', nextSession: date };
  if (minutes >= toMinutes(sessions.at(-1)[1])) return { ...today, state: 'after-close', lastSession: date };
  const inSession = sessions.some(([open, close]) => minutes >= toMinutes(open) && minutes < toMinutes(close));
  return { ...today, state: inSession ? 'open' : 'lunch', nextSession: date };
}

const IST = 'Asia/Kolkata';
const HHMM_IST = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const STAMP_IST = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** "Mon 23 Nov" for a local date. */
export function dayLabel(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(`${date}T12:00:00Z`)).replace(',', '');
}

const istTime = (ex, date, hhmm) => HHMM_IST.format(new Date(zonedTimeToUtc(date, hhmm, ex.timeZone)));

function hoursIst(ex, date) {
  const sessions = sessionsOn(ex, date);
  return `${istTime(ex, date, sessions[0][0])}–${istTime(ex, date, sessions.at(-1)[1])} IST`;
}

/** One calendar line for an exchange, in IST, for the writer. */
function statusLine(ex, s) {
  const local = (hhmm) => (ex.timeZone === IST ? '' : ` (${hhmm} ${ex.city})`);
  const next = `next session ${dayLabel(s.nextSession)}, ${hoursIst(ex, s.nextSession)}`;
  const last = `Last session ${dayLabel(s.lastSession)}; ${next}.`;
  const early = s.earlyClose ? ` Early close today at ${s.earlyClose} ${ex.city} time.` : '';
  const lines = {
    open: () => `open now, closes ${istTime(ex, s.date, s.closesAt)} IST${local(s.closesAt)}.${early}`,
    lunch: () => `lunch break, trading resumes later today and closes ${istTime(ex, s.date, s.closesAt)} IST.`,
    'pre-open': () => `opens ${istTime(ex, s.date, sessionsOn(ex, s.date)[0][0])} IST${local(sessionsOn(ex, s.date)[0][0])}, closes ${istTime(ex, s.date, s.closesAt)} IST.${early}`,
    'after-close': () => `closed for the day. ${last}`,
    holiday: () => `closed today for ${s.holiday}. ${last}`,
    weekend: () => `closed for the weekend. ${last}`,
  };
  const unknown = s.calendarKnown ? '' : ` (Holiday list for ${s.date.slice(0, 4)} not loaded: weekday hours only.)`;
  return `- ${ex.name}: ${lines[s.state]()}${unknown}`;
}

export const CLOSED_MARKET_RULE =
  'A market that is closed did not trade today: its figures and changes are from its last session, so name that ' +
  'session\'s date and never describe it as moving today. If the edition focus asks how a closed market finished today, ' +
  'say it was closed and why, and describe its last session instead. Say "next session <day>" rather than "tomorrow" when they differ.';

/** The calendar block that heads every prompt's market data. */
export function tradingCalendarText(ms) {
  const lines = Object.values(EXCHANGES).map((ex) => statusLine(ex, exchangeStatus(ex.id, ms)));
  return [`TRADING CALENDAR (${STAMP_IST.format(new Date(ms)).replace(' at ', ', ')} IST):`, ...lines, CLOSED_MARKET_RULE].join('\n');
}
