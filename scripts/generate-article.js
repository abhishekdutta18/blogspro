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

    const staticDataBlock = `
    INSTITUTIONAL PULSE:
    RBI (Official): ${rbi.summary}
    SEBI (Official): ${sebi.summary}
    CCIL (Clearing): ${ccil.summary}
    MACRO (WB): ${macro.summary}
    GLOBAL: ${global.summary}
    `;

    const prompt = `You are a Strategic Fintech & Policy Architect for BlogsPro. 
    Write a ${frequency === 'weekly' ? "Weekly Strategic deep-dive" : "Monthly Macro Outlook"} (HTML).
    Tone: Thought-leadership, structural analysis, forward-looking.
    Include specific policy implications and long-term targets.
    REGULATORY DATA: ${staticDataBlock}`;

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].trim() : `Strategic Outlook — ${dateLabel}`;
        const excerpt = "Strategic deep-dive for institutional and professional investors.";
        
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit: { audioScript: "Listen to this week's strategic deep-dive..." }, 
            type: "article", freq: frequency 
        });
        
        const fileName = `article-${today}.html`;
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

        console.log(`🏁 Article Success: ${fileName}`);
    } catch (e) {
        console.error("❌ Article Fail:", e);
        process.exit(1);
    }
}

generateArticle();
