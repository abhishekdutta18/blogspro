// ═══════════════════════════════════════════════
// chart-builder.js — AI-driven chart + data injection
// Generates structured data via AI, renders as
// self-contained inline SVG/HTML with no external deps.
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

// ─────────────────────────────────────────────
// Public API — called from ai-writer.js
// topic: article topic, sectionTitle: current section
// Returns a self-contained HTML string or '' on failure
// ─────────────────────────────────────────────
export async function generateChartForSection(topic, sectionTitle, category, model) {

  // Ask AI what kind of chart fits this section and get the data
  const result = await callAI(
    `You are a data analyst writing for a ${category} blog.
The article is about: "${topic}"
Current section: "${sectionTitle}"

Generate a realistic, relevant data visualization for this section.
Choose the most appropriate chart type for the data.

Return ONLY valid JSON — no markdown, no explanation:
{
  "type": "bar" | "line" | "pie" | "table" | "stats",
  "title": "chart title",
  "subtitle": "optional source or note",
  "labels": ["label1", "label2", ...],
  "datasets": [
    { "name": "Series name", "values": [number, number, ...] }
  ],
  "unit": "% or ₹ or $ or x or empty string",
  "source": "Source: e.g. RBI 2024 or World Bank 2024"
}

Rules:
- Use "stats" type for 3-5 key headline numbers (e.g. market size, growth rate)
- Use "table" for comparison data (features, providers, metrics)
- Use "bar" for categorical comparisons
- Use "line" for trends over time
- Use "pie" for share/breakdown data
- All values must be realistic numbers for the topic
- labels and values arrays must be the same length
- For "stats" type: datasets[0].values = numbers, labels = stat names
- For "table" type: labels = column headers, datasets = rows (each dataset.name = row label, dataset.values = cell values as strings)`,
    true, model
  );

  if (result.error || !result.text) return '';

  let data;
  try {
    const s = result.text.indexOf('{');
    const e = result.text.lastIndexOf('}');
    if (s === -1 || e === -1) return '';
    data = JSON.parse(result.text.substring(s, e + 1));
  } catch(_) { return ''; }

  if (!data?.type || !data?.labels?.length) return '';

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
  const values   = series.values.map(Number).filter(v => !isNaN(v));
  const max      = Math.max(...values) || 1;
  const unit     = data.unit || '';
  const multiSeries = data.datasets?.length > 1;

  const bars = data.labels.map((label, i) => {
    if (multiSeries) {
      // Grouped bars
      const groupBars = data.datasets.map((ds, di) => {
        const val = Number(ds.values[i]) || 0;
        const pct = Math.round((val / max) * 100);
        const color = THEME.palette[di % THEME.palette.length];
        return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <span style="font-size:0.65rem;color:${THEME.muted};width:70px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ds.name}</span>
          <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:2px;height:14px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${color};border-radius:2px;transition:width 0.8s ease;min-width:2px"></div>
          </div>
          <span style="font-size:0.68rem;color:${color};font-weight:700;width:40px;flex-shrink:0">${unit}${val.toLocaleString()}</span>
        </div>`;
      }).join('');
      return `<div style="margin-bottom:0.9rem">
        <div style="font-size:0.75rem;color:${THEME.cream};font-weight:600;margin-bottom:4px">${label}</div>
        ${groupBars}
      </div>`;
    } else {
      const val = values[i] || 0;
      const pct = Math.round((val / max) * 100);
      const color = THEME.palette[i % THEME.palette.length];
      return `<div style="margin-bottom:0.6rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:0.75rem;color:${THEME.cream}">${label}</span>
          <span style="font-size:0.75rem;color:${color};font-weight:700">${unit}${val.toLocaleString()}</span>
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
            <span style="width:10px;height:10px;border-radius:2px;background:${THEME.palette[di % THEME.palette.length]};display:inline-block;flex-shrink:0"></span>${ds.name}
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

  const allVals = data.datasets.flatMap(ds => ds.values.map(Number).filter(v => !isNaN(v)));
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
    const label = v >= 1000 ? (v/1000).toFixed(1)+'k' : v.toFixed(v < 10 ? 1 : 0);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${THEME.border}" stroke-width="1"/>
            <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="${THEME.muted}">${data.unit||''}${label}</text>`;
  }).join('');

  // X axis labels
  const xLabels = data.labels.map((lbl, i) => {
    const x = xScale(i);
    const show = n <= 8 || i % Math.ceil(n / 6) === 0 || i === n - 1;
    return show ? `<text x="${x}" y="${H - 4}" text-anchor="middle" font-size="9" fill="${THEME.muted}">${lbl}</text>` : '';
  }).join('');

  // Series lines + dots
  const seriesElements = data.datasets.map((ds, di) => {
    const vals = ds.values.map(Number);
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
            <span style="width:16px;height:2px;background:${THEME.palette[di % THEME.palette.length]};display:inline-block"></span>${ds.name}
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
  const vals  = series.values.map(Number).filter(v => !isNaN(v) && v > 0);
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
      <span style="font-size:0.75rem;color:${THEME.cream};flex:1">${s.label}</span>
      <span style="font-size:0.75rem;font-weight:700;color:${s.color}">${s.pct}%</span>
      <span style="font-size:0.7rem;color:${THEME.muted}">${data.unit||''}${s.val.toLocaleString()}</span>
    </div>`
  ).join('');

  const svg = `<svg viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" style="width:180px;height:180px;flex-shrink:0">
    ${slices.map(s => s.path).join('')}
    <circle cx="${CX}" cy="${CY}" r="${IR - 3}" fill="${THEME.bg2}"/>
    <text x="${CX}" y="${CY - 6}" text-anchor="middle" font-size="11" fill="${THEME.cream}" font-weight="700">${data.unit||''}${vals.reduce((a,b)=>a+b,0).toLocaleString()}</text>
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
      <div style="font-size:1.6rem;font-weight:800;color:${color};line-height:1;margin-bottom:0.35rem">${data.unit||''}${val}</div>
      <div style="font-size:0.72rem;color:${THEME.muted};line-height:1.3">${label}</div>
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
    <th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.7rem;font-weight:700;color:${THEME.gold};border-bottom:1px solid ${THEME.border};white-space:nowrap"></th>
    ${headers.map(h => `<th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.7rem;font-weight:700;color:${THEME.gold};border-bottom:1px solid ${THEME.border};white-space:nowrap">${h}</th>`).join('')}
  </tr>`;

  const tbody = rows.map((row, ri) => {
    const bg = ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.025)';
    const cells = (row.values || []).map(v =>
      `<td style="padding:0.45rem 0.75rem;font-size:0.78rem;color:${THEME.cream};border-bottom:1px solid ${THEME.border}">${v}</td>`
    ).join('');
    return `<tr style="background:${bg}">
      <td style="padding:0.45rem 0.75rem;font-size:0.78rem;font-weight:600;color:${THEME.gold};border-bottom:1px solid ${THEME.border};white-space:nowrap">${row.name||''}</td>
      ${cells}
    </tr>`;
  }).join('');

  return _chartWrapper(data,
    `<div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-family:var(--sans,sans-serif)">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`
  );
}


// ─────────────────────────────────────────────
// Shared wrapper — title, subtitle, source
// ─────────────────────────────────────────────
function _chartWrapper(data, innerHTML) {
  return `
<div class="bp-chart-block" style="
  background:${THEME.bg};
  border:1px solid ${THEME.border};
  border-left:3px solid ${THEME.gold};
  border-radius:6px;
  padding:1.2rem 1.4rem;
  margin:1.6rem 0;
  font-family:var(--sans,sans-serif);
">
  <div style="margin-bottom:0.9rem">
    <div style="font-size:0.82rem;font-weight:700;color:${THEME.cream};margin-bottom:2px">${data.title || 'Data Visualization'}</div>
    ${data.subtitle ? `<div style="font-size:0.7rem;color:${THEME.muted}">${data.subtitle}</div>` : ''}
  </div>
  ${innerHTML}
  ${data.source ? `<div style="margin-top:0.8rem;font-size:0.65rem;color:${THEME.muted};border-top:1px solid ${THEME.border};padding-top:0.5rem">${data.source}</div>` : ''}
</div>`;
}
