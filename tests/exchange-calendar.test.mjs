/**
 * Exchange trading calendar: holidays, session hours, lunch breaks and early closes per exchange, and how the
 * editions use it so a market closed for a holiday is never described as trading.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALENDAR_YEARS, EXCHANGES, exchangeStatus, tradingCalendarText, zonedTimeToUtc,
} from '../scripts/lib/market-edition/exchange-calendar.js';
import { INSTRUMENT_GROUPS, marketStatus, snapshotToText } from '../scripts/lib/market-edition/market-data.js';
import { HOME_INSTRUMENTS, buildHomeMarkets } from '../scripts/lib/market-edition/home-markets.js';

const ist = (y, mo, d, h, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - 330 * 60 * 1000;

test('NSE on Guru Nanak Jayanti (24 Nov 2026) is a holiday between the 23 Nov and 25 Nov sessions', () => {
  const s = exchangeStatus('NSE', ist(2026, 11, 24, 16, 2));
  assert.equal(s.state, 'holiday');
  assert.equal(s.holiday, 'Guru Nanak Jayanti');
  assert.equal(s.lastSession, '2026-11-23');
  assert.equal(s.nextSession, '2026-11-25');
});

test('NSE is open at 11:00 IST on a trading day and closed for the day after 15:30', () => {
  assert.equal(exchangeStatus('NSE', ist(2026, 11, 25, 11)).state, 'open');
  const after = exchangeStatus('NSE', ist(2026, 11, 25, 22));
  assert.equal(after.state, 'after-close');
  assert.equal(after.lastSession, '2026-11-25');
  assert.equal(after.nextSession, '2026-11-26');
  assert.equal(exchangeStatus('NSE', ist(2026, 11, 26, 8)).state, 'pre-open');
});

test('NYSE: open at 22:00 IST on 25 Nov, shut for Thanksgiving on 26 Nov, early close 13:00 ET on 27 Nov', () => {
  const open = exchangeStatus('NYSE', ist(2026, 11, 25, 22));
  assert.equal(open.state, 'open');
  assert.equal(open.closesAt, '16:00');
  const thanksgiving = exchangeStatus('NYSE', ist(2026, 11, 26, 22));
  assert.equal(thanksgiving.state, 'holiday');
  assert.equal(thanksgiving.holiday, 'Thanksgiving Day');
  assert.equal(thanksgiving.nextSession, '2026-11-27');
  const friday = exchangeStatus('NYSE', ist(2026, 11, 28, 0, 30)); // 14:00 ET on 27 Nov
  assert.equal(friday.state, 'after-close');
  assert.equal(friday.earlyClose, '13:00');
});

test('weekends, lunch breaks and half days', () => {
  assert.equal(exchangeStatus('NSE', ist(2026, 11, 28, 11)).state, 'weekend');
  assert.equal(exchangeStatus('NSE', ist(2026, 11, 28, 11)).nextSession, '2026-11-30');
  assert.equal(exchangeStatus('JPX', Date.UTC(2026, 10, 25, 3, 0)).state, 'lunch'); // 12:00 JST
  assert.equal(exchangeStatus('HKEX', Date.UTC(2026, 10, 25, 4, 30)).state, 'lunch'); // 12:30 HKT
  assert.equal(exchangeStatus('HKEX', Date.UTC(2026, 11, 24, 6, 0)).state, 'after-close'); // 14:00 HKT, half day
  assert.equal(exchangeStatus('LSE', Date.UTC(2026, 11, 28, 10, 0)).holiday, 'Boxing Day (substitute day)');
});

test('zonedTimeToUtc follows daylight saving: 09:30 New York is 14:30Z in winter and 13:30Z in summer', () => {
  assert.equal(zonedTimeToUtc('2026-03-06', '09:30', 'America/New_York'), Date.UTC(2026, 2, 6, 14, 30));
  assert.equal(zonedTimeToUtc('2026-03-09', '09:30', 'America/New_York'), Date.UTC(2026, 2, 9, 13, 30));
  assert.equal(zonedTimeToUtc('2026-11-25', '09:15', 'Asia/Kolkata'), Date.UTC(2026, 10, 25, 3, 45));
});

test('a year without a holiday list is flagged instead of silently treated as fully known', () => {
  const s = exchangeStatus('NSE', ist(2027, 6, 15, 11));
  assert.equal(s.calendarKnown, false);
  assert.equal(s.state, 'open', 'weekday hours still apply');
  assert.equal(exchangeStatus('NSE', ist(2026, 6, 15, 11)).calendarKnown, true);
});

test('holiday data: weekdays only, inside the covered years, early closes inside the session', () => {
  for (const ex of Object.values(EXCHANGES)) {
    for (const [day, name] of Object.entries(ex.holidays)) {
      assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(CALENDAR_YEARS.includes(Number(day.slice(0, 4))), `${ex.id} ${day} outside covered years`);
      assert.ok(![0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay()), `${ex.id} ${day} (${name}) is a weekend`);
    }
    for (const close of Object.values(ex.earlyCloses || {})) {
      assert.ok(close > ex.sessions[0][0] && close < ex.sessions.at(-1)[1], `${ex.id} early close ${close}`);
    }
  }
  assert.equal(Object.keys(EXCHANGES.NSE.holidays).length, 15, 'NSE 2026: 15 weekday holidays');
});

test('every equity and rates instrument names an exchange; 24-hour markets do not', () => {
  const quotes = INSTRUMENT_GROUPS.flatMap((g) => g.instruments);
  for (const q of quotes.filter((i) => i.symbol.startsWith('^'))) assert.ok(EXCHANGES[q.exchange], `${q.symbol} has no exchange`);
  for (const sym of ['USDINR=X', 'BTC-USD', 'BZ=F', 'GC=F']) assert.equal(quotes.find((q) => q.symbol === sym).exchange, undefined);
});

test('marketStatus: a fresh quote on a holiday is not "live"', () => {
  const now = ist(2026, 11, 24, 16, 2);
  const quote = { exchange: 'NSE', asOf: now - 5 * 60 * 1000, exchangeTz: 'Asia/Kolkata' };
  assert.equal(marketStatus(quote, now), 'closed today for Guru Nanak Jayanti, last session Mon 23 Nov');
  assert.equal(marketStatus({ ...quote, asOf: ist(2026, 11, 25, 15, 30) }, ist(2026, 11, 25, 22)), 'closed for the day, last session Wed 25 Nov');
  assert.equal(marketStatus({ exchange: 'NYSE', asOf: ist(2026, 11, 25, 21, 50), exchangeTz: 'America/New_York' }, ist(2026, 11, 25, 22)), 'live');
});

test('the prompt data starts with the trading calendar and the rule for closed markets', () => {
  const now = ist(2026, 11, 24, 16, 2);
  const text = tradingCalendarText(now);
  assert.match(text, /^TRADING CALENDAR \(24 Nov 2026, 16:02 IST\):/);
  assert.match(text, /- NSE\/BSE \(India\): closed today for Guru Nanak Jayanti\. Last session Mon 23 Nov; next session Wed 25 Nov, 09:15–15:30 IST\./);
  assert.match(text, /- NYSE\/Nasdaq \(US\): opens 20:00 IST \(09:30 New York\), closes 02:30 IST\./);
  assert.match(text, /never describe it as moving today/);
  assert.match(snapshotToText([], now), /^TRADING CALENDAR/);
});

test('homepage strip: Nifty is not "live" on an NSE holiday even with a fresh quote; Bitcoin still is', () => {
  const now = ist(2026, 11, 24, 12);
  const quote = { ok: true, price: 100, prevClose: 99, change: 1, changePct: 1.01, asOf: now - 60_000, points: [] };
  const pick = HOME_INSTRUMENTS.filter((i) => ['^NSEI', 'BTC-USD'].includes(i.yahoo));
  const { items } = buildHomeMarkets(pick, [quote, quote], { now });
  assert.deepEqual(items.map((i) => [i.symbol, i.live]), [['NSE:NIFTY', false], ['BTCUSDT', true]]);
  const kept = buildHomeMarkets(pick, [{ ok: false }, { ok: false }], { previous: { items }, now });
  assert.equal(kept.items.find((i) => i.symbol === 'NSE:NIFTY').live, false);
});
