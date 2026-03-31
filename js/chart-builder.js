// ═══════════════════════════════════════════════
// chart-builder.js — AI-driven chart + data injection
// Primary render: Google Charts (interactive, themed).
// Fallback render: self-contained inline SVG/HTML (no external deps).
// Theme: dark navy bg, gold accents, cream text.
// ═══════════════════════════════════════════════
import { callAI } from './ai-core.js';

const THEME = {
  bg:       '#0c1322',
  bg2:      '#111c30',
  border:   'rgba(255,255,255,0.08)',
  gold:     '#c9a84c',
  gold2:    '#e2c97e',
  cream:    '#f5f0e8',
  muted:    '#8896b3',
  green:    '#4ade80',
  red:      '#fca5a5',
  blue:     '#93c5fd',
  purple:   '#c4b5fd',
  // Bar palette — cycles through for multi-series
  palette:  ['#c9a84c','#93c5fd','#4ade80','#c4b5fd','#fca5a5','#fdba74','#6ee7b7'],
};

// Google Charts theme — mirrors THEME above
const GC_THEME = {
  backgroundColor: { fill: '#0c1322' },
  fontName: 'DM Sans',
  colors: ['#c9a84c','#93c5fd','#4ade80','#c4b5fd','#fca5a5','#fdba74','#6ee7b7'],
  legend: { textStyle: { color: '#8896b3', fontSize: 11 } },
  chartArea: { backgroundColor: '#0c1322', left: 60, right: 20, top: 30, bottom: 50 },
  hAxis: {
    textStyle: { color: '#8896b3', fontSize: 9 },
    titleTextStyle: { color: '#8896b3', fontSize: 10, italic: false },
    gridlines: { color: 'rgba(255,255,255,0.06)' },
    baselineColor: 'rgba(255,255,255,0.1)',
  },
  vAxis: {
    textStyle: { color: '#8896b3', fontSize: 9 },
    titleTextStyle: { color: '#8896b3', fontSize: 10, italic: false },
    gridlines: { color: 'rgba(255,255,255,0.06)' },
    baselineColor: 'rgba(255,255,255,0.1)',
  },
};

// ─────────────────────────────────────────────
// initBpCharts(containerEl)
// Scans containerEl for .bp-chart-canvas[data-bp-gchart] divs and
// renders them with Google Charts. Falls back silently if SDK not ready.
// Call this after setting editor.innerHTML or any content update.
// ─────────────────────────────────────────────
export async function initBpCharts(containerEl = document.body) {
  // If Google Charts SDK is not yet ready, wait for it (with 5s timeout).
  // window.bpChartsReady is set in admin.html when google.charts.load() is called.
  if (!window.google?.visualization) {
    if (!window.bpChartsReady) return; // SDK not loaded on this page — use SVG fallback
    try {
      await Promise.race([window.bpChartsReady, new Promise(r => setTimeout(r, 5000))]);
    } catch (_) { return; }
    if (!window.google?.visualization) return;
  }
  containerEl.querySelectorAll('.bp-chart-canvas[data-bp-gchart]').forEach(canvas => {
    try {
      const data = JSON.parse(canvas.getAttribute('data-bp-gchart'));
      const fallback = canvas.previousElementSibling; // .bp-chart-fallback
      _renderGcChart(canvas, data);
      canvas.style.display = 'block';
      if (fallback?.classList.contains('bp-chart-fallback')) {
        fallback.style.display = 'none';
      }
    } catch (e) {
      console.warn('[bp-chart] Google Charts render failed:', e);
    }
  });
}

