const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");
const RSSParser = require("rss-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require("node-fetch");

// Layout Template
function getTemplate(title, excerpt, content, date, social = {}) {
    const canonical = `https://blogspro.in/posts/post-${date}.html`;
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": title,
        "description": excerpt,
        "datePublished": new Date(date).toISOString(),
        "author": { "@type": "Organization", "name": "BlogsPro AI", "url": "https://blogspro.in" },
        "publisher": { "@type": "Organization", "name": "BlogsPro", "logo": { "@type": "ImageObject", "url": "https://blogspro.in/logo.png" } }
    };

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
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [{
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://blogspro.in"
      },{
        "@type": "ListItem",
        "position": 2,
        "name": "Briefings",
        "item": "https://blogspro.in/posts"
      },{
        "@type": "ListItem",
        "position": 3,
        "name": "${title}",
        "item": "${canonical}"
      }]
    }
    </script>
    <script type="application/json" id="audio-briefing-script">${JSON.stringify({ script: social.audioScript || "" })}</script>
    
    <!-- Scripts & Tracking -->
    <script src="../js/sentry-init-v2.js"></script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-DED9GTRR3E"></script>
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-DED9GTRR3E');</script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    
    <style>
        :root { --navy:#080d1a; --gold:#c9a84c; --cream:#f5f0e8; --muted:#8896b3; --serif:'Cormorant Garamond',serif; --sans:'DM Sans',sans-serif; }
        body { background: var(--navy); color: var(--cream); font-family: var(--sans); margin: 0; line-height: 1.6; }
        nav { position: sticky; top: 0; background: rgba(8,13,26,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(201,168,76,0.2); padding: 0 2rem; height: 64px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
        .brand { font-family: var(--serif); font-size: 1.5rem; font-weight: 700; color: var(--gold); text-decoration: none; }
        .back-link { font-size: 0.85rem; color: var(--muted); text-decoration: none; }
        .article-container { max-width: 740px; margin: 0 auto; padding: 4rem 2rem; }
        .meta { color: var(--gold); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 1rem; display: block; }
        h1 { font-family: var(--serif); font-size: clamp(2.2rem, 5vw, 3.5rem); line-height: 1.1; margin-bottom: 1.5rem; }
        .excerpt { font-size: 1.2rem; color: var(--muted); margin-bottom: 2.5rem; border-bottom: 1px solid rgba(201,168,76,0.1); padding-bottom: 2rem; }
        .content { font-size: 1.1rem; line-height: 1.8; }
        .content h2 { font-family: var(--serif); color: var(--gold); font-size: 1.8rem; margin: 3rem 0 1rem; }
        .breadcrumb { font-size: 0.75rem; color: var(--muted); margin-bottom: 1.5rem; display: flex; gap: 0.5rem; }
        .breadcrumb a { color: var(--gold); text-decoration: none; }
        .audio-summary { margin: 2rem 0; padding: 1.5rem; background: rgba(201,168,76,0.08); border: 2px solid var(--gold); border-radius: 8px; display: none; }
        .audio-summary h3 { margin-top: 0; color: var(--gold); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; }
        .ad-slot { margin: 2rem 0; padding: 1.5rem; background: rgba(255,255,255,0.03); border: 1px dashed rgba(201,168,76,0.2); border-radius: 6px; text-align: center; }
        .share-btn { background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3); color: var(--gold); padding: 0.6rem 1.2rem; border-radius: 4px; font-size: 0.85rem; font-weight: 700; cursor: pointer; text-decoration: none; }
    </style>
</head>
<body>
    <nav>
        <a href="../index.html" class="brand">BlogsPro</a>
        <a href="../index.html" class="back-link">← All Briefings</a>
    </nav>
    <article class="article-container">
        <nav class="breadcrumb">
            <a href="/">Home</a> <span>/</span> <a href="/posts">Briefings</a> <span>/</span> <label>${title.substring(0, 30)}...</label>
            <div style="margin-left:auto; display:flex; gap:1rem; align-items:center;">
                <span style="font-size:0.7rem; color:var(--muted); text-transform:uppercase;">Complexity: <b style="color:var(--gold)">${social.complexityScore || 5}/10</b></span>
                <button onclick="window.print()" class="share-btn" style="padding:0.3rem 0.6rem; font-size:0.7rem;">PDF</button>
            </div>
        </nav>
        <header>
            <span class="meta">AI Briefing • ${date}</span>
            <h1 class="title">${title}</h1>
            <p class="excerpt">${excerpt}</p>
        </header>
        <div id="audioSection" class="audio-summary">
            <h3><span>🔊</span> AI Audio Briefing</h3>
            <p style="font-size:0.9rem; color:var(--cream); line-height:1.6; margin-bottom:0px;">${social.audioScript || "Loading..."}</p>
        </div>
        <div class="ad-slot">
            <ins class="adsbygoogle" style="display:block; text-align:center;" data-ad-layout="in-article" data-ad-format="fluid" data-ad-client="ca-pub-DUMMY_CLIENT_ID" data-ad-slot="DUMMY_SLOT_ID"></ins>
            <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
        </div>
        <div class="content">${content}</div>
        <section class="poll-section" style="margin: 4rem 0; padding: 2rem; background: rgba(201,168,76,0.05); border: 1px solid rgba(201,168,76,0.2); border-radius: 8px;">
            <h3 style="font-family: var(--serif); color: var(--gold); margin-top: 0;">🗳️ Community Poll: ${social.pollQuestion || "What's your take?"}</h3>
            <div style="display: grid; gap: 0.8rem; margin-top: 1.5rem;">
                ${(social.pollOptions || ["Agree", "Disagree"]).map(opt => `<button class="share-btn" style="text-align: left; background: rgba(255,255,255,0.03);" onclick="alert('Thanks for voting!')">${opt}</button>`).join('')}
            </div>
        </section>
        <div class="social-share">
            <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(social.twitter || title)}&url=${encodeURIComponent(canonical)}" target="_blank" class="share-btn">Share on X</a>
            <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonical)}" target="_blank" class="share-btn">LinkedIn</a>
        </div>
        <footer>
            <div style="margin-top: 5rem; padding-top: 2rem; border-top: 1px solid rgba(201,168,76,0.1); text-align: center; color: var(--muted); font-size: 0.8rem;">
                &copy; 2026 BlogsPro. <a href="{{UNSUBSCRIBE_LINK}}" style="color: var(--muted); text-decoration: underline;">Unsubscribe</a>
            </div>
        </footer>
    </article>
    <script>
        async function checkAudioStatus() {
            try {
                const res = await fetch('https://firestore.googleapis.com/v1/projects/blogspro-ai/databases/(default)/documents/site/settings');
                const data = await res.json();
                if (data.fields && data.fields.audioEnabled && data.fields.audioEnabled.booleanValue) {
                    document.getElementById('audioSection').style.display = 'block';
                }
            } catch (e) { console.warn("Audio check failed:", e); }
        }
        checkAudioStatus();
    </script>
