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
const { getBriefingPrompt, getSanitizerPrompt } = require("./lib/prompts.js");
const rl = require("./lib/reinforcement.js");
const { sanitizeJSON } = require("./lib/sanitizer.js");
const { generatePDF } = require("./lib/pdf-service.js");
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
    const force = process.argv.includes('--force');
    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const today = now.toISOString().split('T')[0];
    const targetDir = path.join(__dirname, "..", "briefings", frequency);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // 0. IDEMPOTENCY CHECK (Ghost Prevention)
    const indexPath = path.join(targetDir, "index.json");
    if (fs.existsSync(indexPath) && !force) {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        const exists = index.some(entry => {
            if (frequency === 'hourly') {
                const entryHour = new Date(entry.timestamp).getHours();
                return entry.date === today && entryHour === now.getHours();
            }
            return entry.date === today;
        });

        if (exists) {
            console.log(`⚠️ SKIPPING: ${frequency.toUpperCase()} pulse already exists for ${today}${frequency === 'hourly' ? ' (Hour: ' + now.getHours() + ')' : ''}. Use --force to override.`);
            return;
        }
    }

    console.log(`🚀 Starting Global Intelligence Engine (${frequency})...`);
    
    const [calendar, markets, sentiment, universalRaw, upstox, macro, mf, pevc, ins, gift] = await Promise.all([
        fetchEconomicCalendar(), fetchMultiAssetData(), fetchSentimentData(),
        fetchUniversalNews(), fetchUpstoxData(), fetchMacroPulse(),
        fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData()
    ]);

    // PRE-PROCESSING: Aggressive Trimming for Groq/TPM Limits
    const universal = universalRaw.split('|').slice(0, 3).join(' | '); // Limit to top 3 stories only

    const mkt = require("./lib/data-fetchers.js").getMarketContext();

    // SLIM DATA CONTEXT: Only essential fields for prompt efficiency
    const marketContext = `
    --- SYSTEM CONTEXT ---
    TIME_IST: ${mkt.timestamp} | DAY: ${mkt.day} | STATUS: ${mkt.status}
    
    --- KEY DATA ---
    SENTIMENT: ${(sentiment.summary || '').substring(0, 200)}
    MULTI_ASSET: ${(markets.summary || '').substring(0, 200)}
    MACRO: ${(macro.summary || '').substring(0, 200)}
    CALENDAR: ${(calendar.text || '').substring(0, 200)}
    
    --- TOP NEWS ---
    ${universal.substring(0, 500)}
    `;

    const prompt = getBriefingPrompt(frequency, marketContext, mkt);

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
            .replace(/^(Here is|In this|This is).*?:/gim, "") // Remove AI conversational fluff
            .replace(/^Strategic Pulse.*?2026/gim, "") // Remove redundant title headers
            .trim();
    };

    try {
        let content = "";
        let seoDescription = "";
        let seoKeywords = "";

        const validateBriefing = (html) => {
            const failures = [];
            
            // Structural Scribe Check
            if (!/<h1|h2/i.test(html)) failures.push("Missing primary institutional header (H1/H2).");
            if (!/details id="meta-excerpt"/i.test(html)) failures.push("Missing analytical <details> excerpt.");
            
            // Institutional Cold Tone: Fluff Detection
            const fluffRegex = /In this pulse|As reported by|In conclusion|analysis suggests|discussed in the previous|anchor for this chapter|here is the|let's look at|dive into|delve into/i;
            if (fluffRegex.test(html)) {
                const match = html.match(fluffRegex)[0];
                failures.push(`COLD TONE VIOLATION: Conversational fluff detected ("${match}"). Use Bloomberg-style blocks only.`);
            }

            // Citations: Need at least 2 distinct URL links
            const citations = (html.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
            if (citations < 2) failures.push(`Verification failure (Found ${citations} hyperlinked citations, need at least 2 distinct sources).`);

            const chartDataMatch = html.match(/<chart-data>(.*?)<\/chart-data>/s);
            if (!chartDataMatch) {
                failures.push("Missing <chart-data> JSON tag at the end.");
            } else {
                try {
                    const parsed = JSON.parse(chartDataMatch[1].trim());
                    if (!parsed.sentiment || !parsed.macro || !parsed.multi_asset) {
                        failures.push("JSON inside <chart-data> must have 'sentiment', 'macro', and 'multi_asset' keys formatted as arrays.");
                    }
                } catch(e) { failures.push(`JSON_SYNTAX_ERROR: ${e.message}`); }
            }
            return failures;
        };

        const executeAuditedBriefing = async (generationPrompt, isDaily) => {
            // Aggressive Trim for Groq (Target < 8k chars for safety)
            const trimmedPrompt = generationPrompt.length > 8000 
                ? generationPrompt.substring(0, 8000) + "\n[Context Truncated for Groq TPM Safety]"
                : generationPrompt;

            const lessonPrompt = rl.getReinforcementContext() + "\n" + trimmedPrompt;
            let attemptContent = await askAI(lessonPrompt, { role: 'generate' });
            let attempts = 0;
            let lastFailures = [];
            let successOnFirstTry = true;
            
            while (attempts < 3) {
                let sanPrompt = getSanitizerPrompt(attemptContent);
                if (attempts > 0) {
                    successOnFirstTry = false;
                    sanPrompt += `\n\n[SYSTEM REJECTION]: Your previous output failed structural requirements. FIX THESE EXACT ISSUES in the rewrite:\n${lastFailures.map(f => "- " + f).join("\n")}`;
                }
                
                let sanitized = await askAI(sanPrompt, { role: 'audit' });
                sanitized = sanitizeJSON(cleanAIResponse(sanitized));
                
                const failures = validateBriefing(sanitized);
                if (failures.length === 0) {
                    if (successOnFirstTry) {
                        rl.logSuccess("Briefing", "Perfect structural execution");
                    }
                    return sanitized;
                }
                
                console.warn(`⚠️ Briefing Auditor Rejected (Attempt ${attempts+1}/3). Failures: ${failures.join(', ')}`);
                attemptContent = sanitized;
                lastFailures = failures;
                rl.logFailure("Briefing", failures); // Log every failure for reinforcement
                attempts++;
            }
            console.error(`❌ Auditor loop exhausted for Briefing. Proceeding in Lenient Mode.`);
            return attemptContent;
        };

        if (isDaily) {
            console.log("📑 Generating Stage 1: Strategic Recap...");
            const stage1Prompt = `${prompt}\n\nSTRICT INSTRUCTION: Concise RECAP of the last 24 hours. Target 500 words max. Raw data blocks only.`;
            let stage1Raw = await askAI(stage1Prompt, { role: 'generate' });
            
            console.log("📑 Generating Stage 2: Predictive Alpha...");
            const stage2Prompt = `${prompt}\n\nSTRICT INSTRUCTION: Focus on PREDICTION and RISK for the next 48 hours. Connect the data points. Target 1,500 words. Include the final poll and interactive metrics.`;
            let stage2Audited = await executeAuditedBriefing(stage2Prompt, true);
            
            content = `${stage1Raw}\n<hr style="border:1px solid var(--gold); opacity:0.2; margin:4rem 0;">\n${stage2Audited}`;
        } else {
            console.log(`📑 Generating Pulse Analysis (${frequency})...`);
            const verbosePrompt = `${prompt}\n\nSTRICT INSTRUCTION: Provide absolute granular detail. Target ${isHourly ? '700' : '1500'} words of high-density analysis.`;
            content = await executeAuditedBriefing(verbosePrompt, false);
        }

        // Pass 3: SEO Audit
        console.log("🔍 Running SEO Audit Pass...");
        const seoPrompt = `Analyze this market report and return JSON only: {"description": "1-sentence summary", "keywords": "5-10 comma separated keywords"}\n\nREPORT: ${content.substring(0, 2000)}`;
        const seoDataRaw = await askAI(seoPrompt, { role: 'audit' });
        const seoData = JSON.parse(seoDataRaw.match(/\{.*?\}/s)?.[0] || '{"description": "Institutional market pulse", "keywords": "fintech, strategy"}');
        seoDescription = seoData.description;
        seoKeywords = seoData.keywords;

        // Extract Briefing Chart Data proposed by AI
        const chartDataMatch = content.match(/<chart-data>(.*?)<\/chart-data>/s);
        let proposedData = { sentiment: [], macro: [], multi_asset: [] };
        
        const briefingChartContainers = `
<div id="chart_sentiment" class="terminal-chart" style="width:100%;height:180px;margin:1.5rem 0;background:rgba(20,20,20,0.3);border:1px solid rgba(191,161,0,0.1);border-left:3px solid #BFA100;"></div>
<div id="chart_macro" class="terminal-chart" style="width:100%;height:180px;margin:1.5rem 0;background:rgba(20,20,20,0.3);border:1px solid rgba(191,161,0,0.1);border-left:3px solid #BFA100;"></div>
<div id="chart_multi_asset" class="terminal-chart" style="width:100%;height:180px;margin:1.5rem 0;background:rgba(20,20,20,0.3);border:1px solid rgba(191,161,0,0.1);border-left:3px solid #BFA100;"></div>
        `;

        if (chartDataMatch) {
            try { 
                const parsed = JSON.parse(chartDataMatch[1].trim());
                if (parsed.sentiment && parsed.macro && parsed.multi_asset) {
                    proposedData = parsed;
                } else {
                    throw new Error("Invalid structure");
                }
            } catch (e) { 
                console.warn("⚠️ AI Briefing Data Corrupt — Using institutional baseline.");
                proposedData = {
                    sentiment: [["09:00", 45], ["11:00", 52], ["13:00", 48], ["15:00", 55]],
                    macro: [["09:00", 12], ["11:00", 11], ["13:00", 13], ["15:00", 12]],
                    multi_asset: [["09:00", 5], ["11:00", 8], ["13:00", 6], ["15:00", 9]]
                };
            }
            content = content.replace(/<chart-data>.*?<\/chart-data>/s, briefingChartContainers);
        } else {
            // Force baseline charts for briefings to ensure high-fidelity UI
            proposedData = {
                sentiment: [["09:00", 45], ["11:00", 52], ["13:00", 48], ["15:00", 55]],
                macro: [["09:00", 12], ["11:00", 11], ["13:00", 13], ["15:00", 12]],
                multi_asset: [["09:00", 5], ["11:00", 8], ["13:00", 6], ["15:00", 9]]
            };
            content += briefingChartContainers;
        }

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
            { id: "sentiment", label: "Sentiment Drift", data: proposedData.sentiment },
            { id: "macro", label: "Macro Flux", data: proposedData.macro },
            { id: "multi_asset", label: "Multi-Asset Alpha", data: proposedData.multi_asset }
        ];

        const globalBriefingScript = `
<script>
    google.charts.setOnLoadCallback(() => {
        const render = (containerId, label, rawData, color) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            try {
                const data = new google.visualization.DataTable();
                data.addColumn('string', 'Period');
                data.addColumn('number', label);
                data.addRows(rawData);

                const options = {
                    backgroundColor: 'transparent',
                    colors: [color],
                    chartArea: {width: '85%', height: '70%', top: 40, bottom: 60},
                    legend: { position: 'top', alignment: 'center', textStyle: {color: 'rgba(191,161,0,0.8)', fontSize: 10} },
                    hAxis: { 
                        title: 'Intraday Session Period',
                        textStyle: {color: 'rgba(191,161,0,0.6)', fontSize: 10}, 
                        titleTextStyle: {color: '#BFA100', fontSize: 11, italic: true},
                        gridlines: {color: 'rgba(191,161,0,0.1)'} 
                    },
                    vAxis: { 
                        title: label + ' % Delta',
                        textStyle: {color: 'rgba(191,161,0,0.6)', fontSize: 10}, 
                        titleTextStyle: {color: '#BFA100', fontSize: 11, italic: true},
                        gridlines: {color: 'rgba(191,161,0,0.1)'} 
                    },
                    lineWidth: 3, pointSize: 6
                };
                new google.visualization.AreaChart(el).draw(data, options);
            } catch (err) { console.error("Chart Render Fail:", containerId, err); }
        };
        ${briefingCharts.map(c => `render('chart_${c.id}', '${c.label}', ${JSON.stringify(c.data)}, '#BFA100');`).join('\n        ')}
    });
</script>
`;

        // Generate Web Version
        const fullHtml = getBaseTemplate({ 
            title, excerpt, content, dateLabel, 
            finalKit, type: "briefing", freq: frequency, fileName, pairId, sentimentScore, priceInfo,
            seoDescription: seoData.description,
            seoKeywords: seoData.keywords,
            scripts: globalBriefingScript
        });
        const briefingFilePath = path.join(targetDir, fileName);
        fs.writeFileSync(briefingFilePath, fullHtml);
        
        // Generate PDF Version
        try {
            await generatePDF(briefingFilePath);
        } catch (pdfErr) {
            console.error("⚠️ PDF creation failed (skipping):", pdfErr.message);
        }
        
        // Generate & Dispatch Email Version (Safe Template - No JS)
        const emailHtml = require("./lib/templates.js").getEmailTemplate({
            title, excerpt, content, dateLabel, priceInfo
        });

        const indexPath = path.join(targetDir, "index.json");
        let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : [];
        index.unshift({ 
            title, 
            date: today, 
            timestamp: Date.now(),
            excerpt,
            fileName, 
            type: "briefing", 
            frequency 
        });
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
