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
const { getArticlePrompt, getSanitizerPrompt } = require("./lib/prompts.js");
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
    const force = process.argv.includes('--force');
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "articles", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // 0. IDEMPOTENCY CHECK (Ghost Prevention)
    const indexPath = path.join(targetDir, "index.json");
    if (fs.existsSync(indexPath) && !force) {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const exists = index.some(entry => entry.date === today); // Simple date match for weekly/monthly
        if (exists) {
            console.log(`⚠️ SKIPPING: ${frequency.toUpperCase()} article already exists for ${today}. Use --force to override.`);
            return;
        }
    }

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
    let allScripts = "";
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

            const scribePrompt = getArticlePrompt(frequency, v.name, v.data, macro.summary, verticalNews, lastSummary);

            // Stage 1: Narrative Scribing
            let rawChapter = await askAI(scribePrompt);
            
            // Stage 2: Gemini Sanitizer Pass
            console.log(`🧹 Sanitizing Vertical ${i+1}/${verticals.length}...`);
            const sanitizerPrompt = getSanitizerPrompt(rawChapter);
            
            let chapter = await askAI(sanitizerPrompt);
            chapter = cleanAIResponse(chapter);

            // Extract Chart Data Proposed by AI
            const chartDataMatch = chapter.match(/<chart-data>(.*?)<\/chart-data>/s);
            let proposedData = "[['P1', 5], ['P2', 8], ['P3', 6], ['P4', 10]]"; // Fallback
            if (chartDataMatch) {
                const rawData = chartDataMatch[1].trim();
                try {
                    // Pre-verify that it's a valid Data Table array of arrays
                    const parsed = JSON.parse(rawData);
                    if (Array.isArray(parsed)) {
                        proposedData = JSON.stringify(parsed);
                    } else {
                        throw new Error("Not an array");
                    }
                } catch (e) {
                    console.warn(`⚠️ Malformed chart data for ${v.id}. Falling back.`);
                    proposedData = "[['P1', 5], ['P2', 8], ['P3', 6], ['P4', 10]]";
                }
                chapter = chapter.replace(/<chart-data>.*?<\/chart-data>/s, ""); // Purge tag from UI
            }

            fullContent += `\n<section id="${v.id}" class="institutional-section">\n${chapter}\n</section>\n`;
            
            // Build a registry of data for the single global script
            allScripts += `chartRegistry['chart_${v.id}'] = { label: '${v.name}', data: ${proposedData} };\n`;
            
            lastSummary = `Previous chapter concluded a deep dive into ${v.name}, highlighting key regulatory shifts and market exposure for sovereign debt and capital flows.`;
        }

        const globalChartScript = `
<script>
    const chartRegistry = {};
    ${allScripts}
    
    google.charts.setOnLoadCallback(() => {
        const optionsTemplate = {
            backgroundColor: 'transparent',
            colors: ['#BFA100'],
            chartArea: {width: '85%', height: '70%', top: 40, bottom: 60},
            legend: { position: 'top', alignment: 'center', textStyle: {color: 'rgba(191,161,0,0.8)', fontSize: 10} },
            hAxis: { 
                title: 'Observation Period (Bloomberg Terminal)',
                textStyle: {color: 'rgba(191,161,0,0.6)', fontSize: 10}, 
                titleTextStyle: {color: '#BFA100', fontSize: 11, italic: true},
                gridlines: {color: 'rgba(191,161,0,0.1)'} 
            },
            vAxis: { 
                title: 'Institutional Drift %',
                textStyle: {color: 'rgba(191,161,0,0.6)', fontSize: 10}, 
                titleTextStyle: {color: '#BFA100', fontSize: 11, italic: true},
                gridlines: {color: 'rgba(191,161,0,0.1)'} 
            },
            lineWidth: 3, pointSize: 6
        };

        Object.keys(chartRegistry).forEach(containerId => {
            const el = document.getElementById(containerId);
            if (!el) return;
            try {
                const config = chartRegistry[containerId];
                const data = new google.visualization.DataTable();
                data.addColumn('string', 'Period');
                data.addColumn('number', config.label);
                data.addRows(config.data);

                const opt = {...optionsTemplate};
                opt.vAxis.title = config.label + ' %';
                
                const chart = new google.visualization.AreaChart(el);
                chart.draw(data, opt);
            } catch (err) { console.error("Chart Render Fail:", containerId, err); }
        });
    });
</script>
`;

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
            seoKeywords: meta.keywords,
            scripts: globalChartScript
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ 
            title, 
            date: today, 
            timestamp: Date.now(),
            excerpt: excerpt || "Strategic Institutional Analysis",
            fileName, 
            type: "article", 
            frequency 
        });
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