</body>
</html>`;
}

// Fetchers
// Helpers
async function getBriefingKit(today) {
    return { category: "Macro & Strategy", topic: "Indo-Global Convergence" };
}

async function fetchForexFactory() {
    try {
        const response = await fetch("https://nfs.forexfactory.com/ff_calendar_thisweek.xml");
        const xmlData = await response.text();
        const parser = new XMLParser();
        const jsonObj = parser.weeklycalendar.event || [];
        const highImpact = events.filter(e => e.impact === 'High');
        return { 
            text: `High Impact Forex: ${highImpact.slice(0, 10).map(e => `${e.event} (${e.country})`).join(', ')}`,
            raw: highImpact.slice(0, 8).map(e => `${e.country} ${e.event}`)
        };
    } catch (err) { return { text: "Forex: Unavailable.", raw: [] }; }
}

async function fetchNewsAPI() {
    try {
        const apiKey = process.env.NEWS_API_KEY;
        // Global + India
        const [global, india] = await Promise.all([
            fetch(`https://newsapi.org/v2/top-headlines?category=business&language=en&apiKey=${apiKey}`).then(r => r.json()),
            fetch(`https://newsapi.org/v2/top-headlines?country=in&category=business&apiKey=${apiKey}`).then(r => r.json())
        ]);
        const articles = [...(global.articles || []), ...(india.articles || [])].slice(0, 5);
        return `Top Business Headlines (Indo-Global): ${articles.map(a => a.title).join(' | ')}`;
    } catch (err) { return "News: Unavailable."; }
}

