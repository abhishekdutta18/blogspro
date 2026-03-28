#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { 
    fetchRBIData, fetchSEBIData, fetchCCILData, fetchMacroPulse, 
    fetchSentimentData, fetchUniversalNews, getMarketContext,
    fetchMultiAssetData, fetchMFData, fetchPEVCData, fetchInsuranceData, fetchGIFTCityData
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
    
    const [rbi, sebi, ccil, macro, universal, sentiment, markets, mf, pevc, ins, gift] = await Promise.all([
        fetchRBIData(), fetchSEBIData(), fetchCCILData(), fetchMacroPulse(),
        fetchUniversalNews(), fetchSentimentData(), fetchMultiAssetData(),
        fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData()
    ]);

    const mkt = getMarketContext();

    // 2. DATA SEGREGATION & VERTICAL MAPPING
    const verticals = [
        { id: "macro", name: "Global Macro Drift", keywords: ["DXY", "Fed", "Yield", "Oil", "Energy", "Geopolitical"], data: macro.summary },
        { id: "debt", name: "Debt & Sovereignty", keywords: ["Bond", "G-Sec", "CCIL", "Yield", "Sovereign"], data: ccil.summary },
        { id: "digital", name: "Digital Rails", keywords: ["UPI", "NPCI", "SWIFT", "CBDC", "Payments"], data: universal },
        { id: "equities", name: "Equities & Alpha", keywords: ["NIFTY", "Equity", "IPO", "Index", "FPI"], data: markets.summary },
        { id: "reg", name: "Regulatory Ledger", keywords: ["SEBI", "Circular", "Finance Ministry", "Notification"], data: sebi.summary },
        { id: "fx", name: "FX & Cross-Border", keywords: ["USDINR", "Forex", "Remittance", "Hedging"], data: markets.summary },
        { id: "commodity", name: "Commodity Pulse", keywords: ["Gold", "Silver", "Brent", "LME"], data: markets.summary },
        { id: "em", name: "Emerging Markets", keywords: ["BRICS", "EEM", "Developing", "Frontier"], data: universal },
        { id: "asset", name: "Asset Allocation", keywords: ["Rebalancing", "AUM", "Passive", "Active", "Risk"], data: mf.summary },
        { id: "scribe", name: "Scribe Analytics", keywords: ["Inference", "Synthesis", "Narrative", "Model"], data: sentiment.summary },
        { id: "capital", name: "Capital Flows (PE/VC)", keywords: ["Private Equity", "Venture Capital", "Startup", "Round"], data: pevc.summary },
        { id: "insurance", name: "Insurance & Risk", keywords: ["IRDAI", "Life", "General", "Reinsurance"], data: ins.summary },
        { id: "gift", name: "Offshore & GIFT City", keywords: ["IFSCA", "GIFT City", "IFSC", "Offshore"], data: gift.summary }
    ];

    const isMonthly = frequency === 'monthly';
    const targetWords = isMonthly ? 50000 : 10000;
    
    let fullContent = "";
    let lastSummary = "Institutional baseline established.";

    const cleanAIResponse = (text) => {
        return text
            .replace(/```[a-z]*\n/gi, "") // Remove starting code blocks
            .replace(/```/g, "")          // Remove ending code blocks
            .replace(/^(Here is|In this) (chapter|pulse|report).*:$/gim, "") // Remove AI conversational fluff
            .trim();
    };

    try {
        console.log(`🏰 Starting Recursive Synthesis for ${frequency.toUpperCase()} tome...`);

        for (let i = 0; i < verticals.length; i++) {
            const v = verticals[i];
            console.log(`✍️ Scribing Vertical ${i+1}/${verticals.length}: ${v.name}...`);

            const verticalNews = universal.split('|')
                .filter(news => v.keywords.some(k => news.toUpperCase().includes(k.toUpperCase())))
                .slice(0, 8)
                .join(' | ');

            const scribePrompt = `You are a Senior Institutional Analyst at Bloomberg.
            CONTEXT:
            - Data Flux: ${v.data}
            - Anchor: ${macro.summary}
            - Global News: ${verticalNews || "Systemic drift mapping via macro context."}
            - Flow: ${lastSummary}
            
            STRICT INSTRUCTION:
            1. Write a 1,500-2,000 word chapter for '${v.name}'. Cold, data-backed high-density tone.
            2. Formatting: Use <h2> for '${v.name}'. Insert <div class="card"><div id="chart_${v.id}"></div></div>.
            3. NO MARKDOWN CODE BLOCKS. Output pure HTML body snippets only.`;

            // Stage 1: Narrative Scribing
            let rawChapter = await askAI(scribePrompt);
            
            // Stage 2: Gemini Sanitizer Pass
            console.log(`🧹 Sanitizing Vertical ${i+1}/${verticals.length}...`);
            const sanitizerPrompt = `Clean this HTML for a Bloomberg Terminal. 
            - REMOVE all markdown backticks (e.g. \`\`\`).
            - Fix any half-closed tags or invalid HTML.
            - Ensure the ID 'chart_${v.id}' is preserved in the div.
            - Format the text specifically as cold, professional institutional blocks.
            
            CONTENT TO SANITIZE:
            ${rawChapter}`;
            
            let chapter = await askAI(sanitizerPrompt);
            chapter = cleanAIResponse(chapter);

            fullContent += `\n<section id="${v.id}" class="institutional-section">\n${chapter}\n</section>\n`;
            
            // Stage 3: Technical Chart Injection (Hardcoded, NOT AI-generated)
            fullContent += `
            <script>
                google.charts.setOnLoadCallback(() => {
                    const el = document.getElementById('chart_${v.id}');
                    if (!el) return;
                    const data = google.visualization.arrayToDataTable([
                        ['Period', 'Drift', 'Benchmark'],
                        ['P1', ${Math.random()*10}, 5], ['P2', ${Math.random()*15}, 7], ['P3', ${Math.random()*12}, 6], ['P4', ${Math.random()*20}, 8]
                    ]);
                    const options = {
                        backgroundColor: 'transparent',
                        colors: ['#BFA100', '#FFB800'],
                        chartArea: {width: '90%', height: '80%'},
                        legend: { position: 'none' },
                        hAxis: { textStyle: {color: '#BFA100', fontSize: 10}, gridlines: {color: 'rgba(191,161,0,0.1)'} },
                        vAxis: { textStyle: {color: '#BFA100', fontSize: 10}, gridlines: {color: 'rgba(191,161,0,0.1)'} },
                        lineWidth: 2, pointSize: 4
                    };
                    const chart = new google.visualization.LineChart(el);
                    chart.draw(data, options);
                });
            </script>
            `;
            
            lastSummary = `Previous chapter concluded a deep dive into ${v.name}, highlighting key regulatory shifts and market exposure for sovereign debt and capital flows.`;
        }

        console.log("🔍 Running SEO Auditor...");
        const metaRes = await askAI(`Analyze this institutional manuscript and return JSON only: {"description": "1-sentence summary", "keywords": "5 finance terms"}\n\nCONTENT: ${fullContent.substring(0, 3000)}`);
        const meta = JSON.parse(metaRes.match(/\{.*?\}/s)?.[0] || '{"description": "Institutional Strategy", "keywords": "finance, rbi"}');

        const titleMatch = fullContent.match(/<h2[^>]*>(.*?)<\/h2>/i) || fullContent.match(/<h3[^>]*>(.*?)<\/h3>/i);
        const title = titleMatch ? titleMatch[1].trim() : `${frequency.toUpperCase()} Strategic Tome — ${dateLabel}`;
        const excerpt = meta.description;
        
        const sentimentScore = parseInt(sentiment.value) || 50;
        const priceInfo = { last: "N/A", high: "N/A", low: "N/A" };
        let pairId = "179";

        const datestr = new Date().toISOString().split('T')[0];
        const fileName = `strategy-${datestr}-${frequency}-${Date.now()}.html`;
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content: fullContent, dateLabel, 
            finalKit: {
                audioScript: `BlogsPro ${frequency} Strategy. ${title}. ${excerpt}`,
                pollQuestion: "What is the primary volatility catalyst?",
                pollOptions: ["Yield Curve", "FPI Flows", "Regulatory Shift"]
            }, 
            type: "article", freq: frequency, fileName, pairId, sentimentScore, priceInfo,
            seoDescription: meta.description,
            seoKeywords: meta.keywords
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "article", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (isMonthly || frequency === 'weekly')) {
            await fetchWithTimeout(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: fullHtml, secret: process.env.NEWSLETTER_SECRET })
            }).catch(() => {});
        }

        console.log(`🏁 Strategic Article Generated: ${fileName}`);
    } catch (e) {
        console.error("❌ Strategic Article fail:", e);
        process.exit(1);
    }
}

generateArticle();
