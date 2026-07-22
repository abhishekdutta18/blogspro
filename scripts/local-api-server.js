#!/usr/bin/env node
/**
 * BlogsPro Unified Local API Server
 * Alternative to Cloudflare Workers, running locally or on Docker/GCP.
 */

import http from 'http';
import { URL } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

// Import the ESM Cloudflare Worker scripts
import pulseWorker from './pulse-worker.js';
import authWorker from './auth-proxy-worker.js';
import upstoxWorker from '../api/upstox-worker.js';
import sentryWorker from '../workers/sentry/index.js';
import { askAI, askMultipleAIWithConsensus, ResourceManager } from './lib/ai-service.js';
import { fetchAllFinancialMarkets, fetchWeatherData, fetchMacroPulse, fetchEconomicCalendar, fetchDynamicNews, fetchMultiRegionWeather, fetchStockEngine, fetchCurrencyEngine, generatePredictiveAnalytics, runBacktestEngine, fetchDerivativesData, fetchFIIDIIFlows } from './lib/data-fetchers.js';
import { getDrafterPrompt, getManagerAuditPrompt, getInteractiveQueryPrompt } from './lib/prompts.js';

const PORT = process.env.PORT || 8081;

// ── Mock KV Namespace Implementation ─────────────────────────────────────────
class MockKV {
  constructor(name) {
    this.name = name;
    this.store = new Map();
  }

  async get(key, options = {}) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiry && entry.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    // Handle request type (text, arrayBuffer, json)
    const val = entry.value;
    if (options.type === 'json') {
      try { return JSON.parse(val); } catch { return null; }
    }
    return val;
  }

  async put(key, value, options = {}) {
    let expiry = null;
    if (options.expirationTtl) {
      expiry = Date.now() + (options.expirationTtl * 1000);
    }
    this.store.set(key, { value: String(value), expiry });
  }

  async delete(key) {
    this.store.delete(key);
  }
}

// Instantiate shared local KV stores
const kvStore = new MockKV('KV');
const cacheKvStore = new MockKV('CACHE_KV');

