/**
 * Indian government bond yields from CCIL (The Clearing Corporation of India), read from its public pages:
 *   - Tenorwise Indicative Yields: the traded benchmark per maturity bucket (T-bills, G-Secs, state SGS).
 *   - ZCYC Parameters: the daily Nelson-Siegel-Svensson (NSS) fit of the zero-coupon curve, which gives a
 *     yield for any maturity.
 * Both tables are rendered server-side, so plain HTML parsing is enough. Rows are matched by shape and a
 * page that no longer matches yields an empty result instead of a guess.
 */

export const CCIL_SOURCES = Object.freeze({
  tenorwise: 'https://www.ccilindia.com/tenorwise-indicative-yields',
  zcyc: 'https://www.ccilindia.com/zcyc-parameters',
});

const DAYS_PER_YEAR = 365;
const MAX_YIELD = 30; // percent; anything beyond is a parsing error, not a yield
// Curve sample points in years: dense at the short end where the curve bends, sparse further out.
const CURVE_MATURITIES = Object.freeze([
  0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 15, 17, 20, 25, 30, 35, 40,
]);

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Text of every <td> in each <tr> of the page: [[cell, ...], ...]. */
function tableRows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decode(cell[1].replace(/<[^>]+>/g, ''))))
    .filter((cells) => cells.length > 0);
}

// CCIL prints dates as "2026-11-20 00:00:00.0" or "20-11-2026" depending on the request; both become ISO.
export function isoDay(text) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : null;
}
const yieldOrNull = (text) => {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 && n < MAX_YIELD ? n : null;
};

/**
 * Representative maturity in years for a CCIL tenor bucket: "91D" -> 0.25, "4Y-5Y" -> 4.5, "10Y" -> 10.
 * Buckets give a range, not a date, so the midpoint stands in for the residual maturity.
 */
export function bucketYears(bucket) {
  const days = /^(\d+)D$/.exec(bucket);
  if (days) return Math.round((Number(days[1]) / DAYS_PER_YEAR) * 100) / 100;
  const range = /^(\d+)Y-(\d+)Y$/.exec(bucket);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const single = /^(\d+)Y$/.exec(bucket);
  return single ? Number(single[1]) : null;
}

/**
 * Tenorwise Indicative Yields: { asOn: 'YYYY-MM-DD', gsec: [{ bucket, years, security, yield }],
 * sgs: [...] } (sgs are state government securities), or null when the table is missing.
 */
export function parseTenorwise(html) {
  const rows = tableRows(html)
    .filter((c) => c.length >= 4 && isoDay(c[0]))
    .map(([date, bucket, security, ytm]) => ({ date: isoDay(date), bucket, years: bucketYears(bucket), security, yield: yieldOrNull(ytm) }))
    .filter((r) => r.years !== null && r.yield !== null);
  if (rows.length === 0) return null;
  const asOn = rows.map((r) => r.date).sort().at(-1);
  const latest = rows.filter((r) => r.date === asOn).map(({ date, ...rest }) => rest);
  const isState = (r) => /\bSGS\b|\bSDL\b/i.test(r.security);
  return {
    asOn,
    gsec: latest.filter((r) => !isState(r)).sort((a, b) => a.years - b.years),
    sgs: latest.filter(isState).sort((a, b) => a.years - b.years),
  };
}

const PARAM_KEYS = Object.freeze(['b0', 'b1', 'b2', 'b3', 't1', 't2']);

/** ZCYC Parameters table: [{ date, params: { b0, b1, b2, b3, t1, t2 } }], newest first. */
export function parseZcyc(html) {
  return tableRows(html)
    .filter((c) => c.length >= 7 && isoDay(c[0]))
    .map((c) => {
      const values = c.slice(1, 7).map(Number);
      const valid = values.every(Number.isFinite) && values[4] > 0 && values[5] > 0;
      return valid ? { date: isoDay(c[0]), params: Object.fromEntries(PARAM_KEYS.map((k, i) => [k, values[i]])) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// NSS loading of a factor with decay `tau` at maturity m: (1 - e^(-m/tau)) / (m/tau).
const slope = (m, tau) => (1 - Math.exp(-m / tau)) / (m / tau);

/** Zero-coupon yield (percent) at maturity `years` from NSS parameters. */
export function nssYield({ b0, b1, b2, b3, t1, t2 }, years) {
  const level = slope(years, t1);
  return b0 + b1 * level + b2 * (level - Math.exp(-years / t1)) + b3 * (slope(years, t2) - Math.exp(-years / t2));
}

/** The fitted curve as [[years, yield rounded to 4 dp], ...] over CURVE_MATURITIES. */
export function zcycCurve(params) {
  return CURVE_MATURITIES.map((m) => [m, Math.round(nssYield(params, m) * 10_000) / 10_000]);
}
