// Purged: Local LLM fallback logic

import { pushSovereignTrace } from "./storage-bridge.js";
import { VERTICALS } from "./prompts.js";
import { Cerebras } from "@cerebras/cerebras_cloud_sdk";
import { pushTelemetryLog, saveToCloudBucket } from "./storage-bridge.js"; // REST-based for Worker compatibility
import { GoogleGenerativeAI } from "@google/generative-ai";

import { fetchDynamicNews, fetchFullPageContent, fetchDocument } from "./data-fetchers.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- RESILIENT ENV NORMALIZATION ---
const normalizeEnv = () => {
    process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
    process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || process.env.MISTRAL_KEY;
    process.env.OPENROUTER_KEY = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
    process.env.SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_KEY;
    process.env.CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || process.env.CEREBRAS_KEY;
    process.env.HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
    process.env.QWEB_API_KEY = process.env.QWEB_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.QWEB_KEY;
    process.env.CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || process.env.CF_API_KEY;
    process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID; 
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
};

/**
 * [V6.2] Deprecation Shield: Maps retired model strings to their contemporary stable replacements.
 */
function mapLegacyModel(model) {
    if (!model) return model;
    const lower = model.toLowerCase();
    
    // 1. Gemini Migration
    if (lower.includes('gemini-pro')) return "gemini-1.5-pro";
    if (lower.includes('gemini-flash')) return "gemini-1.5-flash";

    // 2. Llama Migration (3.1/3.3 -> 4.0)
    if (lower.includes('llama-3.1') || lower.includes('llama-3.3') || lower.includes('llama3')) {
        if (lower.includes('405b')) return "Meta-Llama-3.1-405B-Instruct-v2";
        if (lower.includes('70b')) return "llama-3.3-70b";
        if (lower.includes('8b')) return "llama-3.1-8b";
        return "llama-3.3-70b";
    }

    // 3. DeepSeek Migration
    if (lower.includes('deepseek-v3')) return "DeepSeek-V3";

    return model;
}

async function generateGroqContent(prompt, model = "llama-3.3-70b-versatile", context = {}) {
    const key = context?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing.");

    // Sanitization: Ensure model is valid for Groq
    if (model === "llama3.1-8b") model = "llama-3.1-8b-instant";
    const groqCompatible = ['llama', 'mixtral', 'gemma', 'whisper', 'distil-'];
    if (!groqCompatible.some(prefix => model?.toLowerCase().includes(prefix))) {
        model = "llama-3.3-70b-versatile";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const tools = [
        { type: "function", function: { name: "search_web", description: "Search the internet.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
        { type: "function", function: { name: "read_page", description: "Read URL.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
        { type: "function", function: { name: "vision_parse", description: "OCR.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } }
    ];

    const messages = [{ role: "user", content: prompt }];
    
    try {
        let res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, tools, tool_choice: "auto", temperature: 0.2 })
        });
        let data = await res.json();
        
        const maxCalls = 5;
        let callCount = 0;
        while (data.choices?.[0]?.message?.tool_calls && callCount < maxCalls) {
            callCount++;
            const toolCalls = data.choices[0].message.tool_calls;
            messages.push(data.choices[0].message);
            for (const toolCall of toolCalls) {
                if (toolCall.function.name === "search_web") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const searchResult = await fetchDynamicNews(args.query);
                    messages.push({ role: "tool", tool_call_id: toolCall.id, content: searchResult });
                } else if (toolCall.function.name === "read_page") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const pageText = await fetchFullPageContent(args.url);
                    messages.push({ role: "tool", tool_call_id: toolCall.id, content: pageText });
                } else if (toolCall.function.name === "vision_parse") {
                    const args = JSON.parse(toolCall.function.arguments);
                    const doc = await fetchDocument(args.url);
                    if (doc) {
                        const ocrResult = await generateGroqContent(`
                            TASK: Extract all institutional metrics, tables, and financial data.
                            CHART RULE: Identify any charts, plots, or data series.
                        `, "llama-3.1-70b-versatile", { ...context, vision_payload: doc });
                        messages.push({ role: "tool", tool_call_id: toolCall.id, content: ocrResult });
                    } else {
                        messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Error: Document unreachable." });
                    }
                }
            }
            res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, messages, temperature: 0.2 })
            });
            data = await res.json();
        }

        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        throw new Error(`Groq API Error: ${data.error?.message || "Unknown error"}`);
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateGeminiContent(prompt, model = "gemini-1.5-flash", context = {}) {
    const key = context?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing.");

    let models = ["gemini-2.5-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
    if (model?.includes('gemini')) {
        models = [model, ...models.filter(m => m !== model)];
    }
    
    await sleep(Math.floor(Math.random() * 1000) + 500);

    for (const modelName of models) {
        try {
            console.log(`🔍 [Gemini-Fleet] Attempting via ${modelName}...`);
            const genAI = new GoogleGenerativeAI(key);
            const genModel = genAI.getGenerativeModel({ model: modelName });
            
            let initialContent = prompt;
            if (context.vision_payload) {
                initialContent = [
                    prompt,
                    { inlineData: { data: context.vision_payload.base64, mimeType: context.vision_payload.mimeType } }
                ];
            }

            const result = await genModel.generateContent(initialContent);
            const response = await result.response;
            return response.text();
        } catch (err) {
            console.warn(`❌ [Gemini-Fleet] ${modelName} failed: ${err.message}`);
            if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('404')) continue;
            throw err;
        }
    }
    throw new Error("GEMINI_FLEET_EXHAUSTED");
}

