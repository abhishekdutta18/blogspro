/**
 * BlogsPro Upstox Proxy Worker
 * Fetches live Indian market data without exposing the auth token to the frontend.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UPSTOX_V2 = "https://api.upstox.com/v2";
const UPSTOX_V3 = "https://api.upstox.com/v3";

function jsonResponse(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

export default {
  async fetch(request, env) {
    // Top-level catch ensures CORS headers always sent
    try {
      const url = new URL(request.url);

      // CORS Preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      // Origin validation
      const origin = request.headers.get("Origin") || "";
      if (origin && !origin.includes("blogspro.in") && !origin.includes("localhost")) {
        return new Response("Unauthorized Origin", { status: 403, headers: CORS_HEADERS });
      }

      // Check token
      const token = env.UPSTOX_ACCESS_TOKEN;
      if (!token) {
        return jsonResponse({ status: "error", message: "Token not configured" }, 503);
      }

      // Routes
      if (url.pathname === "/health") {
        return jsonResponse({ status: "ok", service: "upstox-proxy" });
      }

      if (url.pathname === "/quotes") {
        const defaultSymbols = "NSE_INDEX|Nifty 50,NSE_INDEX|Nifty Bank,NSE_EQ|RELIANCE,NSE_EQ|HDFCBANK,NSE_EQ|ICICIBANK,NSE_EQ|INFY,NSE_EQ|TCS";
        const symbols = url.searchParams.get("symbols") || defaultSymbols;

        const response = await fetch(
          `${UPSTOX_V3}/market-quote/ltp?symbol=${encodeURIComponent(symbols)}`,
          {
            headers: {
              "Accept": "application/json",
              "Authorization": `Bearer ${token}`
            }
          }
        );
        const data = await response.json();

        if (data.status === "error" || !response.ok) {
          return jsonResponse(data, response.status || 401);
        }
        return jsonResponse(data, 200, { "Cache-Control": "public, max-age=1" });
      }

      if (url.pathname === "/historical") {
        const instrumentKey = url.searchParams.get("instrumentKey") || "NSE_INDEX|Nifty 50";
        const interval = url.searchParams.get("interval") || "day";
        const now = new Date();
        const toDate = url.searchParams.get("toDate") || now.toISOString().split('T')[0];
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        const fromDate = url.searchParams.get("fromDate") || thirtyDaysAgo.toISOString().split('T')[0];

        const response = await fetch(
          `${UPSTOX_V3}/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`,
          {
            headers: {
              "Accept": "application/json",
              "Authorization": `Bearer ${token}`
            }
          }
        );
        const data = await response.json();

        if (data.status === "error" || !response.ok) {
          return jsonResponse(data, response.status || 400);
        }
        return jsonResponse(data, 200, { "Cache-Control": "public, max-age=3600" });
      }

      if (url.pathname === "/market-status") {
        const exchange = url.searchParams.get("exchange") || "NSE";

        const response = await fetch(
          `${UPSTOX_V2}/market/status?exchange=${encodeURIComponent(exchange)}`,
          {
            headers: {
              "Accept": "application/json",
              "Authorization": `Bearer ${token}`
            }
          }
        );
        const data = await response.json();

        if (data.status === "error" || !response.ok) {
          return jsonResponse(data, response.status || 400);
        }
        return jsonResponse(data, 200, { "Cache-Control": "public, max-age=60" });
      }

      if (url.pathname === "/global") {
        const tickers = ["^GSPC", "^IXIC", "GC=F", "BZ=F"];
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
      }

      return jsonResponse({ error: "Not found" }, 404);

    } catch (err) {
      // Any unhandled error still gets CORS headers
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  }
};
