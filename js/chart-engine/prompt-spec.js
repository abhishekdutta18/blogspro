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
  { type: 'table', title: 'Scenario matrix', source: 'Source: Swarm consensus', labels: ['Probability', 'Nifty target', 'Trigger'], datasets: [{ name: 'Base', values: ['55%', '25,400', 'Rate pause'] }, { name: 'Bull', values: ['25%', '27,000', 'FII return'] }, { name: 'Bear', values: ['20%', '21,800', 'Oil > $95'] }] },
]);

const TYPE_GUIDE = [
  'column = vertical bars (compare a few items, scenarios, periods)',
  'bar = horizontal bars (rank sectors/countries; long labels)',
  'line / area = trends over time (mark forecasts with "series":{"1":{"dashed":true}})',
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
- Max 6 series, 60 rows. Use null for a missing value, never 0. No placeholder or uniform made-up numbers.
- Omit the chart entirely if you have no verifiable institutional source.
Examples:
${CHART_PROMPT_EXAMPLES.map(e => `<chart-data>${JSON.stringify(e)}</chart-data>`).join('\n')}`;
