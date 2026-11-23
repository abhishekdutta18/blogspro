// Purged: Local LLM fallback logic

import { pushSovereignTrace } from "./storage-bridge.js";
import { VERTICALS } from "./prompts.js";
import { Cerebras } from "@cerebras/cerebras_cloud_sdk";
import { pushTelemetryLog, saveToCloudBucket } from "./storage-bridge.js"; // REST-based for Worker compatibility
import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";

import { fetchDynamicNews, fetchFullPageContent, fetchDocument } from "./data-fetchers.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- RESILIENT ENV NORMALIZATION ---
const normalizeEnv = () => {
    const cleanKeys = [
        'GROQ_API_KEY', 'GROQ_KEY',
        'MISTRAL_API_KEY', 'MISTRAL_KEY',
        'OPENROUTER_KEY', 'OPENROUTER_API_KEY',
        'SAMBANOVA_API_KEY', 'SAMBANOVA_KEY',
        'CEREBRAS_API_KEY', 'CEREBRAS_KEY',
        'HF_TOKEN', 'HUGGINGFACE_TOKEN',
        'QWEB_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY', 'QWEB_KEY',
        'CF_API_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CF_API_KEY',
        'CF_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID',
        'GEMINI_API_KEY', 'GEMINI_KEY', 'GOOGLE_API_KEY'
    ];
    for (const k of cleanKeys) {
        if (process.env[k] !== undefined) {
            const val = String(process.env[k]).trim();
            if (val === 'undefined' || val === 'null' || !val) {
                delete process.env[k];
            }
        }
    }
    
    const setIfExist = (target, ...sources) => {
        for (const src of sources) {
            if (src && src !== 'undefined' && src !== 'null') {
                process.env[target] = src.trim();
                return;
            }
        }
    };

    setIfExist('GROQ_API_KEY', process.env.GROQ_API_KEY, process.env.GROQ_KEY);
    setIfExist('MISTRAL_API_KEY', process.env.MISTRAL_API_KEY, process.env.MISTRAL_KEY);
    setIfExist('OPENROUTER_KEY', process.env.OPENROUTER_KEY, process.env.OPENROUTER_API_KEY);
    setIfExist('SAMBANOVA_API_KEY', process.env.SAMBANOVA_API_KEY, process.env.SAMBANOVA_KEY);
    setIfExist('CEREBRAS_API_KEY', process.env.CEREBRAS_API_KEY, process.env.CEREBRAS_KEY);
    setIfExist('HF_TOKEN', process.env.HF_TOKEN, process.env.HUGGINGFACE_TOKEN);
    setIfExist('QWEB_API_KEY', process.env.QWEB_API_KEY, process.env.QWEN_API_KEY, process.env.DASHSCOPE_API_KEY, process.env.QWEB_KEY);
    setIfExist('CF_API_TOKEN', process.env.CF_API_TOKEN, process.env.CLOUDFLARE_API_TOKEN, process.env.CF_API_KEY);
    setIfExist('CF_ACCOUNT_ID', process.env.CF_ACCOUNT_ID, process.env.CLOUDFLARE_ACCOUNT_ID);
    setIfExist('GEMINI_API_KEY', process.env.GEMINI_API_KEY, process.env.GEMINI_KEY, process.env.GOOGLE_API_KEY);
};

/**
 * [V6.2] Deprecation Shield: Maps retired model strings to their contemporary stable replacements.
 */
function isValidIntelligence(response) {
    if (!response || typeof response !== 'string') return false;
    if (response.length < 10) return false;
    const lower = response.toLowerCase();
    const refusals = [
        "as an ai",
        "i cannot fulfill",
        "i am unable to",
        "i don't have access to",
        "my programming prevents",
        "sorry, i can't",
        "i apologize"
    ];
    return !refusals.some(r => lower.includes(r));
}

function isEcho(response) {
    if (!response || typeof response !== 'string') return false;
    const lower = response.toLowerCase();
    // Catch instances where the model simply repeats parts of the system prompt/task as the answer
    if (lower.includes("task: extract") && lower.length < 200) return true;
    if (lower.includes("here is the prompt:") || lower.includes("echoing the input:")) return true;
    return false;
}

function mapLegacyModel(model) {
    if (!model) return model;
    const lower = model.toLowerCase();
    
    // 1. Gemini Migration (V20.1: 1.5 Deprecated)
    if (lower.includes('gemini-pro') || lower.includes('gemini-1.5-pro')) return "gemini-2.5-pro";
    if (lower.includes('gemini-flash') || lower.includes('gemini-1.5-flash')) return "gemini-2.5-flash";
    if (lower.includes('gemini-2.0-flash-exp')) return "gemini-2.0-flash";

    // 2. Llama Migration (3.1/3.3 -> 4.0)
    if (lower.includes('llama-3.1') || lower.includes('llama-3.3') || lower.includes('llama3')) {
        if (lower.includes('405b') || lower.includes('anchor')) return "Meta-Llama-3.3-70B-Instruct";
        if (lower.includes('70b')) return "Meta-Llama-3.3-70B-Instruct";
        if (lower.includes('8b')) return "Meta-Llama-3.3-70B-Instruct";
        return "Meta-Llama-3.3-70B-Instruct";
    }

    // 3. DeepSeek Migration
    if (lower.includes('deepseek-v3')) return "DeepSeek-V3.1";

    return model;
}