async function generateSambaNovaContent(prompt, model = "Meta-Llama-3.1-405B-Instruct-v2", context = {}) {
    const key = context?.SAMBANOVA_API_KEY || process.env.SAMBANOVA_API_KEY;
    if (!key) throw new Error("SAMBANOVA_API_KEY missing.");

    const targetModel = mapLegacyModel(model) || "Meta-Llama-3.1-405B-Instruct-v2";
    const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1
        })
    });
    if (!res.ok) throw new Error(`SambaNova Error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
}

async function generateCerebrasContent(prompt, model = "llama-3.3-70b", context = {}) {
    const key = context?.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY;
    if (!key) throw new Error("CEREBRAS_API_KEY missing.");
    const targetModel = mapLegacyModel(model) || "llama-3.3-70b";
    const client = new Cerebras({ apiKey: key });
    const completion = await client.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: targetModel,
        temperature: 0.2
    });
    return completion.choices[0].message.content;
}

// --- Balancer and Dispatch Logic ---
export const ResourceManager = {
    pool: [],
    cooldowns: new Map(),
    failed: new Set(),
    
    async init(env = {}, forceRefresh = false) {
        if (this.pool.length > 0 && !forceRefresh) return;
        normalizeEnv();
                   val.includes('REPLACE_WITH_KEY') || 
                   val.includes('YOUR_TOKEN');
        };
        
        const isBridgeActive = !!(env.VAULT_MASTER_KEY || process.env.VAULT_MASTER_KEY || env.SWARM_AI_BRIDGE || process.env.SWARM_AI_BRIDGE);

        const sanitize = (val, nodeName = null, supportsBridge = false) => {
            if (!val || typeof val !== 'string') return null;
            const cleaned = val.replace(/[^\x20-\x7E]/g, '').trim();
            
            if (isPlaceholder(cleaned)) {
                if (nodeName) {
                    if (isBridgeActive && supportsBridge) {
                        console.log(`📡 [AI-Balancer] Node "${nodeName}" (Bridged): Local key is placeholder, routing via Institutional Gateway.`);
                    } else {
                        console.warn(`🚫 [AI-Balancer] Node "${nodeName}" inactive: Placeholder Key Detected.`);
                    }
                }
                return null;
            }
            return cleaned;
        };

        const activeKeys = {
            Groq: sanitize(env.GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.GROQ_KEY, 'Groq', true),
            // Gemini: sanitize(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY, 'Gemini', true), // Purged
            Cerebras: sanitize(env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY, 'Cerebras', true),
            HF_TOKEN: sanitize(env.HF_TOKEN || process.env.HF_TOKEN, 'HuggingFace', true),
            SambaNova: sanitize(env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_KEY, 'SambaNova', true),
            // Ollama Purged 2026-04-14

            Cloudflare: sanitize(env.CF_API_TOKEN || process.env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.CF_API_KEY, 'Cloudflare', false)
        };

        if (process.env.GITHUB_ACTIONS === 'true') {
            console.log("☁️  [AI-Balancer] GHA Mode Detected: Forcing Cloud-First Intelligence.");
        }
        
        // Fix SambaNova/Cerebras cross-contamination (Relaxed for V15.7)
        if (activeKeys.HuggingFace && !activeKeys.HuggingFace.startsWith('hf_')) activeKeys.HuggingFace = null;
        if (activeKeys.Cloudflare && !activeKeys.Cloudflare.startsWith('cfut_')) {
             if (activeKeys.Cloudflare && activeKeys.Cloudflare.length < 30) activeKeys.Cloudflare = null;
        }

        this.pool = [];
        // TIER 1: INSTITUTIONAL RESEARCH & EDITING (High Precision Sovereign Anchor)
        if (activeKeys.SambaNova) {
            // [V15.6] SambaNova 405B: The Primary Strategic Anchor for the Cynical Reconstruction
            this.pool.push({ name: 'SambaNova-405B-Anchor', fn: (p, m, c) => generateSambaNovaContent(p, "Meta-Llama-3.1-405B-Instruct-v2", c), tier: 1, roles: ['research', 'manager', 'consolidate'], match: /sambanova|405b|anchor/i });
            this.pool.push({ name: 'DeepSeek-V3-MoE', fn: (p, m, c) => generateSambaNovaContent(p, "DeepSeek-V3", c), tier: 1, roles: ['research', 'edit'], match: /deepseek|v3|reasoning/i });
        }
        if (activeKeys.Cerebras) {
            this.pool.push({ name: 'Cerebras-Llama-4-70B', fn: (p, m, c) => generateCerebrasContent(p, m || "llama-4-70b", c), tier: 1, roles: ['research', 'edit', 'draft', 'audit', 'generate'], match: /cerebras|llama-4|llama|node-research|node-edit|node-draft|node-audit|node-generate/i });
        }
        if (activeKeys.Groq) {
            this.pool.push({ name: 'Groq-70B-Versatile', fn: (p, m, c) => generateGroqContent(p, m || "llama-3.3-70b-versatile", c), tier: 1, roles: ['research', 'edit', 'draft', 'generate'], match: /groq|node-research|node-edit|node-draft|node-generate|llama/i });
            this.pool.push({ name: 'Gemma-2-9B-Auditor', fn: (p, m, c) => generateGroqContent(p, "gemma2-9b-it", c), tier: 2, roles: ['audit', 'repair'], match: /gemma|node-audit|node-repair/i });
        }

        // TIER 2: HIGH-THROUGHPUT DRAFTING (Cost-Efficient)
        if (activeKeys.SambaNova) {
            this.pool.push({ name: 'SambaNova-70B', fn: generateSambaNovaContent, tier: 2, roles: ['draft'], match: /sambanova|node-draft/i });
        }

        // Purged: Local Ollama Pool initialization


        // TIER 3: RESILIENCE FALLBACKS
        if (activeKeys.Cloudflare) {
             this.pool.push({ name: 'Cloudflare', fn: generateCloudflareContent, tier: 3, roles: ['utility'], match: /cloudflare|node-utility/i }); 
        }
        if (activeKeys.HuggingFace) {
             this.pool.push({ name: 'HuggingFace', fn: generateHuggingFaceContent, tier: 3, roles: ['utility'], match: /huggingface|hf|node-utility/i });
        }
        if (activeKeys.OpenRouter) {
            this.pool.push({ name: 'Kimi-K1.5-Pro', fn: (p, m, c) => generateOpenRouterContent(p, "moonshotai/kimi-k1.5-pro", c), tier: 1, roles: ['research', 'edit'], match: /kimi|pro/i });
            this.pool.push({ name: 'DeepSeek-V3-OpenRouter', fn: (p, m, c) => generateOpenRouterContent(p, "deepseek/deepseek-v3", c), tier: 1, roles: ['research'], match: /deepseek/i });
            this.pool.push({ name: 'Nemotron-340B-Giant', fn: (p, m, c) => generateOpenRouterContent(p, "nvidia/nemotron-4-340b-instruct", c), tier: 1, roles: ['research'], match: /nemotron|giant/i });
            this.pool.push({ name: 'Grok-1-Institutional', fn: (p, m, c) => generateOpenRouterContent(p, "x-ai/grok-1", c), tier: 1, roles: ['research'], match: /grok/i });
            this.pool.push({ name: 'OpenRouter', fn: generateOpenRouterContent, tier: 3, roles: ['utility'], match: /openrouter|node-utility/i });
        }

        // TIER 4: INSTITUTIONAL ANCHOR (Extreme Resilience)
        // Purged: Institutional Laptop Anchor logic


        // TIER 4: INSTITUTIONAL BRIDGE (Restores Groq/Llama via Cloudflare)
        if (isBridgeActive) {
            this.pool.push({ 
                name: 'Cloudflare-Gateway', 
                fn: generateInstitutionalBridgeContent, 
                tier: 2, 
                roles: ['research', 'manager', 'audit', 'utility'], 
                match: /bridge|gateway|institutional/i 
            });

            // [V12.0] VIRTUAL PROXY NODES (Unlocks Cloud models despite local placeholders)
            // These act as direct mappings to the Edge Bridge to ensure high-parameter utilization.
            this.pool.push({ name: 'Groq-70B-Proxy', fn: (p, m, c) => generateInstitutionalBridgeContent(p, "llama-3.3-70b-versatile", c), tier: 1, roles: ['research', 'edit'], match: /groq|node-research|70b/i });
            this.pool.push({ name: 'DeepSeek-V3-1T', fn: (p, m, c) => generateInstitutionalBridgeContent(p, "DeepSeek-V3", c), tier: 1, roles: ['research', 'edit'], match: /deepseek|v3|1t|reasoning/i });
            // [REMOVED] Gemini-Pro-Proxy
            this.pool.push({ name: 'HuggingFace-Proxy', fn: (p, m, c) => generateInstitutionalBridgeContent(p, m || "mistralai/Mistral-7B-Instruct-v0.3", c), tier: 2, roles: ['utility', 'audit'], match: /huggingface|hf|mistral/i });
            
            // [V12.0] Gemma-4 Shadow Audit (Cloud Proxy for GHA Continuity)
            this.pool.push({ name: 'Gemma-4-Proxy', fn: (p, m, c) => generateInstitutionalBridgeContent(p, "gemma2-9b-it", c), tier: 2, roles: ['audit', 'repair'], match: /gemma|node-audit|node-repair/i });

            console.log("🏙️ [AI-Balancer] Institutional Bridge & Proxy Nodes Active. (V15.5 Hardened)");
        }
        
        this.pool.forEach(p => this.inflight.set(p.name, 0));
        console.log(`🌐 [AI-Balancer] V5.4.1 Pool initialized (${this.pool.length} nodes): ${this.pool.map(p => p.name).join(', ')}`);
        
        // Institutional Telemetry: Audit Pool State
        try {
            pushTelemetryLog("SWARM_AI_POOL_V2_INITIALIZED", {
                status: "success",
                nodeCount: this.pool.length,
                capabilities: {
                    research: this.pool.filter(p => p.roles?.includes('research')).length,
                    draft: this.pool.filter(p => p.roles?.includes('draft')).length,
                    audit: this.pool.filter(p => p.roles?.includes('audit')).length
                }
            }, env);
        } catch (e) {}
    },

    getAvailable(seed = 0, requestedModel = null, context = {}, excludeSet = new Set()) {
        const now = Date.now();
        let candidates = this.pool.filter(p => {
            // [V15.5] Request-Local Exclusion Filter
            if (excludeSet.has(p.name)) {
                return false;
            }

            // [V16.0] Terminal Blacklist Check (The Suicide Loop Fix)
            if (this.failed.has(p.name)) {
                return false;
            }

            const cooldown = this.cooldowns.get(p.name);
            if (cooldown && now < cooldown) { 
                console.log(`⏳ [AI-Balancer] Skipping node on cooldown (${Math.ceil((cooldown - now)/1000)}s): ${p.name}`);
                return false;
            }
            return true;
        });

        if (candidates.length === 0) {
            // If all candidates were excluded but we have items in the pool, 
            // the excludeSet might be too aggressive for the current retry.
            // We return null to signal fleet exhaustion to the caller.
            return null;
        }

        // MARCH 2026 UPDATE: Model & Role-Aware Priority
        if (requestedModel || context?.role) {
            const requestedRole = context.role?.replace('node-', ''); // Normalize persona to capability
            const matches = candidates.filter(p => {
                const modelMatch = requestedModel ? (p.match && p.match.test(requestedModel)) : true;
                const roleMatch = requestedRole ? (p.roles && p.roles.includes(requestedRole)) : true;
                return modelMatch && roleMatch;
            });
            if (matches.length > 0) {
                candidates = matches;
            }
        }
        console.log(`🔍 [AI-Balancer] Candidates for ${context?.role || 'generic'}/${requestedModel || 'any'}: ${candidates.map(p => p.name).join(', ')}`);

        candidates.sort((a, b) => {
            // 🛡️ INSTITUTIONAL ALIGNMENT: Prioritize Exact/Regex Match over Tier
            if (requestedModel) {
                const matchA = a.match && a.match.test(requestedModel);
                const matchB = b.match && b.match.test(requestedModel);
                if (matchA && !matchB) return -1;
                if (!matchA && matchB) return 1;
            }

            if (a.tier !== b.tier) return a.tier - b.tier;

            const infA = this.inflight.get(a.name);
            const infB = this.inflight.get(b.name);
            if (infA !== infB) return infA - infB;
            
            // If still tied, prefer the one with NO cooldown
            const coolA = this.cooldowns.get(a.name) || 0;
            const coolB = this.cooldowns.get(b.name) || 0;
            return coolA - coolB;
        });

        const startIdx = seed % candidates.length;
        return candidates[startIdx];
    },

    markFailure(name, error) {
        const current = this.inflight.get(name);
        if (current > 0) this.inflight.set(name, current - 1);
        
        const isRate = error.includes('429') || error.includes('rate_limit') || error.includes('TPM') || error.includes('quota') || error.includes('RATE_LIMIT');
        const isAuth = error.includes('401') || error.includes('403') || error.includes('402') || error.includes('Unauthorized') || error.includes('API key') || error.includes('Authentication') || error.includes('permission') || error.includes('NOT_FOUND') || error.includes('Not Found') || error.includes('404') || error.includes('PERMISSION_DENIED') || error.includes('Invalid Key') || error.includes('Invalid API Key') || error.includes('CREDIT_EXHAUSTED') || error.includes('4018'); // ERR_NGROK_4018

        if (isRate) {
            console.warn(`⏳ [AI-Balancer] ${name} rate limited. Activating 60000ms cooldown.`);
            this.cooldowns.set(name, Date.now() + 60000);
        } else if (isAuth) {
            console.error(`🚫 [AI-Balancer] Terminal error on ${name}: ${error}. Blacklisting node...`);
            this.failed.add(name);
            this.failedAt.set(name, Date.now());
        } else {
            console.warn(`⚠️ [AI-Balancer] ${name} failed with temporary error: ${error}. Retrying next...`);
        }
    },

    /**
     * Emergency Pool Resurrection
     * Forces all blacklisted nodes back into rotation.
     */
    forcePoolHeal() {
        if (this.failed.size === 0) return;
        console.log(`🩹 [AI-Balancer] Institutional Force-Heal Activated. Purging blacklist (${this.failed.size} nodes)...`);
        this.failed.clear();
        this.failedAt.clear();
    },

    /**
     * [V15.5] Emergency Fleet Reset
     * Triggers when the pool is completely exhausted even after initial recovery attempts.
     */
    async emergencyReset(env = {}) {
        console.warn("🚨 [AI-Balancer] POOL DEPLETION DETECTED. Commencing Emergency Fleet Reset...");
        this.failed.clear();
        this.inflight.clear();
        await this.init(env, true); // Force a full vault re-sync and pool rebuild
    },

    revaluateFleet() {
        console.log("♻️ [AI-Balancer] Harvesting fresh fleet nodes...");
        this.failed.clear();
        // Preserving temporary cooldowns to prevent recursive 429 loops (The Suicide Loop Fix)
    }
};

/**
 * V7.1: Institutional Role-Based Semantic Dispatcher
 * Implements Local-First Cascade and Semantic Compression.
 */
export async function askAI(prompt, options = {}) {
    const env = options.env || process.env;
    if (env.DRY_RUN) {
        console.log("🕵️ [DRY-RUN] Globally bypassing AI tier for institutional verification.");
        return "[DRY-RUN MOCK CONTENT]: Strategic Institutional synthesis for BlogsPro 5.0. No AI tokens consumed.";
    }
    const { role = 'generate', model, env: envOpt = {}, seed = 0, frequency = 'hourly', _retry = 0, jobId = null } = options;

    // [V14.1] Autonomous Fleet Revaluation: Clear blacklists for fresh swarm runs
    if (jobId && jobId.startsWith('swarm-') && _retry === 0) {
        ResourceManager.revaluateFleet();
    }
    
    // 1. INTELLIGENCE ENGINE: Decision Tree Routing (V12.0)
    let targetModel = model;
    if (!targetModel) {
        try {
            const { routeToBestModel } = await import("./intelligence-engine.js");
            targetModel = routeToBestModel(role, env);
            console.log(`🧬 [Decision-Tree] Routed ${role} -> ${targetModel}`);
        } catch (e) {
            console.warn("⚠️ [Intelligence-Engine] Decision routing failed, falling back to defaults.");
        }
    } else {
        console.log(`🛡️ [AI-Override] Using mandatory model: ${targetModel}`);
    }

    // Local Cascade Purged


    // 3. Optional: Semantic Compression for Telemetry
    if (role === 'compress') {
        const compressedPrompt = `COMPRESS the following reasoning trace into a 250-word Semantic Summary preserving strategic decisions. DO NOT include raw tokens:\n\n${prompt}`;
        return askAI(compressedPrompt, { role: 'generate', env, model: 'llama-4-70b' });
    }

    if (ResourceManager.pool.length === 0) {
        await ResourceManager.init(env);
    }
    
    // [V12.5] Cynical Pre-Flight Audit: Fast-fail if override is impossible
    if (targetModel && targetModel !== 'auto') {
        const hasCandidate = ResourceManager.pool.some(p => p.match && p.match.test(targetModel));
        if (!hasCandidate) {
            console.error(`🚫 [AI-PreFlight] CRITICAL: Manual model override '${targetModel}' is unavailable (likely missing API Key).`);
            throw new Error(`[AI-Fleet-Fatal] Manual model override '${targetModel}' is not present in the active pool. Check your GHA Secrets.`);
        }
    }

    // [V5.4.1] Role-Aware Dispatch with Request-Local Exclusion
    const triedNodes = options.triedNodes || new Set();
    let provider = ResourceManager.getAvailable(seed, targetModel, { role: role }, triedNodes);
    
    // [V12.5] Speculative Yield: If override is busy but task is speculative, fallback to auto
    if (!provider && targetModel && targetModel !== 'auto' && options.isSpeculative) {
        console.warn(`⏳ [AI-Yield] Speculative task (${role}) yielding override '${targetModel}' due to congestion. Falling back to auto-balancer.`);
        targetModel = 'auto'; 
        provider = ResourceManager.getAvailable(seed, targetModel, { role: role }, triedNodes);
    }
    
    if (!provider) {
        const fleetRetries = options._fleetRetries || 0;
        
        // [V15.5] Emergency Recovery: If fleet is empty after tries, force a reset
        if (fleetRetries === 1) {
            await ResourceManager.emergencyReset(env);
        }

        if (fleetRetries < 2) { 
            console.warn(`⏳ [AI-Balancer] Fleet Exhausted. No providers available for ${role}. Pausing 30s for recovery (Cycle: ${fleetRetries + 1}/2)...`);
            await new Promise(r => setTimeout(r, 65000));
            // Reset tried nodes for the next full fleet attempt
            return askAI(prompt, { ...options, _retry: 0, _fleetRetries: fleetRetries + 1, triedNodes: new Set() });
        }
        
        console.error(`🚨 [AI-Balancer] Critical Fleet Depletion. Transitioning to Direct-Dial Anchor...`);
        try {
            return await directDialAnchor(prompt, targetModel || 'llama-3.3-70b-versatile', role, env);
        } catch (e) {
            throw new Error("FLEET_EXHAUSTION_PERMANENT");
        }
    }

    ResourceManager.inflight.set(provider.name, (ResourceManager.inflight.get(provider.name) || 0) + 1);

    console.log(`🚀 [AI-Balancer] Dispatching to ${provider.name} (Role: ${role}, Retry: ${_retry}, Seed: ${seed})`);

    const startTs = Date.now();
    try {
        console.log(`🌐 [AI-Provisioned] ${role.toUpperCase()} -> ${provider.name} (Requested: ${targetModel || 'auto'})`);
        const response = await provider.fn(prompt, targetModel, env);
        
        // [V15.8] Content Integrity Check
        if (!isValidIntelligence(response)) {
            throw new Error(`INTELLIGENCE_CORRUPTED: ${provider.name} returned invalid/HTML content.`);
        }

        if (isEcho(response)) throw new Error(`ECHO_DETECTED: ${provider.name} echoed the prompt.`);

        const latency = Date.now() - startTs;
        pushSovereignTrace("AI_INTERACTION", {
            jobId: options.jobId || 'local',
            status: "success",
            latency: latency,
            role: role,
            model: provider.name,
            message: `Interaction complete via ${provider.name}`
        }, env).catch(() => {});

        const currentInp = ResourceManager.inflight.get(provider.name);
        if (currentInp > 0) ResourceManager.inflight.set(provider.name, currentInp - 1);
        return response;
    } catch (err) {
        const latency = Date.now() - startTs;
        console.error(`❌ [AI-Balancer] ${provider.name} failed: ${err.message}`);
        
        pushSovereignTrace("AI_FAILURE", {
            jobId: options.jobId || 'local',
            status: "error",
            latency: latency,
            role: role,
            model: provider.name,
            message: `Interaction failed: ${err.message}`
        }, env).catch(() => {});

        ResourceManager.markFailure(provider.name, err.message);
        triedNodes.add(provider.name);
        
        if (_retry >= 3) { // [V15.5] Lowered from 5 to 3
            console.error(`❌ [AI-Balancer] ${provider.name} repeatedly failed. Escalating to Fleet Recovery...`);
            return askAI(prompt, { ...options, _retry: 0, _fleetRetries: (options._fleetRetries || 0) + 1, triedNodes: new Set() });
        }
        return askAI(prompt, { ...options, _retry: _retry + 1, triedNodes });
    }
}

export default { askAI };
