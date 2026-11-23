/**
 * Forecast tests: the BigQuery request (literals validated, data only as a parameter), response parsing by
 * schema field name, regular spacing for TimesFM, and the publisher with a fake query and fake Yahoo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildForecastRequest, parseForecastResponse, sessionPoints, addMonths } from '../scripts/lib/home-forecasts/timesfm.js';
import { regularTail, macroInputs, publishHomeForecasts, DAILY_HORIZON, MACRO_HORIZON } from '../scripts/publish-home-forecasts.js';

test('buildForecastRequest writes validated literals and passes data only as @rows', () => {
  const body = buildForecastRequest([{ id: "x'; DROP", points: [['2026-01-01T00:00:00.000Z', 1]] }], { horizon: 5 });
  assert.match(body.query, /model => 'TimesFM 2\.0', horizon => 5, confidence_level => 0\.8\)/);
  assert.ok(!body.query.includes('DROP'), 'series ids never reach the SQL text');
  assert.deepEqual(body.queryParameters.map((p) => p.name), ['rows']);
  assert.equal(body.queryParameters[0].parameterValue.arrayValues[0].structValues.id.value, "x'; DROP");
  assert.throws(() => buildForecastRequest([], { horizon: 0 }), /bad horizon/);
  assert.throws(() => buildForecastRequest([], { horizon: 2.5 }), /bad horizon/);
  assert.throws(() => buildForecastRequest([], { horizon: 3, confidence: 1 }), /bad confidence/);
  assert.throws(() => buildForecastRequest([], { horizon: 3, model: "x') --" }), /unknown model/);
});

test('parseForecastResponse reads columns by name and numbers steps per series', () => {
  const fields = ['forecast_value', 'id', 'prediction_interval_upper_bound', 'prediction_interval_lower_bound'].map((name) => ({ name }));
  const row = (...v) => ({ f: v.map((x) => ({ v: x })) });
  const parsed = parseForecastResponse({ schema: { fields }, rows: [row('10.1234567', 'A', '11', '9'), row('10.5', 'A', '12', '9'), row('bad', 'B', '1', '0'), row('2', 'B', '3', '1')] });
  assert.deepEqual(parsed.get('A'), [{ step: 1, value: 10.1235, lower: 9, upper: 11 }, { step: 2, value: 10.5, lower: 9, upper: 12 }]);
  assert.deepEqual(parsed.get('B'), [{ step: 1, value: 2, lower: 1, upper: 3 }], 'unparseable rows are skipped');
});

test('sessionPoints and regularTail give TimesFM evenly spaced input', () => {
  const pts = sessionPoints([1, 2, 3], Date.parse('2026-11-20T15:30:00Z'));
  assert.deepEqual(pts.map((p) => p[0].slice(0, 10)), ['2026-11-18', '2026-11-19', '2026-11-20']);
  assert.equal(addMonths('2026-11', 3), '2027-02');
  const gappy = [['2025-01', 1], ['2025-03', 2], ['2025-04', 3], ['2025-05', 4]];
  assert.deepEqual(regularTail(gappy, 1).map((p) => p[0]), ['2025-03', '2025-04', '2025-05']);
  const quarterly = [['2025-03', 1], ['2025-06', 2], ['2025-09', 3]];
  assert.equal(regularTail(quarterly, 3).length, 3);
  const months = (n) => Array.from({ length: n }, (_, i) => [addMonths('2025-01', i), i]);
  const inputs = macroInputs([
    { key: 'cpi', frequency: 'monthly', points: months(6) },
    { key: 'short', frequency: 'monthly', points: months(5) },
    { key: 'odd', frequency: 'weekly', points: months(12) },
  ]);
  assert.deepEqual(inputs.map((s) => s.key), ['cpi']);
});

test('publishHomeForecasts forecasts both sections and keeps the previous one on failure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-forecasts-'));
  const out = path.join(dir, 'forecasts.json');
  const months = Array.from({ length: 8 }, (_, i) => [addMonths('2026-03', i), 5 + i / 10]);
  fs.writeFileSync(path.join(dir, 'policy.json'), JSON.stringify({ macro: { history: [{ key: 'cpi', label: 'CPI inflation', frequency: 'monthly', points: months }] } }));
  const day = 86_400_000;
  const now = Date.parse('2026-11-23T12:00:00Z');
  const chart = { chart: { result: [{ timestamp: Array.from({ length: 40 }, (_, i) => (now - (40 - i) * day) / 1000), indicators: { quote: [{ close: Array.from({ length: 40 }, (_, i) => 100 + i) }] } }] } };
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => chart });
  const answer = (body) => {
    const ids = [...new Set(body.queryParameters[0].parameterValue.arrayValues.map((r) => r.structValues.id.value))];
    const horizon = Number(body.query.match(/horizon => (\d+)/)[1]);
    const fields = ['id', 'forecast_value', 'prediction_interval_lower_bound', 'prediction_interval_upper_bound'].map((name) => ({ name }));
    return { schema: { fields }, rows: ids.flatMap((id) => Array.from({ length: horizon }, (_, i) => ({ f: [id, 10 + i, 9, 11].map((v) => ({ v: String(v) })) }))) };
  };

  const first = await publishHomeForecasts({ out, fetchImpl, query: async (body) => answer(body), now });
  assert.deepEqual(first.fresh, ['daily', 'macro']);
  const saved = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(saved.daily.horizon, DAILY_HORIZON);
  assert.ok(saved.daily.series.length > 0 && saved.daily.series.every((s) => s.forecast.length === DAILY_HORIZON));
  assert.equal(saved.macro.horizon, MACRO_HORIZON);
  assert.deepEqual(saved.macro.series[0].forecast.map((f) => f.period), ['2026-11', '2026-12', '2027-01']);

  const macroOnlyFails = async (body) => {
    if (body.query.includes(`horizon => ${MACRO_HORIZON},`)) throw new Error('quota');
    return answer(body);
  };
  const second = await publishHomeForecasts({ out, fetchImpl, query: macroOnlyFails, now: now + day });
  assert.deepEqual(second.fresh, ['daily']);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).macro, saved.macro, 'failed section keeps its previous copy');

  const nothing = await publishHomeForecasts({ out, fetchImpl, query: async () => { throw new Error('down'); }, now });
  assert.equal(nothing.written, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
