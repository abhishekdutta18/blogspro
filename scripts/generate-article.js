const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const RSSParser = require("rss-parser");
const { GoogleGenAI } = require("@google/genai");

// Layout Template
function getTemplate(title, excerpt, content, date) {
    const canonical = `https://blogspro.in/posts/post-${date}.html`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — BlogsPro Briefing</title>
    <meta name="description" content="${excerpt}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${excerpt}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${canonical}">
    <meta name="twitter:card" content="summary_large_image">
    
    <!-- Scripts & Tracking -->
    <script src="../js/sentry-init-v2.js"></script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-DED9GTRR3E"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-DED9GTRR3E');</script>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    
    <style>
        :root { --navy:#080d1a; --gold:#c9a84c; --cream:#f5f0e8; --muted:#8896b3; --serif:'Cormorant Garamond',serif; --sans:'DM Sans',sans-serif; }
        body { background: var(--navy); color: var(--cream); font-family: var(--sans); margin: 0; line-height: 1.6; -webkit-font-smoothing: antialiased; }
        nav { position: sticky; top: 0; background: rgba(8,13,26,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(201,168,76,0.2); padding: 0 2rem; height: 64px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
        .brand { font-family: var(--serif); font-size: 1.5rem; font-weight: 700; color: var(--gold); text-decoration: none; }
        .back-link { font-size: 0.85rem; color: var(--muted); text-decoration: none; transition: 0.2s; }
        .back-link:hover { color: var(--gold); }
        .container { max-width: 740px; margin: 0 auto; padding: 4rem 2rem; }
        .meta { color: var(--gold); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 1rem; display: block; }
        h1 { font-family: var(--serif); font-size: clamp(2.2rem, 5vw, 3.5rem); line-height: 1.1; margin-bottom: 1.5rem; }
        .excerpt { font-size: 1.2rem; color: var(--muted); line-height: 1.6; margin-bottom: 2.5rem; border-bottom: 1px solid rgba(201,168,76,0.1); padding-bottom: 2rem; }
        .content { font-size: 1.1rem; line-height: 1.8; }
        .content h2 { font-family: var(--serif); color: var(--gold); font-size: 1.8rem; margin: 3rem 0 1rem; }
        .content p { margin-bottom: 1.5rem; }
        .content ul { margin-bottom: 1.5rem; padding-left: 1.2rem; }
        .content li { margin-bottom: 0.5rem; }
        footer { margin-top: 5rem; padding-top: 2rem; border-top: 1px solid rgba(201,168,76,0.1); text-align: center; color: var(--muted); font-size: 0.8rem; }
    </style>
</head>
<body>
    <nav>
        <a href="../index.html" class="brand">BlogsPro</a>
        <a href="../index.html" class="back-link">← All Briefings</a>
    </nav>
    <article class="container">
        <span class="meta">AI Briefing • ${date}</span>
        <h1 class="title">${title}</h1>
        <p class="excerpt">${excerpt}</p>
        <div class="content">
            ${content}
        </div>
        <footer>
            <div style="margin-bottom: 2rem; padding-top: 2rem; border-top: 1px solid rgba(201,168,76,0.1); font-size: 0.75rem; color: var(--muted);">
                &copy; 2026 BlogsPro. Intelligence for the fintech frontier.<br>
                <a href="{{UNSUBSCRIBE_LINK}}" style="color: var(--muted); text-decoration: underline; margin-top: 0.5rem; display: inline-block;">Unsubscribe from these daily briefings</a>
            </div>
        </footer>
    </article>
</body>
</html>`;
}

// Fetchers
async function fetchForexFactory() {
    try {
        const response = await fetch("https://nfs.forexfactory.com/ff_calendar_thisweek.xml");
        const xmlData = await response.text();
        const parser = new XMLParser();
        const jsonObj = parser.parse(xmlData);
        const events = jsonObj.weeklycalendar.event || [];
        
        const highImpact = events.filter(e => e.impact === 'High');
        
        const text = highImpact
            .slice(0, 10)
            .map(e => `- ${e.event} (${e.country}): Forecast ${e.forecast || 'N/A'}, Previous ${e.previous || 'N/A'}`)
            .join('\n');
            
        return { 
            text: `High Impact Forex Events:\n${text || 'No high impact events found.'}`,
            raw: highImpact.slice(0, 8).map(e => `${e.country} ${e.event}`)
        };
    } catch (err) {
        console.error("Forex Factory Error:", err.message);
        return { text: "Forex Factory Context: Currently unavailable.", raw: [] };
    }
}

async function fetchNewsAPI() {
    try {
        const apiKey = process.env.NEWS_API_KEY;
        const response = await fetch(`https://newsapi.org/v2/top-headlines?category=business&language=en&apiKey=${apiKey}`);
        const data = await response.json();
        const articles = (data.articles || []).slice(0, 3);
        
        const newsHeadline = articles
            .map(a => `- ${a.title} (${a.source.name})`)
            .join('\n');
            
        return `Business Headlines:\n${newsHeadline || 'No recent business news found.'}`;
    } catch (err) {
        console.error("NewsAPI Error:", err.message);
        return "Business News Context: Currently unavailable.";
    }
}

async function fetchWSJRSS() {
    try {
        const parser = new RSSParser();
        const feed = await parser.parseURL("https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml");
        const items = feed.items.slice(0, 3);
        
        const wsjSteps = items
            .map(i => `- ${i.title}: ${i.contentSnippet || i.summary || ''}`)
            .join('\n');
            
        return `WSJ Business Feed:\n${wsjSteps || 'No items found in WSJ feed.'}`;
    } catch (err) {
        console.error("WSJ RSS Error:", err.message);
        return "WSJ Context: Currently unavailable.";
    }
}

async function generateArticle() {
    console.log("🚀 Starting Automated AI Pipeline Scaffolding...");

    // 1. Data Fetching (Parallel)
    const [forex, news, wsj] = await Promise.all([
        fetchForexFactory(),
        fetchNewsAPI(),
        fetchWSJRSS()
    ]);

    const liveDataBlock = `
${forex.text}
---
${news}
---
${wsj}
`;

    // Save Ticker Data
    const postsDir = path.join(__dirname, "../posts");
    if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });
    fs.writeFileSync(path.join(postsDir, "ticker.json"), JSON.stringify(forex.raw));
    console.log(`✅ Ticker data updated: posts/ticker.json`);

    // 2. AI Generation (Gemini SDK)
    const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", // Using 1.5-flash as 2.5 is futuristic placeholder
        generationConfig: {
            temperature: 0.2,
        }
    });

    const systemInstruction = `You are an elite, Tier-1 Financial Analyst and Lead Editor for blogspro.in, covering Global Finance, Macroeconomics, and Technology. CRITICAL INSTRUCTION: You MUST base your facts strictly on the 'LIVE DATA' provided. Do not use your pre-trained memory to invent events, quotes, or market sizes. Write a 600-word daily briefing formatted in clean HTML (using <h2>, <p>, and <ul> tags). Do not use markdown code blocks like \`\`\`html. Output only raw HTML. The current year is 2026.`;

    const userPrompt = `Draft today's financial briefing based ONLY on the data provided below: \n\n ${liveDataBlock}`;

    console.log("📡 Calling Gemini Architecture...");
    const result = await model.generateContent(systemInstruction + "\n\n" + userPrompt);
    const htmlResponse = result.response.text();

    // 3. Metadata Extraction & Template Application
    const titleMatch = htmlResponse.match(/<h2[^>]*>(.*?)<\/h2>/i);
    const excerptMatch = htmlResponse.match(/<p[^>]*>(.*?)<\/p>/i);
    
    const aiData = {
        title: titleMatch ? titleMatch[1].trim() : `Fintech Daily — ${new Date().toLocaleDateString()}`,
        excerpt: excerptMatch ? excerptMatch[1].trim().substring(0, 160) : "Today's essential fintech and market briefing.",
    };

    const fullHtml = getTemplate(aiData.title, aiData.excerpt, htmlResponse, new Date().toISOString().split('T')[0]);

    // 4. File System Operations
    const today = new Date().toISOString().split('T')[0];
    const fileName = `post-${today}.html`;
    const filePath = path.join(postsDir, fileName);

    fs.writeFileSync(filePath, fullHtml);
    console.log(`✅ Professional Briefing published: posts/${fileName}`);

    // 4. Update Static Index (for Frontend discoverability)
    const indexPath = path.join(postsDir, "index.json");
    let postsIndex = [];
    if (fs.existsSync(indexPath)) {
        try { postsIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch (e) { postsIndex = []; }
    }
    
    const slug = aiData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || `briefing-${today}`;

    // Add new post to index
    postsIndex.unshift({
        title: aiData.title,
        slug: slug,
        date: today,
        excerpt: aiData.excerpt.substring(0, 150) + "...",
        fileName: fileName
    });
    
    // Limit to last 30 briefings
    postsIndex = postsIndex.slice(0, 30);
    fs.writeFileSync(indexPath, JSON.stringify(postsIndex, null, 2));
    console.log(`✅ Static Index updated: posts/index.json`);

    // 5. Trigger Newsletter Worker (Automated Blast)
    if (process.env.NEWSLETTER_WORKER_URL) {
        console.log("📧 Triggering Newsletter Worker...");
        try {
            await fetch(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subject: aiData.title,
                    html: htmlResponse,
                    secret: process.env.NEWSLETTER_SECRET
                })
            });
            console.log("✅ Newsletter Triggered!");
        } catch (err) {
            console.error("❌ Newsletter Trigger Failed:", err.message);
        }
    }
}

generateArticle().catch(err => {
    console.error("❌ Pipeline Failed:", err);
    process.exit(1);
});
