#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { 
    fetchEconomicCalendar, fetchMultiAssetData, fetchSentimentData, 
    fetchUniversalNews, fetchUpstoxData, fetchMacroPulse,
    fetchMFData, fetchPEVCData, fetchInsuranceData, fetchGIFTCityData
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

async function generateBriefing() {
    const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'daily';
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "briefings", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    console.log(`🚀 Starting Global Intelligence Engine (${frequency})...`);
    
    const [calendar, markets, sentiment, universal, upstox, macro, mf, pevc, ins, gift] = await Promise.all([
        fetchEconomicCalendar(), fetchMultiAssetData(), fetchSentimentData(),
        fetchUniversalNews(), fetchUpstoxData(), fetchMacroPulse(),
        fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData()
    ]);

    const mkt = require("./lib/data-fetchers.js").getMarketContext();

    const marketContext = `
    --- SYSTEM CONTEXT ---
    TIME_IST: ${mkt.timestamp}
    DAY: ${mkt.day}
    MARKET_STATUS: ${mkt.status}
    
    --- DATA FEEDS ---
    SENTIMENT: ${sentiment.summary}
    UPSTOX: ${upstox.summary}
    MULTI_ASSET: ${markets.summary}
    MACRO: ${macro.summary}
    MUTUAL_FUNDS: ${mf.summary}
    PRIVATE_CAPITAL: ${pevc.summary}
    INSURANCE_RISK: ${ins.summary}
    GIFT_CITY: ${gift.summary}
    CALENDAR: ${calendar.text}
    
    --- UNIVERSAL NEWS (Yahoo Finance, Business Standard, Reuters, CNBC) ---
    ${universal}
    `;

    const prompt = `You are a Lead Quant Strategist for BlogsPro Intelligence Terminal.
    Write a high-fidelity ${frequency} market pulse (HTML).
    
    TEMPORAL GUIDANCE:
    - Current DOW is ${mkt.day}. Status: ${mkt.status}.
    ${mkt.isWeekend ? "- IMPORTANT: Markets are CLOSED. Focus on WEEKEND WRAP and WEEKLY PREP. Do NOT suggest intraday long/short trades." : "- Markets are ACTIVE. Focus on LIVE EXECUTION and PIVOTS."}

    STRATEGIC REQUIREMENTS:
    1. Tone: Sharp, authoritative, data-driven.
    2. Focus: ${frequency === 'hourly' ? 'Volatility pivots, technical liquidity, and global macro drifts.' : 'Session transitions, sectoral rotation, and institutional catalysts.'}
    3. Grounding: You MUST reference specific news items from the feeds above to back your analysis.
    4. Sentiment: Map how global greed/fear (${sentiment.label}) correlates with Indian FPI/DII flows.

    CRITICAL VISUAL INSTRUCTIONS:
    - Start with exactly one <h2> tag.
    - Provide a 1-sentence analytical excerpt wrapped in <details id="meta-excerpt" style="display:none">.
    - MANDATORY: Include a Markdown table with at least 5 rows: "| Metric | Observation | Alpha Impact |".
    - End with "SENTIMENT_SCORE: [0-100]" and "PRICE_INFO: [Last, High, Low]".
    - Include a poll: "Question: [Text]" and "Options: [Opt1, Opt2, Opt3]".

    DATASET: ${marketContext}`;

    // Dynamic Symbol Detection
    let pairId = "179"; // Nifty 50
    if (frequency === 'hourly' && marketContext.includes('USDINR')) pairId = "160";
    if (marketContext.includes('BTC')) pairId = "1057391";
    if (marketContext.includes('Bank Nifty')) pairId = "44301";

    const isDaily = frequency === 'daily';
    const isHourly = frequency === 'hourly';

    const cleanAIResponse = (text) => {
        return text
            .replace(/```[a-z]*\n/gi, "") // Remove starting code blocks
            .replace(/```/g, "")          // Remove ending code blocks
            .replace(/^Here is the pulse.*:$/gi, "") // Remove AI conversational fluff
            .replace(/^In this pulse.*:$/gi, "")
            .trim();
    };

    try {
        let content = "";
        let seoDescription = "";
        let seoKeywords = "";

        if (isDaily) {
            console.log("📑 Generating Stage 1: Strategic Recap...");
            const stage1Prompt = `${prompt}\n\nSTRICT INSTRUCTION: Focus purely on RECAP of the last 24 hours. Be extremely verbose. Target 1,500 words. Do NOT include a conclusion yet.`;
            let stage1Raw = await askAI(stage1Prompt);
            
            console.log("📑 Generating Stage 2: Predictive Alpha...");
            const stage2Prompt = `${prompt}\n\nSTRICT INSTRUCTION: Focus on PREDICTION and RISK for the next 48 hours. Connect the data points. Target 1,500 words. Include the final poll and interactive metrics.`;
            let stage2Raw = await askAI(stage2Prompt);
            
            content = `${stage1Raw}\n<hr style="border:1px solid var(--gold); opacity:0.2; margin:4rem 0;">\n${stage2Raw}`;
        } else {
            console.log(`📑 Generating Pulse Analysis (${frequency})...`);
            const verbosePrompt = `${prompt}\n\nSTRICT INSTRUCTION: Provide absolute granular detail. Target ${isHourly ? '700' : '1500'} words of high-density analysis.`;
            content = await askAI(verbosePrompt);
        }

        // Multi-Pass Pass 2: Sanitizer
        console.log("🧹 Sanitizing Briefing Content...");
        const sanitizerPrompt = `Clean this market briefing for institutional delivery.
        - REMOVE all markdown backticks (\`\`\`).
        - Fix mismatching tags and invalid HTML.
        - Ensure metrics (SENTIMENT_SCORE, PRICE_INFO) are preserved at the bottom.
        - Tone: Cold, Bloomberg-style institutional blocks.
        
        CONTENT:
        ${content}`;
        content = await askAI(sanitizerPrompt);
        content = cleanAIResponse(content);

        // Pass 3: SEO Audit
        console.log("🔍 Running SEO Audit Pass...");
        const seoPrompt = `Analyze this market report and return JSON only: {"description": "1-sentence summary", "keywords": "5-10 comma separated keywords"}\n\nREPORT: ${content.substring(0, 2000)}`;
        const seoDataRaw = await askAI(seoPrompt);
        const seoData = JSON.parse(seoDataRaw.match(/\{.*?\}/s)?.[0] || '{"description": "Institutional market pulse", "keywords": "fintech, strategy"}');

        const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const excerptMatch = content.match(/<details id="meta-excerpt"[^>]*>(.*?)<\/details>/i);
        
        const title = titleMatch ? titleMatch[1].trim() : `Strategic Pulse — ${dateLabel}`;
        const excerpt = excerptMatch ? excerptMatch[1].trim() : "Institutional-grade synthesis of global macro and domestic sectoral rotation.";
        
        const sentimentMatch = content.match(/SENTIMENT_SCORE:\s*(\d+)/i);
        const sentimentScore = sentimentMatch ? parseInt(sentimentMatch[1]) : parseInt(sentiment.value);

        const priceMatch = content.match(/PRICE_INFO:\s*\[(.*?),(.*?),(.*?)\]/i) || content.match(/PRICE_INFO:\s*(.*?)(?=\n|$)/i);
        const priceStr = priceMatch ? (priceMatch[1] || priceMatch[0]).replace(/PRICE_INFO:\s*/i, '') : "N/A";
        const priceInfo = { last: priceStr.split(',')[0]?.trim() || "N/A", high: priceStr.split(',')[1]?.trim() || "N/A", low: priceStr.split(',')[2]?.trim() || "N/A" };

        const pollQuestionMatch = content.match(/question:\s*(.*?)(?=\n|$)/i);
        const pollOptionsMatch = content.match(/options:\s*(.*?)(?=\n|$)/i);
        const finalKit = {
            audioScript: `BlogsPro ${frequency} Intelligence. ${title}. ${excerpt}`,
            pollQuestion: pollQuestionMatch ? pollQuestionMatch[1].trim() : "Where is the next liquidity zone?",
            pollOptions: pollOptionsMatch ? pollOptionsMatch[1].split(',').map(o => o.trim()) : ["Pivot Breakout", "Rangebound", "Support Validation"]
        };

        const datestr = new Date().toISOString().split('T')[0];
        const fileName = `pulse-${datestr}-${frequency}-${Date.now()}.html`;
        
        // Final Chart Injection Logic (Briefing Parity with Article Engine)
        const briefingCharts = [
            { id: "sentiment", label: "Sentiment Drift" },
            { id: "macro", label: "Macro Flux" },
            { id: "multi_asset", label: "Multi-Asset Alpha" }
        ];

        let injectionScript = "";
        briefingCharts.forEach(c => {
            injectionScript += `
            <script>
                google.charts.setOnLoadCallback(() => {
                    const el = document.getElementById('chart_${c.id}');
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
        });

        const finalContent = content + injectionScript;

        // Generate Web Version
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content: finalContent, dateLabel, 
            finalKit, type: "briefing", freq: frequency, fileName, pairId, sentimentScore, priceInfo,
            seoDescription: seoData.description,
            seoKeywords: seoData.keywords
        });
        fs.writeFileSync(path.join(targetDir, fileName), fullHtml);
        
        // Generate & Dispatch Email Version (Safe Template - No JS)
        const emailHtml = require("./lib/templates.js").getEmailTemplate({
            title, excerpt, content, dateLabel, priceInfo
        });

        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ title, date: today, fileName, type: "briefing", frequency });
        fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 50), null, 2));

        if (process.env.NEWSLETTER_WORKER_URL && (isDaily || isHourly)) {
            console.log("📨 Dispatching High-Fidelity Newsletter...");
            await fetchWithTimeout(process.env.NEWSLETTER_WORKER_URL, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject: title, html: emailHtml, secret: process.env.NEWSLETTER_SECRET })
            }).catch((err) => { console.error("Newsletter Fail:", err); });
        }

        console.log(`🏁 Intelligence Pulse Generated: ${fileName}`);
    } catch (e) {
        console.error("❌ Intelligence fail:", e);
        process.exit(1);
    }
}

generateBriefing();
