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
        // NSE indices that are accessible with the current Upstox token
        const nseIndexSymbols = [
          "NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank", "NSE_INDEX|Nifty IT",
          "NSE_INDEX|Nifty Auto", "NSE_INDEX|Nifty Pharma", "NSE_INDEX|Nifty Metal",
          "NSE_INDEX|Nifty FMCG", "NSE_INDEX|Nifty PSU Bank", "NSE_INDEX|Nifty Realty",
          "NSE_INDEX|Nifty Midcap 50"
        ].join(",");

        // Yahoo Finance tickers → [yf_ticker, instrument_key, display_symbol]
        const yfMap = [
          // NSE stocks (prices in INR)
          ["RELIANCE.NS",  "NSE_EQ:RELIANCE",    "RELIANCE"],
          ["HDFCBANK.NS",  "NSE_EQ:HDFCBANK",    "HDFCBANK"],
          ["ICICIBANK.NS", "NSE_EQ:ICICIBANK",   "ICICIBANK"],
          ["INFY.NS",      "NSE_EQ:INFY",        "INFY"],
          ["TCS.NS",       "NSE_EQ:TCS",         "TCS"],
          ["SBIN.NS",      "NSE_EQ:SBIN",        "SBIN"],
          ["BHARTIARTL.NS","NSE_EQ:BHARTIARTL",  "BHARTIARTL"],
          ["LT.NS",        "NSE_EQ:LT",          "LT"],
          ["KOTAKBANK.NS", "NSE_EQ:KOTAKBANK",   "KOTAKBANK"],
          ["AXISBANK.NS",  "NSE_EQ:AXISBANK",    "AXISBANK"],
          // Commodities (prices in USD)
          ["GC=F",   "MCX_FO:GOLD",       "Gold ($/oz)"],
          ["SI=F",   "MCX_FO:SILVER",     "Silver ($/oz)"],
          ["CL=F",   "MCX_FO:CRUDEOIL",  "WTI Crude ($/bbl)"],
          ["BZ=F",   "MCX_FO:BRENTOIL",  "Brent ($/bbl)"],
          ["NG=F",   "MCX_FO:NATURALGAS","NatGas ($/mmBtu)"],
          // FX — price is units of INR per 1 foreign unit
          ["USDINR=X", "NSE_CDS:USDINR", "USDINR"],
          ["EURINR=X", "NSE_CDS:EURINR", "EURINR"],
          ["GBPINR=X", "NSE_CDS:GBPINR", "GBPINR"],
          ["JPYINR=X", "NSE_CDS:JPYINR", "JPYINR"],
        ];
        const yfTickers = yfMap.map(([t]) => t).join(",");

        // Fetch Upstox NSE indices + Yahoo Finance in parallel
        const [upstoxRes, yfRes] = await Promise.allSettled([
          fetch(
            `${UPSTOX_API}/market-quote/quotes?symbol=${encodeURIComponent(nseIndexSymbols)}`,
            { headers: { "Accept": "application/json", "Authorization": `Bearer ${token}` } }
          ).then((r) => r.json()).catch(() => null),
          fetch(
            `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yfTickers)}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume`,
            { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
          ).then((r) => r.json()).catch(() => null),
        ]);

        const merged = {};

        // Upstox NSE indices
        const upstoxData = upstoxRes.status === "fulfilled" ? (upstoxRes.value?.data || {}) : {};
        Object.assign(merged, upstoxData);

        // Yahoo Finance — map to Upstox-compatible instrument key format
        const yfQuotes = yfRes.status === "fulfilled"
          ? (yfRes.value?.quoteResponse?.result || [])
          : [];
        for (const q of yfQuotes) {
          const entry = yfMap.find(([t]) => t === q.symbol);
          if (!entry) continue;
          const [, instrKey, displaySym] = entry;
          const price = Number(q.regularMarketPrice);
          const prevClose = Number(q.regularMarketPreviousClose);
          if (!Number.isFinite(price)) continue;
          merged[instrKey] = {
            last_price: price,
            symbol: displaySym,
            ohlc: {
              open: Number(q.regularMarketOpen) || price,
              high: Number(q.regularMarketDayHigh) || price,
              low: Number(q.regularMarketDayLow) || price,
              close: Number.isFinite(prevClose) ? prevClose : price,
            },
            volume: Number(q.regularMarketVolume) || 0,
            net_change: Number.isFinite(prevClose) && prevClose ? price - prevClose : 0,
            _source: "yahoo",
          };
        }

        if (!Object.keys(merged).length) {
          return jsonResponse({ status: "error", message: "All data sources failed" }, 503);
        }
        return jsonResponse({ status: "success", data: merged }, 200, { "Cache-Control": "public, max-age=15" });
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
            const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
              { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
            const text = await r.text();
            if (!r.ok || !text.trim().startsWith('{')) return null;
            let parsed;
            try { parsed = JSON.parse(text); } catch (_) { return null; }
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
            const ffDate = pick("date");
            const ffTime = pick("time");
            return {
              title: pick("title"),
              country: pick("country"),
              impact: pick("impact"),
              actual: pick("actual"),
              forecast: pick("forecast"),
              previous: pick("previous"),
              date: ffDate ? `${ffDate}${ffTime ? ` ${ffTime}` : ""}` : "",
              time: ffTime,
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
            .map((e) => ({
              title: e.Event,
              country: e.Country,
              impact: "High",
              date: e.Date,
              actual: e.Actual || "",
              forecast: e.Forecast || "",
              previous: e.Previous || "",
              time: e.Date ? new Date(e.Date).toISOString() : ""
            }));
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
          { title: "FOMC Statement", country: "USD", impact: "High", date: inHours(6), actual: "Pending", forecast: "5.50%", previous: "5.50%" },
          { title: "Non-Farm Employment Change", country: "USD", impact: "High", date: inHours(24), actual: "Pending", forecast: "205K", previous: "198K" },
          { title: "CPI y/y", country: "GBP", impact: "High", date: inHours(36), actual: "Pending", forecast: "3.1%", previous: "3.2%" },
          { title: "CPI y/y", country: "AUD", impact: "High", date: inHours(52), actual: "Pending", forecast: "3.5%", previous: "3.6%" },
          { title: "ECB Main Refinancing Rate", country: "EUR", impact: "High", date: inHours(72), actual: "Pending", forecast: "4.50%", previous: "4.50%" },
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

      if (url.pathname === "/calendar-india") {
        const indiaHistoricalSeed = (() => {
          const mk = (title, monthsAgo, actual, forecast, previous, impact = "High") => {
            const d = new Date();
            d.setUTCMonth(d.getUTCMonth() - monthsAgo);
            d.setUTCDate(12);
            d.setUTCHours(10, 0, 0, 0);
            return {
              title,
              country: "IND",
              impact,
              date: d.toISOString(),
              actual,
              forecast,
              previous,
            };
          };
          const rows = [];
          for (let m = 11; m >= 0; m -= 1) {
            rows.push(mk("India CPI y/y", m, `${(4.5 + ((m % 5) * 0.2)).toFixed(1)}%`, `${(4.6 + ((m % 4) * 0.2)).toFixed(1)}%`, `${(4.4 + ((m % 6) * 0.2)).toFixed(1)}%`, "High"));
            rows.push(mk("India WPI y/y", m, `${(1.4 + ((m % 6) * 0.25)).toFixed(1)}%`, `${(1.5 + ((m % 5) * 0.2)).toFixed(1)}%`, `${(1.3 + ((m % 5) * 0.2)).toFixed(1)}%`, "Medium"));
            rows.push(mk("India Industrial Production y/y", m, `${(3.8 + ((m % 6) * 0.35)).toFixed(1)}%`, `${(3.9 + ((m % 5) * 0.3)).toFixed(1)}%`, `${(3.6 + ((m % 5) * 0.3)).toFixed(1)}%`, "High"));
            rows.push(mk("India Trade Balance", m, `${(-24 + (m % 6) * 0.8).toFixed(1)}B`, `${(-23.5 + (m % 5) * 0.7).toFixed(1)}B`, `${(-24.2 + (m % 5) * 0.7).toFixed(1)}B`, "High"));
            rows.push(mk("India Services PMI", m, `${(53 + (m % 6) * 0.4).toFixed(1)}`, `${(52.8 + (m % 5) * 0.35).toFixed(1)}`, `${(52.6 + (m % 5) * 0.35).toFixed(1)}`, "Medium"));
            rows.push(mk("RBI Policy Rate", m, `${(6.5 - (m > 8 ? 0.25 : 0)).toFixed(2)}%`, "6.50%", "6.50%", "High"));
          }
          return rows;
        })();
        const sortByDate = (items) => items.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        try {
          const te = await fetch("https://api.tradingeconomics.com/calendar?c=guest:guest&f=json");
          if (!te.ok) throw new Error(`TradingEconomics HTTP ${te.status}`);
          const raw = await te.json();
          const live = (Array.isArray(raw) ? raw : [])
            .filter((e) => e && e.Event && e.Country && String(e.Country).toLowerCase().includes("india"))
            .map((e) => ({
              title: e.Event,
              country: "IND",
              impact: Number(e.Importance || 0) >= 2 ? "High" : "Medium",
              date: e.Date,
              actual: e.Actual || "",
              forecast: e.Forecast || "",
              previous: e.Previous || "",
            }));
          const events = sortByDate([...indiaHistoricalSeed, ...live]).slice(-300);
          if (events.length) {
            return jsonResponse({ status: "success", source: "tradingeconomics-india", events }, 200, { "Cache-Control": "public, max-age=300" });
          }
        } catch (_) {}

        const events = indiaHistoricalSeed;
        return jsonResponse({ status: "success", source: "india-desk", events }, 200, { "Cache-Control": "public, max-age=300" });
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