function _renderGcChart(el, data) {
  const { type, labels = [], datasets = [], unit = '' } = data;
  const vis = google.visualization;

  if (type === 'bar') {
    const multiSeries = datasets.length > 1;
    const cols = [['string', 'Label'], ...datasets.map(ds => ['number', ds.name || ''])];
    const rows = labels.map((lbl, i) =>
      [String(lbl), ...datasets.map(ds => toNum(ds.values[i]) || 0)]
    );
    const dt = vis.arrayToDataTable([cols.map(c => ({ type: c[0], label: c[1] })), ...rows]);
    // arrayToDataTable needs first row as column headers when not using objects
    const dtFlat = vis.arrayToDataTable([
      ['Label', ...datasets.map(ds => ds.name || 'Value')],
      ...labels.map((lbl, i) => [String(lbl), ...datasets.map(ds => toNum(ds.values[i]) || 0)])
    ]);
    el.style.height = Math.max(180, labels.length * 36 + 60) + 'px';
    new vis.BarChart(el).draw(dtFlat, {
      ...GC_THEME,
      isStacked: false,
      bar: { groupWidth: '65%' },
      legend: multiSeries ? GC_THEME.legend : { position: 'none' },
      hAxis: { ...GC_THEME.hAxis, title: unit || '' },
    });

  } else if (type === 'line') {
    const rows = labels.map((lbl, i) =>
      [String(lbl), ...datasets.map(ds => toNum(ds.values[i]) || 0)]
    );
    const dtFlat = vis.arrayToDataTable([
      ['Period', ...datasets.map(ds => ds.name || 'Value')],
      ...rows
    ]);
    el.style.height = '220px';
    new vis.AreaChart(el).draw(dtFlat, {
      ...GC_THEME,
      areaOpacity: 0.1,
      lineWidth: 2,
      pointSize: 4,
      legend: datasets.length > 1 ? GC_THEME.legend : { position: 'none' },
      vAxis: { ...GC_THEME.vAxis, title: unit || '' },
    });

  } else if (type === 'pie') {
    const series = datasets[0];
    if (!series?.values?.length) return;
    const dtFlat = vis.arrayToDataTable([
      ['Label', 'Value'],
      ...labels.map((lbl, i) => [String(lbl), toNum(series.values[i]) || 0])
    ]);
    el.style.height = '240px';
    new vis.PieChart(el).draw(dtFlat, {
      ...GC_THEME,
      pieHole: 0.4,
      chartArea: { ...GC_THEME.chartArea, top: 10, bottom: 10 },
      legend: { ...GC_THEME.legend, position: 'right' },
      pieSliceTextStyle: { color: '#f5f0e8', fontSize: 10 },
    });

  }
  // stats + table: no Google Charts equivalent — fallback SVG/HTML is kept
}

// HTML-escape AI-generated strings before injecting into HTML
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (cleaned) return Number(cleaned[0]);
  }
  return Number(v);
}

function compactNum(n) {
  if (!isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.?0+$/, '')}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatValue(v, unit = '') {
  const n = toNum(v);
  if (!isFinite(n)) return String(v ?? '');
  const u = String(unit || '').trim();
  if (!u) return compactNum(n);

  // Examples: "$B", "₹M" => "$12.5B", "₹3.2M"
  const currencyScale = u.match(/^([$₹€£])\s*([a-zA-Z]+)$/);
  if (currencyScale) {
    const sym = currencyScale[1];
    const scale = currencyScale[2];
    return `${sym}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}${scale}`;
  }

  // Examples: "$", "₹" => "$12.5M"
  if (/^[$₹€£]$/.test(u)) return `${u}${compactNum(n)}`;
  if (u === '%') return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

  // Examples: "M", "B", "million", "billion", "crore"
  if (/^(k|m|b|mn|bn|million|billion|thousand|lakh|crore)$/i.test(u)) {
    return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}${u.length <= 2 ? u : ` ${u}`}`;
  }

  // Generic unit suffix
  return `${compactNum(n)} ${u}`;
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
    true
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
  if (data.labels.length !== data.datasets[0].values.length &&
      data.type !== 'table') return '';

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

  // Inject the chartId for referencing
  data._chartId = chartId;

  switch(data.type) {
    case 'bar':   return buildBarChart(data);
    case 'line':  return buildLineChart(data);
    case 'pie':   return buildPieChart(data);
    case 'stats': return buildStatsCards(data);
    case 'table': return buildDataTable(data);
    default:      return buildBarChart(data);
  }
}


// ─────────────────────────────────────────────
// BAR CHART — horizontal bars, pure CSS
// ─────────────────────────────────────────────
function buildBarChart(data) {
  const series   = data.datasets?.[0];
  if (!series?.values?.length) return '';
  // FIX: Calculate max across ALL datasets, not just the first
  const allValues = data.datasets.flatMap(ds => ds.values.map(toNum).filter(v => !isNaN(v)));
  const max      = Math.max(...allValues) || 1;
  const unit     = data.unit || '';
  const multiSeries = data.datasets?.length > 1;
  const baseValues = series.values.map(toNum).filter(v => !isNaN(v));

  const bars = data.labels.map((label, i) => {
    if (multiSeries) {
      // Grouped bars
      const groupBars = data.datasets.map((ds, di) => {
        const val = toNum(ds.values[i]) || 0;
        const pct = Math.round((val / max) * 100);
        const color = THEME.palette[di % THEME.palette.length];
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="font-size:0.65rem;color:${THEME.muted};width:70px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ds.name)}</span>
          <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:2px;height:14px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;transition:width 0.8s ease;min-width:2px"></div>
          </div>
          <span style="font-size:0.68rem;color:${color};font-weight:700;min-width:56px;flex-shrink:0;text-align:right">${esc(formatValue(val, unit))}</span>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:0.9rem">
        <div style="font-size:0.75rem;color:${THEME.cream};font-weight:600;margin-bottom:4px">${esc(label)}</div>
        ${groupBars}
      </div>`;
    } else {
      const val = baseValues[i] || 0;
      const pct = Math.round((val / max) * 100);
      const color = THEME.palette[i % THEME.palette.length];
      return `<div style="margin-bottom:0.6rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:0.75rem;color:${THEME.cream}">${esc(label)}</span>
          <span style="font-size:0.75rem;color:${color};font-weight:700">${esc(formatValue(val, unit))}</span>
        </div>
        <div style="background:rgba(255,255,255,0.05);border-radius:3px;height:16px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,${color},${color}cc);border-radius:3px;transition:width 0.8s ease;min-width:4px"></div>
        </div>
      </div>`;
    }
  }).join('');

  const legend = multiSeries
    ? `<div style="display:flex;flex-wrap:wrap;gap:0.6rem;margin-bottom:1rem">
        ${data.datasets.map((ds, di) => `
          <span style="display:flex;align-items:center;gap:4px;font-size:0.68rem;color:${THEME.muted}">
            <span style="width:10px;height:10px;border-radius:2px;background:${THEME.palette[di % THEME.palette.length]};display:inline-block;flex-shrink:0"></span>${esc(ds.name)}
          </span>`).join('')}
      </div>` : '';

  return _chartWrapper(data, `${legend}${bars}`);
}


