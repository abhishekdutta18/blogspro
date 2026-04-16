// ═══════════════════════════════════════════════
// chart-builder.js — AI-driven chart + data injection
// Primary render: Google Charts (interactive, themed).
// Fallback render: self-contained inline SVG/HTML (no external deps).
// Theme: dark navy bg, gold accents, cream text.
// ═══════════════════════════════════════════════
import { callAI } from './ai-core.js';

const THEME = {
  bg:       '#ffffff',
  bg2:      '#f4f6f8',
  border:   '#d0d7de',
  gold:     '#1a1a2e',
  gold2:    '#333333',
  cream:    '#111111',
  muted:    '#555555',
  green:    '#16a34a',
  red:      '#dc2626',
  blue:     '#2563eb',
  purple:   '#7c3aed',
  // Bar palette — cycles through for multi-series
  palette:  ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d'],
};

// Google Charts theme — white background, black labels
const GC_THEME = {
  backgroundColor: { fill: '#ffffff' },
  fontName: 'DM Sans',
  colors: ['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d'],
  legend: { textStyle: { color: '#333333', fontSize: 11 } },
  chartArea: { backgroundColor: '#ffffff', left: 60, right: 20, top: 30, bottom: 50 },
  hAxis: {
    textStyle: { color: '#333333', fontSize: 9 },
    titleTextStyle: { color: '#333333', fontSize: 10, italic: false },
    gridlines: { color: '#e0e0e0' },
    baselineColor: '#cccccc',
  },
  vAxis: {
    textStyle: { color: '#333333', fontSize: 9 },
    titleTextStyle: { color: '#333333', fontSize: 10, italic: false },
    gridlines: { color: '#e0e0e0' },
    baselineColor: '#cccccc',
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
  const norm = normalizeChartData(data);
  const { type, labels = [], datasets = [], unit = '' } = norm;
  const vis = google.visualization;

  if (type === 'bar') {
    const multiSeries = datasets.length > 1;
    const dtFlat = vis.arrayToDataTable([
      ['Label', ...datasets.map(ds => ds.name || 'Value')],
      ...labels.map((lbl, i) => [String(lbl), ...datasets.map(ds => toNum(ds.values[i]) || 0)])
    ]);
    
    // Responsive height: prevents clipping if labels are long
    const rowHeight = 36;
    const chartHeight = Math.max(180, labels.length * rowHeight + 80);
    el.style.height = `${chartHeight}px`;

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
    el.style.height = '260px';
    new vis.PieChart(el).draw(dtFlat, {
      ...GC_THEME,
      pieHole: 0.4,
      chartArea: { ...GC_THEME.chartArea, top: 10, bottom: 10 },
      legend: { ...GC_THEME.legend, position: 'right' },
      pieSliceTextStyle: { color: '#ffffff', fontSize: 10 },
    });

  }
}

/**
 * Ensures chart data follows the V17.0 labels/datasets schema.
 * Automatically upgrades legacy 'data' arrays.
 */
function normalizeChartData(data) {
  if (!data) return { labels: [], datasets: [] };
  const d = { ...data };
  
  if (d.data && Array.isArray(d.data) && !d.datasets) {
    d.labels = d.data.map(i => Array.isArray(i) ? i[0] : 'Item');
    d.datasets = [{ 
      name: d.unit || 'Value', 
      values: d.data.map(i => Array.isArray(i) ? i[1] : 0) 
    }];
  }
  
  if (!d.labels) d.labels = [];
  if (!d.datasets) d.datasets = [];
  return d;
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
  const chartId = `chart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const result = await callAI(
    `You are an institutional data analyst. Generate a visualization for a ${category} article.
Article: "${topic}" | Section: "${sectionTitle}"

Pick the best chart type and generate REAL, SPECIFIC numeric data.

CRITICAL: Return ONLY a raw JSON object. No markdown.
REQUIRED FIELDS:
- "name": "Fig N: Descriptive Title"
- "title": Clear Display Title
- "source": VERIFIABLE Citation (e.g. "RBI Annual Report 2024"). 
- "subtitle": Contextual description.

TRUTH-FIRST RULE:
If you cannot find a REAL, NON-HALLUCINATED source for this specific data, return exactly: {"error": "NO_REAL_SOURCE"}
Placeholder citations like "Internal Analysis" or "General Market Industry" are BANNED.`,
    true, "gemini", 512
  );

  if (result.error || !result.text) return '';

  let data;
  try {
    let raw = result.text.replace(/```json|```/gi, '').trim();
    data = JSON.parse(raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch(_) { return ''; }

  // 🛡️ TRUTH-FIRST KILL-SWITCH
  const BANNED_SOURCES = ['INTERNAL', 'ESTIMATE', 'GENERAL', 'PLACEHOLDER', 'UNKNOWN', 'INDUSTRY ANALYSIS'];
  const src = (data.source || '').toUpperCase();
  const isHallucinated = BANNED_SOURCES.some(b => src.includes(b)) || !data.source || data.error === 'NO_REAL_SOURCE';

  if (isHallucinated) {
    console.warn(`🛑 [Truth-First] Specific chart omitted due to hallucinated source: ${data.source}`);
    return ''; // Silent omission of the ungrounded visualization
  }

  // ── VALIDATION & NORMALIZATION ──────────────────
  data = normalizeChartData(data);
  if (!data.labels.length || !data.datasets?.[0]?.values?.length) return '';
  
  const minLen = Math.min(data.labels.length, ...data.datasets.map(ds => (ds.values || []).length));
  data.labels = data.labels.slice(0, minLen);
  data.datasets = data.datasets.map(ds => ({ ...ds, values: (ds.values || []).slice(0, minLen) }));

  if (!data.name) data.name = `${data.type === 'table' ? 'Table' : 'Fig'}: ${data.title || sectionTitle}`;
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
          <div style="flex:1;background:rgba(0,0,0,0.06);border-radius:2px;height:14px;overflow:hidden">
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
        <div style="background:rgba(0,0,0,0.06);border-radius:3px;height:16px;overflow:hidden">
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
  const rawVals = series.values.map(toNum).filter(v => !isNaN(v) && v > 0);
  const total   = rawVals.reduce((a, b) => a + b, 0) || 1;
  const CX = 90, CY = 90, R = 72, IR = 40; 
  
  // 🛡️ MATH HARDENING: Largest Remainder Method for precise 100% sum
  // Prevents "Institutional Poison" (99% or 101% labels)
  const pctsWithRemainder = rawVals.map((v, i) => {
    const exact = (v / total) * 100;
    return { index: i, val: v, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  
  const currentSum = pctsWithRemainder.reduce((a, b) => a + b.floor, 0);
  const diff = 100 - currentSum;
  
  // Sort by remainder descending and distribute the difference
  if (diff > 0) {
    const sorted = [...pctsWithRemainder].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < diff; i++) {
      sorted[i].floor += 1;
    }
  }

  const pcts = pctsWithRemainder.map(p => p.floor);
  let angle = -Math.PI / 2;

  const slices = rawVals.map((v, i) => {
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
    
    return {
      path: `<path d="M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${IR} ${IR} 0 ${large} 0 ${xi1} ${yi1} Z"
               fill="${color}" opacity="0.9"/>`,
      color, label: data.labels[i] || `Item ${i+1}`, pct: pcts[i], val: v
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
    <text x="${CX}" y="${CY - 6}" text-anchor="middle" font-size="11" fill="${THEME.cream}" font-weight="700">${esc(formatValue(rawVals.reduce((a,b)=>a+b,0), data.unit || ''))}</text>
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
    const bg = ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.04)';
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
  background:#ffffff;
  border:1px solid #d0d7de;
  border-left:3px solid #1a1a2e;
  border-radius:6px;
  padding:1.2rem 1.4rem;
  margin:1.6rem 0;
  font-family:var(--sans,sans-serif);
  box-shadow:0 1px 4px rgba(0,0,0,0.07);
">
  <div style="margin-bottom:0.9rem">
    <div style="font-size:0.68rem;font-weight:700;color:#1a1a2e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${esc(chartName)}</div>
    <div style="font-size:0.9rem;font-weight:700;color:#111111;margin-bottom:2px">${esc(data.title || 'Data Visualization')}</div>
    ${data.subtitle ? `<div style="font-size:0.72rem;color:#555555">${esc(data.subtitle)}</div>` : ''}
  </div>
  <div class="bp-chart-fallback">${innerHTML}</div>
  ${hasGcVariant ? `<div class="bp-chart-canvas" data-bp-gchart="${gcAttr}" style="display:none;width:100%"></div>` : ''}
  ${data.source ? `<div style="margin-top:0.8rem;font-size:0.65rem;color:${THEME.muted};border-top:1px solid ${THEME.border};padding-top:0.5rem;font-style:italic">${esc(data.source)}</div>` : ''}
</div>`;
}
