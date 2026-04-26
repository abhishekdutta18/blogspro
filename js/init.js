// BlogsPro — Page Initialisation (extracted from index.html)
// This file bootstraps all homepage modules and data loaders.

import { api } from './services/api.js';
import { initIntelHub } from './intel-hub.js';
import { loadHybridPosts } from './posts.js';
import { initNewsWire } from './news-wire.js';
import { ENDPOINTS } from './endpoints.js';

window.registerGoogle = () => {
  api.auth.google("index.html");
};


const LOCAL_IMAGES_KEY = 'blogspro_images_enabled';
let imagesEnabled = true;
let indexUserIsAdmin = false;

let allPosts   = [];
let currentCat = 'all';

// ── Early Global Exports (Ensures UI handlers work immediately) ───────────────
window.handleSearch = (q) => { /* Placeholder, will be replaced by real function */ };
window.filterByCategory = (c) => { /* Placeholder */ };
window.toggleTheme = () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  document.getElementById('themeBtn').textContent = isLight ? '🌙' : '☀️';
  localStorage.setItem('bpTheme', isLight ? 'light' : 'dark');
};
if (localStorage.getItem('bpTheme') === 'light') {
  document.body.classList.add('light');
  // themeBtn text will be set after DOM loads
}

let forexCalendarRaw = [];
let forexCalendarPast = [];
let indiaCalendarRaw = [];
let indiaCalendarHistoryRaw = [];
let indiaQoqChart = null;
let applyForexFiltersGlobal = null;
let cryptoCache = null;
let cryptoCacheAt = 0;
const CRYPTO_CACHE_TTL = 60000; // 1 minute
const API_TIMEOUT_MS = 12000;
function setIntegrationStatus(mode, label) {
  const badge = document.getElementById('integrationBadge');
  const text = document.getElementById('integrationBadgeText');
  if (!badge || !text) return;
  badge.classList.remove('online', 'degraded');
  if (mode === 'online') badge.classList.add('online');
  if (mode === 'degraded') badge.classList.add('degraded');
  text.textContent = label || 'Integrations: Initializing';
}
setIntegrationStatus(null, 'Integrations: Initializing');

function withTimeout(promise, ms = API_TIMEOUT_MS, label = 'request') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => clearTimeout(timer));
}

async function loadForexFactoryData() {
  const listEl = document.getElementById('forexCalendarList');
  const chipEl = document.getElementById('forexFeedChip');
  const metaEl = document.getElementById('forexCalendarMeta');
  const analysisEl = document.getElementById('forexCalendarAnalysis');
  const summaryEl = document.getElementById('forexCalendarSummary');
  const snapshotEl = document.getElementById('forexCalendarSnapshot');
  const countryMixChartEl = document.getElementById('forexCountryMixChart');
  const surpriseChartEl = document.getElementById('forexSurpriseChart');
  const sessionGaugeChartEl = document.getElementById('forexSessionGaugeChart');
  const sessionGaugeNoteEl = document.getElementById('forexSessionGaugeNote');
  const deskExplainEl = document.getElementById('forexDeskExplain');
  const pastListEl = document.getElementById('forexCalendarPastList');
  const filterEl = document.getElementById('forexCalendarCountryFilter');
  const titleFilterEl = document.getElementById('forexCalendarTitleFilter');
  const impactEl = document.getElementById('forexCalendarImpactFilter');
  const sortEl = document.getElementById('forexCalendarSort');
  const limitEl = document.getElementById('forexCalendarLimit');
  const tzEl = document.getElementById('forexCalendarTimezone');
  const skeletonEl = document.getElementById('forexCalendarSkeleton');
  if (!listEl || !chipEl || !metaEl || !analysisEl || !summaryEl || !snapshotEl || !countryMixChartEl || !surpriseChartEl || !sessionGaugeChartEl || !sessionGaugeNoteEl || !deskExplainEl || !pastListEl || !filterEl || !titleFilterEl || !impactEl || !sortEl || !limitEl || !tzEl || !skeletonEl) return false;

  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmtDate = (raw, mode = 'local') => {
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return 'Date unavailable';
    const useUtc = mode === 'utc';
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: useUtc ? 'UTC' : undefined
    }) + (useUtc ? ' UTC' : '');
  };
  const nowStamp = () => new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const sourceLabel = (src) => (src === 'forexfactory' ? 'ForexFactory' : src === 'tradingeconomics' ? 'TradingEconomics' : 'Market Desk');
  const analystView = (event) => {
    const t = String(event?.title || '').toLowerCase();
    if (t.includes('cpi') || t.includes('inflation')) return 'Analyst view: Inflation surprise risk can reprice rate-cut expectations quickly.';
    if (t.includes('employment') || t.includes('non-farm') || t.includes('payroll')) return 'Analyst view: Labor momentum can shift USD yields and index futures direction.';
    if (t.includes('pmi') || t.includes('manufacturing') || t.includes('services')) return 'Analyst view: Growth momentum signal; watch cyclical sectors and FX beta pairs.';
    if (t.includes('rate') || t.includes('fomc') || t.includes('ecb') || t.includes('boe')) return 'Analyst view: Policy guidance can trigger broad cross-asset volatility in minutes.';
    return 'Analyst view: High-impact macro print; keep tighter stops around release minute.';
  };
  const buildAnalysis = (events) => {
    const byCountry = {};
    for (const e of events) {
      const c = String(e.country || 'FX').trim() || 'FX';
      byCountry[c] = (byCountry[c] || 0) + 1;
    }
    const top = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (!top.length) return 'No high-impact events were identified in the current response.';
    const lead = top.map(([c, n]) => `${c} (${n})`).join(', ');
    return `Risk concentration is highest in ${lead}; expect volatility around release windows and plan tighter risk limits near those sessions.`;
  };
  const parseNum = (v) => {
    const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };


  applyForexFiltersGlobal = null; // reset on each load; reassigned below
  const applyCalendarFilters = () => {
    const q = String(filterEl.value || '').trim().toUpperCase();
    const tq = String(titleFilterEl.value || '').trim().toLowerCase();
    const maxN = Number(limitEl.value || 5);
    const tzMode = tzEl.value === 'utc' ? 'utc' : 'local';
    const impact = impactEl.value || 'all';
    const sort = sortEl.value || 'date_asc';
    const filtered = forexCalendarRaw.filter((e) => {
      const countryOk = !q || String(e.country || '').toUpperCase().includes(q);
      const titleOk = !tq || String(e.title || '').toLowerCase().includes(tq);
      const impactOk = impact === 'all' || String(e.impact || '').toLowerCase().includes(impact.toLowerCase());
      return countryOk && titleOk && impactOk;
    });
    filtered.sort((a, b) => {
      if (sort === 'country') return String(a.country || '').localeCompare(String(b.country || ''));
      const ad = new Date(a.date || a.Date || a.datetime || 0).getTime() || 0;
      const bd = new Date(b.date || b.Date || b.datetime || 0).getTime() || 0;
      return sort === 'date_desc' ? (bd - ad) : (ad - bd);
    });
    const events = filtered.slice(0, Math.max(1, maxN));
    const pastEvents = forexCalendarPast
      .filter((e) => {
        const countryOk = !q || String(e.country || '').toUpperCase().includes(q);
        const titleOk = !tq || String(e.title || '').toLowerCase().includes(tq);
        const impactOk = impact === 'all' || String(e.impact || '').toLowerCase().includes(impact.toLowerCase());
        return countryOk && titleOk && impactOk;
      })
      .slice(0, 6);
    const byCountry = {};
    for (const e of filtered) {
      const c = String(e.country || 'FX').trim() || 'FX';
      byCountry[c] = (byCountry[c] || 0) + 1;
    }
    const topCountry = Object.entries(byCountry).sort((a, b) => b[1] - a[1])[0];
    const nextDate = filtered.map((e) => e.date || e.Date || e.datetime).find(Boolean);
    summaryEl.textContent = `Summary: ${filtered.length} matched · Top country: ${topCountry ? `${topCountry[0]} (${topCountry[1]})` : 'N/A'} · Next release: ${fmtDate(nextDate, tzMode)}`;
    snapshotEl.innerHTML = `
      <div><b>Window:</b> ${filtered.length} events in active filter set</div>
      <div><b>Volatility Bias:</b> ${topCountry ? `${topCountry[0]}-linked pairs` : 'Balanced / mixed'}</div>
      <div><b>Focus Pair:</b> ${topCountry?.[0] === 'USD' ? 'EURUSD / USDJPY' : topCountry?.[0] === 'GBP' ? 'GBPUSD / EURGBP' : topCountry?.[0] === 'AUD' ? 'AUDUSD / AUDJPY' : 'DXY + majors'}</div>
      <div><b>Risk Note:</b> Clustered high-impact prints can widen spreads around the minute of release.</div>
    `;
    const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (window.google && google.visualization) {
      const data = google.visualization.arrayToDataTable([
        ['Country', 'Events'],
        ...topCountries.map(([c, n]) => [c, n])
      ]);
      const options = { 
        ...window.CHART_THEME, 
        pieHole: 0.4, 
        chartArea: { width: '90%', height: '70%' },
        legend: { position: 'bottom', textStyle: { color: 'rgba(191,161,0,0.8)', fontSize: 9 } }
      };
      new google.visualization.PieChart(document.getElementById('forexCountryMixChart')).draw(data, options);
    }

    const surpriseRows = filtered
      .map((e) => {
        const a = parseNum(e.actual);
        const f = parseNum(e.forecast);
        if (!Number.isFinite(a) || !Number.isFinite(f)) return null;
        return { title: String(e.title || 'Event'), s: Math.abs(a - f) };
      })
      .filter(Boolean)
      .sort((a, b) => b.s - a.s)
      .slice(0, 4);
    if (window.google && google.visualization && surpriseRows.length) {
      const data = google.visualization.arrayToDataTable([
        ['Event', 'Surprise'],
        ...surpriseRows.map(r => [r.title.slice(0, 15), r.s])
      ]);
      const options = { 
        ...window.CHART_THEME, 
        hAxis: { ...window.CHART_THEME.hAxis, title: 'Event Dispersion' },
        vAxis: { ...window.CHART_THEME.vAxis, title: 'Absolute Surprise' },
        legend: { position: 'none' }
      };
      new google.visualization.BarChart(document.getElementById('forexSurpriseChart')).draw(data, options);
    }

    const sess = { asia: 0, europe: 0, us: 0 };
    filtered.forEach((e) => {
      const d = new Date(e.date || e.Date || e.datetime || 0);
      if (!Number.isFinite(d.getTime())) return;
      const h = d.getUTCHours();
      if (h < 8) sess.asia += 1;
      else if (h < 14) sess.europe += 1;
      else sess.us += 1;
    });
    const peak = Object.entries(sess).sort((a, b) => b[1] - a[1])[0] || ['asia', 0];
    const peakMap = { asia: 'Asia session', europe: 'Europe session', us: 'US session' };
    const totalSess = Math.max(1, sess.asia + sess.europe + sess.us);
    const heat = Math.round((Number(peak[1] || 0) / totalSess) * 100);
    if (window.google && google.visualization) {
      const data = google.visualization.arrayToDataTable([
        ['Label', 'Value'],
        ['Risk', heat]
      ]);
      const options = {
        width: 120, height: 120,
        redFrom: 75, redTo: 100,
        yellowFrom: 50, yellowTo: 75,
        minorTicks: 5,
        greenColor: '#BFA100', yellowColor: '#FFB800', redColor: '#ef4444'
      };
      new google.visualization.Gauge(document.getElementById('forexSessionGaugeChart')).draw(data, options);
    }
    sessionGaugeNoteEl.textContent = `${peakMap[peak[0]] || 'Session'} concentration: ${heat}% of tracked releases`;
    deskExplainEl.innerHTML = `
      <div><b>Country Event Mix:</b> ${topCountries.map(([c, n]) => `${c} (${n})`).join(', ') || 'No mix available'}.</div>
      <div><b>Surprise Dispersion:</b> ${surpriseRows.length ? `${surpriseRows[0].title} leads with ${surpriseRows[0].s.toFixed(2)} spread.` : 'Awaiting actual-vs-forecast pairs.'}</div>
      <div><b>Session Risk Heat:</b> Highest release clustering in ${peakMap[peak[0]] || 'session windows'}.</div>
    `;
    if (!events.length) {
      listEl.innerHTML = `<li class="calendar-empty">No events match current filters.</li>`;
    } else {
      listEl.innerHTML = events.map((e) => `
          <li class="calendar-item">
            <div class="calendar-item-head">
              <span class="calendar-country">${esc(e.country || 'FX')}</span>
              <span class="calendar-impact">${esc(e.impact || 'High')}</span>
            </div>
            <span class="calendar-title">${esc(e.title || 'Untitled event')}<span class="calendar-view">${esc(analystView(e))}</span></span>
            <span class="calendar-date">${fmtDate(e.date || e.Date || e.datetime, tzMode)}</span>
            <div class="calendar-points">
              <div class="calendar-point">
                <div class="calendar-point-label">Actual</div>
                <div class="calendar-point-value">${esc(e.actual || 'Pending')}</div>
              </div>
              <div class="calendar-point">
                <div class="calendar-point-label">Forecast</div>
                <div class="calendar-point-value">${esc(e.forecast || '--')}</div>
              </div>
              <div class="calendar-point">
                <div class="calendar-point-label">Previous</div>
                <div class="calendar-point-value">${esc(e.previous || '--')}</div>
              </div>
            </div>
          </li>
        `).join('');
    }
    if (!pastEvents.length) {
      pastListEl.innerHTML = '<li class="calendar-empty">No recent past events in current filter set.</li>';
    } else {
      pastListEl.innerHTML = pastEvents.map((e) => `
        <li class="calendar-past-item">
          <div class="calendar-item-head">
            <span class="calendar-country">${esc(e.country || 'FX')}</span>
            <span class="calendar-impact">${esc(e.impact || 'High')}</span>
          </div>
          <span class="calendar-title">${esc(e.title || 'Untitled event')}</span>
          <span class="calendar-date">${fmtDate(e.date || e.Date || e.datetime, tzMode)}</span>
        </li>
      `).join('');
    }
  };
  applyForexFiltersGlobal = applyCalendarFilters;

  const setState = (chipClass, chipText, events, source, isError = false) => {
    skeletonEl.style.display = 'none';
    chipEl.classList.remove('warn', 'down');
    if (chipClass) chipEl.classList.add(chipClass);
    chipEl.textContent = chipText;
    metaEl.textContent = `Source: ${sourceLabel(source)} · Events: ${events.length || 0} · Updated: ${nowStamp()}`;
    if (isError) {
      listEl.innerHTML = `<li class="calendar-empty">Calendar feeds currently unavailable. Please check back shortly.</li>`;
      analysisEl.textContent = 'Analyst view: Macro board temporarily unavailable; keep risk lower around scheduled sessions.';
      summaryEl.textContent = 'Summary: no live data';
      snapshotEl.innerHTML = `<div><b>Window:</b> unavailable</div><div><b>Volatility Bias:</b> unknown</div><div><b>Focus Pair:</b> --</div><div><b>Risk Note:</b> Use defensive sizing until feed normalizes.</div>`;
      pastListEl.innerHTML = '<li class="calendar-empty">Past events unavailable.</li>';
      return;
    }
    analysisEl.textContent = `Analyst view: ${buildAnalysis(events)}`;
    const baseNow = Date.now();
    const hydrated = events.map((e, idx) => {
      const t = new Date(e.date || e.Date || e.datetime || 0).getTime();
      if (Number.isFinite(t) && t > 0) return { ...e, __ts: t };
      return { ...e, __ts: baseNow + ((idx + 1) * 6 * 3600 * 1000) };
    });
    const sorted = hydrated.slice().sort((a, b) => a.__ts - b.__ts);
    forexCalendarRaw = sorted.map(({ __ts, ...rest }) => ({ ...rest, date: rest.date || new Date(__ts).toISOString() }));
    const pastSeed = hydrated.slice().sort((a, b) => b.__ts - a.__ts).slice(0, Math.min(6, hydrated.length));
    forexCalendarPast = pastSeed.map(({ __ts, ...rest }, idx) => {
      const pastTs = __ts - ((idx + 1) * 24 * 3600 * 1000);
      return { ...rest, date: new Date(pastTs).toISOString() };
    });
    applyCalendarFilters();
  };

  const candidates = [ENDPOINTS.upstox];
  for (const base of [...new Set(candidates.map((u) => String(u).replace(/\/+$/, '')))]) {
    try {
      skeletonEl.style.display = 'grid';
      const res = await withTimeout(fetch(`${base}/calendar`), 12000, 'calendar worker');
      if (!res.ok) continue;
      const json = await res.json();
      const events = (json?.events || []).slice(0, 5);
      if (!events.length) continue;
      setState(null, 'Live', events, json.source);
      return true;
    } catch (_) {}
  }
  setState('down', 'Down', [], 'none', true);
  return false;
}

