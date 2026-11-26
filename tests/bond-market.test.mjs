/**
 * Bond market data for the editions: US Treasury yields (Yahoo, Cboe indices) and Indian G-Sec yields from the
 * CCIL curve the homepage job already publishes (data/bonds.json), with changes in basis points and the spreads
 * the writer is asked about.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nssYield } from '../scripts/lib/home-bonds/ccil.js';
import { BOND_GROUP_ID, fetchBondMarket, indiaBondRows, loadIndiaBonds } from '../scripts/lib/market-edition/bond-market.js';
import { snapshotToText } from '../scripts/lib/market-edition/market-data.js';
import { renderEditionBody } from '../scripts/lib/market-edition/edition-template.js';

const LATEST = { b0: 7.3485, b1: -1.9009, b2: 4.5822, b3: 2.9311, t1: 20, t2: 2.0796 };
const PREVIOUS = { b0: 7.2819, b1: -1.8341, b2: 4.6048, b3: 2.797, t1: 20, t2: 2.0519 };
const BONDS = {
  tenors: { asOn: '2026-11-26', gsec: [
    { bucket: '91D', years: 0.25, security: '91 DTB (25/02/2027)', yield: 5.8846 },
    { bucket: '9Y-10Y', years: 9.5, security: '6.94% GS 2036', yield: 7.22 },
  ] },
  zcyc: { latest: { date: '2026-11-26', params: LATEST }, previous: { date: '2026-11-25', params: PREVIOUS } },
};
const NOW = Date.UTC(2026, 10, 26, 16, 30); // 22:00 IST

const bp = (a, b) => Math.round((a - b) * 1000) / 10;

test('indiaBondRows: T-bill from the tenor table, 2Y-30Y from the CCIL curve with day changes in bp', () => {
  const rows = indiaBondRows(BONDS, NOW);
  assert.deepEqual(rows.map((r) => r.name), ['India 91-day T-bill', 'India 2Y', 'India 5Y', 'India 10Y', 'India 30Y']);
  const ten = rows.find((r) => r.symbol === 'IN10Y');
  assert.equal(ten.price, Math.round(nssYield(LATEST, 10) * 1e4) / 1e4);
  assert.equal(ten.changeBp, bp(nssYield(LATEST, 10), nssYield(PREVIOUS, 10)));
  assert.equal(ten.status, 'CCIL curve of Thu 26 Nov');
  assert.equal(rows[0].changeBp, null, 'the tenor table has no previous day');
  assert.ok(rows.every((r) => r.ok && r.kind === 'yield'));
});

test('indiaBondRows refuses a curve older than a week instead of passing it off as current', () => {
  assert.deepEqual(indiaBondRows(BONDS, Date.UTC(2026, 11, 10)), []);
  assert.deepEqual(indiaBondRows(null, NOW), []);
  assert.deepEqual(indiaBondRows({ zcyc: { latest: { date: 'x', params: {} } } }, NOW), []);
});

test('loadIndiaBonds reads data/bonds.json first and falls back to the public copy', async () => {
  const fromFile = await loadIndiaBonds({ readFile: async () => JSON.stringify(BONDS), fetchImpl: async () => { throw new Error('no'); } });
  assert.equal(fromFile.zcyc.latest.date, '2026-11-26');
  const urls = [];
  const fromUrl = await loadIndiaBonds({
    env: { BONDS_JSON_URL: 'https://example.test/bonds.json' },
    readFile: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); },
    fetchImpl: async (url) => { urls.push(url); return { ok: true, json: async () => BONDS }; },
  });
  assert.equal(fromUrl.tenors.asOn, '2026-11-26');
  assert.deepEqual(urls, ['https://example.test/bonds.json']);
  const none = await loadIndiaBonds({ readFile: async () => { throw new Error('x'); }, fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(none, null);
});

function yahoo(price, prevClose) {
  return { ok: true, json: async () => ({ chart: { result: [{
    meta: { regularMarketPrice: price, chartPreviousClose: prevClose, currency: '', regularMarketTime: NOW / 1000 - 300, exchangeTimezoneName: 'America/Chicago' },
    timestamp: [NOW / 1000 - 300], indicators: { quote: [{ close: [price] }] },
  }] } }) };
}

test('fetchBondMarket: US yields change in bp, India rows, spreads and the benchmark note', async () => {
  const prices = { '%5EIRX': [3.6, 3.62], '%5EFVX': [3.9, 3.85], '%5ETNX': [4.21, 4.18], '%5ETYX': [4.7, 4.71] };
  const fetchImpl = async (url) => yahoo(...prices[Object.keys(prices).find((k) => url.includes(k))]);
  const group = await fetchBondMarket({ fetchImpl, now: NOW, readFile: async () => JSON.stringify(BONDS) });
  assert.equal(group.id, BOND_GROUP_ID);
  assert.equal(group.kind, 'yield');
  const us10 = group.quotes.find((q) => q.symbol === '^TNX');
  assert.equal(us10.changeBp, 3);
  assert.equal(us10.exchange, 'CBOE_RATES');
  const in10 = nssYield(LATEST, 10);
  assert.ok(group.notes.includes(`India 10Y minus US 10Y: +${Math.round((in10 - 4.21) * 100)} bp`));
  assert.ok(group.notes.includes(`India 2s10s slope: +${Math.round((in10 - nssYield(LATEST, 2)) * 100)} bp`));
  assert.ok(group.notes.includes('US 3-month to 10Y slope: +61 bp'));
  assert.ok(group.notes.includes('India 10Y benchmark: 6.94% GS 2036 at 7.22% (CCIL, 26 Nov)'));
});

test('fetchBondMarket still returns US yields when the CCIL copy is missing', async () => {
  const group = await fetchBondMarket({
    fetchImpl: async (url) => (url.includes('finance.yahoo') ? yahoo(4.21, 4.18) : { ok: false, status: 404 }),
    now: NOW, readFile: async () => { throw new Error('ENOENT'); },
  });
  assert.equal(group.quotes.filter((q) => q.symbol.startsWith('IN')).length, 0);
  assert.equal(group.quotes.filter((q) => q.ok).length, 4);
  assert.ok(group.notes.includes('Indian G-Sec yields unavailable (CCIL curve not loaded).'));
});

test('yields reach the prompt in % and bp, never as a percent change of a yield', () => {
  const open = Date.UTC(2026, 10, 25, 16, 30); // 22:00 IST Wed 25 Nov: Cboe in session
  const group = {
    id: 'bonds', title: 'Government bond yields', kind: 'yield', notes: ['India 10Y minus US 10Y: +305 bp'],
    quotes: [
      { name: 'US 10Y', ok: true, kind: 'yield', price: 4.21, changeBp: 3, exchange: 'CBOE_RATES', asOf: open - 300_000, exchangeTz: 'America/Chicago' },
      { name: 'India 10Y', ok: true, kind: 'yield', price: 7.2599, changeBp: 4.2, changeBasis: 'vs previous CCIL fit', status: 'CCIL curve of Thu 26 Nov' },
    ],
  };
  const text = snapshotToText([group], open);
  assert.match(text, /- US 10Y: 4\.21% \(\+3\.0 bp vs previous close; live\)/);
  assert.match(text, /- India 10Y: 7\.26% \(\+4\.2 bp vs previous CCIL fit; CCIL curve of Thu 26 Nov\)/);
  assert.match(text, /India 10Y minus US 10Y: \+305 bp/);
  const html = renderEditionBody({ markets: [group], headlines: [], text: null, board: null });
  assert.match(html, /<caption>Government bond yields/);
  assert.match(html, /<td>7\.26%<\/td><td class="up">\+4\.2 bp<\/td>/);
  assert.match(html, /India 10Y minus US 10Y: \+305 bp/);
});
