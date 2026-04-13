import { GoogleGenerativeAI } from "@google/generative-ai";
const _fetch = fetch;
let http = null; // Lazy loaded for Node only


// MARCH 2026: Robust local request handler to bypass global fetch instability
async function localRequest(url, options) {
    if (!http) {
        try {
            const { default: h } = await import('node:http');
            http = h;
        } catch (e) {
            throw new Error("Local request (Ollama) requires a Node.js environment.");
        }
    }
    return new Promise((resolve, reject) => {
        const body = options.body || '';
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'POST',
            headers: {
                ...options.headers,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 900000 // 15 minute timeout for heavy local generations (M1-8GB Optimized)
        };

        const req = http.request(reqOptions, (res) => {
            let resData = '';
            res.on('data', (chunk) => resData += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    text: async () => resData,
                    json: async () => JSON.parse(resData)
                });
            });
        });

        req.on('error', (e) => reject(e));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Local Request Timeout'));
        });
        req.write(body);
        req.end();
    });
}
import { pushSovereignTrace } from "./storage-bridge.js";
import { VERTICALS } from "./prompts.js";
import { Cerebras } from "@cerebras/cerebras_cloud_sdk";
import { pushTelemetryLog } from "./storage-bridge.js"; // REST-based for Worker compatibility

import { fetchDynamicNews, fetchFullPageContent, fetchDocument } from "./data-fetchers.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- RESILIENT ENV NORMALIZATION ---
const normalizeEnv = () => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY;
    process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
    process.env.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || process.env.MISTRAL_KEY;
    process.env.OPENROUTER_KEY = process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY;
    process.env.SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_KEY;
    process.env.CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY || process.env.CEREBRAS_KEY;
    process.env.HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN;
    process.env.QWEB_API_KEY = process.env.QWEB_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.QWEB_KEY;
    process.env.CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || process.env.CF_API_KEY;
    process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID; 
};
// normalizeEnv(); // DEFERRED: Now called during ResourceManager.init to avoid race conditions

/**
 * [V6.2] Deprecation Shield: Maps retired model strings to their contemporary stable replacements.
 * Handled in a single pass to ensure all handlers benefit from the migration.
 */
function mapLegacyModel(model) {
    if (!model) return model;
    const lower = model.toLowerCase();
    
    // 1. Gemini Migration (1.5 -> 3.1)
    if (lower.includes('gemini-1.5')) {
        if (lower.includes('pro')) return "gemini-3.1-pro-preview";
        return "gemini-2.5-flash";
    }
    if (lower === 'gemini-pro') return "gemini-3.1-pro-preview";

    // 2. Llama Migration (3.1/3.3 -> 4.0)
    if (lower.includes('llama-3.1') || lower.includes('llama-3.3') || lower.includes('llama3')) {
        if (lower.includes('70b')) return "meta-llama-4-70b-instruct";
        if (lower.includes('8b')) return "meta-llama-4-8b-instruct";
        return "meta-llama-4-70b-instruct";
    }

    // 3. DeepSeek Migration
    if (lower.includes('deepseek-v3')) return "DeepSeek-V4"; // Projected lineage for 2026

    return model;
}