async function loadUpstoxMarketData(opts = {}) {
  console.log('📡 [BlogsPro] Loading market data (V6.6-VALIDATED)...');
  const { showLoading = false } = opts;
  const segmentIndices = document.getElementById('segmentIndices');
  const segmentStocksOptions = document.getElementById('segmentStocksOptions');
  const segmentBonds = document.getElementById('segmentBonds');
  const segmentCurrency = document.getElementById('segmentCurrency');
  const segmentCommodities = document.getElementById('segmentCommodities');
  const segmentCrypto = document.getElementById('segmentCrypto');
  const ageEls = {
    indices: document.getElementById('ageIndices'),
    stocks: document.getElementById('ageStocks'),
    bonds: document.getElementById('ageBonds'),
    currency: document.getElementById('ageCurrency'),
    commodities: document.getElementById('ageCommodities'),
    crypto: document.getElementById('ageCrypto'),
  };
  const skeletonEl = document.getElementById('marketSegmentsSkeleton');
  const updatedEl = document.getElementById('marketUpdated');
  if (!segmentIndices || !segmentStocksOptions || !segmentBonds || !segmentCurrency || !segmentCommodities || !segmentCrypto || !skeletonEl || !updatedEl) return false;
  const setAgeLabels = (stamp) => {
    const ageSec = stamp ? Math.max(0, Math.round((Date.now() - stamp) / 1000)) : null;
    const txt = ageSec == null ? 'Age: --' : `Age: ${ageSec}s`;
    Object.values(ageEls).forEach((el) => { if (el) el.textContent = txt; });
  };

  const candidates = [ENDPOINTS.upstoxStable];
  const loadCryptoFromCoinGecko = async () => {
    const ids = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'dogecoin', 'cardano', 'matic-network', 'avalanche-2', 'polkadot', 'chainlink', 'litecoin', 'uniswap', 'near', 'stellar', 'internet-computer', 'aptos', 'arbitrum', 'optimism', 'filecoin'];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    const res = await withTimeout(fetch(`${url}&t=${Date.now()}`, { cache: 'no-store' }), 12000, 'coingecko crypto');
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const json = await res.json();
    const map = [['bitcoin', 'BTCUSDT'], ['ethereum', 'ETHUSDT'], ['binancecoin', 'BNBUSDT'], ['solana', 'SOLUSDT'], ['ripple', 'XRPUSDT'], ['dogecoin', 'DOGEUSDT'], ['cardano', 'ADAUSDT'], ['matic-network', 'MATICUSDT'], ['avalanche-2', 'AVAXUSDT'], ['polkadot', 'DOTUSDT'], ['chainlink', 'LINKUSDT'], ['litecoin', 'LTCUSDT'], ['uniswap', 'UNIUSDT'], ['near', 'NEARUSDT'], ['stellar', 'XLMUSDT'], ['internet-computer','ICPUSDT'], ['aptos', 'APTUSDT'], ['arbitrum', 'ARBUSDT'], ['optimism', 'OPUSDT'], ['filecoin', 'FILUSDT']];
    return map.map(([id, sym]) => {
      const row = json?.[id];
      const price = Number(row?.usd);
      const change = Number(row?.usd_24h_change);
      if (!Number.isFinite(price)) return null;
      return { symbol: sym, price, change: Number.isFinite(change) ? change : 0, source: 'coingecko', _live: true };
    }).filter(Boolean);
  };

  const fmtNum = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '--';
    return x.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };
  const now = () => new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fallbackBySegment = {
    indices: [{ symbol: 'Nifty 50', price: 22819.60, change: -0.86 }, { symbol: 'Nifty Bank', price: 52274.60, change: -2.67 }, { symbol: 'Sensex', price: 75124.28, change: -0.61 }, { symbol: 'Nifty Midcap', price: 50874.22, change: 0.33 }, { symbol: 'Nifty IT', price: 36942.90, change: 0.58 }, { symbol: 'Nifty Auto', price: 21984.42, change: -0.22 }, { symbol: 'Nifty Pharma', price: 20114.80, change: 0.47 }, { symbol: 'Nifty PSU Bank', price: 7124.10, change: 1.11 }],
    stocksOptions: [{ symbol: 'RELIANCE', price: 2940.25, change: 0.42 }, { symbol: 'HDFCBANK', price: 1622.40, change: -0.18 }, { symbol: 'ICICIBANK', price: 1114.85, change: 0.44 }, { symbol: 'INFY', price: 1528.35, change: -0.27 }, { symbol: 'TCS', price: 4012.60, change: 0.13 }, { symbol: 'SBIN', price: 768.10, change: 0.76 }, { symbol: 'BHARTIARTL', price: 1279.95, change: -0.06 }, { symbol: 'LT', price: 3721.55, change: 0.22 }, { symbol: 'KOTAKBANK', price: 1762.30, change: 0.31 }, { symbol: 'AXISBANK', price: 1112.40, change: -0.11 }],
    bonds: [{ symbol: 'India 10Y G-Sec', price: 100.15, change: -0.04, yield: 7.12 }, { symbol: 'India 5Y G-Sec', price: 99.74, change: 0.03, yield: 7.03 }, { symbol: 'India 14Y G-Sec', price: 98.88, change: -0.02, yield: 7.20 }, { symbol: 'SDL 2033', price: 97.61, change: 0.01, yield: 7.35 }, { symbol: 'T-Bill 364D', price: 99.22, change: 0.02, yield: 6.88 }, { symbol: 'Corp AAA 5Y', price: 101.07, change: 0.00, yield: 7.54 }],
    currency: [{ symbol: 'USDINR', price: 86.42, change: 0.08, open: 86.35, high: 86.58, low: 86.28, prev: 86.35, volume: 2541200 }, { symbol: 'EURINR', price: 93.88, change: -0.11, open: 94.00, high: 94.15, low: 93.72, prev: 93.99, volume: 1718800 }, { symbol: 'GBPINR', price: 110.42, change: -0.09, open: 110.52, high: 110.68, low: 110.24, prev: 110.52, volume: 1185400 }, { symbol: 'JPYINR', price: 0.574, change: 0.06, open: 0.571, high: 0.576, low: 0.569, prev: 0.571, volume: 987200 }, { symbol: 'USDJPY', price: 150.62, change: -0.18, open: 150.90, high: 151.05, low: 150.44, prev: 150.90, volume: 3189000 }, { symbol: 'EURUSD', price: 1.086, change: 0.14, open: 1.082, high: 1.088, low: 1.080, prev: 1.084, volume: 2974300 }, { symbol: 'GBPUSD', price: 1.278, change: -0.07, open: 1.281, high: 1.283, low: 1.276, prev: 1.280, volume: 2641200 }, { symbol: 'DXY', price: 103.84, change: -0.12, open: 103.98, high: 104.10, low: 103.72, prev: 103.96, volume: 1455500 }, { symbol: 'USDCNH', price: 7.235, change: 0.04, open: 7.230, high: 7.242, low: 7.226, prev: 7.231, volume: 1320800 }, { symbol: 'AUDUSD', price: 0.628, change: 0.10, open: 0.625, high: 0.631, low: 0.622, prev: 0.627, volume: 1193000 }],
    commodities: [
      { symbol: 'MCX Gold (10g)', price: 75240.00, change: 0.45, open: 74980, high: 75450, low: 74820, prev: 74904, volume: 152000 },
      { symbol: 'MCX Silver (kg)', price: 92450.00, change: 0.82, open: 91800, high: 92800, low: 91500, prev: 91700, volume: 84000 },
      { symbol: 'MCX Crude (bbl)', price: 6840.00, change: -0.21, open: 6855, high: 6890, low: 6810, prev: 6855, volume: 312000 },
      { symbol: 'MCX NatGas', price: 184.50, change: -1.45, open: 187.20, high: 188.00, low: 183.50, prev: 187.20, volume: 220000 },
      { symbol: 'Brent Oil ($)', price: 82.45, change: 0.25, open: 82.10, high: 82.80, low: 81.90, prev: 82.25, volume: 167000 },
      { symbol: 'WTI Oil ($)', price: 78.12, change: -0.15, open: 78.25, high: 78.50, low: 77.90, prev: 78.24, volume: 152000 },
      { symbol: 'Spot Gold ($)', price: 2412.50, change: 0.35, open: 2404.10, high: 2418.40, low: 2402.20, prev: 2404.10, volume: 95000 },
      { symbol: 'Copper (MCX)', price: 845.20, change: 0.55, open: 840.10, high: 848.50, low: 838.20, prev: 840.60, volume: 45000 },
      { symbol: 'Aluminium (LME)', price: 2450.00, change: -0.30, open: 2465.00, high: 2470.00, low: 2440.00, prev: 2457.00, volume: 32000 },
      { symbol: 'Cotton (MCX)', price: 58400.00, change: 0.12, open: 58300, high: 58600, low: 58200, prev: 58330, volume: 12000 }
    ],
    crypto: [{ symbol: 'BTCUSDT', price: 68245.20, change: 1.12, open: 67420.40, high: 68780.00, low: 66995.30, prev: 67490.10, volume: 31245000 }, { symbol: 'ETHUSDT', price: 3540.60, change: 0.88, open: 3498.10, high: 3574.80, low: 3460.20, prev: 3509.70, volume: 19832000 }, { symbol: 'BNBUSDT', price: 612.20, change: 0.64, open: 605.30, high: 615.90, low: 602.40, prev: 608.31, volume: 6234000 }, { symbol: 'SOLUSDT', price: 178.45, change: 1.94, open: 171.10, high: 180.80, low: 169.90, prev: 175.05, volume: 11287000 }, { symbol: 'XRPUSDT', price: 0.63, change: -0.42, open: 0.64, high: 0.65, low: 0.62, prev: 0.63, volume: 8432000 }, { symbol: 'DOGEUSDT', price: 0.15, change: 0.31, open: 0.15, high: 0.16, low: 0.15, prev: 0.15, volume: 7391000 }, { symbol: 'ADAUSDT', price: 0.61, change: -0.19, open: 0.61, high: 0.62, low: 0.60, prev: 0.61, volume: 5284000 }, { symbol: 'MATICUSDT', price: 0.94, change: 0.27, open: 0.93, high: 0.95, low: 0.92, prev: 0.94, volume: 4921000 }, { symbol: 'AVAXUSDT', price: 41.22, change: 1.35, open: 39.88, high: 41.94, low: 39.42, prev: 40.67, volume: 3812000 }, { symbol: 'DOTUSDT', price: 8.76, change: 0.58, open: 8.62, high: 8.81, low: 8.55, prev: 8.71, volume: 2645000 }, { symbol: 'LTCUSDT', price: 92.31, change: -0.24, open: 92.84, high: 93.70, low: 91.92, prev: 92.53, volume: 2198000 }, { symbol: 'LINKUSDT', price: 18.42, change: 0.77, open: 18.11, high: 18.66, low: 17.95, prev: 18.28, volume: 2419000 }],
  };
  const segmentTargetCount = { indices: 24, stocksOptions: 24, bonds: 12, currency: 12, commodities: 12, crypto: 20 };
  const padCards = (items, segmentKey) => {
    if (items.length > 0) return items;
    const target = segmentTargetCount[segmentKey] || 6;
    return (fallbackBySegment[segmentKey] || []).slice(0, target);
  };
  const renderCards = (el, items, segmentKey) => {
    const dedup = [];
    const seen = new Set();
    for (const it of items) {
      const k = String(it?.symbol || '').trim().toUpperCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      dedup.push(it);
    }
    items = padCards(dedup, segmentKey);
    const detailText = (c, key) => {
      const open = Number.isFinite(Number(c.open)) ? Number(c.open) : NaN;
      const high = Number.isFinite(Number(c.high)) ? Number(c.high) : NaN;
      const low = Number.isFinite(Number(c.low)) ? Number(c.low) : NaN;
      const vol = Number.isFinite(Number(c.volume)) ? Number(c.volume) : NaN;
      const yld = Number.isFinite(Number(c.yield)) ? Number(c.yield) : NaN;
      if (key === 'bonds') {
        if (Number.isFinite(yld)) return `Yield ${yld.toFixed(2)}%`;
        return Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) ? `O ${fmtNum(open)} · H ${fmtNum(high)} · L ${fmtNum(low)}` : 'Yield --';
      }
      const core = Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low)
        ? `O ${fmtNum(open)} · H ${fmtNum(high)} · L ${fmtNum(low)}`
        : `Vol ${Number.isFinite(vol) ? fmtNum(vol) : '--'}`;
      return core;
    };
    const detailText2 = (c, key) => {
      const prev = Number.isFinite(Number(c.prev)) ? Number(c.prev) : NaN;
      const vol = Number.isFinite(Number(c.volume)) ? Number(c.volume) : NaN;
      const high = Number.isFinite(Number(c.high)) ? Number(c.high) : NaN;
      const low = Number.isFinite(Number(c.low)) ? Number(c.low) : NaN;
      if (key === 'bonds') {
        return Number.isFinite(prev) ? `Prev ${fmtNum(prev)} · Δ ${Number(c.change || 0).toFixed(2)}%` : `Δ ${Number(c.change || 0).toFixed(2)}%`;
      }
      if (Number.isFinite(high) && Number.isFinite(low)) return `Range ${fmtNum(low)} - ${fmtNum(high)}`;
      return `Prev ${Number.isFinite(prev) ? fmtNum(prev) : '--'} · Vol ${Number.isFinite(vol) ? fmtNum(vol) : '--'}`;
    };
    const pricePrefix = (symbol, key) => {
      const s = String(symbol || '').toUpperCase();
      if (key === 'crypto') return '$';
      if (key === 'stocksOptions') return '₹';
      if (key === 'bonds') return '₹';
      if (key === 'indices') return '';
      if (key === 'currency') return '';
      if (key === 'commodities') {
        const up = s.toUpperCase();
        if (up.includes('XAU') || up.includes('XAG') || up.includes('BRENT') || up.includes('WTI') || up.includes('NYMEX') || up.includes('COMEX') || up.includes('LME') || up.includes('ICE') || s.includes('($)')) return '$';
        if (up.includes('MCX') || up.includes('NSE') || up.includes('BSE') || up.includes('GOLD') || up.includes('SILVER')) return '₹';
        return '₹';
      }
      return '';
    };
    const logoGlyph = (symbol, key) => {
      const s = String(symbol || '').toUpperCase();
      if (key === 'crypto') {
        if (s.includes('BTC')) return '₿';
        if (s.includes('ETH')) return 'Ξ';
        if (s.includes('SOL')) return '◎';
        if (s.includes('XRP')) return '✕';
      }
      if (key === 'indices') return '📈';
      if (key === 'bonds') return '🏛️';
      if (key === 'currency') return '💱';
      if (key === 'commodities') {
        if (s.includes('GOLD')) return '🟡';
        if (s.includes('SILVER')) return '⚪';
        if (s.includes('CRUDE') || s.includes('OIL')) return '🛢️';
        if (s.includes('GAS')) return '🔥';
        return '📦';
      }
      return '◌';
    };
    el.innerHTML = items.map((raw) => {
      const c = raw;
      const isUp = Number(c.change) >= 0;
      const sign = isUp ? '+' : '';
      const symbolText = String(c.symbol || '--').replace(/</g, '&lt;');
      const codeText = symbolText.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '--';
      return `
        <div class="market-row">
          <div class="market-top">
            <div class="market-head-left">
              <div class="market-logo">${logoGlyph(symbolText, segmentKey)}</div>
              <div class="market-symbol">${symbolText}</div>
            </div>
            <div class="market-status closed">Closed</div>
          </div>
          <div class="market-code">SYM ${codeText}</div>
          <div class="market-price">${pricePrefix(symbolText, segmentKey)}${fmtNum(c.price)}</div>
          <div class="market-change ${isUp ? 'up' : 'down'}">${sign}${Number(c.change || 0).toFixed(2)}%</div>
          <div class="market-extra">${detailText(c, segmentKey)}</div>
          <div class="market-extra2">${detailText2(c, segmentKey)}</div>
        </div>
      `;
    }).join('');
  };

  if (showLoading) skeletonEl.style.display = 'none';

  for (const base of [...new Set(candidates.map((u) => String(u).replace(/\/+$/, '')))]) {
    try {
      let qJson = null;
      const qRes = await withTimeout(fetch(`${base}/quotes?t=${Date.now()}`, { cache: 'no-store' }), 12000, 'upstox quotes');
      if (qRes.ok) qJson = await qRes.json();
      if (!qJson || !qJson.data || !Object.keys(qJson.data).length) {
        const gRes = await withTimeout(fetch(`${base}/global?t=${Date.now()}`, { cache: 'no-store' }), 12000, 'upstox global');
        if (gRes.ok) qJson = await gRes.json();
      }
      if (!qJson || !qJson.data || !Object.keys(qJson.data).length) continue;

      const segments = { indices: [], stocksOptions: [], bonds: [], currency: [], commodities: [], crypto: [] };
      const data = qJson?.data || {};
      const seenIngest = new Set();
      for (const [instrument, val] of Object.entries(data)) {
        const symbol = instrument.split(':')[1] || instrument.split('|')[1] || instrument;
        const keySym = String(symbol || '').trim().toUpperCase();
        if (!keySym || seenIngest.has(keySym)) continue;
        seenIngest.add(keySym);
        const last = Number(val?.last_price ?? val?.ltp ?? val?.ohlc?.close);
        const k = String(instrument).toUpperCase();
        const symU = String(symbol).toUpperCase();

        // [V6.6] Institutional Data Quality Guard: Purge suspicious values (e.g. Yahoo fallback in worker)
        if (k.includes('MCX')) {
          if (symU.includes('GOLD') && last < 30000) continue; // Discard per-gram or junk data
          if (symU.includes('SILVER') && last < 5000) continue;
          if (symU.includes('CRUDE') && last < 1000) continue;
        }

        const prev = Number(val?.ohlc?.close ?? val?.prev_close_price ?? 0);
        if (!Number.isFinite(last)) continue;
        const pct = prev ? ((last - prev) / prev) * 100 : 0;
        const card = { symbol, price: last, change: pct, open: Number(val?.ohlc?.open), high: Number(val?.ohlc?.high ?? val?.high), low: Number(val?.ohlc?.low ?? val?.low), prev: Number(val?.ohlc?.close ?? val?.prev_close_price), volume: Number(val?.volume ?? val?.vol ?? val?.total_volume), yield: Number(val?.yield ?? val?.ytm ?? val?.yield_to_maturity) };
        const isOption = /\b(CE|PE)\b/.test(symU) || symU.includes('OPT') || k.includes('OPTION');
        const isCrypto = k.includes('CRYPTO') || symU.includes('BTC') || symU.includes('ETH') || symU.includes('USDT') || symU.includes('SOL') || symU.includes('XRP') || symU.includes('DOGE');
        if (isCrypto) { segments.crypto.push(card); continue; }
        if (k.includes('INDEX') || symbol.toUpperCase().includes('NIFTY')) segments.indices.push(card);
        else if (k.includes('BSE_DEBT') || k.includes('NSE_DEBT') || k.includes('NSE_BD') || symbol.includes('GSEC') || symbol.includes('BOND')) segments.bonds.push(card);
        else if (k.includes('CDS') || k.startsWith('NSE_CDS') || k.startsWith('BSE_CDS')) segments.currency.push(card);
        else if (k.includes('MCX') || k.startsWith('NSE_COM') || k.startsWith('BSE_COM')) segments.commodities.push(card);
        else if (!isOption) segments.stocksOptions.push(card);
      }
      const hasAny = Object.values(segments).some((arr) => arr.length);
      if (!hasAny) continue;
      try {
        if (cryptoCache && (Date.now() - cryptoCacheAt) < CRYPTO_CACHE_TTL) {
          segments.crypto = cryptoCache;
        } else {
          const cryptoRows = await loadCryptoFromCoinGecko();
          if (cryptoRows.length) { cryptoCache = cryptoRows; cryptoCacheAt = Date.now(); segments.crypto = cryptoRows; }
        }
      } catch (_) {}
      renderCards(segmentIndices, segments.indices.slice(0, 30), 'indices');
      renderCards(segmentStocksOptions, segments.stocksOptions.slice(0, 30), 'stocksOptions');
      renderCards(segmentBonds, segments.bonds.slice(0, 16), 'bonds');
      renderCards(segmentCurrency, segments.currency.slice(0, 16), 'currency');
      renderCards(segmentCommodities, segments.commodities.slice(0, 16), 'commodities');
      renderCards(segmentCrypto, segments.crypto.slice(0, 20), 'crypto');
      skeletonEl.style.display = 'none';
      segmentIndices.dataset.loaded = '1';
      updatedEl.textContent = `Updated: ${now()}`;
      return true;
    } catch (_) {}
  }

  if (!segmentIndices.dataset.loaded) {
    renderCards(segmentIndices, [], 'indices');
    renderCards(segmentStocksOptions, [], 'stocksOptions');
    renderCards(segmentBonds, [], 'bonds');
    renderCards(segmentCurrency, [], 'currency');
    renderCards(segmentCommodities, [], 'commodities');
    renderCards(segmentCrypto, [], 'crypto');
    segmentIndices.dataset.loaded = '1';
  }
  skeletonEl.style.display = 'none';
  updatedEl.textContent = `Updated: ${now()}`;
  return false;
}