async function fetchGlobalMarkets() {
    console.log("🌎 Fetching Global Markets (Indices/Commodities)...");
    try {
        // Use our proxy worker to get global data
        const res = await fetch("https://blogspro-upstox.abhishek-dutta1996.workers.dev/global");
        const json = await res.json();
        if (json.status === 'success') {
            const summary = json.data.map(d => `${d.symbol}: ${d.price} (${d.change}%)`).join(' | ');
            return { summary, raw: json.data };
        }
        return { summary: "Global Markets: Unavailable.", raw: [] };
    } catch (e) { return { summary: "Global Markets: Unavailable.", raw: [] }; }
}

async function downloadRegFile(url, fileName) {
    try {
        const dest = path.join(__dirname, "../downloads", fileName);
        if (fs.existsSync(dest)) return fileName; // Skip if exists
        const res = await fetch(url);
        const buffer = await res.buffer();
        fs.writeFileSync(dest, buffer);
        console.log(`✅ Downloaded: ${fileName}`);
        return fileName;
    } catch (e) {
        console.warn(`❌ Download fail (${fileName}):`, e.message);
        return null;
    }
}

async function fetchRBIData() {
    console.log("🇮🇳 Fetching RBI Press Releases & Docs...");
    try {
        const parser = new RSSParser();
        const feed = await parser.parseURL("https://www.rbi.org.in/pressreleases_rss.xml");
        const items = feed.items.slice(0, 3);
        const docs = [];
        for (const item of items) {
            // Basic scrape for PDF link (ID starts with APDF_)
            const html = await fetch(item.link).then(r => r.text());
            const pdfMatch = html.match(/href="([^"]+\.PDF)"/i);
            if (pdfMatch) {
                const pdfUrl = pdfMatch[1].startsWith('http') ? pdfMatch[1] : `https://www.rbi.org.in/${pdfMatch[1]}`;
                const local = await downloadRegFile(pdfUrl, `rbi-${Date.now()}-${path.basename(pdfUrl)}`);
                if (local) docs.push({ title: item.title, url: item.link, pdf: local });
            }
        }
        return { summary: `RBI: ${items.map(i => i.title).join(' | ')}`, docs };
    } catch (e) { return { summary: "RBI: Unavailable.", docs: [] }; }
}

async function fetchSEBIData() {
    console.log("🇮🇳 Fetching SEBI Circulars & Docs...");
    try {
        const parser = new RSSParser();
        const feed = await parser.parseURL("https://www.sebi.gov.in/sebirss.xml");
        const items = feed.items.slice(0, 3);
        const docs = [];
        for (const item of items) {
            const html = await fetch(item.link).then(r => r.text());
            const pdfMatch = html.match(/https:\/\/www\.sebi\.gov\.in\/sebi_data\/attachdocs\/[^"]+\.pdf/i);
            if (pdfMatch) {
                const local = await downloadRegFile(pdfMatch[0], `sebi-${Date.now()}-${path.basename(pdfMatch[0])}`);
                if (local) docs.push({ title: item.title, url: item.link, pdf: local });
            }
        }
        return { summary: `SEBI: ${items.map(i => i.title).join(' | ')}`, docs };
    } catch (e) { return { summary: "SEBI: Unavailable.", docs: [] }; }
}

async function fetchWSJRSS() {
    try {
        const parser = new RSSParser();
        const feed = await parser.parseURL("https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml");
        return `WSJ: ${feed.items.slice(0, 3).map(i => i.title).join(' | ')}`;
    } catch (err) { return "WSJ: Unavailable."; }
}

async function fetchUpstoxData() {
    console.log("🌐 Fetching Upstox Live & Historical Market Data via Cloudflare Worker...");
    try {
        const [liveRes, histRes] = await Promise.all([
            fetch("https://blogspro-upstox.abhishek-dutta1996.workers.dev/quotes"),
            fetch("https://blogspro-upstox.abhishek-dutta1996.workers.dev/historical?instrumentKey=NSE_INDEX%7CNifty%2050&interval=day")
        ]);

        const liveData = await liveRes.json();
        const histData = await histRes.json();
        
        let summary = "Upstox: Live data unavailable.";
        let raw = {};

        if (liveData.status === "success" && liveData.data) {
            const d = liveData.data;
            const getLtp = (s) => d[s]?.last_price || "N/A";
            summary = `NIFTY: ${getLtp("NSE_INDEX:Nifty 50")} | BANK NIFTY: ${getLtp("NSE_INDEX:Nifty Bank")} | REL: ${getLtp("NSE_EQ:RELIANCE")} | HDFC: ${getLtp("NSE_EQ:HDFCBANK")}`;
            raw = d;
        }

        if (histData.status === "success" && histData.data && histData.data.candles) {
            const candles = histData.data.candles;
            const lastClose = candles[0][4]; 
            const prevClose = candles[1][4];
            const trend = lastClose > prevClose ? "Bullish" : "Bearish";
            summary += ` | NIFTY Trend: ${trend} (${((lastClose - prevClose)/prevClose * 100).toFixed(2)}%)`;
        }

        return { summary, raw };
    } catch (e) {
        console.error("❌ Upstox Worker fetch failed:", e.message);
    }
    return { summary: "Upstox: Unavailable (Worker).", raw: {} };
}

// QA & Kit Helpers
async function auditBriefing(model, content, sourceData) {
    const prompt = `Fact-Check: SOURCE: ${sourceData} | CONTENT: ${content}. Return PASS or FAIL: [reason].`;
    const result = await model.generateContent(prompt);
    return result.response.text();
}

async function generateArticleContentWithReliability(model, context) {
    const prompt = `Persona: Indo-Global Financial Analyst.
    Task: Write a "Daily Market Briefing" (HTML). 
    Context: ${context}
    Rules: HTML only, no <body>/<html> tags, use <section>, <h3>, <ul>. 
    Tone: Institutional, sharp, forward-looking.`;
    
    // Phase 12: Reliability Router
    let result;
    let attempts = 0;
    while (attempts < 3) {
        try {
            // Adjust temperature for retries
            const generationConfig = attempts === 2 ? { temperature: 0.8 } : {}; // Slightly higher temp on final retry
            result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig });
            break;
        } catch (e) {
            attempts++;
            const retryMode = attempts === 1 ? "Standard Retry" : "Temp-Shift Retry";
            console.warn(`Generation attempt ${attempts} failed (${retryMode})...`);
            if (attempts === 3) throw e;
            // Exponential backoff
            await new Promise(r => setTimeout(r, 2000 * attempts));
        }
    }
    return result.response.text();
}

