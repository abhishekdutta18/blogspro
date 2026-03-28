const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

async function generateGroqContent(prompt) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing.");
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
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
    console.error("❌ Groq API Fail Details:", JSON.stringify(data));
    throw new Error(`Groq API Error: ${data.error?.message || "Rate limit or exhaustion"}`);
}

async function generateKimiContent(prompt) {
    if (!process.env.KIMI_API_KEY) throw new Error("KIMI_API_KEY missing.");
    const res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
        method: "POST",
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
}

async function generateGeminiContent(prompt) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing.");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (e) {
        console.error("❌ Gemini API Fail Details:", e.message);
        if (e.message.includes("404")) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
            const result = await model.generateContent(prompt);
            return result.response.text();
        }
        throw e;
    }
}

async function generateOpenRouterContent(prompt) {
    if (!process.env.OPENROUTER_KEY) throw new Error("OPENROUTER_KEY missing.");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
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
}

async function askAI(prompt, config = {}) {
    console.log(`📝 Prompt prepared. Length: ${prompt.length} chars.`);
    
    // Try Groq
    if (process.env.GROQ_API_KEY) {
        try { 
            console.log("🚀 Attempting Groq (Llama-3.1-8B)...");
            return await generateGroqContent(prompt); 
        }
        catch (e) { console.warn(`⚠️ Groq failed: ${e.message}`); }
    }
    
    // Try Gemini
    if (process.env.GEMINI_API_KEY) {
        try { 
            console.log("🚀 Attempting Gemini (1.5-Flash)...");
            return await generateGeminiContent(prompt); 
        }
        catch (e) { console.warn(`⚠️ Gemini failed: ${e.message}`); }
    }

    // Try Kimi
    if (process.env.KIMI_API_KEY) {
        try { 
            console.log("🚀 Attempting Kimi...");
            return await generateKimiContent(prompt); 
        }
        catch (e) { console.warn(`⚠️ Kimi failed: ${e.message}`); }
    }
    
    // Try OpenRouter
    if (process.env.OPENROUTER_KEY) {
        try { 
            console.log("🚀 Attempting OpenRouter...");
            return await generateOpenRouterContent(prompt); 
        }
        catch (e) { console.warn(`⚠️ OpenRouter failed: ${e.message}`); }
    }
    
    throw new Error("All AI engines exhausted.");
}

module.exports = { askAI };