// ─────────────────────────────────────────────
// LINE CHART — SVG polyline
// ─────────────────────────────────────────────
function buildLineChart(data) {
  const W = 560, H = 180, padL = 44, padR = 16, padT = 10, padB = 32;
  const iW = W - padL - padR;
  const iH = H - padT - padB;

  const allVals = data.datasets.flatMap(ds => ds.values.map(toNum).filter(v => !isNaN(v)));
  const min = Math.min(...allVals, 0);
  const max = Math.max(...allVals, 1);
  const range = max - min || 1;
  const n = data.labels.length;

  const xScale = i => padL + (i / (n - 1 || 1)) * iW;
  const yScale = v => padT + iH - ((v - min) / range) * iH;

  // Y axis gridlines + labels
  const yTicks = 4;
  const gridLines = Array.from({length: yTicks + 1}, (_, ti) => {
    const v = min + (range / yTicks) * ti;
    const y = yScale(v);
    const label = formatValue(v, data.unit || '');
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${THEME.border}" stroke-width="1"/>
            <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="${THEME.muted}">${esc(label)}</text>`;
  }).join('');

  // X axis labels
  const xLabels = data.labels.map((lbl, i) => {
    const x = xScale(i);
    const show = n <= 8 || i % Math.ceil(n / 6) === 0 || i === n - 1;
    return show ? `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" fill="${THEME.muted}">${esc(lbl)}</text>` : '';
  }).join('');

  // Series lines + dots
  const seriesElements = data.datasets.map((ds, di) => {
    const vals = ds.values.map(toNum);
    const color = THEME.palette[di % THEME.palette.length];
    const pts = vals.map((v, i) => `${xScale(i)},${yScale(v)}`).join(' ');
    // Area fill
    const first = `${xScale(0)},${yScale(vals[0])}`;
    const last  = `${xScale(vals.length - 1)},${yScale(vals[vals.length - 1])}`;
    const areaPath = `M ${first} L ${pts.split(' ').join(' L ')} L ${last.split(',')[0]},${padT + iH} L ${xScale(0)},${padT + iH} Z`;
    const dots = vals.map((v, i) =>
      `<circle cx="${xScale(i)}" cy="${yScale(v)}" r="3" fill="${color}" stroke="${THEME.bg}" stroke-width="1.5"/>`
    ).join('');
    return `
      <path d="${areaPath}" fill="${color}" fill-opacity="0.08"/>
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}`;
  }).join('');

  const legend = data.datasets.length > 1
    ? `<div style="display:flex;flex-wrap:wrap;gap:0.6rem;margin-top:0.5rem">
        ${data.datasets.map((ds, di) => `
          <span style="display:flex;align-items:center;gap:4px;font-size:0.68rem;color:${THEME.muted}">
            <span style="width:16px;height:2px;background:${THEME.palette[di % THEME.palette.length]};display:inline-block"></span>${esc(ds.name)}
          </span>`).join('')}
      </div>` : '';

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;display:block">
    ${gridLines}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + iH}" stroke="${THEME.border}" stroke-width="1"/>
    ${seriesElements}
    ${xLabels}
  </svg>`;

  return _chartWrapper(data, svg + legend);
}


// ─────────────────────────────────────────────
// PIE / DONUT CHART — SVG arcs
// ─────────────────────────────────────────────
function buildPieChart(data) {
  const series = data.datasets?.[0];
  if (!series?.values?.length) return '';
  const vals  = series.values.map(toNum).filter(v => !isNaN(v) && v > 0);
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const CX = 90, CY = 90, R = 72, IR = 40; // donut
  let angle = -Math.PI / 2;

  const slices = vals.map((v, i) => {
    const sweep = (v / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    angle += sweep;
    const x2 = CX + R * Math.cos(angle);
    const y2 = CY + R * Math.sin(angle);
    const xi1 = CX + IR * Math.cos(angle - sweep);
    const yi1 = CY + IR * Math.sin(angle - sweep);
    const xi2 = CX + IR * Math.cos(angle);
    const yi2 = CY + IR * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const color = THEME.palette[i % THEME.palette.length];
    const pct   = Math.round((v / total) * 100);
    return {
      path: `<path d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${IR} ${IR} 0 ${large} 0 ${xi1} ${yi1} Z"
               fill="${color}" opacity="0.9"/>`,
      color, label: data.labels[i] || `Item ${i+1}`, pct, val: v
    };
  });

  const legend = slices.map(s =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="width:12px;height:12px;border-radius:2px;background:${s.color};flex-shrink:0;display:inline-block"></span>
      <span style="font-size:0.75rem;color:${THEME.cream};flex:1">${esc(s.label)}</span>
      <span style="font-size:0.75rem;font-weight:700;color:${s.color}">${s.pct}%</span>
      <span style="font-size:0.7rem;color:${THEME.muted}">${esc(formatValue(s.val, data.unit || ''))}</span>
    </div>`
  ).join('');

  const svg = `<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" style="width:180px;height:180px;flex-shrink:0">
    ${slices.map(s => s.path).join('')}
    <circle cx="${CX}" cy="${CY}" r="${IR - 3}" fill="${THEME.bg2}"/>
    <text x="${CX}" y="${CY - 6}" text-anchor="middle" font-size="11" fill="${THEME.cream}" font-weight="700">${esc(formatValue(vals.reduce((a,b)=>a+b,0), data.unit || ''))}</text>
    <text x="${CX}" y="${CY + 10}" text-anchor="middle" font-size="9" fill="${THEME.muted}">Total</text>
  </svg>`;

  return _chartWrapper(data,
    `<div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">
      ${svg}
      <div style="flex:1;min-width:160px">${legend}</div>
    </div>`
  );
}


