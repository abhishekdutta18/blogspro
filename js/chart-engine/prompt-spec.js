// prompt-spec.js — The one chart schema the LLM fleet is told to write. The prompt text is
// generated from CHART_PROMPT_EXAMPLES, and tests/chart-pipeline.test.mjs renders every example
// through the engine, so the instructions models see can never drift from what renders.

/** Canonical example per chart family. Keep these realistic: models copy their style. */
export const CHART_PROMPT_EXAMPLES = Object.freeze([
  { type: 'column', title: 'RBI policy scenario probability', unit: '%', source: 'Source: RBI, desk model', data: [['Scenario', 'Probability'], ['Hold', 62], ['Cut', 25], ['Hike', 13]] },
  { type: 'bar', title: 'FII net flows by sector', unit: '₹Cr', source: 'Source: NSDL', data: [['Sector', 'Net flow'], ['Financials', 4210], ['IT', -1850], ['Energy', 960]] },
  { type: 'line', title: 'CPI inflation vs forecast', unit: '%', source: 'Source: MoSPI', series: { 1: { dashed: true } }, references: [{ from: 2, to: 6, label: 'RBI tolerance band' }, { value: 4, label: 'Target 4%' }], data: [['Quarter', 'Actual', 'Forecast'], ['Q1-25', 4.8, null], ['Q2-25', 5.1, null], ['Q3-25', 4.4, 4.4], ['Q4-25', null, 4.1]] },
  { type: 'pie', title: 'Swarm consensus sentiment', unit: '%', source: 'Source: Swarm consensus', data: [['Stance', 'Share'], ['Bullish', 45], ['Neutral', 30], ['Bearish', 25]] },
  { type: 'gauge', title: 'INR stress', label: 'INR stress', value: 58, min: 0, max: 100, yellowFrom: 50, yellowTo: 75, redFrom: 75, redTo: 100, source: 'Source: desk model' },
  { type: 'stats', title: 'Key prints', source: 'Source: NSE, RBI', labels: ['Nifty 50', 'Repo rate', '10Y G-Sec'], datasets: [{ name: 'values', values: ['24,312', '6.25%', '6.71%'] }] },
  { type: 'waterfall', title: 'Fiscal deficit bridge, FY25 to FY26 BE', unit: '%', source: 'Source: Union Budget', totals: ['FY25 RE', 'FY26 BE'], data: [['Step', 'Change (% of GDP)'], ['FY25 RE', 4.8], ['Tax revenue', -0.3], ['Capex', 0.1], ['Subsidies', -0.2], ['FY26 BE', null]] },
  { type: 'heatmap', title: 'Sector returns by quarter', unit: '%', source: 'Source: NSE', data: [['Sector', 'Q1', 'Q2', 'Q3', 'Q4'], ['Banks', 4.2, -1.8, 6.1, 2.4], ['IT', -3.5, 2.2, -0.8, 5], ['Auto', 7.1, 3.4, -2.6, 1.2]] },
  { type: 'candlestick', title: 'Nifty 50, daily', source: 'Source: NSE', data: [['Date', 'Open', 'High', 'Low', 'Close'], ['2025-11-10', 25500, 25700, 25450, 25690], ['2025-11-11', 25690, 25720, 25520, 25560], ['2025-11-12', 25560, 25900, 25540, 25870]] },
  { type: 'table', title: 'Scenario matrix', source: 'Source: Swarm consensus', labels: ['Probability', 'Nifty target', 'Trigger'], datasets: [{ name: 'Base', values: ['55%', '25,400', 'Rate pause'] }, { name: 'Bull', values: ['25%', '27,000', 'FII return'] }, { name: 'Bear', values: ['20%', '21,800', 'Oil > $95'] }] },
]);

const TYPE_GUIDE = [
  'column = vertical bars (compare a few items, scenarios, periods)',
  'bar = horizontal bars (rank sectors/countries; long labels)',
  'line / area = trends over time (mark forecasts with "series":{"1":{"dashed":true}}); ISO dates (YYYY-MM-DD) as labels get a true time axis; use "curve":"step" for values that hold until the next change (repo rate, policy decisions)',
  'waterfall = bridge from an opening to a closing figure; name the opening/closing rows in "totals"; a total with null is computed',
  'heatmap = one measure across rows x columns (returns by sector and month), up to 12 columns',
  'candlestick = daily prices, rows [ISO date, open, high, low, close]; high/low must enclose open/close',
  'pie = shares of one whole, max 6 slices, values >= 0',
  'gauge = one risk/stress reading with red/yellow bands',
  'stats = 2-6 headline numbers (values may be pre-formatted strings)',
  'table = text comparison grid (scenarios, providers)',
].map(line => `  - ${line}`).join('\n');

/** The instruction block injected into every prompt that may produce charts. */
export const CHART_PROMPT_SPEC = `CHART FORMAT (rendered by the BlogsPro chart engine — anything else is dropped):
- Wrap each chart's JSON in <chart-data>…</chart-data>. Strict JSON: double quotes, no comments, no trailing commas.
- Never use mermaid, HTML <canvas>, images or ASCII art for charts.
- Required keys: "type", "title", "data" (rows: first row = headers, then [label, value, …]) — or "labels" + "datasets" for stats/table.
- Recommended: "unit" ("%", "₹Cr", "$B", "bps", "₹" for raw rupees — shown as L/Cr), "source" (a real institution), "subtitle".
- Optional for bar/column/line: "references": up to 4 of {"value":6.5,"label":"Repo rate"} (a line) or {"from":2,"to":6,"label":"RBI tolerance band"} (a band).
- A single series with gains and losses is colored by sign automatically; do not split it into two series.
- Types:
${TYPE_GUIDE}
- Max 6 series (heatmap: 12 columns), 60 rows. Use null for a missing value, never 0. No placeholder or uniform made-up numbers.
- Omit the chart entirely if you have no verifiable institutional source.
Examples:
${CHART_PROMPT_EXAMPLES.map(e => `<chart-data>${JSON.stringify(e)}</chart-data>`).join('\n')}`;
