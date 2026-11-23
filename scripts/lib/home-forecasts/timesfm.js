/**
 * Forecasts with Google's TimesFM foundation model through BigQuery's AI.FORECAST table function
 * (serverless: no model to host). Several series go in one query, keyed by `id`; the data travels as a
 * typed query parameter, never spliced into SQL.
 *   buildForecastRequest(series, opts) -> a jobs.query request body
 *   parseForecastResponse(response)    -> Map(id -> [{ step, value, lower, upper }])
 *   runQuery(body, { client, project }) -> the completed query response (polls until done)
 * Series are [{ id, points: [[ISO timestamp, value], ...] }] with regular spacing: the caller re-indexes
 * trading sessions onto consecutive days and keeps monthly data on month starts, because TimesFM reads the
 * frequency from the timestamps.
 */

export const MODEL = 'TimesFM 2.0';
export const CONFIDENCE = 0.8;
const POLL_MS = 2000;
const MAX_POLLS = 30;
const QUERY_TIMEOUT_MS = 60_000;
const BIGQUERY = 'https://bigquery.googleapis.com/bigquery/v2/projects';

const MODELS = new Set(['TimesFM 2.0', 'TimesFM 2.5']);
const MAX_HORIZON = 100;

// AI.FORECAST takes model, horizon and confidence only as literals, so they are checked strictly here and
// written into the SQL; the data itself always travels as the @rows parameter.
function forecastSql({ horizon, confidence, model }) {
  if (!MODELS.has(model)) throw new Error(`unknown model ${model}`);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON) throw new Error(`bad horizon ${horizon}`);
  if (!(confidence > 0 && confidence < 1)) throw new Error(`bad confidence ${confidence}`);
  return `SELECT id, forecast_timestamp, forecast_value, prediction_interval_lower_bound, prediction_interval_upper_bound
FROM AI.FORECAST(
  (SELECT row.id AS id, row.t AS t, row.v AS v FROM UNNEST(@rows) AS row),
  data_col => 'v', timestamp_col => 't', id_cols => ['id'],
  model => '${model}', horizon => ${horizon}, confidence_level => ${confidence})
ORDER BY id, forecast_timestamp`;
}

/** jobs.query body forecasting every series `horizon` steps ahead. */
export function buildForecastRequest(series, { horizon, confidence = CONFIDENCE, model = MODEL }) {
  const rows = series.flatMap(({ id, points }) => points.map(([t, v]) => ({
    structValues: { id: { value: id }, t: { value: t }, v: { value: String(v) } },
  })));
  return {
    query: forecastSql({ horizon, confidence, model }),
    useLegacySql: false,
    location: 'US',
    timeoutMs: QUERY_TIMEOUT_MS,
    parameterMode: 'NAMED',
    queryParameters: [
      {
        name: 'rows',
        parameterType: {
          type: 'ARRAY',
          arrayType: { type: 'STRUCT', structTypes: [
            { name: 'id', type: { type: 'STRING' } },
            { name: 't', type: { type: 'TIMESTAMP' } },
            { name: 'v', type: { type: 'FLOAT64' } },
          ] },
        },
        parameterValue: { arrayValues: rows },
      },
    ],
  };
}

const round = (n) => Number(n.toPrecision(6));

/** Map(id -> [{ step, value, lower, upper }]) from a completed query response, steps in time order. */
export function parseForecastResponse(response) {
  const names = (response?.schema?.fields ?? []).map((f) => f.name);
  const column = (row, name) => row.f[names.indexOf(name)]?.v;
  const byId = new Map();
  (response?.rows ?? []).forEach((row) => {
    const id = column(row, 'id');
    const value = Number(column(row, 'forecast_value'));
    const lower = Number(column(row, 'prediction_interval_lower_bound'));
    const upper = Number(column(row, 'prediction_interval_upper_bound'));
    if (!id || ![value, lower, upper].every(Number.isFinite)) return;
    const list = byId.get(id) ?? [];
    list.push({ step: list.length + 1, value: round(value), lower: round(lower), upper: round(upper) });
    byId.set(id, list);
  });
  return byId;
}

/** Runs a jobs.query body and waits for it to finish. `client` is an authorized google-auth-library client. */
export async function runQuery(body, { client, project }) {
  const first = (await client.request({ url: `${BIGQUERY}/${project}/queries`, method: 'POST', data: body })).data;
  let response = first;
  for (let poll = 0; !response.jobComplete; poll += 1) {
    if (poll >= MAX_POLLS) throw new Error('BigQuery forecast did not finish in time');
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const { jobId, location } = first.jobReference;
    response = (await client.request({ url: `${BIGQUERY}/${project}/queries/${jobId}?location=${location}&timeoutMs=10000` })).data;
  }
  if (response.errors?.length) throw new Error(response.errors[0].message);
  return response;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trading sessions re-indexed onto consecutive days ending on the last session, as [[ISO, value]]. */
export function sessionPoints(values, lastMs) {
  const end = Math.floor(lastMs / DAY_MS) * DAY_MS;
  return values.map((v, i) => [new Date(end - (values.length - 1 - i) * DAY_MS).toISOString(), v]);
}

/** 'YYYY-MM' -> ISO timestamp of the month's first day. */
export const monthStart = (key) => `${key}-01T00:00:00.000Z`;

/** The 'YYYY-MM' `months` after `key`. */
export function addMonths(key, months) {
  const [year, month] = key.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}