async function generateSocialKit(model, title, content) {
    const prompt = `Social Media Kit for "${title}". Return JSON {twitter, linkedin, hashtags}.`;
    const result = await model.generateContent(prompt);
    try { return JSON.parse(result.response.text().replace(/```json|```/gi, '').trim()); }
    catch (e) { return { twitter: title, linkedin: title, hashtags: ["#fintech"] }; }
}

async function generateEngagementKit(model, content) {
    const prompt = `Generate Engagement Kit (JSON): {audioScript, pollQuestion, pollOptions, category, complexityScore}. 
    Values for category MUST be one of: Macro, Policy, Equity, Tech, Crypto.
    Values for complexityScore MUST be a number 1-10 (1=Beginner, 10=Expert).
    Content: ${content.substring(0, 500)}`;
    const result = await model.generateContent(prompt);
    try { return JSON.parse(result.response.text().replace(/```json|```/gi, '').trim()); }
    catch (e) { return { audioScript: "Summary...", pollQuestion: "Take?", pollOptions: ["Yes", "No"], category: "Macro", complexityScore: 5 }; }
}

// Observability Helpers
async function logPipelineHealth(status, details = {}) {
    const url = `https://firestore.googleapis.com/v1/projects/blogspro-ai/databases/(default)/documents/site/health?mask.fieldPaths=lastRun&mask.fieldPaths=status&mask.fieldPaths=details`;
    try {
        await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: {
                    lastRun: { timestampValue: new Date().toISOString() },
                    status: { stringValue: status },
                    details: { stringValue: JSON.stringify(details) }
                }
            })
        });
    } catch (e) { console.error("Health log fail:", e); }
}

async function sendNotification(message) {
    if (process.env.NOTIFICATION_WEBHOOK && process.env.NOTIFICATION_WEBHOOK.startsWith('http')) {
        try {
            await fetch(process.env.NOTIFICATION_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: `🚀 **BlogsPro Pipeline**: ${message}` })
            });
        } catch (e) { console.error("Notify fail:", e); }
    }
    await sendTelegramNotification(message);
}