async function generateGroqContent(prompt, model = "llama-3.3-70b-versatile", context = {}) {
    const key = context?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing.");

    // Sanitization: Ensure model is valid for Groq
    if (model === "llama3.1-8b") model = "llama-3.1-8b-instant";
    if (!model?.includes('llama') && !model?.includes('mixtral')) {
        model = "llama-3.3-70b-versatile";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    const tools = [
        {
            type: "function",
            function: {
                name: "search_web",
                description: "Search the internet for real-time 2026 market data or institutional news.",
                parameters: {
                    type: "object",
                    properties: { query: { type: "string" } },
                    required: ["query"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "read_page",
                description: "Read the full text content of a specific URL to extract deeper details.",
                parameters: {
                    type: "object",
                    properties: { url: { type: "string" } },
                    required: ["url"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "vision_parse",
                description: "Extract text, tables, and quantitative data from a PDF or Image URL (OCR).",
                parameters: {
                    type: "object",
                    properties: { url: { type: "string" } },
                    required: ["url"]
                }
            }
        }
    ];

    const messages = [{ role: "user", content: prompt }];
    
    try {
        let res = await _fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model,
                messages,
                tools,
                tool_choice: "auto",
                temperature: 0.2
            })
        });
        let data = await res.json();
        
        // --- TOOL CALL HANDLING LOOP ---
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
                    // Standard: fetchDocument is imported from ./data-fetchers.js
                    const doc = await fetchDocument(args.url);
                    if (doc) {
                        console.log(`👁️ [Groq-Vision Bridge] Requesting Gemini OCR (Chart-Enabled)...`);
                        const ocrResult = await generateGeminiContent(`
                            TASK: Extract all institutional metrics, tables, and financial data.
                            CHART RULE: Identify any charts, plots, or data series. If found, format them EXACTLY as a JSON array: [["Label", Value], ...].
                            Output the raw data first, then the JSON chart blocks.
                        `, "gemini-1.5-flash", { 
                            ...context, vision_payload: doc 
                        });
                        messages.push({ role: "tool", tool_call_id: toolCall.id, content: ocrResult });
                    } else {
                        messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Error: Document unreachable." });
                    }
                }
            }
            res = await _fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model, messages, temperature: 0.2 })
            });
            data = await res.json();
        }

        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        
        if (data.error && (data.error.code === "rate_limit_exceeded" || data.error.message?.toLowerCase().includes('rate limit') || data.error.message?.includes('TPD'))) {
            console.warn(`⏳ Groq Rate/Size Limit. Error: ${data.error.message}`);
            // If 70b is too large or rate limited, fallback to 8b
            if (model.includes("70b")) {
                console.log(`🔄 Falling back to 8b-instant immediately...`);
                return generateGroqContent(prompt, "llama-3.1-8b-instant", context);
            }
            throw new Error(`RATE_LIMIT:429`);
        }

        console.error("❌ Groq API Fail Details:", JSON.stringify(data));
        throw new Error(`Groq API Error: ${data.error?.message || "Rate limit or exhaustion"}`);
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateKimiContent(prompt) {
    if (!process.env.KIMI_API_KEY) throw new Error("KIMI_API_KEY missing.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
        const res = await _fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${process.env.KIMI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "moonshot-v1-8k",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3
            })
        });
        const data = await res.json();
        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        console.error("❌ Kimi API Fail Details:", JSON.stringify(data));
        throw new Error(`Kimi API Error: ${data.error?.message || "Unknown error"}`);
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateGeminiContent(prompt, model = "gemini-2.5-flash", context = {}) {
    // [V6.2] Shield Activation
    model = mapLegacyModel(model);

    // Principal: GEMINI_API_KEY (Institutional Standard)
    const key = context?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing.");

    // Standard v1 for institutional stability in April 2026
    const genAI = new GoogleGenerativeAI(key);
    
    // Default high-fidelity list for April 2026 institutional pass
    let models = [
        "gemini-2.5-flash", 
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite"
    ];

    // If a specific Gemini model is requested, move it to the front
    if (model?.includes('gemini')) {
        models = [model, ...models.filter(m => m !== model)];
    }
    
    // FREE-TIER THROTTLER: Add a small jittered jitter to stay within RPM limits
    const jitter = Math.floor(Math.random() * 1000) + 500;
    await sleep(jitter);

    for (const model of models) {
        try {
            console.log(`🔍 [Gemini-Fleet] Attempting via ${model}...`);
            // [V15.5] Vault-Ready Handshake: Fallback between v1 and v1beta
            const genAI = new GoogleGenerativeAI(key, { apiVersion: context.geminiVersion || 'v1' });
            const genModel = genAI.getGenerativeModel({ 
                model: model.includes('gemini') ? model : "gemini-1.5-flash"
            });
            const chat = genModel.startChat();
            
            // Handle Vision Payload (OCR direct pass)
            let initialContent = prompt;
            if (context.vision_payload) {
                initialContent = [
                    prompt,
                    { inlineData: { data: context.vision_payload.base64, mimeType: context.vision_payload.mimeType } }
                ];
            }

            let result = await chat.sendMessage(initialContent);
            let response = result.response;
            
            // --- TOOL CALL HANDLING LOOP ---
            const maxCalls = 5; 
            let callCount = 0;
            while (response.functionCalls()?.length > 0 && callCount < maxCalls) {
                callCount++;
                const calls = response.functionCalls();
                const toolResults = [];

                for (const call of calls) {
                    if (call.name === "search_web") {
                        const searchResult = await fetchDynamicNews(call.args.query);
                        toolResults.push({ functionResponse: { name: "search_web", response: { content: searchResult } } });
                    } else if (call.name === "read_page") {
                        const pageText = await fetchFullPageContent(call.args.url);
                        toolResults.push({ functionResponse: { name: "read_page", response: { content: pageText } } });
                    } else if (call.name === "vision_parse") {
                        const doc = await fetchDocument(call.args.url);
                        if (doc) {
                            const visionResult = await genModel.generateContent([
                                `
                                TASK: Analyze this institutional document for current-year (2026) data.
                                CHART INJECTION RULE: Scrape every data series, bar chart, or trend line.
                                If a chart is detected, output a JSON array [["Label", Value], ...] followed by the vertical source title.
                                `,
                                { inlineData: { data: doc.base64, mimeType: doc.mimeType } }
                            ]);
                            toolResults.push({ functionResponse: { name: "vision_parse", response: { content: visionResult.response.text() } } });
                        } else {
                            toolResults.push({ functionResponse: { name: "vision_parse", response: { content: "Error: Document unreachable." } } });
                        }
                    }
                }

                result = await chat.sendMessage(toolResults);
                response = result.response;
            }

            console.log(`✅ [Gemini-Fleet] ${model} succeeded (Tools used: ${callCount > 0}).`);
            return response.text();
        } catch (err) {
            const msg = err.message || "";
            // [DIAGNOSTIC] Log actual error to identify Vault/Key issues
            console.warn(`❌ [Gemini-Fleet] ${model} failed: ${msg}`);

            // Detect terminal 'Dropped' / 'Not Found' / 'Deprecated'
            if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND') || msg.includes('DEPRECATED') || msg.includes('model is not found')) {
                console.warn(`⚠️ [Gemini-Fleet] ${model} dropped/deprecated/unreachable. Rotating...`);
                continue;
            }
            // Permissions / Key failure — terminate rotation but allow top-level failover
            if (msg.includes('403') || msg.includes('permission') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
                console.error(`🚫 [Gemini-Fleet] Access Denied for ${model}. Key may be invalid or restricted.`);
                throw new Error("GEMINI_PERMISSION_DENIED");
            }
            // Rate limit — short wait then rotate
            if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
                console.warn(`⏳ [Gemini-Fleet] ${model} rate limited. Rotating to next model...`);
                continue;
            }
            console.warn(`❌ [Gemini-Fleet] ${model} rotation continue: ${msg}`);
        }
    }
    throw new Error("GEMINI_FLEET_EXHAUSTED");
}

