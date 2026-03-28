const fs = require("fs");
const path = require("path");
const { fetchRBIData, fetchSEBIData, fetchCCILData, fetchMacroPulse, fetchGlobalMarkets } = require("./lib/data-fetchers");
const { askAI } = require("./lib/ai-service");
const { getBaseTemplate } = require("./lib/templates");

async function generateArticle() {
    const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'weekly';
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "articles", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    console.log(`🚀 Starting Article Engine (${frequency})...`);
    
    // Articles focus more on Institutional Data
    const [rbi, sebi, ccil, macro, global] = await Promise.all([
        fetchRBIData(),
        fetchSEBIData(),
        fetchCCILData(),
        fetchMacroPulse(),
        fetchGlobalMarkets()
    ]);

    const regulatoryContext = `
    INSTITUTIONAL PULSE:
    RBI (Official): ${rbi.summary}
    SEBI (Compl): ${sebi.summary}
    CCIL (Clearing): ${ccil.summary}
    MACRO (WB): ${macro.summary}
    GLOBAL: ${global.summary}
    `;

    const prompt = `You are a Strategic Fintech & Policy Architect for BlogsPro. 
    Write a ${frequency === 'weekly' ? "Weekly Strategic deep-dive" : "Monthly Macro Outlook"} (HTML).
    
    CRITICAL SEO & VISUAL INSTRUCTIONS:
    1. Start with exactly one <h2> tag containing a unique, structural title.
    2. Provide a 1-sentence analytical excerpt wrapped in a <details id="meta-excerpt" style="display:none"> tag.
    3. MANDATORY: Include a Markdown data table titled "| Variable | Value | Change (%) |" summarizing 5 data points.
    4. MANDATORY: End with exactly "SENTIMENT_SCORE: [0-100]" representing the strategic outlook.
    
    REGULATORY DATA: ${regulatoryContext}`;

    // Dynamic Symbol Detection (Investing.com Pair IDs)
    let pairId = "179"; // Nifty 50
    if (regulatoryContext.includes('G-Sec') || regulatoryContext.includes('Bond')) pairId = "160"; // Use Bond/Forex proxy
    if (regulatoryContext.includes('Digital Rupee')) pairId = "1057391"; // Use BTC as Fintech proxy

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const excerptMatch = content.match(/<details id="meta-excerpt"[^>]*>(.*?)<\/details>/i);
        
        const title = titleMatch ? titleMatch[1].trim() : `Strategic Outlook — ${dateLabel}`;
        const excerpt = excerptMatch ? excerptMatch[1].trim() : "Strategic deep-dive for institutional and professional investors.";
        
        const sentimentMatch = content.match(/SENTIMENT_SCORE:\s*(\d+)/i);
        const sentimentScore = sentimentMatch ? parseInt(sentimentMatch[1]) : 50;

        const datestr = new Date().toISOString().split('T')[0];
        const fileName = `article-${datestr}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit: { audioScript: "Listen to this week's strategic deep-dive..." }, 
            type: "article", freq: frequency, fileName, pairId, sentimentScore
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        // Update index.json
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "article", frequency, rbi: rbi.summary, sebi: sebi.summary });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (frequency === 'weekly' || frequency === 'monthly')) {
            console.log(`📨 Dispatching ${frequency} Newsletter...`);
            await fetch(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            });
        }

        if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_TO) {
            console.log(`📡 Dispatching ${frequency} Article alert to Telegram...`);
            const tgTitle = frequency === 'weekly' ? `🗞️ <b>STRATEGIC WEEKLY</b>` : `📚 <b>MONTHLY OUTLOOK</b>`;
            const text = `${tgTitle}\n\n<b>${title}</b>\n\n${excerpt}\n\n🔗 <a href="https://blogspro.in/articles/${frequency}/${fileName}">Read Full Strategic Report</a>`;
            
            await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: process.env.TELEGRAM_TO, text, parse_mode: "HTML" })
            });
        }

        console.log(`🏁 Article Success: ${fileName}`);
    } catch (e) {
        console.error("❌ Article Fail:", e);
        process.exit(1);
    }
}

generateArticle();