/** Groq retired its Llama 3.x ids for this account; free-tier chat models are gpt-oss and qwen. GROQ_MODEL overrides. */
const DEFAULT_GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export async function generateGroqContent(prompt, model = DEFAULT_GROQ_MODEL, context = {}) {
    const key = context?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing.");

    // [V21.0] Prompt Sanitizer: Normalize to string
    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);

    // Sanitization: Ensure model is valid for Groq
    if (model === "llama3.1-8b") model = "llama-3.1-8b-instant";
    const groqCompatible = ['gpt-oss', 'qwen', 'allam', 'compound'];
    if (!groqCompatible.some(prefix => model?.toLowerCase().includes(prefix))) {
        model = DEFAULT_GROQ_MODEL;
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
            body: JSON.stringify({ model, messages: [{ role: "user", content: promptStr }], tools, tool_choice: "auto", temperature: 0.2 })
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
                        `, DEFAULT_GROQ_MODEL, { ...context, vision_payload: doc });
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
        // Keep the status and code so markFailure can tell rate limits (cooldown) from dead keys (blacklist).
        throw new Error(`Groq API Error: ${res.status} ${data.error?.code || ''} - ${data.error?.message || "Unknown error"}`);
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateGeminiContent(prompt, model = "gemini-3.1-flash-lite-preview", context = {}) {
    const key = context?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing.");

    // [V21.0] Prompt Sanitizer: Callers may pass objects; normalize to string before dispatch.
    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);

    let models = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-3.1-flash-lite-preview", "gemini-flash-latest", "gemini-2.5-pro", "gemini-3.1-pro-preview"];
    if (model?.includes('gemini')) {
        const mappedModel = mapLegacyModel(model);
        models = [mappedModel, ...models.filter(m => m !== mappedModel)];
    }
    
    await sleep(Math.floor(Math.random() * 1000) + 500);

    for (const modelName of models) {
        try {
            console.log(`🔍 [Gemini-Fleet] Attempting via ${modelName}...`);
            const ai = new GoogleGenAI({ apiKey: key });
            
            let contents;
            if (context.vision_payload) {
                contents = [
                    promptStr,
                    { inlineData: { data: context.vision_payload.base64, mimeType: context.vision_payload.mimeType } }
                ];
            } else {
                contents = promptStr;
            }

            const response = await ai.models.generateContent({
                model: modelName,
                contents: contents
            });
            return response.text;
        } catch (err) {
            console.warn(`❌ [Gemini-Fleet] ${modelName} failed: ${err.message}`);
            // [V21.0] Daily quota = terminal for this run; treat as hard failure so the node is blacklisted.
            const isDailyQuota = err.message.includes('GenerateRequestsPerDay') || err.message.includes('GenerateContentInputTokensPerModelPerDay') || err.message.includes('429');
            if (isDailyQuota) {
                console.warn(`⚠️ [Gemini-Fleet] Daily quota exceeded for ${modelName}, trying next...`);
                continue;
            }
            if (err.message.includes('quota') || err.message.includes('404')) continue;
            throw err;
        }
    }
    throw new Error("GEMINI_FLEET_EXHAUSTED: QUOTA_EXCEEDED");
}

/**
 * [V1.0] Sovereign GCP Engine: Native Vertex AI Provider
 * Uses Workload Identity on GKE/CloudRun.
 */
async function generateVertexContent(prompt, model = "gemini-3.1-pro-preview", context = {}) {
    const project = context?.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const location = context?.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT missing for Vertex AI.");

    // [V21.0] Re-enabling native Vertex AI via unified @google/genai SDK
    const geminiModel = model?.includes('flash') ? "gemini-1.5-flash" : "gemini-1.5-pro";
    console.log(`🔀 [Vertex-Native] Routing directly to Vertex AI (${geminiModel}) via @google/genai`);

    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);

    // Save and temporarily delete Gemini API keys from environment to force ADC
    const keysToRestore = {};
    const keyNames = ['GEMINI_API_KEY', 'GEMINI_KEY', 'GOOGLE_API_KEY'];
    for (const keyName of keyNames) {
        if (process.env[keyName]) {
            keysToRestore[keyName] = process.env[keyName];
            delete process.env[keyName];
        }
    }

    try {
        const ai = new GoogleGenAI({ 
            vertexai: true,
            project: project,
            location: location
        });

        let contents;
        if (context.vision_payload) {
            contents = [
                promptStr,
                { inlineData: { data: context.vision_payload.base64, mimeType: context.vision_payload.mimeType } }
            ];
        } else {
            contents = promptStr;
        }

        const response = await ai.models.generateContent({
            model: geminiModel,
            contents: contents
        });
        
        return response.text;
    } finally {
        // Restore environment variables
        for (const [keyName, value] of Object.entries(keysToRestore)) {
            process.env[keyName] = value;
        }
    }
}

async function generateSambaNovaContent(prompt, model = "Meta-Llama-3.3-70B-Instruct", context = {}) {
    const key = context?.SAMBANOVA_API_KEY || process.env.SAMBANOVA_API_KEY;
    if (!key) throw new Error("SAMBANOVA_API_KEY missing.");

    // [V21.0] Prompt Sanitizer: Normalize to string
    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);

    let targetModel = mapLegacyModel(model) || "Meta-Llama-3.3-70B-Instruct";
    const lowerModel = targetModel.toLowerCase();
    if (lowerModel.includes("405b") || lowerModel.includes("deepseek-v3")) {
        targetModel = "DeepSeek-V3.1";
    } else if (lowerModel.includes("70b") || lowerModel.includes("llama")) {
        targetModel = "Meta-Llama-3.3-70B-Instruct";
    } else if (!["deepseek-v3.1", "deepseek-v3.2", "meta-llama-3.3-70b-instruct", "minimax-m2.7", "gemma-4-31b-it", "gpt-oss-120b"].includes(lowerModel)) {
        targetModel = "Meta-Llama-3.3-70B-Instruct";
    }

    const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "user", content: promptStr }],
            temperature: 0.1
        })
    });
    if (!res.ok) throw new Error(`SambaNova Error: ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
}