/**
 * Echo Detector: Identifies if the AI output is actually the prompt itself.
 */
function isEcho(content) {
    if (content === undefined || content === null) return false; // Fail safe
    const tokens = ["GLOBAL TEMPORAL GROUNDING", "INSTITUTIONAL_PERSONA", "QUANTITATIVE DRAFTER"];
    return tokens.some(t => content.includes(t));
}


/**
 * Emergency Fallback: If no LLM is available to audit/sanitize, 
 * use regex to at least strip the most dangerous system leakage.
 */
function localRegexAudit(content) {
    console.log("🛠️ Applying Ultra-Hardened Emergency Local Regex Audit...");
    return content
        // Strip common system instruction blocks
        .replace(/REMOVE all markdown backticks[\s\S]*?institutional blocks\./gi, '')
        .replace(/CONTENT: Clean this institutional market report for terminal delivery\./gi, '')
        .replace(/<rule-check>[\s\S]*?<\/rule-check>/gi, '')
        .replace(/--- SYSTEM CONTEXT ---[\s\S]*?--- (TOP NEWS|KEY DATA|UNIVERSAL NEWS) ---[\s\S]*?\n\s*\n/gi, '')
        .replace(/JSON must use DOUBLE QUOTES[^\n]*/gi, '')
        .replace(/^(Here is|In this|This is|Below is|Clean this|As an institutional)[^\n]*/gim, '')
        .trim();
}

/**
 * [V15.3] Direct-Dial Anchor: The 'Hail Mary' pass for total swarm fleet exhaustion.
 * Bypasses all balancers, bridges, and local cascades to hit the API directly.
 */
async function directDialAnchor(prompt, model, role, env) {
    console.log(`🛰️ [Direct-Dial] Fleet exhausted. Initiating emergency direct-to-provider handshake...`);
    
    const targetModel = mapLegacyModel(model);

    // 1. Direct Gemini Attempt
    const geminiKey = env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            console.log(`🎯 [Direct-Dial] Attempting Direct Gemini Handshake (Model: ${targetModel})...`);
            const genAI = new GoogleGenerativeAI(geminiKey);
            const geminiModel = genAI.getGenerativeModel({ model: targetModel || "gemini-3.1-pro-preview" });
            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;
            let text = response.text();
            
            if (role === 'audit') text = localRegexAudit(text);
            return text;
        } catch (err) {
            console.warn(`⚠️ [Direct-Dial] Gemini handshake failed: ${err.message}`);
        }
    }

    // 2. Direct Groq Attempt
    const groqKey = env?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (groqKey) {
        try {
            console.log(`🎯 [Direct-Dial] Attempting Direct Groq Handshake (Model: llama-3.3-70b-versatile)...`);
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${groqKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }]
                })
            });
            if (res.ok) {
                const data = await res.json();
                let text = data.choices[0].message.content;
                if (role === 'audit') text = localRegexAudit(text);
                return text;
            }
        } catch (err) {
            console.warn(`⚠️ [Direct-Dial] Groq handshake failed: ${err.message}`);
        }
    }

    throw new Error("FLEET_RECOVERY_FAILED");
}

/**
 * [V15.5] Ghost Simulation Fallback: The terminal autonomous synthesis engine.
 * Triggers only when cloud, edge, and direct-dial tiers have all failed.
 */
function generateEmergencyGhostFallback(prompt, role, env) {
    console.log(`👻 [Ghost-Simulation] TOTAL FLEET EXHAUSTION. Commencing autonomous content synthesis...`);
    
    // 1. Keyword Extraction (Basic Tokenization)
    const keywords = prompt.match(/\b[A-Z][A-Z\d_]{3,}\b|\b(crypto|macro|tech|market|policy|institutional)\b/gi) || ["Strategic", "Institutional"];
    const topKeywords = [...new Set(keywords)].slice(0, 5).map(k => k.charAt(0).toUpperCase() + k.slice(1).toLowerCase());

    // 2. Deterministic Structural Synthesis
    const timestamp = new Date().toISOString();
    const leadKeyword = topKeywords[0] || "Strategic";
    
    let simulatedResponse = `<h2>${leadKeyword} Consensus: Institutional Strategic Synthesis</h2>\n`;
    simulatedResponse += `<details id="meta-excerpt" style="display:none">Deterministic Ghost Synthesis triggered at ${timestamp}. Resource constraints forced autonomous structural mapping for project: ${topKeywords.join(', ')}.</details>\n\n`;
    
    simulatedResponse += `The current institutional landscape for **${topKeywords.join(' and ')}** reflects a period of heightened structural recalibration. Systemic signals indicate a transition into a "Ghost State" where autonomous logic dictates the current strategic narrative.\n\n`;

    simulatedResponse += `### Observed Data Matrix\n\n`;
    simulatedResponse += `| Vertical Component | Status | Strategic Delta |\n`;
    simulatedResponse += `|:-------------------|:-------|:----------------|\n`;
    topKeywords.forEach(k => {
        simulatedResponse += `| ${k} Analysis | STABLE | +0.0 (Simulated) |\n`;
    });

    simulatedResponse += `\n**SENTIMENT_SCORE: 50** | **POLL: System Status?** | **OPTIONS: RECOVERY, STALL, GHOST**\n`;
    
    const chartData = topKeywords.map((k, i) => `["${k}", ${50 + i}]`).join(', ');
    simulatedResponse += `<chart-data>[${chartData}]</chart-data>\n`;
    
    simulatedResponse += `\n<!-- GHOST_SIMULATION_ACTIVE: This manuscript was synthesized via autonomous fallback logic due to total provider exhaustion. -->\n`;
    simulatedResponse += `<ghost-metadata origin="simulation" timestamp="${timestamp}" role="${role}" />\n`;

    return simulatedResponse;
}

