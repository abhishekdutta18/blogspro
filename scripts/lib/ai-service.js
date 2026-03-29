const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateGroqContent(prompt) {
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
                model: "llama-3.1-8b-instant", // Corrected model name for high-throughput synthesis
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2
            })
        });
        const data = await res.json();
        if (data && data.choices && data.choices.length > 0) return data.choices[0].message.content;
        
        if (data.error && data.error.code === "rate_limit_exceeded") {
            const waitMatch = data.error.message.match(/try again in ([\d.]+)s/);
            const waitMs = waitMatch ? (parseFloat(waitMatch[1]) * 1000) + 1000 : 10000;
            console.warn(`⏳ Groq Rate Limit (TPM/RPM). Error: ${data.error.message}`);
            // Do NOT recurse in CI; throw so the load balancer can try Gemini/Kimi immediately.
            throw new Error(`RATE_LIMIT:${waitMs}`);
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
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // Use gemini-1.5-flash-latest for best compatibility
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("❌ Gemini API Fail Details:", e.message);
        // Fallback or retry logic can go here if needed
        throw e;
    }
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
                model: "meta-llama/llama-3-8b-instruct:free", // Resilient fallback
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

let generatePoolIndex = 0;

async function askAI(prompt, options = { role: 'generate' }) {
    console.log(`📝 Prompt prepared. Length: ${prompt.length} chars. Role: ${options.role}`);
    
    const generatePool = [];
    if (process.env.GROQ_API_KEY) generatePool.push({ name: 'Groq', fn: generateGroqContent });
    if (process.env.KIMI_API_KEY) generatePool.push({ name: 'Kimi', fn: generateKimiContent });
    if (process.env.OPENROUTER_KEY) generatePool.push({ name: 'OpenRouter', fn: generateOpenRouterContent });
    
    // If role is audit, we explicitly want Gemini first for precision formatting
    if (options.role === 'audit' && process.env.GEMINI_API_KEY) {
        try {
            console.log("🔍 Auditing/Sanitizing via Gemini (1.5-Flash)...");
            return await generateGeminiContent(prompt);
        } catch (e) {
            console.warn(`⚠️ Gemini Auditor failed: ${e.message}. Falling back to pool.`);
        }
    }
    
    if (generatePool.length === 0) {
        if (process.env.GEMINI_API_KEY) return await generateGeminiContent(prompt);
        throw new Error("All AI engines exhausted or keys missing.");
    }

    // Round Robin Load Balancer
    const startIdx = generatePoolIndex % generatePool.length;
    
    for (let i = 0; i < generatePool.length; i++) {
        const idx = (startIdx + i) % generatePool.length;
        const model = generatePool[idx];
        try {
            console.log(`🚀 Attempting Load-Balanced Generation via ${model.name}...`);
            const res = await model.fn(prompt);
            generatePoolIndex++; // iterate for next call
            return res;
        } catch (e) {
            console.warn(`⚠️ ${model.name} failed: ${e.message}. Rotating to next...`);
            if (e.message.startsWith('RATE_LIMIT:')) {
                const waitMs = parseInt(e.message.split(':')[1]) || 5000;
                // Optional: sleep a tiny bit to avoid hammering next provider too fast
                await sleep(500);
            }
        }
    }

    // Ultimate fallback for generation
    if (process.env.GEMINI_API_KEY && options.role === 'generate') {
         console.log("🚀 Attempting Ultimate Fallback via Gemini...");
         return await generateGeminiContent(prompt);
    }
    
    throw new Error("All AI engines exhausted in load balancer.");
}

module.exports = { askAI };