/** Cerebras retired zai-glm-4.7 (2026-11); override with CEREBRAS_MODEL when the catalogue changes again. */
const DEFAULT_CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "gpt-oss-120b";

async function generateCerebrasContent(prompt, model = DEFAULT_CEREBRAS_MODEL, context = {}) {
    const key = context?.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY;
    if (!key) throw new Error("CEREBRAS_API_KEY missing.");
    
    // [V21.0] Prompt Sanitizer: Normalize to string
    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);

    const targetModel = model || DEFAULT_CEREBRAS_MODEL;

    const client = new Cerebras({ apiKey: key });
    const completion = await client.chat.completions.create({
        messages: [{ role: "user", content: promptStr }],
        model: targetModel,
        temperature: 0.2
    });
    return completion.choices[0].message.content;
}

/** Workers AI caps replies at 256 tokens unless asked for more; briefings need far longer output. */
const CLOUDFLARE_MAX_TOKENS = 4096;
const DEFAULT_CLOUDFLARE_MODEL = process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Cloudflare credentials: a scoped API token, or the account's global API key plus email. Null when neither is set. */
function cloudflareAuth(context = {}) {
    const read = (...names) => names.map((n) => context?.[n] || process.env[n]).find(Boolean);
    const accountId = read('CF_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID');
    if (!accountId) return null;
    const token = read('CF_API_TOKEN', 'CLOUDFLARE_API_TOKEN');
    if (token) return { accountId, headers: { "Authorization": `Bearer ${token}` } };
    const email = read('CLOUDFLARE_EMAIL');
    const globalKey = read('CLOUDFLARE_API_KEY');
    if (email && globalKey) return { accountId, headers: { "X-Auth-Email": email, "X-Auth-Key": globalKey } };
    return null;
}

export async function generateCloudflareContent(prompt, model = DEFAULT_CLOUDFLARE_MODEL, context = {}) {
    const auth = cloudflareAuth(context);
    if (!auth) throw new Error("Cloudflare Credentials missing.");

    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/ai/run/${model}`, {
        method: "POST",
        headers: { ...auth.headers, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: promptStr }], max_tokens: CLOUDFLARE_MAX_TOKENS })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Cloudflare AI Error: ${res.status} - ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const result = data.result?.choices?.[0]?.message?.content || data.result?.response || data.result?.text;
    if (!result) {
        throw new Error(`Cloudflare AI returned empty result: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return result;
}

// GitHub Models was retired on 30 Jul 2026: models.github.ai now answers every request with a plain "OK",
// so the node was removed. The successor (Microsoft Foundry) needs an Azure account.

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
/** Free "Experiment" plan: about 1 request/second per model, large monthly token allowance. MISTRAL_MODEL overrides. */
const DEFAULT_MISTRAL_MODEL = process.env.MISTRAL_MODEL || "mistral-large-latest";
// Edition sections run to ~1,300 words (~2,000 tokens); leave headroom for JSON and longer manuscripts.
const MISTRAL_MAX_TOKENS = 8192;
const MISTRAL_TIMEOUT_MS = 120000;

function mistralKey(context = {}) {
    return context?.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY || null;
}

export async function generateMistralContent(prompt, model = DEFAULT_MISTRAL_MODEL, context = {}) {
    const key = mistralKey(context);
    if (!key) throw new Error("MISTRAL_API_KEY missing.");

    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);
    const res = await fetch(MISTRAL_URL, {
        method: "POST",
        signal: AbortSignal.timeout(MISTRAL_TIMEOUT_MS),
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: MISTRAL_MAX_TOKENS, messages: [{ role: "user", content: promptStr }] })
    });
    if (!res.ok) {
        // Status stays in the message: the balancer cools a node down on "429" and blacklists on auth errors.
        const errText = await res.text().catch(() => "");
        throw new Error(`Mistral API Error: ${res.status} - ${errText.slice(0, 300)}`);
    }
    const data = await res.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) throw new Error(`Mistral returned empty result: ${JSON.stringify(data).slice(0, 300)}`);
    return result;
}

/** Drops nodes whose name contains any family in a comma list (AI_DISABLED_PROVIDERS), e.g. "gemini". */
export function filterDisabledProviders(pool, disabledList = '') {
    const families = String(disabledList).split(',').map((f) => f.trim().toLowerCase()).filter(Boolean);
    if (families.length === 0) return pool;
    return pool.filter((node) => !families.some((family) => node.name.toLowerCase().includes(family)));
}

async function generateHuggingFaceContent(prompt, model = "mistralai/Mistral-7B-Instruct-v0.3", context = {}) {
    const token = context?.HF_TOKEN || process.env.HF_TOKEN;
    if (!token) throw new Error("HF_TOKEN missing.");

    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);
    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: promptStr })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HuggingFace Error: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    const result = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;
    if (!result) {
        throw new Error(`HuggingFace returned empty result: ${JSON.stringify(data)}`);
    }
    return result;
}