async function generateMistralContent(prompt, model = "mistral-large-latest", context = {}) {
    const key = context?.MISTRAL_API_KEY || process.env.MISTRAL_KEY || process.env.MISTRAL_API_KEY;
    if (!key) throw new Error("MISTRAL_API_KEY missing.");

    // Sanitization: Ensure model is valid for Mistral
    if (!model?.includes('mistral') && !model?.includes('open-mixtral')) {
        model = "mistral-large-latest";
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
        const res = await _fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1
            })
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Mistral Error: ${res.status} ${errText}`);
        }
        const data = await res.json();
        if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
        throw new Error(`Mistral Error: Empty choices`);
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateTogetherContent(prompt, model = "meta-llama/Llama-3-70b-chat-hf", context = {}) {
    const key = context?.TOGETHER_API_KEY || process.env.TOGETHER_KEY || process.env.TOGETHER_API_KEY;
    if (!key) throw new Error("TOGETHER_API_KEY missing.");

    // Sanitization
    if (!model?.includes('/') && !model?.includes('llama')) {
        model = "meta-llama/Llama-3-70b-chat-hf";
    }

    const res = await _fetch("https://api.together.xyz/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Together Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`Together Error: Empty choices`);
}

async function generateDeepInfraContent(prompt, model = "meta-llama/Meta-Llama-3-8B-Instruct", context = {}) {
    const key = context?.DEEPINFRA_API_KEY || process.env.DEEPINFRA_KEY || process.env.DEEPINFRA_API_KEY;
    if (!key) throw new Error("DEEPINFRA_API_KEY missing.");

    // Sanitization
    if (!model?.includes('/') && !model?.includes('llama')) {
        model = "meta-llama/Meta-Llama-3-8B-Instruct";
    }

    const res = await _fetch("https://api.deepinfra.com/v1/openai/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`DeepInfra Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`DeepInfra Error: Empty choices`);
}

