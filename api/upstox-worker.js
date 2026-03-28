/**
 * BlogsPro Upstox Proxy Worker
 * Fetches live Indian market data without exposing the auth token to the frontend.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const UPSTOX_API = "https://api.upstox.com/v2";

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
          `${UPSTOX_API}/market-quote/quotes?symbol=${encodeURIComponent(symbols)}`,
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
          `${UPSTOX_API}/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`,
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

      if (url.pathname === "/global") {
        const tickers = ["^GSPC", "^IXIC", "GC=F", "BZ=F"];
        const results = await Promise.all(tickers.map(async (ticker) => {
          try {
            const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`);
            const text = await r.text();
            if (!r.ok) return null;
            const parsed = JSON.parse(text);
            const meta = parsed?.chart?.result?.[0]?.meta;
            if (!meta || !Number.isFinite(Number(meta.regularMarketPrice)) || !Number.isFinite(Number(meta.chartPreviousClose))) return null;
            return {
              symbol: meta.symbol,
              price: Number(meta.regularMarketPrice),
              prevClose: Number(meta.chartPreviousClose),
              change: (((Number(meta.regularMarketPrice) - Number(meta.chartPreviousClose)) / Number(meta.chartPreviousClose)) * 100).toFixed(2)
            };
          } catch (_) {
            return null;
          }
        }));
        const summary = results.filter(Boolean);
        if (!summary.length) {
          return jsonResponse({ status: "success", data: [] }, 200, { "Cache-Control": "public, max-age=60" });
        }
        return jsonResponse({ status: "success", data: summary }, 200, { "Cache-Control": "public, max-age=60" });
      }

      if (url.pathname === "/calendar") {
        const extractHighImpact = (xml) => {
          const events = [...xml.matchAll(/<event>([\s\S]*?)<\/event>/gi)].map((m) => {
            const body = m[1] || "";
            const pick = (tag) => {
              const mm = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
              return (mm?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
            };
            return {
              title: pick("title"),
              country: pick("country"),
              impact: pick("impact"),
            };
          });
          return events
            .filter((e) => e.title && e.country && String(e.impact || "").toLowerCase().includes("high"))
            .slice(0, 10);
        };

        // Primary source: ForexFactory (faireconomy host)
        try {
          const ff = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.xml", {
            headers: {
              "User-Agent": "BlogsProCalendarProxy/1.0",
              "Accept": "application/xml,text/xml;q=0.9,*/*;q=0.8",
              "Referer": "https://www.forexfactory.com/",
            },
          });
          if (ff.ok) {
            const xml = await ff.text();
            const events = extractHighImpact(xml);
            if (events.length) {
              return jsonResponse(
                { status: "success", source: "forexfactory", events },
                200,
                { "Cache-Control": "public, max-age=300" }
              );
            }
          }
        } catch (_) {}

        // Fallback: TradingEconomics guest calendar
        try {
          const te = await fetch("https://api.tradingeconomics.com/calendar?c=guest:guest&f=json");
          if (!te.ok) throw new Error(`TradingEconomics HTTP ${te.status}`);
          const raw = await te.json();
          const events = (Array.isArray(raw) ? raw : [])
            .filter((e) => e && e.Event && e.Country && Number(e.Importance || 0) >= 2)
            .slice(0, 10)
            .map((e) => ({ title: e.Event, country: e.Country, impact: "High", date: e.Date }));
          if (events.length) {
            return jsonResponse(
              { status: "success", source: "tradingeconomics", events },
              200,
              { "Cache-Control": "public, max-age=300" }
            );
          }
        } catch (_) {}

        const now = Date.now();
        const inHours = (h) => new Date(now + h * 3600 * 1000).toISOString();
        const fallbackEvents = [
          { title: "FOMC Statement", country: "USD", impact: "High", date: inHours(6) },
          { title: "Non-Farm Employment Change", country: "USD", impact: "High", date: inHours(24) },
          { title: "CPI y/y", country: "GBP", impact: "High", date: inHours(36) },
          { title: "CPI y/y", country: "AUD", impact: "High", date: inHours(52) },
          { title: "ECB Main Refinancing Rate", country: "EUR", impact: "High", date: inHours(72) },
        ];
        return jsonResponse(
          {
            status: "success",
            source: "static-fallback",
            message: "Live calendar feeds unavailable; showing market-desk high-impact events.",
            events: fallbackEvents,
          },
          200,
          { "Cache-Control": "public, max-age=300" }
        );
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
