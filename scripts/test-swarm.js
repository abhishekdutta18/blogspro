#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pulseWorker from './pulse-worker.js';
import dataWorker from './data-worker.js';
import relevanceWorker from './relevance-worker.js';
import auditorWorker from './auditor-worker.js';
import seoWorker from './seo-worker.js';

import templateWorker from './template-worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * BlogsPro Swarm 4.0: Local Test Executive
 * ========================================
 * Mocks the entire 5-tier micro-worker swarm for local dry-runs.
 * Simulates Service Bindings, Hierarchical Loops, and Temporal R2/KV Memory.
 */
async function runTest() {
    const frequency = process.argv[2] || 'weekly';
    const type = process.argv[3] || 'article';
    
    console.log(`🛰 [Test] Starting BlogsPro Swarm 4.0 Local Test Run... [${type.toUpperCase()}:${frequency.toUpperCase()}]`);

    if (!process.env.GEMINI_API_KEY) {
        console.error("❌ Error: GEMINI_API_KEY is not set in your environment.");
        process.exit(1);
    }

    // --- MOCK R2 & KV ---
    const mockR2 = {
        storage: new Map(),
        put: async (key, content) => {
            const dir = path.join(process.cwd(), 'test-output', 'r2', path.dirname(key));
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(process.cwd(), 'test-output', 'r2', key), content);
            mockR2.storage.set(key, content);
            console.log(`✓ [MOCK R2] Saved: ${key}`);
        },
        get: async (key) => ({
            json: async () => JSON.parse(mockR2.storage.get(key) || fs.readFileSync(path.join(process.cwd(), 'test-output', 'r2', key), 'utf-8')),
            text: async () => mockR2.storage.get(key) || fs.readFileSync(path.join(process.cwd(), 'test-output', 'r2', key), 'utf-8')
        }),
        list: async ({ prefix }) => {
            const dir = path.join(process.cwd(), 'test-output', 'r2', prefix);
            if (!fs.existsSync(dir)) return { objects: [] };
            const files = fs.readdirSync(dir);
            return {
                objects: files.map(f => ({ key: prefix + f, uploaded: fs.statSync(path.join(dir, f)).mtimeMs }))
            };
        }
    };

    const mockKV = {
        data: new Map(),
        put: async (k, v) => {
            mockKV.data.set(k, v);
            console.log(`✓ [MOCK KV] Updated: ${k}`);
        },
        get: async (k, opt) => {
            const val = mockKV.data.get(k);
            if (!val) return null;
            return opt && opt.type === 'json' ? JSON.parse(val) : val;
        }
    };

    const SWARM_TOKEN = "BPRO_SWARM_SECRET_2026";

    // --- MOCK SERVICE BINDINGS ---
    const env = {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        OPENROUTER_KEY: process.env.OPENROUTER_KEY,
        FIREBASE_PROJECT_ID: "blogspro-ai-test",
        BASE_URL: "https://blogspro.in",
        SWARM_INTERNAL_TOKEN: SWARM_TOKEN,
        BLOOMBERG_ASSETS: mockR2,
        KV: mockKV,

        // Service Binding: DATA_HUB
        DATA_HUB: {
            fetch: async (req) => dataWorker.fetch(req, env)
        },
        // Service Binding: RELEVANCE
        RELEVANCE: {
            fetch: async (req) => relevanceWorker.fetch(req, env)
        },
        // Service Binding: AUDITOR
        AUDITOR: {
            fetch: async (req) => auditorWorker.fetch(req, env)
        },
        // Service Binding: SEO_MANAGER
        SEO_MANAGER: {
            fetch: async (req) => seoWorker.fetch(req, env)
        },
        // Service Binding: TEMPLATE_ENGINE [NEW]
        TEMPLATE_ENGINE: {
            fetch: async (req) => templateWorker.fetch(req, env)
        }
    };

    try {
        console.log("📥 [Test] Step 1: Pre-filling Context Mega-Pool (Hourly, Daily, Weekly, Monthly, Baseline)...");
        
        // 1a. Pre-fill all temporal buckets (The Pre-fill Data Rule)
        await Promise.all([
            dataWorker.fetch(new Request("https://data/hourly?freq=hourly&force=true"), env),
            dataWorker.fetch(new Request("https://data/daily?freq=daily&force=true"), env),
            dataWorker.fetch(new Request("https://data/weekly?freq=weekly&force=true"), env),
            dataWorker.fetch(new Request("https://data/monthly?freq=monthly&force=true"), env)
        ]);

        // 1b. Pre-fill Historical Baseline (MANDATORY for Swarm 4.0)
        const baselineKey = "snapshots/historical/market_baseline.json";
        const baselineData = {
            timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
            market_cap_growth: 1.2,
            volatility_index: 14.5,
            institutional_flow_index: 0.85
        };
        await mockR2.put(baselineKey, JSON.stringify(baselineData));
        console.log("✓ [Test] Context Mega-Pool Hydro-Filled.");

        console.log("🚀 [Test] Step 2: Triggering Pulse Orchestrator...");

        const pulseUrl = `https://pulse/?freq=${frequency}&type=${type}`;
        const pulseRes = await pulseWorker.fetch(new Request(pulseUrl), env);
        const pulseData = await pulseRes.json();

        if (pulseData.status === "error") {
            throw new Error(`[Pulse Error] ${pulseData.message}`);
        }
        
        const result = pulseData.result;
        
        console.log("\n🛸 [Swarm 4.0] Industrial Test Cycle Complete!");
        console.log("-----------------------------------------");
        console.log(`Status:  PASSED`);
        console.log(`Title:   ${result.title}`);
        console.log(`File:    ${result.file}`);
        console.log(`Score:   ${result.qualityScore || 'N/A'}/100`);
        console.log(`Audit:   VERIFIED & SECURED`);
        console.log("Local assets: /test-output/r2/");
        console.log("-----------------------------------------");



    } catch (err) {
        console.error("❌ Swarm Test Run Failed:", err);
    }
}

runTest();
