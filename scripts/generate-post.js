const fs = require("fs");
const path = require("path");
const { fetchIndianNews, fetchGlobalNews, fetchMacroPulse } = require("./lib/data-fetchers");
const { askAI } = require("./lib/ai-service");
const { getBaseTemplate } = require("./lib/templates");

async function generatePost() {
    const category = process.argv.find(a => a.startsWith('--cat='))?.split('=')[1] || 'Macro';
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "posts");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    console.log(`🚀 Starting Post Engine (Category: ${category})...`);
    
    // Posts focus more on Narrative context
    const [inNews, glNews, macro] = await Promise.all([
        fetchIndianNews(),
        fetchGlobalNews(),
        fetchMacroPulse()
    ]);

    const context = `
    CURRENT NARRATIVE:
    Market Sentiment (India): ${inNews}
    Market Sentiment (Global): ${glNews}
    Economic Structure: ${macro.summary}
    `;

    const prompt = `You are a Thought-Leader & Narrative Writer for BlogsPro. 
    Write a topical blog post about "${category}" in the context of today's market (HTML).
    Tone: Narrative, opinionated, analytical.
    Context: ${context}`;

    try {
        const content = await askAI(prompt);
        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].trim() : `Post: ${category} — ${dateLabel}`;
        const excerpt = `A narrative deep-dive into ${category} and its current market sentiment.`;
        
        const fileName = `${category.toLowerCase()}-${today}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit: { pollQuestion: "What do you think of this macro shift?", pollOptions: ["Bullish", "Bearish", "Neutral"] }, 
            type: "post", freq: "daily", rel: "../", fileName
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        // Update index.json
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "post", category });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        console.log(`🏁 Post Success: ${fileName}`);
    } catch (e) {
        console.error("❌ Post Fail:", e);
        process.exit(1);
    }
}

generatePost();