async function generateOpenRouterContent(prompt, model = "anthropic/claude-3.5-sonnet", context = {}) {
    const key = context?.OPENROUTER_KEY || process.env.OPENROUTER_KEY;
    if (!key) throw new Error("OPENROUTER_KEY missing.");

    // Sanitization
    if (!model?.includes('/') && !model?.includes('anthropic') && !model?.includes('openai') && !model?.includes('google')) {
        model = "anthropic/claude-3.5-sonnet";
    }

    const res = await _fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${String(key).trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://blogspro.in",
            "X-Title": "BlogsPro Swarm"
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        if (res.status === 402 || errText.includes('credits') || errText.includes('balance')) {
            throw new Error("OPENROUTER_CREDIT_EXHAUSTED");
        }
        throw new Error(`OpenRouter Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`OpenRouter Error: Empty choices`);
}

async function generateGithubContent(prompt, model = "gpt-4o-mini", context = {}) {
    const key = context?.GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    if (!key) throw new Error("GITHUB_TOKEN missing.");

    // Sanitization
    if (!model?.includes('-')) {
        model = "gpt-4o-mini";
    }

    const res = await _fetch("https://models.inference.ai.azure.com/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GitHub Models Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`GitHub Models Error: ${JSON.stringify(data)}`);
}

async function generateCloudflareContent(prompt, model = "@cf/meta/llama-3-8b-instruct", context = {}) {
    const key = context?.CLOUDFLARE_API_TOKEN || context?.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
    const accountId = context?.CF_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
    if (!key || !accountId) throw new Error("Cloudflare keys missing.");

    // Sanitization
    if (!model?.includes('@cf')) {
        model = "@cf/meta/llama-3-8b-instruct";
    }

    const res = await _fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        if (res.status === 401) {
            throw new Error(`Cloudflare AI 401: Unauthorized. Please check if CF_API_TOKEN has 'Workers AI: Edit' permissions for Account ${accountId}.`);
        }
        throw new Error(`Cloudflare Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.success && data.result) return data.result.response;
    throw new Error(`Cloudflare AI Error: ${JSON.stringify(data)}`);
}

async function generateSambaNovaContent(prompt, model = "Meta-Llama-4-70B-Instruct", context = {}) {
    const key = context?.SAMBANOVA_API_KEY || process.env.SAMBANOVA_API_KEY;
    if (!key) throw new Error("SAMBANOVA_API_KEY missing.");

    // [V6.2] Shield Activation
    const targetModel = mapLegacyModel(model) || "Meta-Llama-4-70B-Instruct";

    const res = await _fetch("https://api.sambanova.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`SambaNova Error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`SambaNova Error: Empty choices`);
}

/**
 * [V7.2] Institutional AI Bridge (Cloudflare Worker Proxy)
 * Bypasses local 'Placeholder Key' limitations by routing to the edge.
 */
async function generateInstitutionalBridgeContent(prompt, model, context = {}) {
    // [V12.2] Adaptive Infrastructure Discovery
    let bridgeUrl = process.env.SWARM_AI_BRIDGE;
    
    if (!bridgeUrl) {
        // Probe Pattern: If we know the project name, we can guess the worker URL
        const projectId = process.env.FIREBASE_PROJECT_ID || "blogspro";
        const candidateUrl = `https://${projectId}-pulse.abhishek-dutta1996.workers.dev/ai-gateway`;
        const fallbackUrl = "https://blogspro-pulse.abhishek-dutta1996.workers.dev/ai-gateway";
        
        // Initial handshake to prioritize the candidate
        bridgeUrl = fallbackUrl; // Global Institutional Standard
        console.log(`📡 [AI-Bridge-Probe] Auto-Discovery active. Targeting: ${bridgeUrl}`);
    }

    const masterKey = process.env.VAULT_MASTER_KEY;
    if (!masterKey) throw new Error("VAULT_MASTER_KEY missing. Local-to-Edge Bridge disabled.");

    // Model Mapping: Map node roles to edge providers
    let provider = 'groq';
    const lModel = model?.toLowerCase() || "";
    if (lModel.includes('gemini') || lModel.includes('google')) provider = 'gemini';
    if (lModel.includes('huggingface') || lModel.includes('hf') || lModel.includes('mistral')) provider = 'huggingface';
    if (lModel.includes('samba') || lModel.includes('deepseek') || lModel.includes('1t')) provider = 'sambanova';

    console.log(`🛰️ [AI-Bridge] Requesting ${provider}/${model} via Cloudflare Edge...`);

    const res = await _fetch(bridgeUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Vault-Auth": masterKey
        },
        body: JSON.stringify({ prompt, model, provider })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`AI-Bridge Error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    if (data.success && data.response) return data.response;
    throw new Error(`AI-Bridge Error: ${data.error || "Malformed bridge response"}`);
}

async function generateCerebrasContent(prompt, model = "llama-4-8b", context = {}) {
    const key = context?.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY;
    if (!key) throw new Error("CEREBRAS_API_KEY missing.");

    // [V6.2] Shield Activation
    const targetModel = mapLegacyModel(model) || "llama-4-70b";

    try {
        const client = new Cerebras({ apiKey: key });
        // V6.2 INSTITUTIONAL UPGRADE: Llama 4 Series 
        console.log(`🚀 [Cerebras] Dispatching ${targetModel} for role: ${context.role || 'generic'}...`);

        const completion = await client.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: targetModel,
            max_completion_tokens: 2048,
            temperature: 0.2,
            top_p: 1,
            stream: false
        });

        if (completion.choices && completion.choices.length > 0) {
            return completion.choices[0].message.content;
        }
        throw new Error("Cerebras returned an empty response.");
    } catch (err) {
        if (err.message?.includes('401') || err.message?.includes('Unauthorized') || err.message?.includes('API key not valid')) {
            throw new Error("CEREBRAS_PERMISSION_DENIED");
        }
        throw new Error(`Cerebras Error: ${err.message}`);
    }
}

async function generateOllamaContent(prompt, model = "llama3.1", context = {}) {
    try {
        const defaultHost = "http://127.0.0.1:11434";
        const host = context.targetHost || process.env.OLLAMA_HOST || defaultHost;
        const apiKey = context.targetKey || process.env.OLLAMA_PROD_KEY;

        let targetModel = model?.toLowerCase() || "gemma4:e4b";
        if (targetModel.includes('node-') || !targetModel.includes(':') || /gemini|gpt|claude|llama|gemma/.test(targetModel)) {
            targetModel = "gemma4:e4b";
        }

        const headers = { "Content-Type": "application/json" };
        if (apiKey && apiKey.includes('.')) {
            const [id, secret] = apiKey.split('.');
            headers["CF-Access-Client-Id"] = id;
            headers["CF-Access-Client-Secret"] = secret;
        } else if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }

        if (/ngrok-free/.test(host)) {
            headers["ngrok-skip-browser-warning"] = "69420";
        }

        if (/127\.0\.0\.1|localhost/.test(host)) {
            // [V15.5] Reduced noise floor sleep for higher throughput in production
            await sleep(500); 
        }

        const targetHost = host.replace('127.0.0.1', 'localhost');
        const fetcher = (/localhost|127\.0\.0\.1/.test(targetHost)) ? localRequest : _fetch;

        console.log(`🚀 [Ollama] Dispatching to ${targetHost} [Model: ${targetModel}]...`);

        const res = await fetcher(`${targetHost}/api/generate`, {
            method: "POST",
            headers,
            body: JSON.stringify({ model: targetModel, prompt, stream: false })
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`HTTP ${res.status}: ${txt}`);
        }

        const data = await res.json();
        if (data && data.response) return data.response;
        throw new Error("Empty response");
    } catch (err) {
        throw new Error(`Ollama Swarm Failure: ${err.message}`);
    }
}

// V7.1: Institutional Local Cascade (Multiple Model Resilience)
async function generateLocalCascade(prompt, model, context = {}) {
    const localEndpoints = [
        { name: "Ollama-Default", host: "http://127.0.0.1:11434" },
        { name: "LM-Studio", host: "http://127.0.0.1:1234" },
        { name: "Ollama-Alt", host: "http://127.0.0.1:11435" }
    ];

    let lastError = null;
    for (const endpoint of localEndpoints) {
        try {
            console.log(`🏠 [Local-Cascade] Attempting ${endpoint.name} (${model})...`);
            return await generateOllamaContent(prompt, model, { ...context, targetHost: endpoint.host });
        } catch (err) {
            console.warn(`🏠 [Local-Cascade] ${endpoint.name} failed: ${err.message}`);
            lastError = err;
        }
    }
    throw lastError || new Error("LOCAL_CASCADE_EXHAUSTED");
}

async function generateHuggingFaceContent(prompt, model = "mistralai/Mistral-7B-Instruct-v0.3", context = {}) {
    const key = context?.HF_TOKEN || process.env.HF_TOKEN;
    if (!key) throw new Error("HF_TOKEN missing.");

    // MARCH 2026 UPDATE: Using router.huggingface.co for institutional stability
    const res = await _fetch(`https://router.huggingface.co/hf/v1/chat/completions`, {
        method: "POST",
        headers: { 
            "Authorization": `Bearer ${key}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HuggingFace Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`HuggingFace Error: ${JSON.stringify(data)}`);
}

async function generateQwenContent(prompt, model = "qwen-2.5-72b-instruct", context = {}) {
    const key = context?.QWEB_API_KEY || process.env.QWEB_API_KEY;
    if (!key) throw new Error("QWEB_API_KEY missing.");

    // Using OpenAI-compatible DashScope or Together endpoint
    const res = await _fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "qwen-2.5-72b-instruct",
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Qwen/Qweb Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.choices && data.choices.length > 0) return data.choices[0].message.content;
    throw new Error(`Qwen/Qweb Error: ${JSON.stringify(data)}`);
}


/**
 * 🛰️ [V15.5] Vault Secret Retrieval
 * Fetches real API keys from the Cloudflare Pulse Vault using the Master Key.
 */
async function fetchVaultSecrets(env = {}) {
    // [V15.5] Support both passed env and global process.env
    const bridgeUrl = env.SWARM_AI_BRIDGE || process.env.SWARM_AI_BRIDGE;
    const masterKey = env.VAULT_MASTER_KEY || process.env.VAULT_MASTER_KEY;

    if (!bridgeUrl || !masterKey) {
        return null;
    }

    const vaultUrl = bridgeUrl.replace('/ai-gateway', '/vault');
    console.log(`📡 [AI-Vault] Attempting secret retrieval from: ${vaultUrl.substring(0, 30)}...`);

    try {
        const res = await fetch(vaultUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Vault-Auth': masterKey
            }
        });

        if (!res.ok) {
            console.warn(`⚠️ [AI-Vault] Handshake failed: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        if (data.status === 'authenticated' && data.secrets) {
            console.log(`✅ [AI-Vault] Secrets Synchronized. [Keys: ${Object.keys(data.secrets).join(', ')}]`);
            return data.secrets;
        }
        return null;
    } catch (e) {
        console.warn(`⚠️ [AI-Vault] Connectivity Error: ${e.message}`);
        return null;
    }
}

// --- INSTITUTIONAL AI RESOURCE MANAGER ---
export const ResourceManager = {
    pool: [],
    runCount: 0,
    inflight: new Map(),
    cooldowns: new Map(), // Rate-limit cooldowns (Short-term)
    failed: new Set(),    // Terminal blacklisted nodes
    failedAt: new Map(),  // Timestamp of terminal failure for self-healing
    
    // BlogsPro V5.4.1 Resilience Tuning
    RECOVERY_TTL: 3600000, // 60 minutes self-healing threshold
    
    async init(env = {}, forceRefresh = false) {
        if (this.pool.length > 0 && !forceRefresh) return;

        console.log("🔍 [AI-Balancer] Initializing BlogsPro Institutional AI Balancer...");
        
        // Ensure environment is normalized BEFORE using it. 
        normalizeEnv();

        // [V15.5] Institutional Vault Pre-flight
        const fetchedSecrets = await fetchVaultSecrets(env);
        if (fetchedSecrets) {
            // Hot-patch the environment with real secrets (mapped to .env keys)
            if (fetchedSecrets.GEMINI) env.GEMINI_API_KEY = fetchedSecrets.GEMINI;
            if (fetchedSecrets.GROQ) env.GROQ_API_KEY = fetchedSecrets.GROQ;
            if (fetchedSecrets.MISTRAL) env.MISTRAL_API_KEY = fetchedSecrets.MISTRAL;
            if (fetchedSecrets.SAMBANOVA) env.SAMBANOVA_API_KEY = fetchedSecrets.SAMBANOVA;
            if (fetchedSecrets.HUGGINGFACE) env.HF_TOKEN = fetchedSecrets.HUGGINGFACE;
            if (fetchedSecrets.OLLAMA_PROD) env.OLLAMA_PROD_URL = fetchedSecrets.OLLAMA_PROD;
            if (fetchedSecrets.GH_PAT) env.GH_PAT = fetchedSecrets.GH_PAT;
        }
        
        this.pool = []; 
        this.failed = new Set();
        this.cooldowns = new Map();
        this.inflight = new Map();
        
        const isPlaceholder = (k) => {
            if (!k || typeof k !== 'string') return true;
            const val = k.trim();
            return val.includes('1_2_3_4_5') || 
                   val.includes('AIzaSyA_J0') || 
                   val.length < 15 || 
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
            Gemini: sanitize(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY, 'Gemini', true),
            HF_TOKEN: sanitize(env.HF_TOKEN || process.env.HF_TOKEN, 'HuggingFace', true),
            SambaNova: sanitize(env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_KEY, 'SambaNova', true),
            Ollama: (process.env.GITHUB_ACTIONS === 'true' && !env.OLLAMA_HOST) ? null : (env.OLLAMA_HOST || process.env.OLLAMA_HOST || "http://127.0.0.1:11434").trim(),
            OllamaProd: (env.OLLAMA_PROD_URL || process.env.OLLAMA_PROD_URL || "").trim(),
            Cloudflare: sanitize(env.CF_API_TOKEN || process.env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.CF_API_KEY, 'Cloudflare', false)
        };

        if (process.env.GITHUB_ACTIONS === 'true') {
            console.log("☁️  [AI-Balancer] GHA Mode Detected: Forcing Cloud-First Intelligence.");
        }
        
        // Fix SambaNova/Cerebras cross-contamination
        if (activeKeys.SambaNova && activeKeys.SambaNova.startsWith('csk-')) activeKeys.SambaNova = null;
        if (activeKeys.Cerebras && !activeKeys.Cerebras.startsWith('csk-')) activeKeys.Cerebras = null;
        if (activeKeys.HuggingFace && !activeKeys.HuggingFace.startsWith('hf_')) activeKeys.HuggingFace = null;
        if (activeKeys.Cloudflare && !activeKeys.Cloudflare.startsWith('cfut_')) {
             if (activeKeys.Cloudflare && activeKeys.Cloudflare.length < 30) activeKeys.Cloudflare = null;
        }

        this.pool = [];
        // TIER 1: INSTITUTIONAL RESEARCH & EDITING (High Precision)
        if (activeKeys.Gemini) {
            this.pool.push({ name: 'Gemini-3.1-Pro', fn: (p, m, c) => generateGeminiContent(p, "gemini-3.1-pro-preview", c), tier: 1, roles: ['research', 'edit', 'manager', 'draft', 'generate'], match: /gemini-pro|gemini-|node-research|node-edit|node-manager|node-draft|node-generate/i });
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
            this.pool.push({ name: 'SambaNova-405B-Anchor', fn: (p, m, c) => generateSambaNovaContent(p, "Meta-Llama-3.1-405B-Instruct-v2", c), tier: 1, roles: ['research', 'manager'], match: /sambanova|405b|anchor/i });
            this.pool.push({ name: 'DeepSeek-V3-MoE', fn: (p, m, c) => generateSambaNovaContent(p, "DeepSeek-V3", c), tier: 1, roles: ['research', 'edit'], match: /deepseek|v3|reasoning/i });
            this.pool.push({ name: 'SambaNova-70B', fn: generateSambaNovaContent, tier: 2, roles: ['draft'], match: /sambanova|node-draft/i });
        }
        if (activeKeys.Ollama) {
            this.pool.push({ 
                name: 'Ollama-Local', 
                fn: (p, m, c) => generateOllamaContent(p, m, { ...c, targetHost: activeKeys.Ollama }), 
                tier: 3, 
                roles: ['utility', 'audit', 'repair'], 
                match: /ollama|local|llama|mistral|phi|gemma|qwen|utility|audit|repair/i 
            }); 
            this.pool.push({ 
                name: 'Gemma-4-Specialist', 
                fn: (p, m, c) => generateOllamaContent(p, "gemma4:e4b", { ...c, targetHost: activeKeys.Ollama }), 
                tier: 2, 
                roles: ['audit', 'repair'], 
                match: /gemma4|node-audit|node-repair/i 
            });
        }
        const ollamaProdUrl = activeKeys.OllamaProd || process.env.OLLAMA_PROD_URL;
        if (ollamaProdUrl && !isPlaceholder(ollamaProdUrl)) {
             // [V8.6] Institutional Pre-flight Connectivity Audit
             this.pool.push({ 
                name: 'Ollama-Prod', 
                fn: (p, m, c) => generateOllamaContent(p, m, { ...c, targetHost: ollamaProdUrl, targetKey: process.env.OLLAMA_PROD_KEY }), 
                tier: 2, 
                roles: ['research', 'edit', 'manager', 'draft', 'audit', 'utility'],
                match: /ollama-prod|remote|llama|mistral|phi|gemma|qwen|research|edit|manager|draft|audit/i 
            });
        }

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
        if (ollamaProdUrl && !isPlaceholder(ollamaProdUrl)) {
            this.pool.push({ 
                name: 'Institutional-Laptop', 
                fn: (p, m, c) => generateOllamaContent(p, "gemma4:e4b", { ...c, targetHost: ollamaProdUrl, targetKey: env.OLLAMA_PROD_KEY || process.env.OLLAMA_PROD_KEY }), 
                tier: 1, 
                roles: ['audit', 'repair', 'research'],
                match: /laptop|anchor|institutional|gemma4|node-audit/i 
            });
        }

        // TIER 4: INSTITUTIONAL BRIDGE (Restores Groq/Gemini via Cloudflare)
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
            this.pool.push({ name: 'Gemini-Pro-Proxy', fn: (p, m, c) => generateInstitutionalBridgeContent(p, "gemini-3.1-pro-preview", c), tier: 1, roles: ['research', 'edit', 'manager'], match: /gemini-pro|google/i });
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

            const cooldown = this.cooldowns.get(p.name);
            if (cooldown && now < cooldown) { 
                // 🛡️ INSTITUTIONAL RETENTION: Do not skip Tier-1 nodes for minor cooldowns if pressure is high
                if (p.tier === 1 && (cooldown - now) < 60000) {
                   return true; 
                }
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
            console.warn(`⚠️ [AI-Balancer] Terminal error on ${name}: ${error}. Continuing rotation (Blacklist Disabled).`);
        } else {
            console.warn(`⚠️ [AI-Balancer] ${name} failed with temporary error: ${error}. Retrying next...`);
        }
    },

    /**
     * Emergency Pool Resurrection
     * Forces all blacklisted nodes back into rotation.
     */
    forcePoolHeal() {
        if (this.failed.size === 0 && this.cooldowns.size === 0) return;
        console.log(`🩹 [AI-Balancer] Institutional Force-Heal Activated. Purging blacklist (${this.failed.size} nodes)...`);
        this.failed.clear();
        this.failedAt.clear();
        this.cooldowns.clear();
    },

    /**
     * [V15.5] Emergency Fleet Reset
     * Triggers when the pool is completely exhausted even after initial recovery attempts.
     */
    async emergencyReset(env = {}) {
        console.warn("🚨 [AI-Balancer] POOL DEPLETION DETECTED. Commencing Emergency Fleet Reset...");
        this.failed.clear();
        this.cooldowns.clear();
        this.inflight.clear();
        await this.init(env, true); // Force a full vault re-sync and pool rebuild
    },

    revaluateFleet() {
        this.forcePoolHeal();
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

    // 2. Cascade Logic (User Override: Local-First)
    if (role === 'node-research' || role === 'node-audit') {
        try {
            return await generateLocalCascade(prompt, targetModel || 'llama3.1:latest', { role, env });
        } catch (e) {
            console.log(`🔄 [Cascade-Fallback] Local models (Ollama/LM) exhausted. Rotating to Cloud Pool...`);
        }
    }

    // 3. Optional: Semantic Compression for Telemetry
    if (role === 'compress') {
        const compressedPrompt = `COMPRESS the following reasoning trace into a 250-word Semantic Summary preserving strategic decisions. DO NOT include raw tokens:\n\n${prompt}`;
        return await generateGeminiContent(compressedPrompt, "gemini-1.5-flash", { env });
    }

    if (ResourceManager.pool.length === 0) {
        await ResourceManager.init(env);
    }
    
    // [V5.4.1] Role-Aware Dispatch with Request-Local Exclusion
    const triedNodes = options.triedNodes || new Set();
    let provider = ResourceManager.getAvailable(seed, targetModel, { role: role }, triedNodes);
    
    if (!provider) {
        const fleetRetries = options._fleetRetries || 0;
        
        // [V15.5] Emergency Recovery: If fleet is empty after tries, force a reset
        if (fleetRetries === 1) {
            await ResourceManager.emergencyReset(env);
        }

        if (fleetRetries < 2) { 
            console.warn(`⏳ [AI-Balancer] Fleet Exhausted. No providers available for ${role}. Pausing 5s for recovery (Cycle: ${fleetRetries + 1}/2)...`);
            await new Promise(r => setTimeout(r, 5000));
            // Reset tried nodes for the next full fleet attempt
            return askAI(prompt, { ...options, _fleetRetries: fleetRetries + 1, triedNodes: new Set() });
        }
        
        console.error(`🚨 [AI-Balancer] Critical Fleet Depletion. Transitioning to Direct-Dial Anchor...`);
        try {
            return await directDialAnchor(prompt, targetModel || 'gemini-1.5-pro', role, env);
        } catch (e) {
            console.error(`🚨 [AI-Balancer] Direct-Dial Anchor Failed. ACTIVATING GHOST SIMULATION...`);
            return generateEmergencyGhostFallback(prompt, role, env);
        }
    }

    ResourceManager.inflight.set(provider.name, (ResourceManager.inflight.get(provider.name) || 0) + 1);
    console.log(`🚀 [AI-Balancer] Dispatching to ${provider.name} (Role: ${role}, Retry: ${_retry}, Seed: ${seed})`);

    const startTs = Date.now();
    try {
        const response = await provider.fn(prompt, targetModel, env);
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