async function sendTelegramNotification(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;
    console.log("📲 Sending Telegram Broadcast...");
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🛡️ BlogsPro: ${message}`, parse_mode: 'Markdown' })
        });
    } catch (e) { console.error("Telegram fail:", e); }
}

function applyContextualLinks(content) {
    const entities = { 'TSLA': 'Tesla', 'AAPL': 'Apple', 'NVDA': 'Nvidia', 'BTC': 'Bitcoin', 'ETH': 'Ethereum', 'Fed': 'Federal Reserve' };
    let linked = content;
    for (const [t, n] of Object.entries(entities)) {
        const regex = new RegExp(`\\$${t}|(?<![">])${n}(?![^<]*>)`, 'g');
        linked = linked.replace(regex, (m) => `<a href="/posts?q=${encodeURIComponent(t)}" style="color:var(--gold); text-decoration:underline;">${m}</a>`);
    }
    return linked;
}

// Main Loop
async function generateArticle() {
    console.log("🇮🇳 Starting Indo-Global Automated AI Pipeline...");
    try {
        const today = new Date().toISOString().split('T')[0];
        const [forex, news, rbi, sebi, wsj, upstox, global, briefingKit] = await Promise.all([
            fetchForexFactory(),
            fetchNewsAPI(),
            fetchRBIData(),
            fetchSEBIData(),
            fetchWSJRSS(),
            fetchUpstoxData(),
            fetchGlobalMarkets(),
            getBriefingKit(today)
        ]);
const liveDataBlock = `
MARKET DATA (Indo-Global Context):
FOREX: ${forex.text}
NEWS: ${news}
WSJ: ${wsj}
RBI (INDIA): ${rbi.summary}
SEBI (INDIA): ${sebi.summary}
GLOBAL MARKETS: ${global.summary}
UPSTOX (LIVE): ${upstox.summary}
`;

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
        const system = `You are an elite Indo-Global Financial Analyst for blogspro.in. 
        CRITICAL TASK: Correlate Global Macro (WSJ/Forex) with Indian Regulatory (RBI/SEBI) updates and their specific impact on NSE/BSE indices/stocks provided in Upstox data.
        Write raw HTML briefings (no \`\`\`html). Use <h3> for section headers, <ul> for key takeaways, and ensure a "Market Outlook" section at the end.`;
        
        const result = await model.generateContent(`${system}\n\nDATA: ${liveDataBlock}\n\nRAW_UPSTOX_JSON: ${JSON.stringify(upstox.raw)}`);
        let htmlSnippet = result.response.text();

        const audit = await auditBriefing(model, htmlSnippet, liveDataBlock);
        if (audit.startsWith("FAIL")) {
            const fix = await model.generateContent(`${system}\n\nAudit failed: ${audit}. Rewrite: ${liveDataBlock}\n\nRAW_UPSTOX_JSON: ${JSON.stringify(upstox.raw)}`);
            htmlSnippet = fix.response.text();
        }

        const contextHtml = applyContextualLinks(htmlSnippet);
        const social = await generateSocialKit(model, "Briefing", contextHtml);
        const engage = await generateEngagementKit(model, contextHtml);
        const finalKit = { ...social, ...engage };

        const titleMatch = contextHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const title = titleMatch ? titleMatch[1].trim() : `Briefing — ${new Date().toLocaleDateString()}`;
        const excerpt = contextHtml.match(/<p[^>]*>(.*?)<\/p>/i)?.[1].substring(0, 160) || "Briefing out.";

        const fullHtml = getTemplate(title, excerpt, contextHtml, today, social);
        const fileName = `post-${today}.html`;
        fs.writeFileSync(path.join(postsDir, fileName), fullHtml);

        const indexPath = path.join(postsDir, "index.json");
        let index = [];
        if (fs.existsSync(indexPath)) index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.unshift({ 
            title, 
            slug: title.toLowerCase().replace(/ /g, '-'), 
            date: today, 
            fileName,
            category: briefingKit.category || "Macro",
            rbi: rbi.summary.substring(0, 200), 
            sebi: sebi.summary.substring(0, 200),
            docs: [...rbi.docs, ...sebi.docs],
            global: global.raw
        });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 30), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL) {
            await fetch(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: contextHtml, secret: process.env.NEWSLETTER_SECRET })
            });
        }

        await logPipelineHealth("SUCCESS", { title });
        await sendNotification(`Briefing Live: **${title}**`);
        console.log("🏁 Success.");
    } catch (err) {
        console.error("❌ Fail:", err);
        await logPipelineHealth("FAILURE", { error: err.message });
        await sendNotification(`🚨 **Pipeline Fail**: ${err.message}`);
        process.exit(1);
    }
}

generateArticle();
