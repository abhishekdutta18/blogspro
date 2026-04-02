import { GoogleGenerativeAI } from "@google/generative-ai";
// import _fetch from "node-fetch"; // Removed: Using Node 24 native fetch
const _fetch = fetch;
import Cerebras from "@cerebras/cerebras_cloud_sdk";
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
    process.env.CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
    process.env.CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "abhishekdutta18"; // Institutional Default
};
normalizeEnv();

async function generateGroqContent(prompt, model = "llama-3.3-70b-versatile", context = {}) {
    const key = context?.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing.");

    // Sanitization: Ensure model is valid for Groq
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

async function generateGeminiContent(prompt, model = "gemini-1.5-flash", context = {}) {
    // Principal: GEMINI_API_KEY (Institutional Standard)
    const key = context?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing.");

    // Standard v1 for institutional stability in March 2026
    const genAI = new GoogleGenerativeAI(key);
    
    // MARCH 2026: Institutional model-name sanitizer
    if (model?.includes('3.1') || model?.includes('lite')) {
        console.warn(`🧹 [Gemini-Fleet] Sanitizing deprecated model: ${model} -> gemini-1.5-flash`);
        model = "gemini-1.5-flash";
    }

    // Default high-fidelity list for March 2026 institutional pass (Removing experimental/deprecated models)
    let models = [
        "gemini-1.5-flash", 
        "gemini-2.0-flash-exp",
        "gemini-1.5-pro"
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
            // bees: Using v1beta for all 2026 institutional passes
            const genAI = new GoogleGenerativeAI(key, { apiVersion: 'v1beta' });
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
            // Detect terminal 'Dropped' / 'Not Found' / 'Deprecated'
            if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND') || msg.includes('DEPRECATED')) {
                console.warn(`⚠️ [Gemini-Fleet] ${model} dropped/deprecated. Rotating...`);
                continue;
            }
            // Permissions / Key failure — terminate rotation but allow top-level failover
            if (msg.includes('403') || msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
                console.error(`🚫 [Gemini-Fleet] Access Denied for ${model}. Key may not have Pro access.`);
                throw new Error("GEMINI_PERMISSION_DENIED");
            }
            // Rate limit — short wait then rotate
            if (msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
                console.warn(`⏳ [Gemini-Fleet] ${model} rate limited. Rotating to next model...`);
                continue;
            }
            console.warn(`❌ [Gemini-Fleet] ${model} encountered unknown error: ${msg}. Rotating...`);
        }
    }
    throw new Error("GEMINI_FLEET_EXHAUSTED");
}

/**
 * Echo Detector: Identifies if the AI output is actually the prompt itself.
 */
function isEcho(content) {
    if (!content) return true;
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
        throw new Error(`Cloudflare Error: ${res.status} ${errText}`);
    }
    const data = await res.json();
    if (data.success && data.result) return data.result.response;
    throw new Error(`Cloudflare AI Error: ${JSON.stringify(data)}`);
}

