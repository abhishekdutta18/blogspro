/**
 * BlogsPro Upstox Proxy Worker
 * Exposes a clean endpoint for the frontend to fetch live Indian market data
 * without exposing sensitive access tokens or API keys.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const authHeader = request.headers.get("Authorization");

    // 0. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    // Simple security: check for a secret header or just allow CORS for blogspro.in
    const origin = request.headers.get("Origin");
    if (origin && !origin.includes("blogspro.in") && !origin.includes("localhost")) {
      return new Response("Unauthorized Origin", { status: 403 });
    }

    // 1. Health Check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "upstox-proxy" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
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
          headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${env.UPSTOX_ACCESS_TOKEN}`
          }
        });

        const data = await response.json();
        
        // Handle token expiry or errors
        if (data.status === "error") {
          return new Response(JSON.stringify(data), {
            status: 401,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }

        return new Response(JSON.stringify(data), {
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=1" // Cache for 1 second
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 3. Fetch Historical Data (New)
    if (url.pathname === "/historical") {
        const instrumentKey = url.searchParams.get("instrumentKey") || "NSE_INDEX|Nifty 50";
        const interval = url.searchParams.get("interval") || "day";
        const now = new Date();
        const toDate = url.searchParams.get("toDate") || now.toISOString().split('T')[0];
        
        // Default to last 30 days if fromDate is missing
        const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));
        const fromDate = url.searchParams.get("fromDate") || thirtyDaysAgo.toISOString().split('T')[0];

        const upstoxUrl = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`;

        try {
            const response = await fetch(upstoxUrl, {
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${env.UPSTOX_ACCESS_TOKEN}`
                }
            });

            const data = await response.json();
            
            if (data.status === "error") {
                return new Response(JSON.stringify(data), {
                    status: 400,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }

            return new Response(JSON.stringify(data), {
                headers: { 
                    "Content-Type": "application/json", 
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600" // Cache for 1 hour
                }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }
    }

    // 4. Global Market Data
    if (url.pathname === "/global") {
      const tickers = ["^GSPC", "^IXIC", "GC=F", "BZ=F"];
      try {
        const results = await Promise.all(tickers.map(ticker => 
          fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`)
            .then(r => r.json())
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

        return new Response(JSON.stringify({ status: "success", data: summary }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
      }
    }

    // 4. Fallback: Symbol Search
    if (url.pathname === "/search") {
      // Implement symbol search if needed
    }

    return new Response("Service Not Found", { status: 404 });
  }
};
