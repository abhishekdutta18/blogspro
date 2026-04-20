/**
 * market-data.js
 * Fetches live Indian market data from the Upstox proxy worker and
 * renders it into the homepage UI (status dot + live quotes strip).
 */
import { UPSTOX_WORKER_URL } from './constants.js';

const SYMBOLS = 'NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_INDEX|Nifty Midcap 50,NSE_EQ|RELIANCE,NSE_EQ|HDFCBANK,NSE_EQ|ICICIBANK,NSE_EQ|INFY,NSE_EQ|TCS';

const DISPLAY_NAMES = {
  'NSE_INDEX:Nifty 50':        'NIFTY 50',
  'NSE_INDEX:Nifty Bank':      'BANK NIFTY',
  'NSE_INDEX:Nifty Midcap 50': 'MIDCAP 50',
  'NSE_EQ:RELIANCE':           'RELIANCE',
  'NSE_EQ:HDFCBANK':           'HDFC BANK',
  'NSE_EQ:ICICIBANK':          'ICICI BANK',
  'NSE_EQ:INFY':               'INFOSYS',
  'NSE_EQ:TCS':                'TCS',
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function initMarketData() {
  await Promise.all([
    _fetchMarketStatus(),
    _fetchAndRenderQuotes(),
  ]);
}

// ── Market status → .status-dot ──────────────────────────────────────────────

async function _fetchMarketStatus() {
  const dot = document.querySelector('.status-dot');
  if (!dot) return;

  try {
    const res  = await fetch(`${UPSTOX_WORKER_URL}/market-status?exchange=NSE`);
    const json = await res.json();
    const isOpen = String(json?.data?.market_status || '').toLowerCase().includes('open');

    dot.style.background  = isOpen ? 'var(--emerald)' : 'var(--muted)';
    dot.style.boxShadow   = isOpen ? '0 0 6px var(--emerald)' : 'none';
    dot.style.animation   = isOpen ? '' : 'none';
    dot.title             = isOpen ? 'NSE Open' : 'NSE Closed';
  } catch (_) {
    // silent — dot stays green (default CSS)
  }
}

// ── Live quotes strip ─────────────────────────────────────────────────────────

async function _fetchAndRenderQuotes() {
  const strip = document.getElementById('marketQuotesStrip');
  if (!strip) return;

  try {
    const res  = await fetch(`${UPSTOX_WORKER_URL}/ohlc?symbols=${encodeURIComponent(SYMBOLS)}&interval=1d`);
    const json = await res.json();

    if (json.status !== 'success' || !json.data) {
      strip.style.display = 'none';
      return;
    }

    const items = Object.entries(json.data).map(([key, q]) => {
      const label  = DISPLAY_NAMES[key] || key.split(':')[1] || key;
      const price  = q.last_price ?? q.ohlc?.close ?? 0;
      const change = q.net_change ?? (q.ohlc ? q.last_price - q.ohlc.close : 0);
      const pct    = q.percentage_change ?? (q.ohlc?.close ? (change / q.ohlc.close) * 100 : 0);
      const up     = change >= 0;

      const fmt = (n) =>
        n >= 1000
          ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
          : n.toFixed(2);

      return `
        <div class="mq-item">
          <span class="mq-label">${label}</span>
          <span class="mq-price">${fmt(price)}</span>
          <span class="mq-change ${up ? 'up' : 'down'}">
            ${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%
          </span>
        </div>`;
    });

    strip.innerHTML = items.join('');
    strip.style.display = 'flex';
  } catch (_) {
    strip.style.display = 'none';
  }
}
