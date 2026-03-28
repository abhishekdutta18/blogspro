#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { 
    fetchRBIData, fetchSEBIData, fetchCCILData, fetchMacroPulse, 
    fetchGlobalMarkets, fetchSentimentData, fetchInstitutionalNews,
    fetchMultiAssetData
} = require("./lib/data-fetchers.js");
const { askAI } = require("./lib/ai-service.js");
const { getBaseTemplate } = require("./lib/templates.js");
const fetch = require("node-fetch");

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function generateArticle() {
    const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "articles", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    console.log(`🚀 Starting Global Strategic Article Engine (${frequency})...`);
    
    const [rbi, sebi, ccil, macro, global, sentiment, instNews, markets] = await Promise.all([
        fetchRBIData(),
        fetchSEBIData(),
        fetchCCILData(),
        fetchMacroPulse(),
        fetchGlobalMarkets(),
        fetchSentimentData(),
        fetchInstitutionalNews(),
        fetchMultiAssetData()
    ]);

    const regulatoryContext = `
    INSTITUTIONAL METRICS:
    RBI: ${rbi.summary}
    SEBI: ${sebi.summary}
    CCIL: ${ccil.summary}
    MACRO: ${macro.summary}
    GLOBAL: ${global.summary}
    SENTIMENT: ${sentiment.summary}
    SECTORAL: ${markets.summary}
    
    INSTITUTIONAL CIRCULARS:
    ${instNews}
    `;

    const prompt = `You are a Principal Policy & Strategy Architect for BlogsPro.
    Write a high-fidelity ${frequency === 'weekly' ? 'Weekly Strategic Analysis' : 'Monthly Macro Roadmap'} (HTML).
    
    CORE OBJECTIVE:
    Synthesize the latest regulatory circulars (RBI/SEBI) with sectoral rotation data. 
    Explain the "Big Picture" for institutional and professional practitioners.

    CRITICAL VISUAL INSTRUCTIONS:
    1. Start with exactly one <h2> tag (e.g., "The Strategic Pivot", "Regulatory Horizon").
    2. Provide a 1-sentence analytical excerpt wrapped in <details id="meta-excerpt" style="display:none">.
    3. MANDATORY: Include a Markdown table with at least 5 rows: "| Variable | Current | Change | Risk Level |".
    4. ANALYSIS: Deep-dive into the interaction between global macro sentiment (${sentiment.label}) and Indian sectoral trends.
    5. INTERACTIVE: End with "SENTIMENT_SCORE: [0-100]" and "PRICE_INFO: [Last, High, Low]".
    6. Include a poll: "Question: [Text]" and "Options: [Opt1, Opt2, Opt3]".

    DATASET: ${regulatoryContext}`;

    // Dynamic Symbol Detection
    let pairId = "179"; // Nifty 50
    if (regulatoryContext.includes('G-Sec') || regulatoryContext.includes('Bond')) pairId = "160";
    if (regulatoryContext.includes('Digital Rupee') || regulatoryContext.includes('Fintech')) pairId = "1057391";

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const excerptMatch = content.match(/<details id="meta-excerpt"[^>]*>(.*?)<\/details>/i);
        
        const title = titleMatch ? titleMatch[1].trim() : `Strategic Deep-Dive — ${dateLabel}`;
        const excerpt = excerptMatch ? excerptMatch[1].trim() : "Institutional synthesis of regulatory policy and macro-economic drift.";
        
        const sentimentMatch = content.match(/SENTIMENT_SCORE:\s*(\d+)/i);
        const sentimentScore = sentimentMatch ? parseInt(sentimentMatch[1]) : parseInt(sentiment.value);

        const priceMatch = content.match(/PRICE_INFO:\s*\[(.*?),(.*?),(.*?)\]/i);
        const priceInfo = priceMatch ? { last: priceMatch[1].trim(), high: priceMatch[2].trim(), low: priceMatch[3].trim() } : { last: "N/A", high: "N/A", low: "N/A" };

        const pollQuestionMatch = content.match(/question:\s*(.*?)(?=\n|$)/i);
        const pollOptionsMatch = content.match(/options:\s*(.*?)(?=\n|$)/i);
        const finalKit = {
            audioScript: `BlogsPro ${frequency} Strategy. ${title}. ${excerpt}`,
            pollQuestion: pollQuestionMatch ? pollQuestionMatch[1].trim() : "What is the priority for the next quarter?",
            pollOptions: pollOptionsMatch ? pollOptionsMatch[1].split(',').map(o => o.trim()) : ["Monetary Tightening", "Liquidity Surplus", "Asset Quality"]
        };

        const datestr = new Date().toISOString().split('T')[0];
        const fileName = `strategy-${datestr}-${frequency}-${Date.now()}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit, type: "article", freq: frequency, fileName, pairId, sentimentScore, priceInfo
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "article", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (frequency === 'weekly' || frequency === 'monthly')) {
            await fetchWithTimeout(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            }).catch(() => {});
        }

        if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TO) {
            const tgTitle = `<b>STRATEGIC REPORT: ${frequency.toUpperCase()}</b>`;
            const text = `${tgTitle}\n\n<b>${title}</b>\n\n${excerpt}\n\n🔗 <a href="https://blogspro.in/articles/${frequency}/${fileName}">Deep-Dive Analysis</a>`;
            await fetchWithTimeout(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: process.env.TELEGRAM_TO, text, parse_mode: "HTML" })
            }).catch(() => {});
        }

        console.log(`🏁 Strategic Article Generated: ${fileName}`);
    } catch (e) {
        console.error("❌ Strategic Article fail:", e);
        process.exit(1);
    }
}

generateArticle();
