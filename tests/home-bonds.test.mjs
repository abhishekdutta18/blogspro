/**
 * CCIL bond data tests: the tenorwise and ZCYC tables parsed from saved copies of the real pages, the NSS
 * curve maths, history accumulation, and the publisher keeping its last good file when CCIL fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseTenorwise, parseZcyc, bucketYears, nssYield, zcycCurve, isoDay, CCIL_SOURCES } from '../scripts/lib/home-bonds/ccil.js';
import { publishHomeBonds, mergeHistory, HISTORY_DAYS } from '../scripts/publish-home-bonds.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const TENORWISE = fixture('ccil-tenorwise-indicative-yields.html');
const ZCYC = fixture('ccil-zcyc-parameters.html');

test('bucketYears turns CCIL buckets into representative maturities', () => {
  assert.deepEqual(['91D', '364D', '1Y-2Y', '9Y-10Y', '28Y-30Y', '10Y', 'odd'].map(bucketYears), [0.25, 1, 1.5, 9.5, 29, 10, null]);
});

test('parseTenorwise reads the latest G-Sec and SGS yields from the real table', () => {
  const t = parseTenorwise(TENORWISE);
  assert.equal(t.asOn, '2026-11-20');
  assert.deepEqual(t.gsec.map((r) => r.bucket), ['91D', '182D', '364D', '1Y-2Y', '4Y-5Y', '9Y-10Y', '13Y-15Y', '28Y-30Y']);
  assert.deepEqual(t.gsec.find((r) => r.bucket === '9Y-10Y'), { bucket: '9Y-10Y', years: 9.5, security: '6.94% GS 2036', yield: 7.2116 });
  assert.deepEqual(t.sgs.map((r) => [r.years, r.yield]), [[5, 7.61], [10, 7.82], [15, 7.97]]);
  assert.equal(parseTenorwise('<html>maintenance</html>'), null);
});

test('isoDay accepts both date styles CCIL serves', () => {
  assert.deepEqual([isoDay('2026-11-20 00:00:00.0'), isoDay('20-11-2026'), isoDay('20/11/2026')], ['2026-11-20', '2026-11-20', null]);
  const dmy = ZCYC.replace(/(\d{4})-(\d{2})-(\d{2}) 00:00:00\.0/g, '$3-$2-$1');
  assert.deepEqual(parseZcyc(dmy).map((r) => r.date), ['2026-11-20', '2026-11-19']);
});

test('parseZcyc reads both fits, newest first', () => {
  const rows = parseZcyc(ZCYC);
  assert.deepEqual(rows.map((r) => r.date), ['2026-11-20', '2026-11-19']);
  assert.deepEqual(rows[0].params, { b0: 8.0339, b1: -2.5862, b2: 2.4008, b3: 2.6396, t1: 13.5924, t2: 2.0055 });
  assert.deepEqual(parseZcyc('<table><tr><td>2026-11-20 00:00:00.0</td><td>x</td></tr></table>'), []);
});

test('nssYield gives a curve close to the traded benchmarks', () => {
  const { params } = parseZcyc(ZCYC)[0];
  assert.ok(Math.abs(nssYield(params, 10) - 7.26) < 0.01, '10-year zero rate is ~7.26%, near the 7.21% 9-10Y par yield');
  assert.ok(nssYield(params, 0.25) < nssYield(params, 10), 'upward sloping');
  const curve = zcycCurve(params);
  assert.deepEqual(curve[0][0], 0.25);
  assert.deepEqual(curve.at(-1)[0], 40);
});

test('mergeHistory keeps one fit per date, oldest first, capped', () => {
  const fits = parseZcyc(ZCYC);
  const once = mergeHistory([], fits);
  assert.deepEqual(once.map((h) => h.date), ['2026-11-19', '2026-11-20']);
  assert.equal(once[1].y10, Math.round(nssYield(fits[0].params, 10) * 10_000) / 10_000);
  assert.deepEqual(mergeHistory(once, fits).length, 2, 'a repeat run adds nothing');
  const long = Array.from({ length: HISTORY_DAYS + 5 }, (_, i) => ({ date: `2025-01-${String(i).padStart(3, '0')}`, params: {}, y10: 7 }));
  assert.equal(mergeHistory(long, fits).length, HISTORY_DAYS);
});

test('publishHomeBonds writes the curve and keeps the last good file when CCIL fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-bonds-'));
  const out = path.join(dir, 'bonds.json');
  const pages = { [CCIL_SOURCES.tenorwise]: TENORWISE, [CCIL_SOURCES.zcyc]: ZCYC };
  const okFetch = async (url) => ({ ok: true, text: async () => pages[url] });
  const first = await publishHomeBonds({ out, fetchImpl: okFetch, now: 1 });
  assert.deepEqual(first.fresh, ['tenors', 'zcyc']);
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(saved.zcyc.latest.date, '2026-11-20');
  assert.equal(saved.zcyc.previous.date, '2026-11-19');
  assert.equal(saved.tenors.gsec.length, 8);
  assert.equal(saved.history.length, 2);

  const second = await publishHomeBonds({ out, fetchImpl: async () => ({ ok: false, status: 503 }), now: 2 });
  assert.equal(second.written, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), saved);
  fs.rmSync(dir, { recursive: true, force: true });
});