async function generateSambaNovaContent(prompt, model = "Meta-Llama-3.1-405B-Instruct-v2", context = {}) {
    const key = context?.SAMBANOVA_API_KEY || process.env.SAMBANOVA_API_KEY;
    if (!key) throw new Error("SAMBANOVA_API_KEY missing.");

    // Swarm 5.0: Default to 405B for anchors if no specific model requested
    const targetModel = model?.includes('405b') ? "Meta-Llama-3.1-405B-Instruct-v2" : "Meta-Llama-3.3-70B-Instruct";

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

async function generateCerebrasContent(prompt, model = "llama3.1-8b", context = {}) {
    const key = context?.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY;
    if (!key) throw new Error("CEREBRAS_API_KEY missing.");

    try {
        const client = new Cerebras({ apiKey: key });
        const targetModel = model?.includes('70b') ? "llama3.1-70b" : "llama3.1-8b";

        const completion = await client.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: targetModel,
            max_completion_tokens: 1024,
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

async function generateOllamaContent(prompt, model = "llama3", context = {}) {
    try {
        const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434"; // Use 127.0.0.1 for better Node/DNS stability
        // MARCH 2026 UPDATE: Using /api/chat for better persona/rule enforcement
        const res = await _fetch(`${host}/api/chat`, {
            method: "POST",
            body: JSON.stringify({
                model: model || "llama3",
                messages: [{ role: "user", content: prompt }],
                stream: false,
                options: { temperature: 0.1 }
            })
        });
        if (!res.ok) throw new Error(`Ollama Error: Status ${res.status}`);
        const data = await res.json();
        if (data.message && data.message.content) return data.message.content;
    } catch (e) {
        throw new Error(`Ollama (Local Swarm) Unreachable: ${e.message}`);
    }
    throw new Error(`Ollama Error: Service unreachable.`);
}


// --- INSTITUTIONAL AI RESOURCE MANAGER ---
const ResourceManager = {
    pool: [],
    inflight: new Map(),
    cooldowns: new Map(),
    failed: new Set(),
    
    init(env = {}, forceRefresh = false) {
        if (this.pool.length > 0 && !forceRefresh) return; // Only init once unless forced
        this.failed = new Set();
        const activeKeys = {
            Groq: env.GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.GROQ_KEY,
            Gemini: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY,
            OpenRouter: env.OPENROUTER_KEY || process.env.OPENROUTER_KEY,
            Mistral: env.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY || process.env.MISTRAL_KEY,
            Together: env.TOGETHER_API_KEY || process.env.TOGETHER_KEY,
            DeepInfra: env.DEEPINFRA_API_KEY || process.env.DEEPINFRA_KEY,
            SambaNova: env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_API_KEY || process.env.SAMBANOVA_KEY,
            Cerebras: env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY || process.env.CEREBRAS_KEY,
            HuggingFace: env.HF_TOKEN || process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN,
            Qweb: env.QWEB_API_KEY || process.env.QWEB_API_KEY || process.env.QWEB_KEY,
            Ollama: true, // Always check for local Ollama
            Cloudflare: (env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN) && (env.CF_ACCOUNT_ID || process.env.CF_ACCOUNT_ID),
            GitHub: env.GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
        };

        this.pool = [];
        if (activeKeys.Gemini) this.pool.push({ name: 'Gemini', fn: generateGeminiContent, tier: 1, match: /gemini/i }); 
        if (activeKeys.Groq) this.pool.push({ name: 'Groq', fn: generateGroqContent, tier: 1, match: /groq/i }); 
        if (activeKeys.SambaNova) this.pool.push({ name: 'SambaNova', fn: generateSambaNovaContent, tier: 1, match: /samba|llama-3\.3-70b|llama-3\.1-405b/i });
        if (activeKeys.Cerebras) this.pool.push({ name: 'Cerebras', fn: generateCerebrasContent, tier: 1, match: /cerebras|llama3\.1-8b|llama3\.1-70b/i });
        if (activeKeys.Qweb) this.pool.push({ name: 'Qweb', fn: generateQwenContent, tier: 1, match: /qwen|qweb/i });
        if (activeKeys.Mistral) this.pool.push({ name: 'Mistral', fn: generateMistralContent, tier: 2, match: /mistral/i });
        if (activeKeys.Together) this.pool.push({ name: 'Together', fn: generateTogetherContent, tier: 2, match: /together/i });
        if (activeKeys.DeepInfra) this.pool.push({ name: 'DeepInfra', fn: generateDeepInfraContent, tier: 2, match: /deepinfra/i });
        if (activeKeys.GitHub) this.pool.push({ name: 'GitHub', fn: generateGithubContent, tier: 2, match: /github|gpt-4o/i });
        if (activeKeys.HuggingFace) this.pool.push({ name: 'HuggingFace', fn: generateHuggingFaceContent, tier: 3, match: /huggingface|hf/i });
        if (activeKeys.Ollama) this.pool.push({ name: 'Ollama', fn: generateOllamaContent, tier: 3, match: /ollama|local/i }); 
        if (activeKeys.Cloudflare) this.pool.push({ name: 'Cloudflare', fn: generateCloudflareContent, tier: 3, match: /cloudflare/i }); 
        if (activeKeys.OpenRouter) this.pool.push({ name: 'OpenRouter', fn: generateOpenRouterContent, tier: 3, match: /openrouter/i });
        
        this.pool.forEach(p => this.inflight.set(p.name, 0));
        console.log(`🌐 [AI-Balancer] Pool initialized with ${this.pool.length} providers.`);
    },

    getAvailable(seed = 0, requestedModel = null) {
        const now = Date.now();
        let candidates = this.pool.filter(p => {
            if (this.failed.has(p.name)) return false;
            const cooldown = this.cooldowns.get(p.name);
            if (cooldown && now < cooldown) return false;
            return true;
        });

        if (candidates.length === 0) return null;

        // MARCH 2026 UPDATE: Model-Aware Priority
        // If a specific model or provider hint is in the requested model name, 
        // filter candidates to only those that match.
        if (requestedModel) {
            const explicitMatches = candidates.filter(p => p.match && p.match.test(requestedModel));
            if (explicitMatches.length > 0) {
                candidates = explicitMatches;
            }
        }

        candidates.sort((a, b) => {
            const infA = this.inflight.get(a.name);
            const infB = this.inflight.get(b.name);
            if (infA !== infB) return infA - infB;
            return a.tier - b.tier;
        });

        const startIdx = seed % candidates.length;
        return candidates[startIdx];
    },

    markFailure(name, error) {
        const current = this.inflight.get(name);
        if (current > 0) this.inflight.set(name, current - 1);
        
        const isRate = error.includes('429') || error.includes('rate_limit') || error.includes('TPM') || error.includes('quota') || error.includes('RATE_LIMIT');
        const isAuth = error.includes('401') || error.includes('403') || error.includes('402') || error.includes('Unauthorized') || error.includes('API key') || error.includes('Authentication') || error.includes('permission') || error.includes('NOT_FOUND') || error.includes('Not Found') || error.includes('404') || error.includes('PERMISSION_DENIED') || error.includes('Invalid Key') || error.includes('Invalid API Key') || error.includes('CREDIT_EXHAUSTED');

        if (isRate) {
            console.warn(`⏳ [AI-Balancer] ${name} rate limited. Activating 60000ms cooldown.`);
            this.cooldowns.set(name, Date.now() + 60000);
        } else if (isAuth) {
            console.error(`🚫 [AI-Balancer] Blacklisting ${name} due to terminal failure: ${error}`);
            this.failed.add(name);
        } else {
            console.warn(`⚠️ [AI-Balancer] ${name} failed with temporary error: ${error}. Retrying next...`);
        }
    }
};

export async function askAI(prompt, options = {}) {
    const { role = 'generate', model, env = {}, seed = 0 } = options;
    
    // MARCH 2026: Persistence check — Only init if pool is empty
    if (ResourceManager.pool.length === 0) {
        ResourceManager.init(env);
    }
    
    const provider = ResourceManager.getAvailable(seed, model);
    if (!provider) throw new Error("No available AI providers found.");

    ResourceManager.inflight.set(provider.name, ResourceManager.inflight.get(provider.name) + 1);
    console.log(`📝 [AI] Request: Role=${role} [Seed=${seed}]`);
    console.log(`🚀 [AI-Balancer] Dispatching to ${provider.name} (In-flight: ${ResourceManager.inflight.get(provider.name)})`);

    try {
        const response = await provider.fn(prompt, model, env); // Pass context bridge
        
        if (isEcho(response)) {
            throw new Error(`ECHO_DETECTED: ${provider.name} echoed the prompt.`);
        }

        ResourceManager.inflight.set(provider.name, ResourceManager.inflight.get(provider.name) - 1);
        return response;
    } catch (err) {
        console.error(`❌ [AI-Balancer] ${provider.name} failed: ${err.message}`);
        ResourceManager.markFailure(provider.name, err.message);
        
        // Dynamic Failover Rotation (Max Retries: 5)
        if (seed >= 5) {
            console.error(`🚨 [AI-Balancer] Max retries exhausted for role: ${role}. Failing...`);
            throw new Error(`AI_FLEET_EXHAUSTED: ${err.message}`);
        }

        console.log(`🔄 [AI-Balancer] Initiating failover for role: ${role} [Retry ${seed + 1}/5]...`);
        return askAI(prompt, { ...options, seed: seed + 1 });
    }
}

// Simplified ESM export
export default { askAI };