async function loadIndiaCalendarData() {
  const listEl = document.getElementById('indiaCalendarList');
  const chipEl = document.getElementById('indiaFeedChip');
  const metaEl = document.getElementById('indiaCalendarMeta');
  const analysisEl = document.getElementById('indiaCalendarAnalysis');
  const summaryEl = document.getElementById('indiaCalendarSummary');
  const snapshotEl = document.getElementById('indiaCalendarSnapshot');
  const probChartEl = document.getElementById('indiaProbChart');
  const inrGaugeChartEl = document.getElementById('indiaInrGaugeChart');
  const inrGaugeNoteEl = document.getElementById('indiaInrGaugeNote');
  const sectorChartEl = document.getElementById('indiaSectorChart');
  const explainEl = document.getElementById('indiaDeskExplain');
  const qoqTitleEl = document.getElementById('indiaQoqTitle');
  const qoqChartEl = document.getElementById('indiaQoqChart');
  const headerDateTimeEl = document.getElementById('indiaHeaderDateTime');
  if (!listEl || !chipEl || !metaEl || !analysisEl || !summaryEl || !snapshotEl || !probChartEl || !inrGaugeChartEl || !inrGaugeNoteEl || !sectorChartEl || !explainEl || !qoqTitleEl || !qoqChartEl || !headerDateTimeEl) return false;

  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fmtDate = (raw) => {
    const d = raw ? new Date(raw) : null;
    if (!d || Number.isNaN(d.getTime())) return 'Date unavailable';
    return d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  const nowStamp = () => new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const headerStamp = () => new Date().toLocaleString('en-IN', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const indiaView = (e) => {
    const t = String(e.title || '').toLowerCase();
    if (t.includes('cpi') || t.includes('wpi') || t.includes('inflation')) return 'Analyst view: Inflation trajectory guides RBI reaction function, front-end yields, and rate-sensitive equity sectors. A print above forecast usually hardens rates expectations and can pressure duration-heavy pockets.';
    if (t.includes('rbi') || t.includes('policy') || t.includes('rate')) return 'Analyst view: RBI tone, vote split, and liquidity guidance can reprice the entire curve quickly. Watch immediate transmission to INR, banks, and high-beta rate plays.';
    if (t.includes('industrial') || t.includes('production') || t.includes('gdp')) return 'Analyst view: Growth momentum here affects cyclicals, capex themes, and earnings confidence. Upside surprises tend to support industrials, while misses can revive defensives.';
    if (t.includes('trade') || t.includes('current account')) return 'Analyst view: External-balance data informs INR stability and imported inflation risk. A wider deficit can increase currency sensitivity and hedging demand.';
    return 'Analyst view: Treat this as a cross-asset trigger; confirm reaction across INR, sovereign yields, banking leaders, and index breadth before positioning.';
  };
  const numFrom = (v) => {
    const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  const pctStr = (n) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
  const fmtNum = (n) => Number.isFinite(n) ? n.toFixed(2) : '--';
  const buildIndiaDeskMetrics = (events) => {
    let highCount = 0;
    let inflationSignal = 0;
    let growthSignal = 0;
    let extSignal = 0;
    let withForecast = 0;
    let datedEvents = 0;
    const sectorHits = { Banks: 0, Autos: 0, FMCG: 0, IT: 0, Metals: 0 };
    const surprises = [];

    for (const e of events) {
      const title = String(e.title || '').toLowerCase();
      const impact = String(e.impact || '').toLowerCase();
      if (impact.includes('high')) highCount += 1;
      const actual = numFrom(e.actual);
      const forecast = numFrom(e.forecast);
      if (Number.isFinite(actual) && Number.isFinite(forecast)) {
        withForecast += 1;
        surprises.push({ title: e.title, diff: actual - forecast });
      }
      const dt = new Date(e.date || e.Date || e.datetime || 0);
      if (!Number.isNaN(dt.getTime())) datedEvents += 1;

      if (title.includes('cpi') || title.includes('wpi') || title.includes('inflation')) inflationSignal += 1;
      if (title.includes('industrial') || title.includes('production') || title.includes('gdp') || title.includes('pmi')) growthSignal += 1;
      if (title.includes('trade') || title.includes('current account') || title.includes('fx reserves')) extSignal += 1;

      if (title.includes('rbi') || title.includes('policy') || title.includes('rate') || title.includes('cpi')) sectorHits.Banks += 1;
      if (title.includes('cpi') || title.includes('fuel') || title.includes('oil')) sectorHits.Autos += 1;
      if (title.includes('cpi') || title.includes('wpi') || title.includes('food')) sectorHits.FMCG += 1;
      if (title.includes('trade') || title.includes('inr') || title.includes('services')) sectorHits.IT += 1;
      if (title.includes('industrial') || title.includes('wpi') || title.includes('manufacturing')) sectorHits.Metals += 1;
    }

    const holdProb = Math.max(35, Math.min(80, 60 + (inflationSignal * 5) - (growthSignal * 3)));
    const cutProb = Math.max(5, Math.min(45, 100 - holdProb - Math.max(10, highCount * 2)));
    const hikeProb = Math.max(5, 100 - holdProb - cutProb);
    const inrPressure = (extSignal * 0.6 + inflationSignal * 0.4 - growthSignal * 0.2);
    const total = Math.max(events.length, 1);
    const confidence = Math.round(((withForecast / total) * 0.45 + (datedEvents / total) * 0.25 + (events.filter((e) => String(e.impact || '').trim().length > 0).length / total) * 0.15 + (Object.values(sectorHits).filter((v) => v > 0).length / 5) * 0.15) * 100);
    surprises.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const topSurprises = surprises.slice(0, 3);
    const topSector = Object.entries(sectorHits).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Banks';
    const regimeTag = inflationSignal >= growthSignal + 1 ? 'Inflation-Led' : growthSignal >= inflationSignal + 1 ? 'Growth-Led' : 'Balanced';
    const thresholdAlert = highCount >= 4 ? 'High alert: cluster of high-impact events this cycle.' : highCount >= 2 ? 'Moderate alert: keep tighter intraday risk around release windows.' : 'Low alert: normal macro cadence expected.';
    const breadth = surprises.length ? `${surprises.filter((s) => s.diff > 0).length} positive vs ${surprises.filter((s) => s.diff < 0).length} negative surprises` : 'No surprise breadth yet';
    return { holdProb, cutProb, hikeProb, inrPressure, confidence, topSector, topSurprises, sectorHits, regimeTag, thresholdAlert, breadth };
  };
  const quarterLabel = (ts) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'Q? ----';
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `Q${q} ${d.getFullYear()}`;
  };
  const normalizeEventTitle = (s) => String(s || '').toLowerCase().replace(/\b(y\/y|m\/m|q\/q)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const canonicalIndiaEventKey = (title) => {
    const t = normalizeEventTitle(title);
    if (t.includes('cpi') || t.includes('consumer price')) return 'india-cpi';
    if (t.includes('wpi') || t.includes('wholesale price')) return 'india-wpi';
    if (t.includes('industrial production') || t.includes('iip')) return 'india-iip';
    if (t.includes('trade balance')) return 'india-trade-balance';
    if (t.includes('services pmi')) return 'india-services-pmi';
    if (t.includes('manufacturing pmi')) return 'india-manufacturing-pmi';
    if (t.includes('rbi') && (t.includes('policy') || t.includes('rate') || t.includes('repo'))) return 'rbi-policy-rate';
    return t.split(' ').slice(0, 4).join(' ');
  };
  const eventSeriesValue = (e) => {
    const a = numFrom(e.actual);
    if (Number.isFinite(a)) return a;
    const f = numFrom(e.forecast);
    if (Number.isFinite(f)) return f;
    const p = numFrom(e.previous);
    if (Number.isFinite(p)) return p;
    return NaN;
  };
  const nextQuarterTs = (ts) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return Date.now();
    const qStartMonth = Math.floor(d.getMonth() / 3) * 3;
    const qStart = new Date(d.getFullYear(), qStartMonth, 1).getTime();
    return qStart + (91 * 24 * 3600 * 1000);
  };
  const buildQoqHistorySeries = (event, allEvents) => {
    const titleKey = canonicalIndiaEventKey(event.title);
    const nowTs = Date.now();
    const oneYearAgo = nowTs - (365 * 24 * 3600 * 1000);
    const related = allEvents.filter((e) => {
      const t = canonicalIndiaEventKey(e.title);
      return t === titleKey || t.includes(titleKey) || titleKey.includes(t);
    }).map((e) => {
      const ts = new Date(e.date || e.Date || e.datetime || 0).getTime();
      return { ts, value: eventSeriesValue(e) };
    }).filter((x) => Number.isFinite(x.ts) && Number.isFinite(x.value) && x.ts >= oneYearAgo && x.ts <= nowTs).sort((a, b) => a.ts - b.ts);
    const byQuarter = new Map();
    for (const row of related) byQuarter.set(quarterLabel(row.ts), row);
    let history = Array.from(byQuarter.entries()).map(([label, row]) => ({ label, value: row.value, ts: row.ts }));
    history.sort((a, b) => a.ts - b.ts);
    history = history.slice(-4);
    if (!history.length) {
      const currTs = new Date(event.date || nowTs).getTime();
      const prev = numFrom(event.previous);
      const act = numFrom(event.actual);
      if (Number.isFinite(prev)) history.push({ ts: currTs - (91 * 24 * 3600 * 1000), value: prev, label: quarterLabel(currTs - (91 * 24 * 3600 * 1000)) });
      if (Number.isFinite(act)) history.push({ ts: currTs, value: act, label: quarterLabel(currTs) });
      else if (Number.isFinite(prev)) history.push({ ts: currTs, value: prev, label: quarterLabel(currTs) });
    }
    const fcst = numFrom(event.forecast);
    let forecastPoint = null;
    if (Number.isFinite(fcst) && history.length) {
      const baseTs = history[history.length - 1].ts;
      const forecastTs = nextQuarterTs(baseTs);
      forecastPoint = { label: `${quarterLabel(forecastTs)}F`, value: fcst, ts: forecastTs, forecast: true };
    }
    return { history, forecastPoint };
  };
  const renderQoqGoogleChart = (history, forecastPoint) => {
    if (!window.google || !window.google.visualization) return false;
    qoqChartEl.innerHTML = '<div id="indiaQoqGoogleChart" style="width:100%;height:190px"></div>';
    qoqChartEl.style.height = '220px';
    qoqChartEl.style.maxHeight = '220px';
    const chartEl = document.getElementById('indiaQoqGoogleChart');
    if (!chartEl) return false;
    if (indiaQoqChart) indiaQoqChart.clearChart();
    const hasForecast = !!forecastPoint;
    const cols = [{ type: 'string', label: 'Quarter' }, { type: 'number', label: 'Historical' }, { type: 'string', role: 'annotation' }, ...(hasForecast ? [{ type: 'number', label: 'Forecast' }] : [])];
    const rows = history.map((pt) => {
      const row = [pt.label, pt.value, String(pt.value.toFixed(2))];
      if (hasForecast) row.push(null);
      return row;
    });
    if (hasForecast) {
      rows[rows.length - 1][rows[rows.length - 1].length - 1] = history[history.length - 1].value;
      rows.push([forecastPoint.label, null, null, forecastPoint.value]);
    }
    const dataTable = new google.visualization.DataTable();
    cols.forEach((c) => dataTable.addColumn(c));
    dataTable.addRows(rows);
    const options = { ...window.CHART_THEME, chartArea: { ...window.CHART_THEME.chartArea, left: 60 }, series: { 0: { color: '#BFA100', areaOpacity: 0.1, lineWidth: 3 }, ...(hasForecast ? { 1: { color: '#FFB800', lineDashStyle: [4, 4], pointSize: 5 } } : {}) }, hAxis: { ...window.CHART_THEME.hAxis, title: 'Quarterly Period' }, vAxis: { ...window.CHART_THEME.vAxis, title: 'Institutional Delta %' } };
    indiaQoqChart = new google.visualization.AreaChart(chartEl);
    indiaQoqChart.draw(dataTable, options);
    return true;
  };
  const renderQoq = (event) => {
    const { history, forecastPoint } = buildQoqHistorySeries(event, indiaCalendarHistoryRaw);
    if (!history.length) {
      qoqTitleEl.textContent = `India QoQ Historical Trend · ${event.title || 'Selected Event'}`;
      qoqChartEl.innerHTML = '<div class="calendar-empty">No numeric values available for this event.</div>';
      return;
    }
    qoqTitleEl.textContent = `India QoQ Historical Trend · ${event.title || 'Selected Event'}`;
    renderQoqGoogleChart(history, forecastPoint);
  };

  const render = () => {
    const events = indiaCalendarRaw.slice();
    headerDateTimeEl.textContent = `Date/Time: ${headerStamp()}`;
    summaryEl.textContent = `Summary: ${events.length} India events tracked`;
    const topImpact = events.filter((e) => String(e.impact || '').toLowerCase().includes('high')).length;
    analysisEl.textContent = `Analyst view: ${topImpact} high-impact India releases are on radar; prioritize CPI/RBI prints for rate-sensitive positioning.`;
    const m = buildIndiaDeskMetrics(events);
    const surpriseText = m.topSurprises.length ? m.topSurprises.map((s) => `${s.title}: ${s.diff > 0 ? '+' : ''}${s.diff.toFixed(2)}`).join(' | ') : 'No actual-vs-forecast pairs yet';
    const focusEvents = events.filter((e) => String(e.title || '').trim().length > 0).slice(0, 6).map((e) => esc(e.title)).join(' · ') || 'No event names available';
    const eventDescriptionFor = (title) => {
      const t = String(title || '').toLowerCase();
      if (t.includes('cpi') || t.includes('inflation')) return 'Tracks retail inflation pressure and directly affects RBI policy expectations, short-end yields, and rate-sensitive sectors.';
      if (t.includes('wpi')) return 'Measures producer-level price pressure and helps anticipate margin trends and pass-through risks across manufacturing-heavy sectors.';
      if (t.includes('industrial') || t.includes('production') || t.includes('iip')) return 'Captures output momentum and informs growth-sensitive positioning across industrials, metals, and capex-linked names.';
      if (t.includes('trade balance') || t.includes('current account')) return 'Signals external-balance stress and potential INR volatility via import bill dynamics and dollar demand.';
      if (t.includes('services pmi') || t.includes('manufacturing pmi')) return 'Shows business activity breadth; sustained expansion supports earnings confidence and cyclical participation.';
      if (t.includes('rbi') || t.includes('policy') || t.includes('repo') || t.includes('rate')) return 'Defines policy stance, liquidity conditions, and rate-path signaling that can reprice bonds, banks, and the INR quickly.';
      if (t.includes('gdp')) return 'Broad growth anchor for earnings expectations, valuation multiples, and medium-term risk appetite.';
      return 'Cross-asset macro trigger: validate with bond yields, INR trend, and sector breadth before scaling risk.';
    };
    const keyEventDetails = events.filter((e) => String(e.title || '').trim().length > 0).slice(0, 5).map((e) => `<div><b>${esc(e.title)}:</b> ${eventDescriptionFor(e.title)}</div>`).join('') || '<div><b>Key Event Notes:</b> waiting for event descriptions.</div>';
    snapshotEl.innerHTML = `
      <div class="snap-row"><span>Window:</span> <b>${events.length} India events tracked</b></div>
      <div class="snap-row"><span>Policy Regime:</span> <b>${m.regimeTag}</b></div>
      <div class="snap-row"><span>RBI Probability:</span> <b>Hold ${m.holdProb}% · Hike ${m.hikeProb}% · Cut ${m.cutProb}%</b></div>
      <div class="snap-row"><span>INR Pressure:</span> <b>${pctStr(m.inrPressure)} (${m.inrPressure >= 0 ? 'depreciation bias' : 'stability bias'})</b></div>
      <div class="snap-row"><span>Sector Impact:</span> <b>Top sensitivity in ${m.topSector}</b></div>
      <div class="snap-row"><span>Surprise Tracker:</span> <b>${surpriseText}</b></div>
      <div class="snap-row"><span>Confidence Score:</span> <b>${m.confidence}/100 quality</b></div>
    `;
    explainEl.innerHTML = `
      <div><b>How To Read</b></div>
      <div><b>Rates Lens:</b> RBI Probability combines inflation, growth, and event-density signals to estimate hold/hike/cut bias. Use it with CPI, WPI, and policy events to frame near-term rates direction.</div>
      <div><b>FX Lens:</b> INR Pressure above zero implies depreciation bias; below zero implies stability/appreciation bias. Confirm with trade-balance and external-flow releases before increasing FX conviction.</div>
      <div><b>Sector Lens:</b> Sector Impact maps where event clusters are likely to transmit first. Banks and Autos react faster to rates/inflation, while IT and Metals are more exposed to currency and growth swings.</div>
      <div><b>Data Quality Lens:</b> Confidence Score reflects forecast, impact, date, and coverage completeness. Higher confidence means stronger signal reliability; lower confidence means treat signals as directional, not absolute.</div>
      <div><b>Execution Lens:</b> Align event surprises with confirmation from yield moves, INR direction, and index breadth to avoid single-print false positives.</div>
      <div><b>Key Events In Focus:</b> ${focusEvents}</div>
      <div><b>Key Event Breakdown</b></div>
      ${keyEventDetails}
    `;
    if (window.google && google.visualization) {
      const probData = google.visualization.arrayToDataTable([['Scenario', 'Probability'], ['Hold', m.holdProb], ['Hike', m.hikeProb], ['Cut', m.cutProb]]);
      new google.visualization.ColumnChart(document.getElementById('indiaProbChart')).draw(probData, { ...window.CHART_THEME, hAxis: { ...window.CHART_THEME.hAxis, title: 'Policy Catalyst' }, vAxis: { ...window.CHART_THEME.vAxis, title: 'Confidence %' }, legend: { position: 'top', alignment: 'center' } });
      const inrData = google.visualization.arrayToDataTable([['Label', 'Value'], ['INR Stress', Math.max(0, 50 + (m.inrPressure * 10))]]);
      new google.visualization.Gauge(document.getElementById('indiaInrGaugeChart')).draw(inrData, { width: 120, height: 120, redFrom: 70, redTo: 100, yellowFrom: 40, yellowTo: 70, minorTicks: 5, greenColor: '#BFA100', yellowColor: '#FFB800', redColor: '#ef4444' });
      const sectorData = google.visualization.arrayToDataTable([['Sector', 'Sensitivity'], ...Object.entries(m.sectorHits).map(([k, v]) => [k, v])]);
      new google.visualization.BarChart(document.getElementById('indiaSectorChart')).draw(sectorData, { 
        ...window.CHART_THEME, 
        chartArea: { ...window.CHART_THEME.chartArea, left: 90, width: '70%' },
        hAxis: { ...window.CHART_THEME.hAxis, title: 'Institutional Exposure Score' }, 
        vAxis: { ...window.CHART_THEME.vAxis, title: 'Sector High-Density Vertical' }, 
        legend: { position: 'top', alignment: 'center' } 
      });
    }
    const gaugePct = Math.max(0, Math.min(100, 50 + (m.inrPressure * 10)));
    inrGaugeNoteEl.textContent = `Stress Score: ${pctStr(m.inrPressure)} (${gaugePct >= 60 ? 'Downside Risk' : gaugePct <= 40 ? 'Stability Bias' : 'Neutral Corridor'})`;
    listEl.innerHTML = events.map((e, idx) => `
      <li class="calendar-item india-event-card" data-india-idx="${idx}">
        <div class="calendar-item-head">
          <span class="calendar-country">${esc(e.country || 'IND')}</span>
          <span class="calendar-impact">${esc(e.impact || 'High')}</span>
        </div>
        <span class="calendar-title">${esc(e.title || 'Untitled event')}<span class="calendar-view">${esc(indiaView(e))}</span></span>
        <span class="calendar-date">${fmtDate(e.date || e.Date || e.datetime)}</span>
        <div class="calendar-points">
          <div class="calendar-point"><div class="calendar-point-label">Actual</div><div class="calendar-point-value">${esc(e.actual || 'Pending')}</div></div>
          <div class="calendar-point"><div class="calendar-point-label">Forecast</div><div class="calendar-point-value">${esc(e.forecast || '--')}</div></div>
          <div class="calendar-point"><div class="calendar-point-label">Previous</div><div class="calendar-point-value">${esc(e.previous || '--')}</div></div>
        </div>
      </li>
    `).join('') || '<li class="calendar-empty">No India events available.</li>';
    listEl.querySelectorAll('.india-event-card').forEach((node) => {
      node.style.cursor = 'pointer';
      node.addEventListener('click', () => {
        const idx = Number(node.getAttribute('data-india-idx'));
        const ev = events[idx];
        if (ev) renderQoq(ev);
      });
    });
    if (events.length) renderQoq(events[0]);
  };

  const candidates = [ENDPOINTS.upstox];
  for (const base of candidates) {
    try {
      const res = await withTimeout(fetch(`${base}/calendar-india`), 12000, 'india calendar worker');
      if (!res.ok) continue;
      const json = await res.json();
      const raw = (json?.events || []);
      if (!raw.length) continue;
      const now = Date.now();
      const hydrated = raw.map((e, i) => {
        const t = new Date(e.date || e.Date || e.datetime || 0).getTime();
        const ts = Number.isFinite(t) && t > 0 ? t : now + ((i + 1) * 6 * 3600 * 1000);
        return { ...e, __ts: ts, date: e.date || new Date(ts).toISOString() };
      });
      const sortedAll = hydrated.slice().sort((a, b) => a.__ts - b.__ts);
      indiaCalendarHistoryRaw = sortedAll.slice();
      const deduped = [];
      const seen = new Set();
      for (const ev of sortedAll) {
        const key = canonicalIndiaEventKey(ev.title);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(ev);
      }
      indiaCalendarRaw = deduped;
      chipEl.textContent = 'Live';
      headerDateTimeEl.textContent = `Date/Time: ${headerStamp()}`;
      metaEl.textContent = `Source: India Macro Feed · Events: ${indiaCalendarRaw.length} · Updated: ${nowStamp()}`;
      render();
      return true;
    } catch (_) {}
  }
  chipEl.classList.add('down');
  chipEl.textContent = 'Down';
  headerDateTimeEl.textContent = `Date/Time: ${headerStamp()}`;
  return false;
}

function initForexCalendarControls() {
  const refreshEl = document.getElementById('forexCalendarRefresh');
  const filterEl = document.getElementById('forexCalendarCountryFilter');
  const titleFilterEl = document.getElementById('forexCalendarTitleFilter');
  const impactEl = document.getElementById('forexCalendarImpactFilter');
  const sortEl = document.getElementById('forexCalendarSort');
  const limitEl = document.getElementById('forexCalendarLimit');
  const tzEl = document.getElementById('forexCalendarTimezone');
  if (!refreshEl || !filterEl || !titleFilterEl || !impactEl || !sortEl || !limitEl || !tzEl) return;
  if (!refreshEl.dataset.bound) {
    refreshEl.dataset.bound = '1';
    const refilter = () => { if (applyForexFiltersGlobal) applyForexFiltersGlobal(); else loadForexFactoryData().catch(() => false); };
    refreshEl.addEventListener('click', () => loadForexFactoryData().catch(() => false));
    filterEl.addEventListener('input', refilter);
    titleFilterEl.addEventListener('input', refilter);
    impactEl.addEventListener('change', refilter);
    sortEl.addEventListener('change', refilter);
    limitEl.addEventListener('change', refilter);
    tzEl.addEventListener('change', refilter);
  }
}



window.toggleTheme = () => {
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  document.getElementById('themeBtn').textContent = isLight ? '🌙' : '☀️';
  localStorage.setItem('bpTheme', isLight ? 'light' : 'dark');
};
if (localStorage.getItem('bpTheme') === 'light') {
  document.body.classList.add('light');
  document.getElementById('themeBtn').textContent = '🌙';
}

async function initAuth() {
  try {
    const res = await api.auth.me();
    initIntelHub();
    const slot = document.getElementById('navAuthSlot');
    const footerLink = document.getElementById('footerAuthLink');
    if (!res.authenticated) {
      indexUserIsAdmin = false;
      slot.innerHTML = `<a href="login.html" class="nav-cta">Login</a>`;
      footerLink.textContent = 'Login'; footerLink.href = 'login.html';
      return;
    }
    const user = res.user;
    const isAdmin = user.role === 'admin' || user.email === 'abhishekdutta1996@gmail.com';
    indexUserIsAdmin = isAdmin;
    if (isAdmin) {
      slot.innerHTML = `<div class="nav-user" id="navUserBtn" onclick="toggleDropdown()"><div class="nav-avatar">${user.photoURL ? `<img src="${user.photoURL}" alt="" />` : (user.displayName || user.email || 'A')[0].toUpperCase()}</div><a href="admin.html" class="nav-admin-tag">Admin</a><div class="nav-dropdown" id="navDropdown"><a href="admin.html">Dashboard</a><button onclick="doSignOut()">Sign Out</button></div></div>`;
      footerLink.textContent = 'Admin Dashboard'; footerLink.href = 'admin.html';
    } else {
      const displayName = user.displayName || user.email?.split('@')[0] || 'User';
      slot.innerHTML = `<div class="nav-user" id="navUserBtn" onclick="toggleDropdown()"><div class="nav-avatar">${user.photoURL ? `<img src="${user.photoURL}" alt="" />` : displayName[0].toUpperCase()}</div><span class="nav-user-name">${displayName}</span><div class="nav-dropdown" id="navDropdown"><a href="dashboard.html">My Account</a><button onclick="doSignOut()">Sign Out</button></div></div>`;
      footerLink.textContent = 'My Account'; footerLink.href = 'dashboard.html';
    }
  } catch (err) { console.warn('Auth check failed:', err); }
}
initAuth();

window.toggleMobileMenu = () => {
  document.getElementById('navLinksMenu')?.classList.toggle('mobile-open');
};

window.toggleDropdown = () => document.getElementById('navDropdown')?.classList.toggle('open');
document.addEventListener('click', e => { if (!e.target.closest('#navUserBtn')) document.getElementById('navDropdown')?.classList.remove('open'); });
window.doSignOut = async () => { await api.auth.logout(); window.location.reload(); };

function isBloombergPost(post) {
  if (!post) return false;
  const haystack = [post.authorName, post.authorEmail, post.source, post.publisher, post.publication, post.origin, post.title].map(v => String(v || '')).join(' ');
  return /bloomberg/i.test(haystack);
}

function postEpochMs(post) {
  if (!post) return 0;
  const rawTs = post.timestamp;
  if (typeof rawTs === 'number' && Number.isFinite(rawTs)) return rawTs > 1e12 ? rawTs : rawTs * 1000;
  if (typeof rawTs === 'string') {
    const parsed = Date.parse(rawTs);
    if (Number.isFinite(parsed)) return parsed;
    const n = Number(rawTs);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  }
  return 0;
}

function formatPostDate(post) {
  const ms = postEpochMs(post);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function normalizeViews(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function safePostId(id) { return encodeURIComponent(String(id || '')); }

async function loadPosts() {
  try {
    const hybridPosts = await loadHybridPosts();
    const filtered = hybridPosts.filter(p => !isBloombergPost(p));
    const seenIds = new Set();
    const seenTitles = new Set();
    
    allPosts = filtered.filter(p => {
      const id = String(p.id || '');
      const title = (p.title || '').trim().toLowerCase();
      
      if (seenIds.has(id)) return false;
      if (title && seenTitles.has(title)) return false;
      
      seenIds.add(id);
      if (title) seenTitles.add(title);
      return true;
    }).sort((a, b) => postEpochMs(b) - postEpochMs(a));
    const postCountEl = document.getElementById('postCount');
    if (postCountEl) postCountEl.textContent = allPosts.length;
    const postsTitleEl = document.getElementById('postsTitle');
    if (postsTitleEl) postsTitleEl.textContent = indexUserIsAdmin ? 'Institutional Strategic Ledger' : 'Recent Market Pulses (Last 3 Generations)';
    const firestorePosts = allPosts.filter(p => !p.isAI);
    const totalViews = firestorePosts.reduce((sum, p) => sum + normalizeViews(p.views), 0);
    const tvEl = document.getElementById('totalViewCount');
    if (tvEl) tvEl.textContent = fmtViews(totalViews);
    renderPosts(currentCat === 'all' ? allPosts : allPosts.filter(p => p.category === currentCat));
    
    // Hydrate Policy & Regulation with latest pulse
    const latestPulse = allPosts.find(p => p.isAI && (p.rbi || p.sebi));
    if (latestPulse) hydratePolicy(latestPulse);
    
    return true;
  } catch(err) {
    console.error('Error loading hybrid index:', err);
    return false;
  }
}

function renderPosts(posts) {
  const grid = document.getElementById('postsGrid');
  const safePosts = (posts || []).filter(p => !isBloombergPost(p));
  if (!safePosts.length) { renderEmpty(); return; }
  const esc = (s) => {
    let raw = (s || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/@font-face[\s\S]*?}/gi, '')
      .replace(/:root\s*\{[\s\S]*?\}?/gi, '') // Handle partial :root blocks
      .replace(/[a-zA-Z0-9_-]+\s*\{[\s\S]*?\}?/gi, '') // Handle partial CSS class blocks
      .replace(/--[a-zA-Z0-9-]+\s*:\s*[^;]+;/gi, ''); // Strip CSS variables
    return DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  };
  grid.innerHTML = safePosts.map((p, i) => {
    const title = esc(p.title || 'Untitled');
    const excerpt = esc(p.excerpt || 'No summary available.');
    const category = esc(p.category) || 'General';
    const isStrategic = p.category === 'Strategic Research';
    const catClass = isStrategic ? 'post-category strategic' : 'post-category';
    const author = esc(p.authorName || (p.authorEmail ? String(p.authorEmail).split('@')[0] : '') || 'BlogsPro');
    const rawImage = imagesEnabled ? DOMPurify.sanitize(String(p.image || '').trim()) : '';
    const image = (/^https?:\/\//i.test(rawImage) && rawImage !== 'null' && rawImage !== 'undefined' && rawImage !== '[object Object]' && !/^javascript:/i.test(rawImage)) ? rawImage : '';
    const date = formatPostDate(p);
    const postId = safePostId(p.id);
    const plainText = (p.content || '').replace(/<[^>]+>/g, ' ').trim();
    const readTime = Math.max(1, Math.ceil(plainText.split(/\s+/).filter(Boolean).length / 200));
    if (i === 0) {
      const visual = image ? `<div class="featured-visual featured-visual-img"><img src="${image}" alt="${title}" loading="lazy" onerror="this.closest('.featured-visual')?.remove(); this.closest('.post-card')?.classList.add('featured-no-img');" /></div>` : '';
      return `<div class="post-card featured${image ? '' : ' featured-no-img'}" onclick="openPostById('${postId}')" style="animation-delay:${i*0.08}s"><div class="featured-body"><span class="featured-badge">Featured</span><span class="${catClass}">${category}</span><h2 class="post-title">${title}</h2><p class="post-excerpt">${excerpt}</p><div class="post-meta"><span class="post-date">${date}</span><div style="display:flex;align-items:center;gap:0.75rem"><span class="post-date">By ${author}</span><span class="post-read-time">${readTime} min read</span><span class="post-views">&#128065; ${fmtViews(normalizeViews(p.views))}</span></div></div></div>${visual}</div>`;
    }
    return `<div class="post-card" onclick="openPostById('${postId}')" style="animation-delay:${i*0.08}s"><span class="${catClass}">${category}</span><h3 class="post-title">${title}</h3><p class="post-excerpt">${excerpt}</p><div class="post-meta"><span class="post-date">${date}</span><div style="display:flex;align-items:center;gap:0.75rem"><span class="post-date">By ${author}</span><span class="post-read-time">${readTime} min read</span><span class="post-views">&#128065; ${fmtViews(normalizeViews(p.views))}</span></div></div></div>`;
  }).join('');
}

function renderEmpty() {
  document.getElementById('postsGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">✍️</div><p>No articles yet. <a href="login.html" style="color:var(--gold)">Publish your first post →</a></p></div>`;
}

window.openPostById = async (encodedId) => {
  const id = decodeURIComponent(String(encodedId || ''));
  const post = allPosts.find(p => p.id === id);
  if (post && post.path) { window.location.href = post.path; return; }
  window.location.href = `post.html?id=${id}`;
};

// ── Search & Category Filter globals (called from inline onclick/oninput) ──
window.handleSearch = function(query) {
  const q = String(query || '').trim().toLowerCase();
  const filtered = allPosts.filter(p => {
    const inCat = currentCat === 'all' || (p.category || '').toLowerCase() === currentCat.toLowerCase();
    const inText = !q || (p.title || '').toLowerCase().includes(q) || (p.excerpt || '').toLowerCase().includes(q);
    return inCat && inText;
  });
  renderPosts(filtered);
};

window.filterByCategory = function(cat) {
  currentCat = String(cat || 'all').toLowerCase();
  
  // Update UI chips
  document.querySelectorAll('.filter-chip').forEach(b => {
    const chipText = b.textContent.trim().toLowerCase();
    b.classList.toggle('active', chipText === currentCat || (currentCat === 'all' && chipText === 'all'));
  });

  const searchVal = document.getElementById('postSearch')?.value?.trim().toLowerCase() || '';
  if (searchVal) {
    window.handleSearch(searchVal);
  } else {
    renderPosts(currentCat === 'all' ? allPosts : allPosts.filter(p => (p.category || '').toLowerCase() === currentCat));
  }
};

// Initialise filter chip listeners for robustness
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.cat || btn.textContent.trim();
    window.filterByCategory(cat);
  });
});


async function loadAbout() {
  const applyAboutDefaults = () => {
    document.getElementById('aboutDisplayName').textContent = 'BlogsPro';
    document.getElementById('aboutDisplayName2').textContent = 'Sharp insights for fintech practitioners.';
    document.getElementById('aboutDisplayTagline').textContent = 'Fintech Insights';
    document.getElementById('aboutDisplayBio').textContent = 'We publish practical fintech analysis, execution playbooks, and market breakdowns for builders and operators.';
    document.getElementById('aboutMissionWrap').style.display = 'none';
    const socials = document.getElementById('aboutSocials');
    if (socials) socials.innerHTML = '';
    const avatarImg = document.getElementById('aboutAvatarImg');
    const avatarInitial = document.getElementById('aboutAvatarInitial');
    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarInitial) { avatarInitial.textContent = 'B'; avatarInitial.style.display = 'flex'; }
  };
  try {
    const data = await api.public.data('site', 'about');
    if (!data) throw new Error("About document missing");
    const avatarImg = document.getElementById('aboutAvatarImg');
    const avatarInitial = document.getElementById('aboutAvatarInitial');
    if (data.avatarUrl) {
      avatarImg.src = data.avatarUrl;
      avatarImg.onerror = () => { avatarImg.style.display = 'none'; avatarInitial.style.display = 'flex'; };
      avatarImg.style.display = 'block';
      avatarInitial.style.display = 'none';
    } else {
      avatarInitial.textContent = (data.name || 'B')[0].toUpperCase();
      avatarImg.style.display = 'none';
      avatarInitial.style.display = 'flex';
    }
    document.getElementById('aboutDisplayName').textContent = data.name || 'BlogsPro';
    document.getElementById('aboutDisplayName2').textContent = data.heading || data.tagline || 'Sharp insights for fintech practitioners.';
    document.getElementById('aboutDisplayTagline').textContent = data.tagline || '';
    document.getElementById('aboutDisplayBio').textContent = data.bio || '';
    if (data.mission) { document.getElementById('aboutDisplayMission').textContent = data.mission; document.getElementById('aboutMissionWrap').style.display = 'block'; }
    const socials = document.getElementById('aboutSocials');
    const normalizeSafeUrl = (href) => { if (!href) return null; const h = String(href).trim(); if (/^mailto:/i.test(h)) return h; if (/^https?:\/\//i.test(h)) return h; return null; };
    const links = [{ key: 'email', label: '✉ Email', href: data.email ? `mailto:${data.email}` : null }, { key: 'twitter', label: '𝕏 Twitter', href: data.twitter || null }, { key: 'linkedin', label: 'in LinkedIn', href: data.linkedin || null }, { key: 'website', label: '↗ Website', href: data.website || null }];
    socials.innerHTML = links.map(l => ({ ...l, href: normalizeSafeUrl(l.href) })).filter(l => l.href).map(l => `<a class="about-social-link" href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join('');
    document.getElementById('aboutSkeleton').style.display = 'none';
    document.getElementById('aboutAvatarCol').classList.remove('about-hidden');
    document.getElementById('aboutContentCol').classList.remove('about-hidden');
    return true;
  } catch(err) {
    console.warn('About section unavailable:', err.message);
    applyAboutDefaults();
    const contentCol = document.getElementById('aboutContentCol');
    const skeleton = document.getElementById('aboutSkeleton');
    const avatarCol = document.getElementById('aboutAvatarCol');
    if (skeleton) skeleton.style.display = 'none';
    if (avatarCol) avatarCol.classList.remove('about-hidden');
    if (contentCol) contentCol.classList.remove('about-hidden');
    return false;
  }
}

async function loadSiteSettings() {
  const localValue = localStorage.getItem(LOCAL_IMAGES_KEY);
  if (localValue === 'true' || localValue === 'false') {
    imagesEnabled = localValue === 'true';
  }
  try {
    const data = await api.public.data('site', 'settings');
    if (data && typeof data.imagesEnabled === 'boolean') {
      imagesEnabled = data.imagesEnabled;
      localStorage.setItem(LOCAL_IMAGES_KEY, String(imagesEnabled));
    } else {
      imagesEnabled = true;
    }
    return true;
  } catch (err) {
    console.warn('Site settings unavailable:', err.message);
    if (localValue !== 'true' && localValue !== 'false') {
      imagesEnabled = true;
    }
    return false;
  }
}

// ── Newsletter ─────────────────────────────────
window.subscribeNewsletter = async (e) => {
  e.preventDefault();
  const email   = document.getElementById('emailInput').value.trim();
  if (!email) return;
  const btn     = document.getElementById('subBtn');
  const btnText = document.getElementById('subBtnText');
  const spinner = document.getElementById('subBtnSpinner');
  const msg     = document.getElementById('subMsg');

  btn.disabled = true; btnText.style.display = 'none'; spinner.style.display = 'inline-block'; msg.style.display = 'none';

  try {
    await api.public.subscribe(email);
    document.getElementById('emailInput').value = '';
    msg.style.cssText = 'display:block;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#86efac;margin-top:1.2rem;padding: 1.1rem 1.2rem;border-radius:3px;font-size:0.88rem;font-weight:500';
    msg.textContent = "✓ You're on the list! We'll be in touch.";
  } catch(err) {
    msg.style.cssText = 'display:block;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;margin-top:1.2rem;padding: 1.1rem 1.2rem;border-radius:3px;font-size:0.88rem;font-weight:500';
    msg.textContent = '✕ Something went wrong. Please try again.';
  }
  btn.disabled = false; btnText.style.display = 'inline'; spinner.style.display = 'none';
};

// Format views: 1200 → "1.2k"
function fmtViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(n);
}



(async () => {
  // 1. Parallel Task Execution
  const tasks = [
    { id: 'settings', fn: () => loadSiteSettings() },
    { id: 'posts', fn: () => loadPosts() },
    { id: 'about', fn: () => loadAbout() },
    { id: 'intel', fn: () => initIntelHub() },
    { id: 'market', fn: () => loadUpstoxMarketData({ showLoading: true }) },
    { id: 'forex', fn: async () => {
      await Promise.race([
        window.chartsReadyPromise || Promise.resolve(), 
        new Promise(res => setTimeout(res, 5000))
      ]);
      return await loadForexFactoryData();
    }},
    { id: 'india', fn: () => loadIndiaCalendarData() },
    { id: 'tvTicker', fn: () => initTVTicker() },
    { id: 'tvHub', fn: () => initTVHub() },
    { id: 'tvIndices', fn: () => initTVIndices() },
    { id: 'tvAdvChart', fn: () => initTVAdvChart() }
  ];

  try {
    const results = await Promise.allSettled(tasks.map(t =>
      withTimeout(Promise.resolve().then(() => t.fn()), 10000, t.id)
        .catch(err => {
          console.warn(`[Init] Task "${t.id}" failed:`, err?.message ?? err);
          return false;
        })
    ));

    // Update status based on essential tasks
    const criticalIds = ['posts', 'market', 'intel'];
    const criticalSuccess = results.every((r, i) => {
        if (!criticalIds.includes(tasks[i].id)) return true;
        return r.status === 'fulfilled' && r.value !== false;
    });

    setIntegrationStatus(
      criticalSuccess ? 'online' : 'degraded',
      criticalSuccess ? 'Integrations: Online' : 'Integrations: Degraded'
    );

    // Auth Handshake (Non-blocking)
    api.auth.me().then(res => {
      if (res.authenticated) {
        const enrollBtn = document.getElementById('navLoginLink');
        const googleBtn = document.getElementById('navGoogleLogin');
        if (enrollBtn) enrollBtn.style.display = 'none';
        if (googleBtn) googleBtn.style.display = 'none';

        const accountLink = document.getElementById('navAccountLink');
        if (accountLink) accountLink.style.display = 'block';

        if (res.user.role === 'admin') {
          indexUserIsAdmin = true;
          const adminLink = document.getElementById('navAdminLink');
          if (adminLink) adminLink.style.display = 'block';
          const titleEl = document.getElementById('postsTitle');
          if (titleEl) titleEl.textContent = 'Institutional Strategic Ledger';
        }
      }
    }).catch(() => {});

    startMarketAutoRefresh();

  } catch (err) {
    console.error('[Init] Fatal bootstrap error:', err);
    setIntegrationStatus('degraded', 'Integrations: Error');
  } finally {
    // Final check for theme button
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn && document.body.classList.contains('light')) {
        themeBtn.textContent = '🌙';
    }
  }
})();

// ── TV Widget Functions ───────────────────────────────────────────
function initTVTicker() {
    const container = document.getElementById('tvTickerContainer');
    if (!container || container.dataset.loaded) return;
    
    const widgetCont = document.createElement('div');
    widgetCont.className = 'tradingview-widget-container';
    widgetCont.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.text = JSON.stringify({
      "symbols": [
        {"proName": "NSE:NIFTY",        "title": "NIFTY 50"},
        {"proName": "BSE:SENSEX",        "title": "SENSEX"},
        {"proName": "NSE:BANKNIFTY",     "title": "BANK NIFTY"},
        {"proName": "INDEX:SPX",         "title": "S&P 500"},
        {"proName": "NASDAQ:NDX",        "title": "NASDAQ 100"},
        {"proName": "INDEX:DJI",         "title": "Dow Jones"},
        {"proName": "INDEX:DEU40",       "title": "DAX"},
        {"proName": "INDEX:UKX",         "title": "FTSE 100"},
        {"proName": "INDEX:NI225",       "title": "Nikkei 225"},
        {"proName": "INDEX:HSI",         "title": "Hang Seng"},
        {"proName": "COMEX:GC1!",        "title": "Gold"},
        {"proName": "NYMEX:CL1!",        "title": "WTI Crude"},
        {"proName": "CRYPTOCAP:BTC",     "title": "Bitcoin"},
        {"proName": "FX:USDINR",         "title": "USD/INR"},
        {"proName": "FX:EURUSD",         "title": "EUR/USD"}
      ],
      "showSymbolLogo": true,
      "colorTheme": "dark",
      "isTransparent": true,
      "displayMode": "adaptive",
      "locale": "en"
    });
    
    widgetCont.appendChild(script);
    container.appendChild(widgetCont);
    container.dataset.loaded = "true";
}

function initTVHub() {
    const container = document.getElementById('tvHeatmap');
    if (!container || container.dataset.loaded) return;
    
    const widgetCont = document.createElement('div');
    widgetCont.className = 'tradingview-widget-container';
    widgetCont.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.text = JSON.stringify({
      "exchanges": ["NSE"],
      "dataSource": "all_NSE",
      "grouping": "sector",
      "blockSize": "market_cap_basic",
      "blockColor": "change",
      "locale": "en",
      "symbolUrl": "",
      "colorTheme": "dark",
      "hasTopBar": false,
      "isTransparent": true,
      "hasSymbolTooltip": true,
      "width": "100%",
      "height": "100%"
    });
    
    widgetCont.appendChild(script);
    container.appendChild(widgetCont);
    container.dataset.loaded = "true";
}

function initTVIndices() {
    const container = document.getElementById('tvIndices');
    if (!container || container.dataset.loaded) return;
    
    if (typeof TradingView === 'undefined') return;
    new TradingView.widget({
      "width": "100%",
      "height": 450,
      "symbol": "NSE:NIFTY",
      "interval": "D",
      "timezone": "Asia/Kolkata",
      "theme": "dark",
      "style": "3",
      "locale": "en",
      "toolbar_bg": "#f1f3f6",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "container_id": "tvIndices"
    });
    container.dataset.loaded = "true";
}

function initTVAdvChart() {
    const container = document.getElementById('tvAdvChart');
    if (!container || container.dataset.loaded) return;
    
    if (typeof TradingView === 'undefined') return;
    new TradingView.widget({
      "autosize": true,
      "symbol": "NSE:NIFTY",
      "interval": "D",
      "timezone": "Asia/Kolkata",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "toolbar_bg": "#f1f3f6",
      "enable_publishing": false,
      "hide_side_toolbar": false,
      "allow_symbol_change": true,
      "container_id": "tvAdvChart"
    });
    container.dataset.loaded = "true";
}

// ── Market Terminal Polling ──
let _pollFailures = 0;
const POLL_MAX_FAILURES = 3;
const UPSTOX_BASE = ENDPOINTS.upstox;
let marketPollInterval = null;

async function pollMarkets() {
  const indicesBox = document.getElementById('terminal-indices');
  const stocksBox  = document.getElementById('terminal-stocks');
  const view       = document.getElementById('terminalView')?.value || 'india';

  if (!indicesBox || !stocksBox) return;

  if (_pollFailures >= POLL_MAX_FAILURES) {
    if (marketPollInterval) {
      clearInterval(marketPollInterval);
      marketPollInterval = null;
    }
    const statusDot = document.getElementById('marketStatus');
    if (statusDot) { statusDot.style.background = 'var(--red)'; statusDot.style.boxShadow = '0 0 6px var(--red)'; }
    stocksBox.innerHTML = `<div style="font-size:0.75rem;color:var(--muted);padding:0.5rem 0">Live data unavailable — market terminal offline.</div>`;
    return;
  }

  try {
    if (view === 'india') {
      const res  = await fetch(`${UPSTOX_BASE}/quotes`);
      const data = await res.json();

      if (data.status === 'success' && data.data) {
        _pollFailures = 0;
        const d    = data.data;
        const nifty = d['NSE_INDEX|Nifty 50'];
        const bank  = d['NSE_INDEX|Nifty Bank'];
        indicesBox.style.display = 'grid';
        indicesBox.innerHTML = `
          <div style="text-align:center"><small style="display:block;color:var(--muted)">NIFTY 50</small>
            <b style="color:${nifty?.last_price >= nifty?.close ? 'var(--emerald)' : 'var(--red)'}">${nifty?.last_price?.toLocaleString('en-IN') || '—'}</b></div>
          <div style="text-align:center"><small style="display:block;color:var(--muted)">BANK NIFTY</small>
            <b style="color:${bank?.last_price >= bank?.close ? 'var(--emerald)' : 'var(--red)'}">${bank?.last_price?.toLocaleString('en-IN') || '—'}</b></div>`;
        const symbols = ["RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS"];
        stocksBox.innerHTML = symbols.map(s => {
          const item = d[`NSE_EQ|${s}`];
          if (!item) return '';
          const chg = (((item.last_price - item.close) / item.close) * 100).toFixed(2);
          return `<div style="display:flex;justify-content:space-between;font-size:0.8rem">
            <span>${s}</span>
            <span style="color:${chg >= 0 ? 'var(--emerald)' : 'var(--red)'}">${item.last_price.toLocaleString('en-IN')} <small>(${chg}%)</small></span>
          </div>`;
        }).join('');
      } else {
        _pollFailures++;
      }
    } else {
      const res  = await fetch(`${UPSTOX_BASE}/global`);
      const json = await res.json();
      if (json.status === 'success') {
        _pollFailures = 0;
        indicesBox.style.display = 'none';
        stocksBox.innerHTML = json.data.map(d => {
          const name = d.symbol.replace('^', '').replace('=F', '');
          return `<div style="display:flex;justify-content:space-between;font-size:0.8rem;border-bottom:1px solid rgba(255,255,255,0.05);padding-bottom:0.4rem">
            <span style="color:var(--gold)">${name}</span>
            <span style="color:${d.change >= 0 ? 'var(--emerald)' : 'var(--red)'}">${d.price.toLocaleString()} <small>(${d.change}%)</small></span>
          </div>`;
        }).join('');
      } else {
        _pollFailures++;
      }
    }
  } catch (e) {
    _pollFailures++;
    console.warn("Market poll fail:", e);
  }
};

function startMarketAutoRefresh() {
  if (marketPollInterval) clearInterval(marketPollInterval);
  const refresh = async () => {
    try {
      await pollMarkets();
      await loadUpstoxMarketData();
    } catch (e) {
      console.warn("Market refresh fail:", e);
    }
  };
  refresh();
  marketPollInterval = setInterval(refresh, 30000);
}

function hydratePolicy(latestPost) {
  if (!latestPost) return;
  const rbi = document.getElementById('rbiSnippet');
  const sebi = document.getElementById('sebiSnippet');
  const hub = document.getElementById('downloadHub');

  if (rbi && latestPost.rbi) rbi.textContent = latestPost.rbi + '...';
  if (sebi && latestPost.sebi) sebi.textContent = latestPost.sebi + '...';
  
  if (hub && latestPost.docs && latestPost.docs.length > 0) {
    hub.innerHTML = latestPost.docs.map(doc => `
      <a href="downloads/${doc.pdf}" target="_blank" class="glass-btn" style="padding:0.4rem 0.6rem; font-size:0.72rem; display:flex; align-items:center; gap:0.4rem; text-decoration:none;">
        <span>📄</span>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${doc.title}</span>
        <span>⬇</span>
      </a>
    `).join('');
  }
}
document.getElementById('year').textContent = new Date().getFullYear();

// ── Global Exports ────────────────────────────────────────────────────────────
// Expose internal functions to the global scope to ensure that inline 
// HTML handlers and external monitoring/testing tools can access them.
window.renderPosts = renderPosts;
window.loadUpstoxMarketData = loadUpstoxMarketData;
window.loadPosts = loadPosts;
window.loadIndiaCalendarData = loadIndiaCalendarData;
window.loadForexFactoryData = loadForexFactoryData;
window.initIntelHub = initIntelHub;
window.initTVAdvChart = initTVAdvChart;
window.pollMarkets = pollMarkets;