// ── Server Request Dispatcher ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // 1. Enable Global CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Swarm-Token, X-Hub-Signature-256, X-GitHub-Event');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // 2. Map path prefixes to workers
  let worker = null;
  let prefix = '';

  if (pathname.startsWith('/pulse')) {
    worker = pulseWorker;
    prefix = '/pulse';
  } else if (pathname.startsWith('/upstox')) {
    worker = upstoxWorker;
    prefix = '/upstox';
  } else if (pathname.startsWith('/auth')) {
    worker = authWorker;
    prefix = '/auth';
  } else if (pathname.startsWith('/newsletter')) {
    worker = sentryWorker;
    prefix = '/newsletter';
  } else if (pathname.startsWith('/ai') || pathname.startsWith('/data')) {
    worker = 'native_ai';
    prefix = pathname.startsWith('/data') ? '/data' : '/ai';
  }

  // Root health check for the server itself
  if (!worker) {
    if (pathname === '/' || pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        server: 'blogspro-alternative-api',
        uptime: process.uptime(),
        routes: {
          pulse: '/pulse',
          upstox: '/upstox',
          auth: '/auth',
          newsletter: '/newsletter',
          ai: '/ai'
        }
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
    return;
  }

  try {
    // 3. Buffer the raw request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks);

    // 4. Native AI Handler bypasses Worker fetch emulation
    if (worker === 'native_ai') {
      if (pathname === '/ai/status') {
        try {
          await ResourceManager.init(process.env); // Ensure pool is initialized
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            nodes: ResourceManager.pool.map(n => ({ name: n.name, tier: n.tier, roles: n.roles })),
            metrics: ResourceManager.metrics
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/data/markets') {
        try {
            console.log(`[local-api] Fetching Global Markets...`);
            const text = await fetchAllFinancialMarkets();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ text }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/data/weather') {
        try {
            console.log(`[local-api] Fetching Multi-Region Weather...`);
            const data = await fetchMultiRegionWeather();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
      
      if (pathname === '/data/currency') {
        try {
            console.log(`[local-api] Fetching Currency Engine...`);
            const data = await fetchCurrencyEngine();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
      
      if (pathname === '/data/stocks') {
        try {
            console.log(`[local-api] Fetching Stock Engine...`);
            const data = await fetchStockEngine();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
      
      if (pathname === '/data/predictive') {
        try {
            console.log(`[local-api] Fetching Predictive Analytics...`);
            const stockData = await fetchStockEngine();
            const currencyData = await fetchCurrencyEngine();
            // Combine raw arrays for the analytics engine
            const combinedRaw = [...stockData.raw, ...currencyData.raw];
            const data = generatePredictiveAnalytics(combinedRaw);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/data/derivatives') {
        try {
            console.log(`[local-api] Fetching Derivatives & Volatility Surface...`);
            const data = await fetchDerivativesData();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
      
      if (pathname === '/data/fii-dii') {
        try {
            console.log(`[local-api] Fetching FII/DII Institutional Flows...`);
            const data = await fetchFIIDIIFlows();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/data/economics') {
        try {
            console.log(`[local-api] Fetching Macro Economics...`);
            const [pulse, calendar] = await Promise.all([
                fetchMacroPulse().catch(e => ({ error: e.message })),
                fetchEconomicCalendar().catch(e => ({ text: "Calendar fetch failed", raw: [] }))
            ]);
            // Return structured JSON instead of a concatenated text blob
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ pulse, calendar }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/data/news') {
        try {
            const urlObj = new URL(req.url, `http://${req.headers.host}`);
            const query = urlObj.searchParams.get('q') || 'markets';
            console.log(`[local-api] Fetching News for: ${query}`);
            const text = await fetchDynamicNews(query);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ text }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      if (pathname === '/data/backtest') {
        try {
            console.log(`[local-api] Fetching Backtesting Engine...`);
            const data = await runBacktestEngine();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      try {
        const body = JSON.parse(rawBody.toString() || '{}');
        const prompt = body.prompt;
        
        if (pathname === '/ai/multi') {
            console.log(`[local-api] AI Multi-Model Consensus Generation...`);
            const text = await askMultipleAIWithConsensus(prompt, process.env, 3);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ text }));
            return;
        }

        if (pathname === '/ai/institutional') {
            console.log(`[local-api] Running Institutional Pipeline (with Baseline Data & Fact Check) for: ${prompt}`);
            
            // 1. Fetch Baseline Data & News (All Engines Concurrently)
            const [
                baselineMarkets, 
                weatherData, 
                baselineEconPair, 
                news,
                stockData,
                currencyData,
                backtestData,
                derivativesData,
                fiiDiiData
            ] = await Promise.all([
                fetchAllFinancialMarkets().catch(() => ''),
                fetchMultiRegionWeather().catch(() => ({ summary: 'Weather Unavailable', raw: [] })),
                Promise.all([fetchMacroPulse(), fetchEconomicCalendar()]).catch(() => ['', '']),
                fetchDynamicNews(prompt).catch(() => ''),
                fetchStockEngine().catch(() => ({ summary: 'Stock Engine Unavailable', raw: [] })),
                fetchCurrencyEngine().catch(() => ({ summary: 'Currency Engine Unavailable', raw: [] })),
                runBacktestEngine().catch(() => ({ summary: 'Backtesting Engine Unavailable', raw: [] })),
                fetchDerivativesData().catch(() => ({ summary: 'Derivatives data unavailable.', raw: {} })),
                fetchFIIDIIFlows().catch(() => ({ summary: 'FII/DII flow data unavailable.', raw: {} }))
            ]);
            
            const pulseText = baselineEconPair[0] && typeof baselineEconPair[0] === 'object' ? (baselineEconPair[0].summary || JSON.stringify(baselineEconPair[0])) : baselineEconPair[0];
            const calText = baselineEconPair[1] && typeof baselineEconPair[1] === 'object' ? (baselineEconPair[1].summary || baselineEconPair[1].text || JSON.stringify(baselineEconPair[1])) : baselineEconPair[1];
            
            // Generate Predictive Analytics from Stock and Currency data
            const combinedRaw = [...(stockData.raw || []), ...(currencyData.raw || [])];
            const predictiveData = generatePredictiveAnalytics(combinedRaw);
            
            const baselineEconomics = `MACRO PULSE:\n${pulseText}\n\nECONOMIC CALENDAR:\n${calText}`;
            const liveDataContext = `--- USER QUERY CONTEXT ---\nThe user is asking about: "${prompt}"\nYour ENTIRE analysis, thesis, trade ideas, and data interpretation MUST be anchored to this specific topic. Do NOT produce generic market commentary. Every section must directly address how the data relates to "${prompt}".\n\n--- LIVE MARKET DATA ---\n${baselineMarkets}\n\n--- MULTI-REGION WEATHER ---\n${weatherData.summary}\n\n--- MACRO ECONOMICS ---\n${baselineEconomics}\n\n--- DERIVATIVES & VOLATILITY SURFACE (LIVE DATA) ---\n${derivativesData.summary}\n\n--- FII/DII INSTITUTIONAL FLOWS (LIVE DATA from NSE India) ---\n${fiiDiiData.summary}\n\n--- PREDICTIVE ANALYTICS ENGINE ---\n${predictiveData.summary}\n\n--- STOCK ENGINE ---\n${stockData.summary}\n\n--- CURRENCY ENGINE ---\n${currencyData.summary}\n\n${backtestData.summary}\n\n--- LATEST NEWS ---\n${news}`;
            
            // 2. Draft Article with Full Context (Multi-Model Consensus)
            const drafterPrompt = getInteractiveQueryPrompt(prompt, liveDataContext);
            let chapter = await askMultipleAIWithConsensus(drafterPrompt, process.env, 3);
            
            // 2.5 Strip out <think> blocks (native to R1 models like DeepSeek/Cerebras)
            chapter = chapter.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            
            // 3. Manager Audit (Fact Check against live web data)
            const combinedAuditContext = `--- NEWS ---\n${news}\n\n--- ACTUAL LIVE MARKET DATA USED BY DRAFTER ---\n${liveDataContext}`;
            const auditPrompt = getManagerAuditPrompt(chapter, prompt, process.env, combinedAuditContext, true);
            const auditRes = await askAI(auditPrompt, { model: 'auto' });
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                text: chapter,
                audit: auditRes,
                baseline: liveDataContext,
                news: news
            }));
            return;
        }

        const provider = body.provider || 'gemini';
        console.log(`[local-api] AI Generation -> provider: ${provider}`);
        
        const text = await askAI(prompt, { model: provider });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
      } catch (err) {
        console.error(`[local-api] AI Native Handler Error:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // 5. Rewrite URL path to strip prefix (workers expect paths like /health, not /pulse/health)
    let subPath = pathname.slice(prefix.length);
    if (!subPath.startsWith('/')) {
      subPath = '/' + subPath;
    }
    const rewrittenUrl = new URL(subPath + reqUrl.search, `http://${req.headers.host || 'localhost'}`);

    // 5. Construct Web Request
    const webHeaders = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach(val => webHeaders.append(key, val));
        } else {
          webHeaders.set(key, value);
        }
      }
    });

    const init = {
      method: req.method,
      headers: webHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && rawBody.length > 0) {
      init.body = rawBody;
    }

    const webReq = new Request(rewrittenUrl.toString(), init);

    // 6. Build the Cloudflare Worker env context
    const defaultEnv = {
      FIREBASE_PROJECT_ID: 'blogspro-ai',
      FIREBASE_STORAGE_BUCKET: 'blogspro-asset',
      SAMBANOVA_MODEL: 'Meta-Llama-4-70B-Instruct',
      CEREBRAS_MODEL: 'llama-4-70b',
      MISTRAL_MODEL: 'mistral-large-latest',
      BASE_URL: 'https://blogspro.in',
      PROJECT_DOMAIN: 'blogspro.in',
    };

    const env = {
      ...defaultEnv,
      ...process.env,
      KV: kvStore,
      CACHE_KV: cacheKvStore,
      // Normalize telegram bindings
      TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_TO: process.env.TELEGRAM_CHAT_ID,
      // Normalize firebase project
      FIREBASE_PROJECT: process.env.FIREBASE_PROJECT_ID || 'blogspro-ai',
      FIREBASE_API_KEY: process.env.FIREBASE_WEB_API_KEY || process.env.GEMINI_API_KEY,
    };

    const ctx = {
      waitUntil: (promise) => {
        promise.catch(err => console.error(`[Background Promise Exception] inside ${prefix}:`, err));
      }
    };

    // 7. Dispatch to worker
    console.log(`[local-api] ${req.method} ${pathname} -> Routing to ${prefix} with path ${subPath}`);
    const webRes = await worker.fetch(webReq, env, ctx);

    // 8. Map Web Response to Node HTTP Response
    webRes.headers.forEach((value, key) => {
      // Do not duplicate Access-Control headers
      if (!key.toLowerCase().startsWith('access-control-')) {
        res.setHeader(key, value);
      }
    });

    res.statusCode = webRes.status;
    const bodyBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(bodyBuffer));

  } catch (err) {
    console.error(`[local-api-error] Failed to execute worker ${prefix}:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Worker Execution Error',
      worker: prefix,
      message: err.message
    }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 BlogsPro Unified Local API Server running on http://localhost:${PORT}`);
  console.log('📡 Mocking Cloudflare Workers:');
  console.log(`   - Pulse Orchestrator:  http://localhost:${PORT}/pulse`);
  console.log(`   - Upstox Market Proxy: http://localhost:${PORT}/upstox`);
  console.log(`   - Auth Proxy:          http://localhost:${PORT}/auth`);
  console.log(`   - Sentry / Newsletter: http://localhost:${PORT}/newsletter`);
  console.log(`   - Native AI Gateway:   http://localhost:${PORT}/ai`);
  console.log('Press Ctrl+C to stop the server.\n');
});
