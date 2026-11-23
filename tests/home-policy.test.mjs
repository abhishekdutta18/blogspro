/**
 * Homepage policy data tests: RBI policy rates and USD/INR from the RBI homepage, recent non-routine RBI
 * press releases from its RSS feed, this week's high-impact releases from the Forex Factory calendar
 * feed, and the publisher that merges them into data/policy.json, keeping each source's last good data
 * when it fails (Forex Factory rate-limits with HTTP 429).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRbiRates, parseRbiReleases } from '../scripts/lib/home-policy/rbi.js';
import { parseCalendar } from '../scripts/lib/home-policy/calendar.js';
import { publishHomePolicy, SOURCES } from '../scripts/publish-home-policy.js';

const NOW = Date.UTC(2026, 10, 23, 8, 0);

const RBI_HOME = `<html><script>var x = "Policy Repo Rate : 9.99%";</script><body>
  <div class="rates"><span>Policy Repo Rate</span>
     <span>:</span> <span>5.50%</span>
  <span>Standing Deposit Facility Rate</span><span>:</span><span>5.25%</span>
  <span>Marginal Standing Facility Rate</span><span>:</span><span>5.75%</span>
  <span>Bank Rate</span><span>:</span><span>5.75%</span>
  <span>Fixed Reverse Repo Rate</span><span>:</span><span>3.35%</span>
  <span>CRR</span><span>:</span><span>3.00%</span><span>SLR</span><span>:</span><span>18.00%</span>
  Exchange&nbsp;Rates <span>INR / 1 USD</span><span>:</span><span>92.7968</span></div></body></html>`;

const rssItem = (title, link, date) => `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate></item>`;
const RBI_RSS = `<rss><channel>
  ${rssItem('Money Market Operations as on November 22, 2026', 'https://rbi.org.in/a', 'Mon, 23 Nov 2026 11:45:00')}
  ${rssItem('Result of the 2-day Variable Rate Repo (VRR) auction held on November 23, 2026', 'https://rbi.org.in/b', 'Mon, 23 Nov 2026 11:35:00')}
  ${rssItem('Governor’s Statement: December 2026', 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=1', 'Mon, 23 Nov 2026 10:00:00')}
  ${rssItem('Phishing &amp; fake links', 'https://evil.example/rbi.org.in/', 'Mon, 23 Nov 2026 09:00:00')}
  ${rssItem('RBI imposes monetary penalty on a bank', 'http://rbi.org.in/Scripts/x.aspx?id=2', 'Sun, 22 Nov 2026 18:30:00')}
</channel></rss>`;

const ffEvent = (over = {}) => ({ title: 'CPI m/m', country: 'USD', date: '2026-11-24T08:30:00-05:00', impact: 'High', forecast: '0.3%', previous: '0.4%', ...over });

test('parseRbiRates reads the policy rates and USD/INR from page text, not from scripts', () => {
  const rbi = parseRbiRates(RBI_HOME);
  assert.deepEqual(rbi.rates.map((r) => [r.key, r.value]), [['repo', 5.5], ['sdf', 5.25], ['msf', 5.75], ['bank', 5.75], ['crr', 3], ['slr', 18]]);
  assert.equal(rbi.rates[0].label, 'Policy repo rate');
  assert.equal(rbi.usdInr, 92.7968);
});

test('parseRbiRates returns null when the repo rate is missing or implausible', () => {
  assert.equal(parseRbiRates('<html>maintenance</html>'), null);
  assert.equal(parseRbiRates(RBI_HOME.replace('5.50%', '55.0%')), null);
});

test('parseRbiReleases drops routine operations and foreign links, and reads dates as IST', () => {
  const releases = parseRbiReleases(RBI_RSS);
  assert.deepEqual(releases.map((r) => r.title), ['Governor’s Statement: December 2026', 'RBI imposes monetary penalty on a bank']);
  assert.equal(releases[0].time, Date.UTC(2026, 10, 23, 4, 30), '10:00 IST is 04:30 UTC');
  assert.equal(releases[1].href, 'https://rbi.org.in/Scripts/x.aspx?id=2', 'http upgraded to https');
});

test('parseCalendar keeps valid high-impact events sorted by time', () => {
  const events = parseCalendar([
    ffEvent({ title: 'FOMC Minutes', date: '2026-11-25T14:00:00-05:00', forecast: '' }),
    ffEvent(),
    ffEvent({ impact: 'Low' }),
    ffEvent({ country: '<b>' }),
    ffEvent({ date: 'soon' }),
    { nonsense: true },
  ]);
  assert.deepEqual(events.map((e) => e.title), ['CPI m/m', 'FOMC Minutes']);
  assert.deepEqual(events[0], { title: 'CPI m/m', country: 'USD', time: Date.UTC(2026, 10, 24, 13, 30), forecast: '0.3%', previous: '0.4%' });
  assert.equal(events[1].forecast, '');
  assert.deepEqual(parseCalendar({ error: 'rate limited' }), []);
});

/** fetch stub answering per source URL; a function value lets a test fail one source. */
function stubFetch(responses) {
  return async (url) => {
    const body = responses[url];
    if (body === undefined || body instanceof Error) return { ok: false, status: 429, text: async () => 'Rate Limited' };
    return { ok: true, status: 200, text: async () => body };
  };
}

