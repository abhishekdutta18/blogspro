const fs = require("fs");
const path = require("path");
const { fetchEconomicCalendar, fetchMultiAssetData, fetchIndianNews, fetchGlobalNews, fetchGlobalMarkets, fetchMacroPulse, fetchUpstoxData } = require("./lib/data-fetchers");
const { askAI } = require("./lib/ai-service");
const { getBaseTemplate } = require("./lib/templates");

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

    const liveDataBlock = `
    MARKET PULSE:
    MULTI-ASSET: ${markets.summary}
    UPSTOX: ${upstox.summary}
    GLOBAL: ${global.summary}
    CALENDAR: ${calendar.text}
    MACRO: ${macro.summary}
    
    NEWS:
    IN: ${inNews}
    GL: ${glNews}
    `;

    const prompt = `You are a Senior Fintech Market Analyst for BlogsPro. 
    Write a sharp, institutional-grade ${frequency} market pulse (HTML).
    
    CRITICAL SEO INSTRUCTIONS:
    1. Start with exactly one <h2> tag containing a unique, punchy, and keyword-rich title for this specific hour/day (e.g., "Nifty Tests 22K Support Amidst Global Tech Sell-off" instead of "Market Summary").
    2. Provide a 1-sentence analytical excerpt (max 160 chars) at the very top, wrapped in a <details id="meta-excerpt" style="display:none"> tag.
    
    MARKET CONTEXT: ${staticDataBlock}`;

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const excerptMatch = content.match(/<details id="meta-excerpt"[^>]*>(.*?)<\/details>/i);
        
        const title = titleMatch ? titleMatch[1].trim() : `Briefing — ${dateLabel}`;
        const excerpt = excerptMatch ? excerptMatch[1].trim() : "Sharp Indo-Global market insights and regulatory updates.";
        
        const fileName = `briefing-${today}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit: { audioScript: "Listen to today's sharp market pulse..." }, 
            type: "briefing", freq: frequency, fileName
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        // Update index.json
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "briefing", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (frequency === 'daily' || frequency === 'hourly')) {
            console.log(`📨 Dispatching ${frequency} Newsletter...`);
            await fetch(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            });
        }

        if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TO) {
            console.log(`📡 Dispatching ${frequency} Pulse to Telegram...`);
            const tgTitle = frequency === 'hourly' ? `🕒 <b>HOURLY PULSE</b>` : `📅 <b>DAILY BRIEFING</b>`;
            const text = `${tgTitle}\n\n<b>${title}</b>\n\n${excerpt}\n\n🔗 <a href="https://blogspro.in/briefings/${frequency}/${fileName}">Read Full Terminal Report</a>`;
            
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: process.env.TELEGRAM_TO, text, parse_mode: "HTML" })
            });
        }

        console.log(`🏁 Briefing Success: ${fileName}`);
    } catch (e) {
        console.error("❌ Briefing Fail:", e);
        process.exit(1);
    }
}

generateBriefing();