// ─────────────────────────────────────────────
// STAT CARDS — headline numbers
// ─────────────────────────────────────────────
function buildStatsCards(data) {
  const series = data.datasets?.[0];
  if (!series?.values?.length) return '';

  const cards = data.labels.map((label, i) => {
    const val   = series.values[i];
    const color = THEME.palette[i % THEME.palette.length];
    return `<div style="flex:1;min-width:120px;background:${THEME.bg2};border:1px solid ${color}33;border-radius:6px;padding:0.9rem 1rem;text-align:center">
      <div style="font-size:1.6rem;font-weight:800;color:${color};line-height:1;margin-bottom:0.35rem">${esc(data.unit||'')}${esc(val)}</div>
      <div style="font-size:0.72rem;color:${THEME.muted};line-height:1.3">${esc(label)}</div>
    </div>`;
  }).join('');

  return _chartWrapper(data,
    `<div style="display:flex;flex-wrap:wrap;gap:0.75rem">${cards}</div>`
  );
}


// ─────────────────────────────────────────────
// DATA TABLE — comparison grid
// ─────────────────────────────────────────────
function buildDataTable(data) {
  const headers = data.labels || [];
  const rows    = data.datasets || [];
  if (!headers.length || !rows.length) return '';

  const thead = `<tr>
    <th style="padding:0.6rem 0.75rem;text-align:left;font-size:0.7rem;font-weight:700;color:${THEME.gold};border-bottom:1px solid ${THEME.border};white-space:nowrap;position:sticky;left:0;background:${THEME.bg2};z-index:2"></th>
    ${headers.map(h => `<th style="padding:0.6rem 0.75rem;text-align:left;font-size:0.7rem;font-weight:700;color:${THEME.gold};border-bottom:1px solid ${THEME.border};white-space:nowrap;background:${THEME.bg2}">${esc(h)}</th>`).join('')}
  </tr>`;

  const tbody = rows.map((row, ri) => {
    const bg = ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.025)';
    const cells = (row.values || []).map(v =>
      `<td style="padding:0.55rem 0.75rem;font-size:0.78rem;color:${THEME.cream};border-bottom:1px solid ${THEME.border};vertical-align:top;white-space:normal;line-height:1.45">${esc(v)}</td>`
    ).join('');
    return `<tr style="background:${bg}">
      <td style="padding:0.55rem 0.75rem;font-size:0.78rem;font-weight:600;color:${THEME.gold};border-bottom:1px solid ${THEME.border};white-space:nowrap;position:sticky;left:0;background:${THEME.bg}">${esc(row.name||'')}</td>
      ${cells}
    </tr>`;
  }).join('');

  return _chartWrapper(data,
    `<div style="overflow-x:auto;border:1px solid ${THEME.border};border-radius:6px">
      <table style="width:100%;min-width:680px;border-collapse:collapse;font-family:var(--sans,sans-serif);table-layout:auto">
        <caption style="caption-side:top;text-align:left;padding:0.6rem 0.75rem;color:${THEME.muted};font-size:0.7rem;border-bottom:1px solid ${THEME.border}">
          ${esc(data.name || data.title || 'Comparison Table')}
        </caption>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`
  );
}