test('publishHomePolicy writes RBI and calendar sections, then keeps each one when its source fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-policy-'));
  const out = path.join(dir, 'data', 'policy.json');
  const all = { [SOURCES.rbiHome]: RBI_HOME, [SOURCES.rbiPress]: RBI_RSS, [SOURCES.calendar]: JSON.stringify([ffEvent()]) };

  const first = await publishHomePolicy({ out, fetchImpl: stubFetch(all), now: NOW });
  assert.deepEqual([first.written, first.fresh], [true, ['rbi', 'calendar']]);
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(saved.rbi.rates[0].value, 5.5);
  assert.equal(saved.rbi.fetchedAt, NOW);
  assert.equal(saved.rbi.releases.length, 2);
  assert.equal(saved.calendar.events[0].title, 'CPI m/m');

  const limited = await publishHomePolicy({ out, fetchImpl: stubFetch({ ...all, [SOURCES.calendar]: new Error('429') }), now: NOW + 1_800_000 });
  assert.deepEqual(limited.fresh, ['rbi']);
  const merged = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(merged.rbi.fetchedAt, NOW + 1_800_000);
  assert.deepEqual(merged.calendar, saved.calendar, 'the rate-limited calendar keeps its last good copy and time');

  const down = await publishHomePolicy({ out, fetchImpl: stubFetch({}), now: NOW + 3_600_000 });
  assert.equal(down.written, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), merged, 'nothing new: the file is untouched');
  assert.deepEqual(fs.readdirSync(path.dirname(out)), ['policy.json']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('MoSPI indicators are published, kept per series on failure, and re-fetched at most every six hours', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-policy-'));
  const out = path.join(dir, 'policy.json');
  const cpiRows = JSON.stringify({ msg: 'Data fetched successfully', data: [{ year: '2026', month: 'October', sector: 'Combined', division: 'CPI (General)', group: null, inflation: '6.09' }] });
  const noData = JSON.stringify({ msg: 'No Data Found', data: [] });
  const mospiCalls = [];
  const fetchWith = (cpi) => async (url) => {
    if (url.startsWith(SOURCES.mospi)) {
      mospiCalls.push(url);
      const body = url.includes('/api/cpi/') && url.includes('month_code=10') ? cpi : noData;
      return { ok: true, status: 200, text: async () => body };
    }
    return stubFetch({ [SOURCES.rbiHome]: RBI_HOME, [SOURCES.rbiPress]: RBI_RSS, [SOURCES.calendar]: '[]' })(url);
  };

  const first = await publishHomePolicy({ out, fetchImpl: fetchWith(cpiRows), now: NOW });
  assert.ok(first.fresh.includes('macro'));
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.deepEqual(saved.macro.indicators.map((i) => [i.key, i.value, i.period]), [['cpi', 6.09, 'Oct 2026']]);
  assert.equal(saved.macro.fetchedAt, NOW);

  mospiCalls.length = 0;
  const soon = await publishHomePolicy({ out, fetchImpl: fetchWith(noData), now: NOW + 3_600_000 });
  assert.equal(mospiCalls.length, 0, 'within six hours MoSPI is not called');
  assert.ok(!soon.fresh.includes('macro'));
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).macro, saved.macro);

  const legacy = { ...saved, macro: { ...saved.macro, history: undefined } };
  fs.writeFileSync(out, JSON.stringify(legacy));
  await publishHomePolicy({ out, fetchImpl: fetchWith(noData), now: NOW + 3_600_000 });
  assert.ok(mospiCalls.length > 0, 'a copy from before history was published is refreshed at once');
  fs.writeFileSync(out, JSON.stringify(saved));

  mospiCalls.length = 0;
  await publishHomePolicy({ out, fetchImpl: fetchWith(noData), now: NOW + 7 * 3_600_000 });
  assert.ok(mospiCalls.length > 0, 'after six hours it is called again');
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).macro, saved.macro, 'no data this time: the last values stay');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a failed press-release feed keeps the previous releases while the rates refresh', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-policy-'));
  const out = path.join(dir, 'policy.json');
  const all = { [SOURCES.rbiHome]: RBI_HOME, [SOURCES.rbiPress]: RBI_RSS, [SOURCES.calendar]: '[]' };
  await publishHomePolicy({ out, fetchImpl: stubFetch(all), now: NOW });
  await publishHomePolicy({ out, fetchImpl: stubFetch({ ...all, [SOURCES.rbiPress]: new Error('down') }), now: NOW + 60_000 });
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(saved.rbi.releases.length, 2);
  assert.equal(saved.rbi.fetchedAt, NOW + 60_000);
  fs.rmSync(dir, { recursive: true, force: true });
});
