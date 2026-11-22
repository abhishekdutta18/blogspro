// ═══════════════════════════════════════════════
// chart-builder.js — AI-driven chart generation for the admin editor.
// Renders through the unified chart engine (js/chart-engine/): static SVG/HTML,
// no client-side chart library. Legacy Google-Charts blocks saved in older posts
// are upgraded in place by initBpCharts().
// ═══════════════════════════════════════════════
import { callAI } from './ai-core.js';
import { renderChart } from './chart-engine/index.js';
import { upgradeLegacyCharts, browserDegradeReporter } from './chart-engine/browser.js';

// ─────────────────────────────────────────────
// initBpCharts(containerEl)
// Upgrades legacy .bp-chart-block markup (posts saved before the engine) to engine output.
// Blocks the engine cannot parse keep their static fallback HTML, which renders without JS.
// Call this after setting editor.innerHTML or any content update.
// ─────────────────────────────────────────────
export function initBpCharts(containerEl = document.body) {
  return upgradeLegacyCharts(containerEl, { theme: 'light' });
}

// ─────────────────────────────────────────────
// Public API — called from ai-writer.js
// topic: article topic, sectionTitle: current section
// Returns a self-contained HTML string or '' on failure
// ─────────────────────────────────────────────
export async function generateChartForSection(topic, sectionTitle, category, model) {

  // Generate a unique chart ID for referencing
  const chartId = `chart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const result = await callAI(
    `You are a data analyst. Generate a data visualization for a ${category} article.
Article topic: "${topic}"
Section: "${sectionTitle}"

Pick the best chart type and generate REAL, SPECIFIC numeric data relevant to this section.

CRITICAL: Return ONLY a raw JSON object. No markdown, no backticks, no explanation. Start with {

REQUIRED FIELDS:
- "name": A unique descriptive name for this chart (e.g. "Fig 1: UPI Transaction Volume 2020-2024")
- "title": Display title shown above the chart
- "source": Citation source (e.g. "Source: RBI Annual Report 2024", "Source: NPCI Dashboard")
- "subtitle": Brief description of what the data shows

Example for a bar chart:
{"type":"bar","name":"Fig 1: Top 5 Fintech Markets","title":"Top 5 Fintech Markets by Investment","subtitle":"2024 data","labels":["USA","China","UK","India","Brazil"],"datasets":[{"name":"Investment $B","values":[89,52,31,8,4]}],"unit":"$B","source":"Source: CB Insights Global Fintech Report 2024"}

Example for a stats chart:
{"type":"stats","name":"Fig 2: Global Fintech Key Metrics","title":"Key Market Statistics","subtitle":"Global fintech 2024","labels":["Market Size","YoY Growth","Active Users","Funding Rounds"],"datasets":[{"name":"values","values":["$340B","23%","4.8B","2,847"]}],"unit":"","source":"Source: Statista Digital Payments Report 2024"}

Example for a table:
{"type":"table","name":"Table 1: Banking Model Comparison","title":"Feature Comparison","subtitle":"","labels":["Speed","Cost","Security","Ease of Use"],"datasets":[{"name":"Provider A","values":["Fast","Low","High","Easy"]},{"name":"Provider B","values":["Medium","Medium","High","Medium"]}],"unit":"","source":"Source: Deloitte Banking Survey 2024"}

Rules:
- "name" MUST start with "Fig N:" or "Table N:" followed by a descriptive name
- "source" MUST cite a real organization (RBI, SEBI, NPCI, World Bank, McKinsey, PwC, Statista, etc.)
- ALL numbers must be realistic for the topic — do NOT use placeholder zeros
- labels array and values array MUST have the same length
- For stats type: values can be strings like "23%" or "$340B"
- Choose: bar (comparisons), line (trends over time with years as labels), pie (market share), stats (key numbers), table (feature comparison)`,
    true,
    "gemini",
    512
  );

  if (result.error || !result.text) return '';

  let data;
  try {
    let raw = result.text.replace(/```json|```/gi, '').trim();
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    if (s === -1 || e === -1) return '';
    data = JSON.parse(raw.substring(s, e + 1));
  } catch(_) { return ''; }

  // ── VALIDATION ENGINE ──────────────────────────
  if (!data?.type || !data?.labels?.length) return '';
  if (!data.datasets?.[0]?.values?.length) return '';
  // Normalize lengths to avoid ingestion errors
  const minLen = Math.min(
    data.labels.length,
    ...data.datasets.map(ds => (ds.values || []).length)
  );
  data.labels = data.labels.slice(0, minLen);
  data.datasets = data.datasets.map(ds => ({ ...ds, values: (ds.values || []).slice(0, minLen) }));
  if (!minLen) return '';

  // Validate chart name exists
  if (!data.name) data.name = `${data.type === 'table' ? 'Table' : 'Fig'}: ${data.title || sectionTitle}`;

  // Validate source citation exists
  if (!data.source) data.source = `Source: Industry analysis for "${sectionTitle}"`;

  // Validate numeric data is realistic (reject all-zero datasets)
  if (data.type !== 'stats' && data.type !== 'table') {
    const numVals = data.datasets[0].values.map(Number).filter(v => !isNaN(v));
    const allZero = numVals.every(v => v === 0);
    const allSame = numVals.length > 2 && new Set(numVals).size === 1;
    if (allZero) return ''; // Reject placeholder data
    if (allSame) return ''; // Reject suspiciously uniform data
  }

  // Render through the unified chart engine (static SVG/HTML, light theme to match the editor).
  try {
    return renderChart({ ...data, id: chartId }, { theme: 'light', onDegrade: browserDegradeReporter('chart-builder') });
  } catch (err) {
    console.warn('[bp-chart] engine rejected AI chart:', err instanceof Error ? err.message : err);
    return '';
  }
}
