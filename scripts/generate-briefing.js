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

    const prompt = `You are a Sharp Indo-Global Market Pulse Analyst. 
    Write a ${frequency === 'hourly' ? "high-speed snap" : "comprehensive daily briefing"} (HTML).
    Tone: Institutional, sharp, forward-looking.
    Include a Markdown table for market data summary.
    DATA: ${liveDataBlock}`;

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].trim() : `Briefing — ${dateLabel}`;
        const excerpt = "Sharp Indo-Global market insights and regulatory updates.";
        
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit: { audioScript: "Listen to today's sharp market pulse..." }, 
            type: "briefing", freq: frequency 
        });
        
        const fileName = `briefing-${today}.html`;
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        // Update index.json
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "briefing", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && frequency === 'daily') {
            console.log("📨 Dispatching Daily Newsletter...");
            await fetch(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            });
        }

        console.log(`🏁 Briefing Success: ${fileName}`);
    } catch (e) {
        console.error("❌ Briefing Fail:", e);
        process.exit(1);
    }
}

generateBriefing();