async function generateOpenRouterContent(prompt, model = "mistralai/mistral-7b-instruct", context = {}) {
    const key = context?.OPENROUTER_KEY || process.env.OPENROUTER_KEY;
    if (!key) throw new Error("OPENROUTER_KEY missing.");

    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: promptStr }]
        })
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`OpenRouter Error: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    if (!data.choices || data.choices.length === 0) {
        throw new Error(`OpenRouter returned empty choices: ${JSON.stringify(data)}`);
    }
    return data.choices[0].message.content;
}

export async function generateInstitutionalBridgeContent(prompt, model = "llama-3.3-70b-versatile", context = {}) {
    const bridgeUrl = context?.SWARM_AI_BRIDGE || process.env.SWARM_AI_BRIDGE;
    const vaultKey = context?.VAULT_MASTER_KEY || process.env.VAULT_MASTER_KEY;
    if (!bridgeUrl) throw new Error("SWARM_AI_BRIDGE URL missing.");

    // Infer provider for the gateway
    let provider = 'groq';
    const lowerModel = model.toLowerCase();
    if (lowerModel.includes('gemini')) {
        provider = 'gemini';
    } else if (lowerModel.includes('sambanova') || lowerModel.includes('deepseek')) {
        provider = 'sambanova';
    } else if (lowerModel.includes('huggingface') || lowerModel.includes('mistral') || lowerModel.includes('codestral') || lowerModel.includes('nemo')) {
        provider = 'huggingface';
    }

    const res = await fetch(bridgeUrl, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "X-Vault-Auth": vaultKey || "",
            "X-Vault-Key": vaultKey || "" 
        },
        body: JSON.stringify({ prompt, model, provider, role: context.role || 'research' })
    });
    if (!res.ok) throw new Error(`Bridge Error: ${res.status}${await bridgeErrorDetail(res)}`);
    const data = await res.json();
    return data.response;
}

/** Upstream error text from a failed bridge response (" - <message>"), so callers can tell dead keys from outages. */
async function bridgeErrorDetail(res) {
    const body = await res.text().catch(() => '');
    if (!body) return '';
    try {
        const parsed = JSON.parse(body);
        const message = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
        return ` - ${String(message || body).slice(0, 300)}`;
    } catch {
        return ` - ${body.slice(0, 300)}`;
    }
}

/**
 * [V21.1] Cloud-Native Engine: Vertex AI Model Garden (MaaS & Anthropic)
 * Leverages GKE Workload Identity to route high-fidelity models via Google Cloud.
 */
async function generateVertexModelGardenContent(prompt, model = "meta/llama3-405b-instruct-maas", context = {}) {
    const project = context?.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    const location = context?.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    
    // [V21.0] Prompt Sanitizer: Normalize to string for MaaS compliance
    const promptStr = (typeof prompt === 'string') ? prompt : JSON.stringify(prompt);

    if (!project) {
        console.warn("⚠️ [Vertex-MaaS] GOOGLE_CLOUD_PROJECT missing. Yielding to next node.");
        throw new Error("GOOGLE_CLOUD_PROJECT missing for Vertex AI Model Garden.");
    }

    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const accessToken = await auth.getAccessToken();

    let targetModel = model;
    let endpointType = 'maas'; // 'maas' for Llama/Mistral, 'anthropic' for Claude
    
    // 1. Meta Llama 3.1 Family
    if (model.includes("405b") || model.includes("llama-3.1-405b")) targetModel = "meta/llama3-405b-instruct-maas";
    else if (model.includes("70b") || model.includes("llama-3.1-70b")) targetModel = "meta/llama3-70b-instruct-maas";
    else if (model.includes("8b") || model.includes("llama-3.1-8b")) targetModel = "meta/llama3-8b-instruct-maas";
    
    // 2. Mistral Family
    else if (model.includes("mistral-large")) targetModel = "mistralai/mistral-large-2407";
    else if (model.includes("mistral-nemo") || model.includes("nemo")) targetModel = "mistralai/mistral-nemo";
    else if (model.includes("codestral")) targetModel = "mistralai/codestral-2405";
    
    // 3. Anthropic Claude Family (Vertex native format)
    else if (model.includes("claude-3-5-sonnet") || model.includes("sonnet")) {
        targetModel = "claude-3-5-sonnet@20240620";
        endpointType = 'anthropic';
    } else if (model.includes("claude-3-opus") || model.includes("opus")) {
        targetModel = "claude-3-opus@20240229";
        endpointType = 'anthropic';
    } else if (model.includes("claude-3-haiku") || model.includes("haiku")) {
        targetModel = "claude-3-haiku@20240307";
        endpointType = 'anthropic';
    }
    // Default fallback
    else if (!targetModel.includes('/')) {
        targetModel = "meta/llama3-405b-instruct-maas"; 
    }

    // A. Anthropic Vertex Routing
    if (endpointType === 'anthropic') {
        const claudeEndpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/anthropic/models/${targetModel}:rawPredict`;
        
        const res = await fetch(claudeEndpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                anthropic_version: "vertex-2023-10-16",
                messages: [{ role: "user", content: promptStr }],
                max_tokens: 8192,
                temperature: 0.2
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Vertex Claude Error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        return data.content?.[0]?.text;
    }

    // B. Standard MaaS Routing (OpenAPI Chat Completions format for Llama & Mistral)
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/endpoints/openapi/chat/completions`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: targetModel,
            messages: [{ role: "user", content: promptStr }],
            temperature: 0.2
        })
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Vertex MaaS Error: ${res.status} - ${errText}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content;
}

async function directDialAnchor(prompt, model, role, env) {
    console.warn(`⚓ [AI-Balancer] Emergency Direct-Dial to Anchor engaged for ${role}.`);
    if (model?.includes('gemini')) return generateGeminiContent(prompt, model, { env });
    return generateCerebrasContent(prompt, DEFAULT_CEREBRAS_MODEL, { env });
}

// --- Balancer and Dispatch Logic ---
/**
 * Error text that means a provider cannot recover within this run: bad or revoked keys, unpaid plans,
 * closed billing, retired models. Anything else (5xx without detail, network errors) is treated as temporary.
 */
const TERMINAL_ERROR_PATTERNS = [
    '401', '402', '403', '404', 'Unauthorized', 'API key', 'Authentication', 'permission', 'NOT_FOUND', 'Not Found',
    'PERMISSION_DENIED', 'Invalid Key', 'Invalid API Key', 'invalid_api_key', 'CREDIT_EXHAUSTED', 'DAILY_QUOTA_EXCEEDED',
    'QUOTA_EXCEEDED', '4018', // ERR_NGROK_4018
    'does not exist', 'archived', 'Payment required', 'payment_required', 'User not found', 'billing account',
];

/** How long revaluateFleet keeps a terminally failed node out; longer than the longest daily run. */
const TERMINAL_BLACKLIST_MS = 60 * 60 * 1000;

/** True when a provider error means the node is dead for this run and must be blacklisted, not retried. */
export function isTerminalProviderError(message = '') {
    return TERMINAL_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export const ResourceManager = {
    inflight: new Map(),
    failedAt: new Map(),
    pool: [],
    cooldowns: new Map(),
    failed: new Set(),
    
    async init(env = {}, forceRefresh = false) {
        if (this.pool.length > 0 && !forceRefresh) return;
        normalizeEnv();
        const isPlaceholder = (val) => {
            if (!val || typeof val !== 'string') return false;
            const lower = val.toLowerCase();
            return lower.includes('replace_with_key') || 
                   lower.includes('your_token') ||
                   /^[0-9_]+$/.test(val) || // matches "1_2_3_4_5_6_7_8_9"
                   lower.includes('1_2_3_4_5');
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

        let rawSamba = env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_KEY || env.SAMBANOVA || '';
        let rawCerebras = env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY || env.CEREBRAS || '';
        
        if (typeof rawSamba === 'string' && rawSamba.startsWith('csk-')) {
            console.log('🔄 [AI-Balancer] Crossover Detected: SAMBANOVA key is a Cerebras key.');
            if (!rawCerebras) {
                rawCerebras = rawSamba;
                process.env.CEREBRAS_API_KEY = rawCerebras;
            }
            rawSamba = null;
        }

        const activeKeys = {
            Groq: sanitize(env.GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.GROQ_KEY, 'Groq', true),
            Gemini: sanitize(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY, 'Gemini', true),
            Cerebras: sanitize(rawCerebras, 'Cerebras', true),
            HF_TOKEN: sanitize(env.HF_TOKEN || process.env.HF_TOKEN, 'HuggingFace', true),
            SambaNova: sanitize(rawSamba, 'SambaNova', true),
            VertexMaaS: !!(env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT),
            Cloudflare: sanitize(env.CF_API_TOKEN || process.env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || env.CF_API_KEY, 'Cloudflare', false),
            OpenRouter: sanitize(env.OPENROUTER_KEY || process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY, 'OpenRouter', true)
        };

        if (activeKeys.Cerebras) {
            process.env.CEREBRAS_API_KEY = activeKeys.Cerebras;
        }

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
            this.pool.push({ name: 'SambaNova-405B-Anchor', fn: (p, m, c) => generateSambaNovaContent(p, "Meta-Llama-3.3-70B-Instruct", c), tier: 1, roles: ['research', 'manager', 'consolidate', 'generate'], match: /sambanova|405b|anchor/i });
            this.pool.push({ name: 'DeepSeek-V3-MoE', fn: (p, m, c) => generateSambaNovaContent(p, "DeepSeek-V3.1", c), tier: 1, roles: ['research', 'edit', 'generate'], match: /deepseek|v3|reasoning/i });
        }
        if (activeKeys.Cerebras) {
            this.pool.push({ name: 'Cerebras', fn: (p, m, c) => generateCerebrasContent(p, DEFAULT_CEREBRAS_MODEL, c), tier: 1, roles: ['research', 'edit', 'draft', 'audit', 'generate'], match: /cerebras|glm|node-generate|node-draft/i });
        }
        if (activeKeys.Groq) {
            this.pool.push({ name: 'Groq', fn: (p, m, c) => generateGroqContent(p, DEFAULT_GROQ_MODEL, c), tier: 1, roles: ['research', 'edit', 'draft', 'generate'], match: /groq|node-research|node-edit|node-draft|node-generate|llama/i });
            // this.pool.push({ name: 'Llama-4-Scout-17B', fn: (p, m, c) => generateGroqContent(p, "meta-llama/llama-4-scout-17b-16e-instruct", c), tier: 1, roles: ['research', 'edit', 'draft'], match: /scout|llama-4/i });
            // this.pool.push({ name: 'GPT-OSS-120B', fn: (p, m, c) => generateGroqContent(p, "openai/gpt-oss-120b", c), tier: 1, roles: ['research', 'edit', 'generate'], match: /gpt-oss-120b|oss/i });
            
            // this.pool.push({ name: 'Llama-3.1-8B-Auditor', fn: (p, m, c) => generateGroqContent(p, "llama-3.1-8b-instant", c), tier: 2, roles: ['audit', 'repair'], match: /llama|node-audit|node-repair/i });
            // this.pool.push({ name: 'GPT-OSS-20B', fn: (p, m, c) => generateGroqContent(p, "openai/gpt-oss-20b", c), tier: 2, roles: ['draft', 'audit'], match: /gpt-oss-20b/i });
            // this.pool.push({ name: 'Qwen-3-32B', fn: (p, m, c) => generateGroqContent(p, "qwen/qwen3-32b", c), tier: 2, roles: ['research', 'draft'], match: /qwen3-32b/i });
            // this.pool.push({ name: 'Qwen-3.6-27B', fn: (p, m, c) => generateGroqContent(p, "qwen/qwen3.6-27b", c), tier: 2, roles: ['research', 'draft'], match: /qwen3.6-27b/i });
            // this.pool.push({ name: 'Allam-2-7B', fn: (p, m, c) => generateGroqContent(p, "allam-2-7b", c), tier: 2, roles: ['draft'], match: /allam/i });
            // this.pool.push({ name: 'Orpheus-V1-English', fn: (p, m, c) => generateGroqContent(p, "canopylabs/orpheus-v1-english", c), tier: 2, roles: ['draft'], match: /orpheus/i });
            // this.pool.push({ name: 'Groq-Compound', fn: (p, m, c) => generateGroqContent(p, "groq/compound", c), tier: 2, roles: ['draft', 'research'], match: /compound/i });
        }

        if (activeKeys.Gemini) {
            this.pool.push({ name: 'Gemini-3.1-Pro', fn: (p, m, c) => generateGeminiContent(p, "gemini-3.1-pro-preview", c), tier: 0, roles: ['research', 'edit', 'draft', 'audit', 'generate', 'manager', 'consolidate'], match: /gemini|pro|vertex|node-draft/i });
            this.pool.push({ name: 'Gemini-3.1-Flash', fn: (p, m, c) => generateGeminiContent(p, "gemini-3.1-flash-lite-preview", c), tier: 1, roles: ['draft', 'audit', 'generate', 'edit'], match: /gemini|flash/i });
            // [V21.0] Vertex nodes now route through Gemini API (Vertex SDK deprecated June 2025)
            this.pool.push({ name: 'Vertex-Gemini-Pro-Fallback', fn: (p, m, c) => generateGeminiContent(p, "gemini-3.1-pro-preview", c), tier: 2, roles: ['research', 'edit'], match: /vertex.*pro/i });
            this.pool.push({ name: 'Vertex-Gemini-Flash-Fallback', fn: (p, m, c) => generateGeminiContent(p, "gemini-3.1-flash-lite-preview", c), tier: 3, roles: ['draft', 'audit'], match: /vertex.*flash/i });
        }

        // [V1.0] GKE Native: Vertex AI Fallback (Zero-Key Resilience)
        const gcpProject = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
        /* USER EXPLICITLY DISABLED BILLING, ALWAYS FAILS 
        if (gcpProject) {
            // Downgraded tier because billing is permanently disabled
            this.pool.push({ name: 'Vertex-Gemini-Pro', fn: (p, m, c) => generateVertexContent(p, "gemini-3.1-pro-preview", c), tier: 5, roles: ['research', 'manager', 'edit', 'draft', 'audit', 'generate'], match: /vertex|institutional|pro|gemini|node-editor|node-draft/i });
            this.pool.push({ name: 'Vertex-Gemini-Flash', fn: (p, m, c) => generateVertexContent(p, "gemini-3.1-flash-lite-preview", c), tier: 6, roles: ['audit', 'generate'], match: /vertex|flash/i });
            console.log("🏙️ [AI-Balancer] GKE Native Vertex AI nodes activated.");
        }
        */
        if (activeKeys.SambaNova) {
            this.pool.push({ name: 'SambaNova-70B', fn: generateSambaNovaContent, tier: 2, roles: ['draft', 'generate'], match: /sambanova|node-draft/i });
        }

        if (activeKeys.VertexMaaS) {
            /*
            this.pool.push({ 
                name: 'Vertex-Llama-405B', 
                fn: (p, m, c) => generateVertexModelGardenContent(p, m || "meta/llama3-405b-instruct-maas", c), 
                tier: 1, 
                roles: ['research', 'manager', 'consolidate', 'generate', 'edit', 'draft'], 
                match: /vertex|maas|llama|sovereign|405b/i 
            });
            this.pool.push({ 
                name: 'Vertex-Mistral-Large', 
                fn: (p, m, c) => generateVertexModelGardenContent(p, m || "mistralai/mistral-large-2407", c), 
                tier: 1, 
                roles: ['research', 'edit', 'generate', 'draft', 'manager'], 
                match: /mistral|large/i 
            });
            this.pool.push({ 
                name: 'Vertex-Claude-3.5-Sonnet', 
                fn: (p, m, c) => generateVertexModelGardenContent(p, m || "claude-3-5-sonnet@20240620", c), 
                tier: 1, 
                roles: ['audit', 'draft', 'edit', 'generate', 'manager', 'research'], 
                match: /claude|sonnet/i 
            });
            console.log("⚓ [AI-Balancer] Cloud Sovereign Nodes (Vertex Model Garden) online.");
            */
        }


        // TIER 3: RESILIENCE FALLBACKS
        // Free tiers that need no billing: Cloudflare Workers AI (10k neurons/day) and Mistral's Experiment plan.
        if (mistralKey(env)) {
             this.pool.push({ name: 'Mistral', fn: (p, m, c) => generateMistralContent(p, DEFAULT_MISTRAL_MODEL, { ...env, ...c }), tier: 1, roles: ['research', 'edit', 'draft', 'audit', 'generate', 'manager', 'consolidate', 'utility'], match: /mistral|node-research|node-edit|node-draft|node-generate/i });
        }
        if (cloudflareAuth(env)) {
             this.pool.push({ name: 'Cloudflare-Workers-AI', fn: (p, m, c) => generateCloudflareContent(p, DEFAULT_CLOUDFLARE_MODEL, { ...env, ...c }), tier: 1, roles: ['research', 'edit', 'draft', 'audit', 'generate', 'utility', 'manager', 'consolidate'], match: /cloudflare|workers-ai|llama|node-utility|node-editor|node-research|node-draft|node-generate/i });
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
            // Only bridge routes that reach a model the bridge serves. Removed (Nov 2026), each failed every call:
            // Cloudflare-Gateway and HuggingFace-Proxy forwarded the caller's model hint ("auto") as a model id,
            // and DeepSeek-V3-1T asked for a model the bridge's SambaNova route does not serve.
            this.pool.push({ name: 'Groq-Bridge-Proxy', fn: (p, m, c) => generateInstitutionalBridgeContent(p, DEFAULT_GROQ_MODEL, c), tier: 1, roles: ['research', 'edit'], match: /groq|node-research|node-draft|70b/i });
            
            // [V12.0] Gemma-4 Shadow Audit (Cloud Proxy for GHA Continuity)
            this.pool.push({ name: 'Groq-Bridge-20B-Proxy', fn: (p, m, c) => generateInstitutionalBridgeContent(p, "openai/gpt-oss-20b", c), tier: 2, roles: ['audit', 'repair'], match: /llama|node-audit|node-repair/i });

            console.log("🏙️ [AI-Balancer] Institutional Bridge & Proxy Nodes Active. (V15.5 Hardened)");
        }
        
        const disabled = env.AI_DISABLED_PROVIDERS || process.env.AI_DISABLED_PROVIDERS || '';
        if (disabled) {
            this.pool = filterDisabledProviders(this.pool, disabled);
            console.log(`🚫 [AI-Balancer] Providers disabled by AI_DISABLED_PROVIDERS: ${disabled}`);
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
            // 🛡️ INSTITUTIONAL ALIGNMENT: Prioritize Exact Name Match > Regex Match > Tier
            if (requestedModel) {
                const exactA = a.name.toLowerCase() === requestedModel.toLowerCase();
                const exactB = b.name.toLowerCase() === requestedModel.toLowerCase();
                if (exactA && !exactB) return -1;
                if (!exactA && exactB) return 1;

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
        
        const isRate = error.includes('429') || error.includes('rate_limit') || error.includes('TPM') || error.includes('RATE_LIMIT');
        const isAuth = isTerminalProviderError(error);

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
        console.warn("🛡️ [AI-Balancer] Initiating Total Emergency Reset of AI Fleet (Institutional Override)...");
        this.failed.clear();
        this.cooldowns.clear();
        this.inflight.clear();
        await this.init(env, true); // Force a full vault re-sync and pool rebuild
    },

    revaluateFleet() {
        console.log("♻️ [AI-Balancer] Harvesting fresh fleet nodes...");
        // Dead keys and retired models stay out for the rest of a run; older entries get another chance.
        const now = Date.now();
        for (const name of [...this.failed]) {
            const failedAt = this.failedAt.get(name) || 0;
            if (now - failedAt < TERMINAL_BLACKLIST_MS) continue;
            this.failed.delete(name);
            this.failedAt.delete(name);
        }
        // Preserving temporary cooldowns to prevent recursive 429 loops (The Suicide Loop Fix)
    }
};

/**
 * V7.1: Institutional Role-Based Semantic Dispatcher
 * Implements Local-First Cascade and Semantic Compression.
 */
/** Full passes over the fleet after the first one, before askAI gives up with FLEET_EXHAUSTION_PERMANENT. */
const MAX_FLEET_RECOVERIES = 2;

export async function askAI(prompt, options = {}) {
    const env = options.env || process.env;
    if (env.DRY_RUN) {
        console.log("🕵️ [DRY-RUN] Globally bypassing AI tier for institutional verification.");
        return "[DRY-RUN MOCK CONTENT]: Strategic Institutional synthesis for BlogsPro 5.0. No AI tokens consumed.";
    }
    const { role = 'generate', model, env: envOpt = {}, seed = 0, frequency = 'hourly', _retry = 0, jobId = null } = options;

    // [V14.1] Autonomous Fleet Revaluation: Clear blacklists for fresh swarm runs.
    // Only on the first pass: re-clearing on every recovery cycle kept failed nodes "available" forever.
    if (jobId && jobId.startsWith('swarm-') && _retry === 0 && !options._fleetRetries) {
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
            // Routing and callers name models that may be disabled or keyless; serve the role from the rest of the fleet.
            console.warn(`⚠️ [AI-PreFlight] No node serves '${targetModel}'. Falling back to any node for role '${role}'.`);
            targetModel = 'auto';
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

        if (fleetRetries < MAX_FLEET_RECOVERIES) { 
            const isHighPriority = options.jobId?.startsWith('swarm-monthly');
            const pauseMs = 65000;
            console.warn(`⏳ [AI-Balancer] Fleet Exhausted. No providers available for ${role}. Pausing ${pauseMs/1000}s for recovery (Cycle: ${fleetRetries + 1}/${MAX_FLEET_RECOVERIES})...`);
            await new Promise(r => setTimeout(r, pauseMs));
            // Reset tried nodes for the next full fleet attempt
            return askAI(prompt, { ...options, _retry: 0, _fleetRetries: fleetRetries + 1, triedNodes: new Set() });
        }
        
        console.error(`🚨 [AI-Balancer] Critical Fleet Depletion. Transitioning to Direct-Dial Anchor...`);
        try {
            // [V21.1] Prioritize Vertex Model Garden as the ultimate institutional anchor
            const cloudSovereign = ResourceManager.pool.find(p => p.name === 'Vertex-Llama-405B');
            if (cloudSovereign) {
                console.log("⚓ [AI-Balancer] Using Vertex Model Garden Anchor.");
                return await cloudSovereign.fn(prompt, "meta/llama3-405b-instruct-maas", env);
            }
            return await directDialAnchor(prompt, targetModel || 'llama-3.3-70b-versatile', role, env);
        } catch (e) {
            console.error(`💀 [AI-Balancer-Fatal] Anchor also failed: ${e.message}`, e);
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
            const fleetRetries = (options._fleetRetries || 0) + 1;
            if (fleetRetries > MAX_FLEET_RECOVERIES) {
                console.error(`💀 [AI-Balancer-Fatal] ${role}: providers kept failing across ${MAX_FLEET_RECOVERIES} recovery cycles. Giving up.`);
                throw new Error("FLEET_EXHAUSTION_PERMANENT");
            }
            console.error(`❌ [AI-Balancer] ${provider.name} repeatedly failed. Escalating to Fleet Recovery (cycle ${fleetRetries}/${MAX_FLEET_RECOVERIES})...`);
            return askAI(prompt, { ...options, _retry: 0, _fleetRetries: fleetRetries, triedNodes: new Set() });
        }
        return askAI(prompt, { ...options, _retry: _retry + 1, triedNodes });
    }
}

/**
 * NEW: Multi-Model Architecture
 * Dispatches a single prompt to multiple models concurrently and synthesizes the results.
 */
export async function askMultipleAIWithConsensus(prompt, env, numModels = 3) {
    console.log(`🤖 [Multi-Model] Initializing parallel execution across ${numModels} nodes...`);
    await ResourceManager.init(env);
    
    // Select top N distinct active providers
    const activePool = ResourceManager.pool.filter(p => !ResourceManager.failed.has(p.name));
    const selectedNodes = activePool.slice(0, numModels);
    
    if (selectedNodes.length === 0) {
        console.warn(`⚠️ [Multi-Model] Fleet exhausted. Falling back to single askAI.`);
        return await askAI(prompt, { env });
    }

    // Stagger parallel calls by 2s to avoid simultaneous rate-limit hits
    const promises = selectedNodes.map((node, idx) => {
        return (async () => {
            if (idx > 0) await sleep(2000 * idx); // Stagger: 0s, 2s, 4s
            try {
                console.log(`🚀 [Multi-Model] Dispatching to ${node.name} (stagger: ${idx * 2}s)...`);
                const res = await node.fn(prompt, "auto", env);
                if (!res || typeof res !== 'string' || res.length < 200) {
                    throw new Error(`Insufficient response length (${res?.length || 0} chars)`);
                }
                console.log(`✅ [Multi-Model] ${node.name} returned ${res.length} chars.`);
                return { model: node.name, text: res, success: true };
            } catch (err) {
                console.warn(`⚠️ [Multi-Model] Node ${node.name} failed: ${err.message}`);
                return { model: node.name, text: '', success: false, error: err.message };
            }
        })();
    });

    const results = await Promise.all(promises);
    const validResults = results.filter(r => r.success);
    
    // CRITICAL FALLBACK: If all parallel nodes failed, fall back to single askAI (which has full retry logic)
    if (validResults.length === 0) {
        console.warn(`⚠️ [Multi-Model] All ${numModels} parallel nodes failed. Falling back to single askAI with full retry logic...`);
        return await askAI(prompt, { env, role: 'draft' });
    }

    // If only one succeeded, return it directly (no consensus needed)
    if (validResults.length === 1) {
        console.warn(`⚠️ [Multi-Model] Only one node (${validResults[0].model}) succeeded. Returning raw output.`);
        return validResults[0].text;
    }

    console.log(`🧠 [Multi-Model] Synthesizing consensus from ${validResults.length} successful models: ${validResults.map(r => r.model).join(', ')}...`);
    
    // Build a concise consensus prompt WITHOUT re-embedding the entire original prompt (which would overflow context)
    const modelOutputs = validResults.map(r => `[MODEL: ${r.model}]\n${r.text}`).join('\n\n---\n\n');
    
    const consensusPrompt = `You are the Consensus Architect for an institutional research pipeline.

