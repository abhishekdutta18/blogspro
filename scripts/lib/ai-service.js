const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Zero-dependency Environment Loader
 * Consolidates keys from project root into process.env
 */
function loadEnv() {
    const envPath = path.join(__dirname, "../../.env");
    if (fs.existsSync(envPath)) {
        const env = fs.readFileSync(envPath, "utf8");
        env.split("\n").forEach(line => {
            const [k, v] = line.split("=");
            if (k && v && !process.env[k.trim()]) {
                process.env[k.trim()] = v.trim();
            }
        });
        // Institutional Bridging
        if (process.env.GEMINI_KEY && !process.env.GEMINI_API_KEY) {
            process.env.GEMINI_API_KEY = process.env.GEMINI_KEY;
        }
    }
}
loadEnv();

async function generateGroqContent(prompt, model = "llama-3.3-70b-versatile") {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 4096
            })
        });
        const data = await res.json();
        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        
        if (data.error && (data.error.code === "rate_limit_exceeded" || data.error.message?.includes('Request too large') || data.error.message?.includes('Rate limit'))) {
            console.warn(`⏳ Groq Rate/Size Limit. Error: ${data.error.message}`);
            // If 70b is too large or rate limited, wait the specified time then fall back to 8b
            if (model === "llama-3.3-70b-versatile") {
                const waitMatch = data.error.message.match(/try again in ([\d.]+)s/);
                const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 500 : 3000;
                if (waitMs < 15000) {
                    await sleep(waitMs);
                    console.log(`🔄 Falling back to 8b-instant after ${waitMs}ms wait...`);
                } else {
                    console.log(`🔄 70b TPM limit high, falling back to 8b-instant immediately...`);
                }
                return generateGroqContent(prompt, "llama-3.1-8b-instant");
            }
            throw new Error(`RATE_LIMIT:10000`);
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
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
        const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
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

async function generateGeminiContent(prompt) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing.");
    // Mandatory v1beta for Gemini 3.1 and March 2026 fleet
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1beta' });
    
    // Try newest stable models for March 2026 — 1.5 and 2.0 series are now retired
    const models = [
        "gemini-3.1-pro-preview", 
        "gemini-2.5-flash", 
        "gemini-3.1-flash-lite-preview"
    ];
    
    for (const modelName of models) {
        try {
            console.log(`🔍 Attempting Gemini via ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            console.log(`✅ Gemini ${modelName} succeeded.`);
            return response.text();
        } catch (err) {
            if (err.message.includes('404') || err.message.includes('not found') || err.message.includes('NOT_FOUND')) {
                console.warn(`⚠️ Gemini ${modelName} not found. Rotating to next...`);
                continue;
            }
            // Rate limit — wait and retry same model once
            if (err.message.includes('429') || err.message.includes('quota') || err.message.includes('RESOURCE_EXHAUSTED')) {
                console.warn(`⏳ Gemini ${modelName} rate limited. Waiting 5s...`);
                await sleep(5000);
                try {
                    const model2 = genAI.getGenerativeModel({ model: modelName });
                    const result2 = await model2.generateContent(prompt);
                    return result2.response.text();
                } catch (e2) { continue; }
            }
            throw err;
        }
    }
    console.warn("🛑 ALL Gemini models failed/not found. Using local regex-based audit as emergency fallback.");
    return localRegexAudit(prompt);
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

async function generateOpenRouterContent(prompt) {
    if (!process.env.OPENROUTER_KEY) throw new Error("OPENROUTER_KEY missing.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_KEY}`,
                "HTTP-Referer": "https://blogspro.in",
                "X-Title": "BlogsPro AI",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "meta-llama/llama-3.1-8b-instruct", // Resilient fallback
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await res.json();
        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        console.error("❌ OpenRouter Fail Details:", JSON.stringify(data));
        throw new Error("OpenRouter failed.");
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateMistralContent(prompt) {
    if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY missing.");
    try {
        const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "mistral-small-latest",
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await res.json();
        if (data && data.choices) return data.choices[0].message.content;
        throw new Error("Mistral failed");
    } catch (e) { throw e; }
}

async function generateCerebrasContent(prompt) {
    if (!process.env.CEREBRAS_API_KEY) throw new Error("CEREBRAS_API_KEY missing.");
    try {
        const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.CEREBRAS_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama3.1-8b",
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await res.json();
        if (data && data.choices) return data.choices[0].message.content;
        throw new Error("Cerebras failed");
    } catch (e) { throw e; }
}

async function generateCloudflareContent(prompt) {
    if (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) throw new Error("Cloudflare credentials missing.");
    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.CF_API_TOKEN}` },
            body: JSON.stringify({ messages: [{ role: "user", content: prompt }] })
        });
        const data = await res.json();
        if (data && data.result) return data.result.response;
        throw new Error("Cloudflare AI failed");
    } catch (e) { throw e; }
}

async function generateTogetherContent(prompt) {
    if (!process.env.TOGETHER_KEY) throw new Error("TOGETHER_KEY missing.");
    return generateOpenAICompatible(prompt, "together", "https://api.together.xyz/v1/chat/completions", process.env.TOGETHER_KEY, "meta-llama/Llama-3-8b-chat-hf");
}

async function generateDeepInfraContent(prompt) {
    if (!process.env.DEEPINFRA_KEY) throw new Error("DEEPINFRA_KEY missing.");
    return generateOpenAICompatible(prompt, "deepinfra", "https://api.deepinfra.com/v1/openai/chat/completions", process.env.DEEPINFRA_KEY, "meta-llama/Meta-Llama-3-8B-Instruct");
}

async function generateOpenAICompatible(prompt, name, url, key, model) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
        const res = await fetch(url, {
            method: "POST",
            signal: controller.signal,
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
        const data = await res.json();
        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        console.error(`❌ ${name} Fail Details:`, JSON.stringify(data));
        throw new Error(`${name} failed.`);
    } catch (err) {
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

async function generateGithubContent(prompt) {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN missing.");
    try {
        const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }]
            })
        });
        const data = await res.json();
        if (data && data.choices) return data.choices[0].message.content;
        console.error("❌ GitHub Models Fail Details:", JSON.stringify(data));
        throw new Error(`GitHub Models failed: ${data.error?.message || 'Unknown'}`);
    } catch (e) { throw e; }
}

let generatePoolIndex = 0;
const failedProviders = new Set();

async function askAI(prompt, options = { role: 'generate' }) {
    console.log(`📝 Prompt prepared. Length: ${prompt.length} chars. Role: ${options.role}`);
    
    // 0. MirorFish Swarm QA - Specialized Serverless Switch
    if (options.role === 'swarm_qa') {
        try {
            const { runSwarmAudit } = require("./mirofish-qa-service.js");
            console.log("🕵️  Handoff to MiroFish Swarm QA CLI...");
            return await runSwarmAudit(prompt, options.freq || "daily");
        } catch (e) {
            console.warn(`⚠️ Swarm QA Bridge failed: ${e.message}. Falling back to standard Auditor...`);
            options.role = 'audit'; 
        }
    }

    const generatePool = [];
    const activeKeys = {
        Gemini: process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || process.env.LLM_API_KEY,
        Groq: process.env.GROQ_KEY || process.env.GROQ_API_KEY,
        OpenRouter: process.env.OPENROUTER_KEY || process.env.OPENROUTER_API_KEY,
        Mistral: process.env.MISTRAL_KEY || process.env.MISTRAL_API_KEY,
        Together: process.env.TOGETHER_KEY,
        DeepInfra: process.env.DEEPINFRA_KEY,
        Cloudflare: process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_ID,
        GitHub: process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    };

    console.log("🛠️ AI Service environment check:");
    Object.keys(activeKeys).forEach(k => {
        if (activeKeys[k]) console.log(`   - ${k}: ✅ Present`);
    });

    if (activeKeys.Gemini) {
        process.env.GEMINI_API_KEY = activeKeys.Gemini;
        generatePool.push({ name: 'Gemini', fn: generateGeminiContent });
    }
    if (activeKeys.Groq) {
        process.env.GROQ_API_KEY = activeKeys.Groq;
        generatePool.push({ name: 'Groq', fn: generateGroqContent });
    }
    if (activeKeys.OpenRouter) {
        process.env.OPENROUTER_KEY = activeKeys.OpenRouter;
        generatePool.push({ name: 'OpenRouter', fn: generateOpenRouterContent });
    }
    if (activeKeys.Mistral) {
        process.env.MISTRAL_API_KEY = activeKeys.Mistral;
        generatePool.push({ name: 'Mistral', fn: generateMistralContent });
    }
    if (activeKeys.Together) generatePool.push({ name: 'Together', fn: generateTogetherContent });
    if (activeKeys.DeepInfra) generatePool.push({ name: 'DeepInfra', fn: generateDeepInfraContent });
    if (activeKeys.Cloudflare) generatePool.push({ name: 'Cloudflare', fn: generateCloudflareContent });
    if (activeKeys.GitHub) generatePool.push({ name: 'GitHub', fn: generateGithubContent });
    
    console.log(`🌊 Active pool size: ${generatePool.length} providers`);
    
    // If role is audit, we explicitly want Gemini first for precision formatting (but now with fallback)
    if (options.role === 'audit' && process.env.GEMINI_API_KEY) {
        try {
            console.log("🔍 Auditing/Sanitizing via Gemini (1.5-Flash)...");
            return await generateGeminiContent(prompt);
        } catch (e) {
            console.warn(`⚠️ Gemini Auditor failed: ${e.message}. Falling back to general pool for audit...`);
            // Continue below to the general pool loop
        }
    }
    
    if (generatePool.length === 0) {
        // One last-ditch attempt at Gemini if no other keys are present
        if (process.env.GEMINI_API_KEY) {
            console.log("🚀 Attempting Last-Ditch Fallback via Gemini...");
            return await generateGeminiContent(prompt);
        }
        throw new Error("All AI engines exhausted or keys missing. Please check your GitHub Secrets (GEMINI, GROQ, etc.).");
    }

    // Round Robin Load Balancer
    const startIdx = generatePoolIndex % generatePool.length;
    
    for (let i = 0; i < generatePool.length; i++) {
        const idx = (startIdx + i) % generatePool.length;
        const model = generatePool[idx];
        
        if (failedProviders.has(model.name)) continue;

        try {
            console.log(`🚀 Attempting Load-Balanced Generation via ${model.name}...`);
            const res = await model.fn(prompt);
            generatePoolIndex++; // iterate for next call
            return res;
        } catch (e) {
            console.warn(`⚠️ ${model.name} failed: ${e.message}. Rotating to next...`);
            
            // If it's an Auth error, blacklist this provider for the rest of the job
            if (e.message.includes('Authentication') || e.message.includes('401') || e.message.includes('not found')) {
                console.error(`🚫 Blacklisting ${model.name} due to terminal authentication/config failure.`);
                failedProviders.add(model.name);
            }

            if (e.message.startsWith('RATE_LIMIT:')) {
                const waitMs = parseInt(e.message.split(':')[1]) || 5000;
                await sleep(500);
            }
        }
    }

    // Ultimate fallback for generation: Gemini (any role)
    if (process.env.GEMINI_API_KEY) {
        console.log("🚀 Attempting Ultimate Fallback via Gemini...");
        return await generateGeminiContent(prompt);
    }
    
    throw new Error("All AI engines exhausted. Check GEMINI_API_KEY/GROQ_API_KEY secrets in GitHub Actions.");
}

module.exports = { askAI };
