/**
 * BlogsPro Upstox Proxy Worker
 * Exposes a clean endpoint for the frontend to fetch live Indian market data
 * without exposing sensitive access tokens or API keys.
 */
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

    // 0. Handle CORS Preflight — always respond with CORS headers
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Origin guard — but always include CORS headers so browser can read the 403
    const origin = request.headers.get("Origin") || "";
    if (origin && !origin.includes("blogspro.in") && !origin.includes("localhost")) {
      return new Response("Unauthorized Origin", { status: 403, headers: CORS_HEADERS });
    }

    // 1. Health Check
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok", service: "upstox-proxy" });
    }

    // 2. Fetch Market Quotes
    if (url.pathname === "/quotes") {
      const defaultSymbols = [
        "NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank",
        "NSE_EQ|RELIANCE", "NSE_EQ|HDFCBANK", "NSE_EQ|ICICIBANK", "NSE_EQ|INFY", "NSE_EQ|TCS"
      ].join(',');
      const symbols = url.searchParams.get("symbols") || defaultSymbols;
      const upstoxUrl = `https://api.upstox.com/v2/market-quote/quotes?symbol=${encodeURIComponent(symbols)}`;

      try {
        const response = await fetch(upstoxUrl, {
          headers: { "Accept": "application/json", "Authorization": `Bearer ${env.UPSTOX_ACCESS_TOKEN}` }
        });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { status: "error", message: "Invalid response from upstream" }; }

        if (data.status === "error") return jsonResponse(data, 401);
        return jsonResponse(data, 200, { "Cache-Control": "public, max-age=1" });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 3. Historical Candle Data
    if (url.pathname === "/historical") {
      const instrumentKey = url.searchParams.get("instrumentKey") || "NSE_INDEX|Nifty 50";
      const interval = url.searchParams.get("interval") || "day";
      const now = new Date();
      const toDate = url.searchParams.get("toDate") || now.toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
      const fromDate = url.searchParams.get("fromDate") || thirtyDaysAgo.toISOString().split('T')[0];
      const upstoxUrl = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`;

      try {
        const response = await fetch(upstoxUrl, {
          headers: { "Accept": "application/json", "Authorization": `Bearer ${env.UPSTOX_ACCESS_TOKEN}` }
        });
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { status: "error", message: "Invalid response from upstream" }; }

        if (data.status === "error") return jsonResponse(data, 400);
        return jsonResponse(data, 200, { "Cache-Control": "public, max-age=3600" });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // 4. Global Market Data
    if (url.pathname === "/global") {
      const tickers = ["^GSPC", "^IXIC", "GC=F", "BZ=F"];
      try {
        const results = await Promise.all(tickers.map(ticker =>
          fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`).then(r => r.json())
        ));
        const summary = results.map(r => {
          const meta = r.chart.result[0].meta;
          return {
            symbol: meta.symbol,
            price: meta.regularMarketPrice,
            prevClose: meta.chartPreviousClose,
            change: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100).toFixed(2)
          };
        });
        return jsonResponse({ status: "success", data: summary }, 200, { "Cache-Control": "public, max-age=60" });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
}