TASK: Merge the following ${validResults.length} independent AI-generated research manuscripts into ONE final, authoritative document.

RULES:
1. Keep ALL markdown tables, Mermaid charts, and data points that appear in ANY response.
2. Where models AGREE on a number, use that number with high confidence.
3. Where models DISAGREE, prefer the number that appears in the majority, or the one closest to the live data values.
4. Eliminate any hallucinated claims that only ONE model makes and which contradict the others.
5. The final output MUST be a complete institutional research manuscript (2500+ words) with all required sections, tables, and charts.
6. Output ONLY the final merged document. No meta-commentary about the merging process.
7. Preserve [[BPRO_INTEL_START]] and [[BPRO_INTEL_END]] delimiters.

--- MODEL OUTPUTS TO MERGE ---
${modelOutputs}
`;

    try {
        return await askAI(consensusPrompt, { env, role: 'consensus' });
    } catch (consensusErr) {
        // If even the consensus step fails, return the best single result
        console.warn(`⚠️ [Multi-Model] Consensus synthesis failed: ${consensusErr.message}. Returning best single result.`);
        // Return the longest valid result as "best"
        validResults.sort((a, b) => b.text.length - a.text.length);
        return validResults[0].text;
    }
}

export default { askAI, askMultipleAIWithConsensus };
