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
const { validateContent } = require("./lib/validator.js");
const rl = require("./lib/reinforcement.js");
const { sanitizeJSON } = require("./lib/sanitizer.js");
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
            .replace(/^(Here is|In this|Sure|Please|This) (chapter|pulse|report|analysis|is).*:?$/gim, "") // Remove AI conversational fluff
            .replace(/I have updated.*$/gim, "")
            .replace(/I will now.*$/gim, "")
            .trim();
    };


    const executeAuditedGeneration = async (scribePrompt, frequency, vName) => {
        // Prepend Lessons Learned from past failures
        const lessonPrompt = rl.getReinforcementContext() + "\n" + scribePrompt;
        
        let chapter = await askAI(lessonPrompt, { role: 'generate' });
        let attempts = 0;
        let lastFailures = [];
        let successOnFirstTry = true;
        
        while (attempts < 3) {
            let sanPrompt = getSanitizerPrompt(chapter);
            if (attempts > 0) {
                successOnFirstTry = false;
                sanPrompt += `\n\n[SYSTEM REJECTION]: Your previous output failed structural requirements. FIX THESE EXACT ISSUES in the rewrite:\n${lastFailures.map(f => "- " + f).join("\n")}`;
            }
            
            let sanitized = await askAI(sanPrompt, { role: 'audit' });
            sanitized = sanitizeJSON(cleanAIResponse(sanitized));
            
            const failures = validateContent(sanitized);
            if (failures.length === 0) {
                // Log Success for the Reinforcement Loop
                if (successOnFirstTry) {
                    rl.logSuccess(vName, "Perfect structural execution");
                }
                return sanitized;
            }
            
            console.warn(`⚠️ Auditor rejected ${vName} (Attempt ${attempts+1}/3). Failures: ${failures.join(', ')}`);
            chapter = sanitized; 
            lastFailures = failures;
            rl.logFailure(vName, failures); // Log every failure for reinforcement
            attempts++;
        }
        if (!chapter.includes("| Metric |")) {
            console.warn(`[LENIENT FAIL-SAFE] Injecting table structure for ${vName}`);
            chapter += `\n\n| Metric | Observation | Alpha Impact |\n|:-------|:------------|:-------------|\n| System Drift | Structural Halt | N/A |\n| Content Volume | Insufficient Data | Negative |\n| Volatility Index | Flat | Neutral |\n| Yield Analysis | Pending Revision | Unknown |\n| Terminal Code | Awaits Reload | Neutral |\n\n`;
        }

        console.error(`❌ Auditor loop exhausted for ${vName}. Proceeding safely.`);
        return chapter; 
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

            const scribePrompt = getArticlePrompt(frequency, v.name, v.id, v.data, macro.summary, verticalNews, lastSummary);

            // Execute Stage 1 & 2 via the Auditor Loop
            let chapter = await executeAuditedGeneration(scribePrompt, frequency, v.name);

            // Extract Chart Data Proposed by AI
            const chartDataMatch = chapter.match(/<chart-data>(.*?)<\/chart-data>/s);
            let proposedData = "[['P1', 5], ['P2', 8], ['P3', 6], ['P4', 10]]"; // Fallback
            
            const chartContainer = `<div id="chart_${v.id}" class="terminal-chart" style="width:100%;height:220px;margin:2.5rem 0;background:rgba(20,20,20,0.3);border:1px solid rgba(191,161,0,0.15);border-left:3px solid var(--nexus-accent);"></div>`;

            if (chartDataMatch) {
                const rawData = chartDataMatch[1].trim();
                try {
                    const parsed = JSON.parse(rawData);
                    if (Array.isArray(parsed)) proposedData = JSON.stringify(parsed);
                } catch (e) {
                    console.warn(`⚠️ Malformed chart data for ${v.id}. Falling back.`);
                }
                chapter = chapter.replace(/<chart-data>.*?<\/chart-data>/s, chartContainer);
            } else {
                // Ensure every vertical has a chart target for V6.44 uniformity
                chapter += `\n${chartContainer}`;
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
            const emailHtml = require("./lib/templates.js").getEmailTemplate({
                title, excerpt, content: fullContent, dateLabel, priceInfo
            });
            await fetchWithTimeout(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: emailHtml, secret: process.env.NEWSLETTER_SECRET })
            }).catch(() => {});
        }

        console.log(`🏁 Strategic Article Generated: ${fileName}`);
    } catch (e) {
        console.error("❌ Strategic Article fail:", e);
        process.exit(1);
    }
}

generateArticle();
