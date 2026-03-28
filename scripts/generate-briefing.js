#!/usr/bin/env node
const path = require("path");
const { fetchEconomicCalendar, fetchMultiAssetData, fetchIndianNews, fetchGlobalNews, fetchGlobalMarkets, fetchMacroPulse, fetchUpstoxData } = require(path.join(__dirname, "lib", "data-fetchers"));
const { askAI } = require(path.join(__dirname, "lib", "ai-service"));
const { getBaseTemplate } = require(path.join(__dirname, "lib", "templates"));
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

    console.log(`🚀 Starting Briefing Engine (${frequency})...`);
    
    const [calendar, markets, inNews, glNews, upstox, global, macro] = await Promise.all([
        fetchEconomicCalendar(),
        fetchMultiAssetData(),
        fetchIndianNews(),
        fetchGlobalNews(),
        fetchUpstoxData(),
        fetchGlobalMarkets(),
        fetchMacroPulse()
    ]);

    const marketContext = `
    LIVE DATA:
    UPSTOX: ${upstox.summary}
    GLOBAL: ${global.summary}
    CALENDAR: ${calendar.text}
    MACRO: ${macro.summary}
    MULTI-ASSET: ${markets.summary}
    
    NEWS:
    IN: ${inNews}
    GL: ${glNews}
    `;

    const prompt = `You are a Senior Fintech Market Analyst for BlogsPro. 
    Write a sharp, institutional-grade ${frequency} market pulse (HTML).
    
    CRITICAL SEO & VISUAL INSTRUCTIONS:
    1. Start with exactly one <h2> tag containing a unique, punchy title.
    2. Provide a 1-sentence analytical excerpt wrapped in a <details id="meta-excerpt" style="display:none"> tag.
    3. MANDATORY: Include a Markdown data table with columns "| Metric | Value | Change (%) |" summarizing at least 4 key stats.
    4. MANDATORY: End with exactly "SENTIMENT_SCORE: [0-100]" and "PRICE_INFO: [Last, High, Low]".
    5. INTERACTIVE: Include a 1-sentence "What's your take?" poll question and 3 short options.
    
    MARKET CONTEXT: ${marketContext}`;

    // Dynamic Symbol Detection (Investing.com Pair IDs)
    let pairId = "179"; // Nifty 50
    if (frequency === 'hourly' && marketContext.includes('USDINR')) pairId = "160";
    if (marketContext.includes('BTC') || marketContext.includes('Crypto')) pairId = "1057391";
    if (marketContext.includes('Bank Nifty')) pairId = "44301";

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const excerptMatch = content.match(/<details id="meta-excerpt"[^>]*>(.*?)<\/details>/i);
        
        const title = titleMatch ? titleMatch[1].trim() : `Briefing — ${dateLabel}`;
        const excerpt = excerptMatch ? excerptMatch[1].trim() : "Sharp Indo-Global market insights and regulatory updates.";
        
        const sentimentMatch = content.match(/SENTIMENT_SCORE:\s*(\d+)/i);
        const sentimentScore = sentimentMatch ? parseInt(sentimentMatch[1]) : 50;

        const priceMatch = content.match(/PRICE_INFO:\s*\[(.*?),(.*?),(.*?)\]/i);
        const priceInfo = priceMatch ? { last: priceMatch[1].trim(), high: priceMatch[2].trim(), low: priceMatch[3].trim() } : { last: "24,000", high: "24,200", low: "23,800" };

        const pollQuestionMatch = content.match(/poll question:\s*(.*?)(?=\n|$)/i);
        const pollOptionsMatch = content.match(/options:\s*(.*?)(?=\n|$)/i);
        const finalKit = {
            audioScript: "Listen to today's sharp market pulse...",
            pollQuestion: pollQuestionMatch ? pollQuestionMatch[1].trim() : "Where do you see the Nifty 50 heading tomorrow?",
            pollOptions: pollOptionsMatch ? pollOptionsMatch[1].split(',').map(o => o.trim()) : ["Bullish Above 24k", "Rangebound", "Bearish Breakout"]
        };

        const datestr = new Date().toISOString().split('T')[0];
        const fileName = `briefing-${datestr}${frequency === 'hourly' ? '-' + Date.now() : ''}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit, type: "briefing", freq: frequency, fileName, pairId, sentimentScore, priceInfo
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        // Update index.json
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "briefing", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (frequency === 'daily' || frequency === 'hourly')) {
            console.log(`📨 Dispatching ${frequency} Newsletter...`);
            await fetchWithTimeout(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            }).catch(e => console.error("⚠️ Newsletter dispatch timed out/failed:", e.message));
        }

        if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TO) {
            console.log(`📡 Dispatching ${frequency} Pulse to Telegram...`);
            const tgTitle = frequency === 'hourly' ? `🕒 <b>HOURLY PULSE</b>` : `📅 <b>DAILY BRIEFING</b>`;
            const text = `${tgTitle}\n\n<b>${title}</b>\n\n${excerpt}\n\n🔗 <a href="https://blogspro.in/briefings/${frequency}/${fileName}">Read Full Terminal Report</a>`;
            
            await fetchWithTimeout(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: process.env.TELEGRAM_TO, text, parse_mode: "HTML" })
            }).catch(e => console.error("⚠️ Telegram dispatch timed out/failed:", e.message));
        }

        console.log(`🏁 Briefing Success: ${fileName}`);
    } catch (e) {
        console.error("❌ Briefing Fail:", e);
        process.exit(1);
    }
}

generateBriefing();
