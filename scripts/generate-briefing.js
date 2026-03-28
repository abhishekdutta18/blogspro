#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { 
    fetchEconomicCalendar, fetchMultiAssetData, fetchSentimentData, 
    fetchIndianNews, fetchGlobalNews, fetchInstitutionalNews, 
    fetchGlobalMarkets, fetchMacroPulse, fetchUpstoxData 
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

async function generateBriefing() {
    const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'daily';
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "briefings", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    console.log(`🚀 Starting Global Intelligence Engine (${frequency})...`);
    
    const [calendar, markets, sentiment, inNews, glNews, instNews, upstox, global, macro] = await Promise.all([
        fetchEconomicCalendar(),
        fetchMultiAssetData(),
        fetchSentimentData(),
        fetchIndianNews(),
        fetchGlobalNews(),
        fetchInstitutionalNews(),
        fetchUpstoxData(),
        fetchGlobalMarkets(),
        fetchMacroPulse()
    ]);

    const marketContext = `
    DASHBOARD:
    SENTIMENT: ${sentiment.summary}
    UPSTOX: ${upstox.summary}
    GLOBAL_INDICES: ${global.summary}
    CALENDAR: ${calendar.text}
    MACRO: ${macro.summary}
    MULTI_ASSET: ${markets.summary}
    
    NEWS_STREAMS:
    DOMESTIC: ${inNews}
    GLOBAL: ${glNews}
    INSTITUTIONAL: ${instNews}
    `;

    const prompt = `You are a Lead Quant Strategist for BlogsPro Intelligence Terminal.
    Write a high-fidelity, institutional-grade ${frequency} market pulse (HTML).
    
    STRATEGIC REQUIREMENTS:
    - Tone: Sharp, authoritative, data-driven.
    - Focus: ${frequency === 'hourly' ? 'Intraday volatility, Pivots, and technical liquidity zones.' : 'Session transitions, macro-catalysts, and sectoral rotation.'}
    - Analysis: Synthesize how the institutional news and sentiment (${sentiment.label}) impact the domestic NIFTY trend.

    CRITICAL VISUAL INSTRUCTIONS:
    1. Start with exactly one <h2> tag (e.g., "The Morning Pivot", "Closing Bell Alpha").
    2. Provide a 1-sentence analytical excerpt wrapped in <details id="meta-excerpt" style="display:none">.
    3. MANDATORY: Include a Markdown table: "| Indicator | Level | Change | Trend |".
    4. DATA SECTION: Comment on the Sectoral Rotation (IT vs Bank vs Auto) using the multi-asset data provided.
    5. INTERACTIVE: End with "SENTIMENT_SCORE: [0-100]" and "PRICE_INFO: [Last, High, Low]".
    6. Include a poll: "Question: [Text]" and "Options: [Opt1, Opt2, Opt3]".

    MARKET DATASET: ${marketContext}`;

    // Dynamic Symbol Detection
    let pairId = "179"; // Nifty 50
    if (frequency === 'hourly' && marketContext.includes('USDINR')) pairId = "160";
    if (marketContext.includes('BTC')) pairId = "1057391";
    if (marketContext.includes('Bank Nifty')) pairId = "44301";

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const excerptMatch = content.match(/<details id="meta-excerpt"[^>]*>(.*?)<\/details>/i);
        
        const title = titleMatch ? titleMatch[1].trim() : `Strategic Pulse — ${dateLabel}`;
        const excerpt = excerptMatch ? excerptMatch[1].trim() : "Institutional-grade synthesis of global macro and domestic sectoral rotation.";
        
        const sentimentMatch = content.match(/SENTIMENT_SCORE:\s*(\d+)/i);
        const sentimentScore = sentimentMatch ? parseInt(sentimentMatch[1]) : parseInt(sentiment.value);

        const priceMatch = content.match(/PRICE_INFO:\s*\[(.*?),(.*?),(.*?)\]/i);
        const priceInfo = priceMatch ? { last: priceMatch[1].trim(), high: priceMatch[2].trim(), low: priceMatch[3].trim() } : { last: "24,000", high: "24,150", low: "23,900" };

        const pollQuestionMatch = content.match(/question:\s*(.*?)(?=\n|$)/i);
        const pollOptionsMatch = content.match(/options:\s*(.*?)(?=\n|$)/i);
        const finalKit = {
            audioScript: `BlogsPro ${frequency} Intelligence. ${title}. ${excerpt}`,
            pollQuestion: pollQuestionMatch ? pollQuestionMatch[1].trim() : "Where is the next liquidity zone?",
            pollOptions: pollOptionsMatch ? pollOptionsMatch[1].split(',').map(o => o.trim()) : ["Pivot Breakout", "Rangebound", "Support Validation"]
        };

        const datestr = new Date().toISOString().split('T')[0];
        const fileName = `pulse-${datestr}-${frequency}-${Date.now()}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit, type: "briefing", freq: frequency, fileName, pairId, sentimentScore, priceInfo
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "briefing", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (frequency === 'daily' || frequency === 'hourly')) {
            await fetchWithTimeout(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            }).catch(() => {});
        }

        if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TO) {
            const tgTitle = `📑 *INTELLIGENCE PULSE: ${frequency.toUpperCase()}*`;
            const tgText = `${tgTitle}\n\n*${title}*\n\n${excerpt}\n\n🔗 Terminal Report: https://blogspro.in/briefings/${frequency}/${fileName}`;
            
            await fetchWithTimeout(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: process.env.TELEGRAM_TO, text: tgText, parse_mode: "Markdown" })
            }).catch(() => {});
        }

        console.log(`🏁 Intelligence Pulse Generated: ${fileName}`);
    } catch (e) {
        console.error("❌ Intelligence fail:", e);
        process.exit(1);
    }
}

generateBriefing();
