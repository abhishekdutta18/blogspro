/**
 * Tests for the homepage Policy section loader (frontend/src/lib/policy.js). /data/policy.json is
 * network data built from external sites, so malformed rates, events and links are dropped, and one
 * missing section does not hide the other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePolicy, formatIst, formatRate } from '../frontend/src/lib/policy.js';

const NOW = Date.UTC(2026, 10, 23, 8, 0);
const rbi = (over = {}) => ({
  fetchedAt: NOW,
  rates: [{ key: 'repo', label: 'Policy repo rate', value: 5.5 }, { key: 'crr', label: 'Cash reserve ratio', value: 3 }],
  usdInr: 92.7968,
  releases: [{ title: 'Governor’s Statement', href: 'https://www.rbi.org.in/Scripts/x.aspx?prid=1', time: NOW }],
  ...over,
});
const event = (over = {}) => ({ title: 'Core PCE Price Index m/m', country: 'USD', time: Date.UTC(2026, 10, 25, 13, 30), forecast: '0.3%', previous: '', ...over });

test('parsePolicy keeps valid rates, releases and events', () => {
  const data = parsePolicy({ generatedAt: NOW, rbi: rbi(), calendar: { fetchedAt: NOW, events: [event(), event({ title: 'GDP', time: NOW })] } });
  assert.deepEqual(data.rbi.rates, [{ label: 'Policy repo rate', value: 5.5 }, { label: 'Cash reserve ratio', value: 3 }]);
  assert.equal(data.rbi.usdInr, 92.7968);
  assert.equal(data.rbi.releases.length, 1);
  assert.deepEqual(data.calendar.events.map((e) => e.title), ['GDP', 'Core PCE Price Index m/m'], 'sorted by time');
  assert.equal(data.calendar.events[1].previous, '—', 'an empty value shows a dash');
});

test('parsePolicy drops links that leave rbi.org.in and implausible values', () => {
  const data = parsePolicy({
    rbi: rbi({
      rates: [{ label: 'Policy repo rate', value: 5.5 }, { label: 'Broken', value: 550 }, { label: '', value: 3 }],
      releases: [
        { title: 'ok', href: 'https://rbi.org.in/a', time: NOW },
        { title: 'js', href: 'javascript:alert(1)', time: NOW },
        { title: 'lookalike', href: 'https://rbi.org.in.evil.example/', time: NOW },
        { title: 'plain http', href: 'http://rbi.org.in/a', time: NOW },
      ],
    }),
    calendar: { fetchedAt: NOW, events: [event({ country: 'usd' }), event({ time: 'soon' })] },
  });
  assert.deepEqual(data.rbi.rates.map((r) => r.label), ['Policy repo rate']);
  assert.deepEqual(data.rbi.releases.map((r) => r.title), ['ok']);
  assert.deepEqual(data.calendar.events, []);
});

test('one unusable section leaves the other; nothing usable gives null', () => {
  assert.equal(parsePolicy({ rbi: null, calendar: { fetchedAt: NOW, events: [event()] } }).rbi, null);
  assert.equal(parsePolicy({ rbi: rbi(), calendar: 'rate limited' }).calendar, null);
  assert.equal(parsePolicy({ rbi: rbi({ rates: [] }), calendar: null }), null);
  assert.equal(parsePolicy(null), null);
});

test('times are shown in IST and rates with two decimals', () => {
  assert.equal(formatIst(Date.UTC(2026, 10, 25, 13, 30)), 'Wed 25 Nov, 19:00 IST');
  assert.equal(formatRate(5.5), '5.50%');
});