// ─────────────────────────────────────────────
// Shared wrapper — title, subtitle, source
// Embeds raw chart JSON in data-bp-gchart for Google Charts progressive
// enhancement. The fallback SVG/HTML is always present for non-JS contexts.
// ─────────────────────────────────────────────
function _chartWrapper(data, innerHTML) {
  const chartName = data.name || data.title || 'Data Visualization';
  const chartId = data._chartId || '';

  // Embed chart config for Google Charts rendering (strip internal _chartId)
  const gcPayload = {
    type:     data.type,
    labels:   data.labels,
    datasets: data.datasets,
    unit:     data.unit || '',
    title:    data.title || '',
    name:     chartName,
  };
  // Encode as HTML-safe attribute value (double-quoted attr — escape " inside JSON)
  const gcAttr = JSON.stringify(gcPayload).replace(/"/g, '&quot;');

  // stats and table have no Google Charts equivalent — no canvas div needed
  const hasGcVariant = ['bar', 'line', 'pie'].includes(data.type);

  return `
<div class="bp-chart-block" id="${esc(chartId)}" data-chart-name="${esc(chartName)}" style="
  background:${THEME.bg};
  border:1px solid ${THEME.border};
  border-left:3px solid ${THEME.gold};
  border-radius:6px;
  padding:1.2rem 1.4rem;
  margin:1.6rem 0;
  font-family:var(--sans,sans-serif);
">
  <div style="margin-bottom:0.9rem">
    <div style="font-size:0.68rem;font-weight:600;color:${THEME.gold};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">${esc(chartName)}</div>
    <div style="font-size:0.82rem;font-weight:700;color:${THEME.cream};margin-bottom:2px">${esc(data.title || 'Data Visualization')}</div>
    ${data.subtitle ? `<div style="font-size:0.7rem;color:${THEME.muted}">${esc(data.subtitle)}</div>` : ''}
  </div>
  <div class="bp-chart-fallback">${innerHTML}</div>
  ${hasGcVariant ? `<div class="bp-chart-canvas" data-bp-gchart="${gcAttr}" style="display:none;width:100%"></div>` : ''}
  ${data.source ? `<div style="margin-top:0.8rem;font-size:0.65rem;color:${THEME.muted};border-top:1px solid ${THEME.border};padding-top:0.5rem;font-style:italic">${esc(data.source)}</div>` : ''}
</div>`;
}
