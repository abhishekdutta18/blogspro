/**
 * BlogsPro Upstox Proxy Worker
 * Uses upstox-js-sdk to fetch live Indian market data
 * without exposing sensitive access tokens to the frontend.
 */
import UpstoxClient from 'upstox-js-sdk';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

/** Promisify a callback-style SDK call */
function callSdk(fn) {
  return new Promise((resolve, reject) => {
    fn((err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

/** Configure SDK auth for this request */
function setupClient(accessToken) {
  const client = UpstoxClient.ApiClient.instance;
  client.authentications['OAUTH2'].accessToken = accessToken;
}

export default {
  async fetch(request, env) {
    // Top-level guard: always return CORS headers even on unexpected crashes
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }
};

async function handleRequest(request, env) {
  const url = new URL(request.url);

  // CORS Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Origin guard
  const origin = request.headers.get("Origin") || "";
  if (origin && !origin.includes("blogspro.in") && !origin.includes("localhost")) {
    return new Response("Unauthorized Origin", { status: 403, headers: CORS_HEADERS });
  }

  // Health check
  if (url.pathname === "/health") {
    return jsonResponse({ status: "ok", service: "upstox-proxy" });
  }

  // All Upstox endpoints require a token
  const token = env.UPSTOX_ACCESS_TOKEN;
  if (!token) {
    return jsonResponse({ status: "error", message: "UPSTOX_ACCESS_TOKEN not configured" }, 503);
  }
  setupClient(token);

  // 1. Market Quotes (live prices)
  if (url.pathname === "/quotes") {
    const defaultSymbols = [
      "NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank",
      "NSE_EQ|RELIANCE", "NSE_EQ|HDFCBANK", "NSE_EQ|ICICIBANK", "NSE_EQ|INFY", "NSE_EQ|TCS"
    ].join(',');
    const symbols = url.searchParams.get("symbols") || defaultSymbols;

    const api = new UpstoxClient.MarketQuoteApi();
    try {
      const data = await callSdk(cb => api.getFullMarketQuote(symbols, '2.0', cb));
      return jsonResponse(data, 200, { "Cache-Control": "public, max-age=1" });
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 401);
    }
  }

  // 2. Historical Candle Data
  if (url.pathname === "/historical") {
    const instrumentKey = url.searchParams.get("instrumentKey") || "NSE_INDEX|Nifty 50";
    const interval     = url.searchParams.get("interval") || "day";
    const now          = new Date();
    const toDate       = url.searchParams.get("toDate") || now.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const fromDate = url.searchParams.get("fromDate") || thirtyDaysAgo.toISOString().split('T')[0];

    const api = new UpstoxClient.HistoryApi();
    try {
      // getHistoricalCandleData1 accepts fromDate; getHistoricalCandleData does not
      const data = await callSdk(cb =>
        api.getHistoricalCandleData1(instrumentKey, interval, toDate, fromDate, '2.0', cb)
      );
      return jsonResponse(data, 200, { "Cache-Control": "public, max-age=3600" });
    } catch (err) {
      return jsonResponse({ status: "error", message: err.message }, 400);
    }
  }

  // 3. Global Market Data (Yahoo Finance — no Upstox SDK needed)
  if (url.pathname === "/global") {
    const tickers = ["^GSPC", "^IXIC", "GC=F", "BZ=F"];
    try {
      const results = await Promise.all(tickers.map(ticker =>
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`).then(r => r.json())
      ));
      const summary = results.map(r => {
        const meta = r.chart.result[0].meta;
        return {
          symbol:    meta.symbol,
          price:     meta.regularMarketPrice,
          prevClose: meta.chartPreviousClose,
          change:    ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2)
        };
      });
      return jsonResponse({ status: "success", data: summary }, 200, { "Cache-Control": "public, max-age=60" });
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
}
