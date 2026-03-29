#!/usr/bin/env node
const path = require("path");
const fs = require("fs");
const { 
    fetchMacroPulse, fetchRBIData, fetchSEBIData, 
    fetchMFData, fetchPEVCData, fetchInsuranceData, fetchGIFTCityData 
} = require("./lib/data-fetchers.js");
const { getBaseTemplate } = require("./lib/templates.js");

async function testArticleGeneration() {
    console.log("🏛️  Starting BlogsPro V6.40 High-Fidelity Smoke Test...");
    
    // 1. Data Ingestion (Parity)
    const [macro, rbi, sebi, mf, pevc, ins, gift] = await Promise.all([
        fetchMacroPulse(), fetchRBIData(), fetchSEBIData(),
        fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData()
    ]);

    const verticals = [
        { id: "macro", name: "Global Macro Drift", data: macro.summary },
        { id: "debt", name: "Debt & Sovereignty", data: rbi.summary },
        { id: "equities", name: "Equities & Alpha", data: sebi.summary },
        { id: "mutual-funds", name: "Institutional Mutual Funds", data: mf.summary },
        { id: "pe-vc", name: "Private Equity & VC (CCIL)", data: pevc.summary },
        { id: "insurance", name: "Insurance Pulse (IRDAI)", data: ins.summary },
        { id: "gift-city", name: "GIFT City Catalyst (IFSCA)", data: gift.summary },
        { id: "digital", name: "Digital Infrastructure", data: "RBI CBDC/UPI 2.0 pulses active." },
        { id: "fx", name: "Foreign Exchange Drift", data: "USDINR sovereign drift monitoring." },
        { id: "commodities", name: "Strategic Commodities", data: "Gold sovereign reserve delta pulse." },
        { id: "em", name: "Emerging Market Alpha", data: "BRICS+ systemic shift analysis." },
        { id: "allocation", name: "Systemic Asset Allocation", data: "Institutional cross-asset rebalancing." },
        { id: "analytics", name: "Scribe Quantitative Audit", data: "Recursive drift synthesis metrics." }
    ];

    let fullContent = "";
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // 2. Mock Recursive Synthesis (V6.33 Persona)
    let allScripts = "";
    console.log("🖋️  Synthesizing 13 Experts (Mocked Scribe)...");
    for (const v of verticals) {
        const mockChapter = `
            <h2>${v.name}</h2>
            <p><strong>Institutional Audit:</strong> Our recursive pulse of the ${v.name} vertical suggests a systemic volatility plateau. The primary drift factor is currently measured at 12.4% above institutional baselines, driven largely by ${v.data.slice(0, 50)}...</p>
            <p><strong>Risk Assessment:</strong> Second-order effects from the latest regulatory shift indicate a 40bp divergence in alpha targets. Institutional actors are repositioning exposure to mitigate sovereign liquidity drift.</p>
            <div class="card">
                <div class="card-title">Institutional Multi-Asset Drift - ${v.name}</div>
                <div id="chart_${v.id}" style="height: 300px;"></div>
            </div>
            <p><strong>Summary:</strong> Continuous monitoring of ${v.id} remains the highest strategic priority for Q2 transition.</p>
            <chart-data>[["Q1", ${5 + Math.random()*2}], ["Q2", ${7 + Math.random()*3}], ["Q3", ${6 + Math.random()*2}], ["Q4", ${10 + Math.random()*5}]]</chart-data>
        `;
        const chartDataMatch = mockChapter.match(/<chart-data>(.*?)<\/chart-data>/s);
        let proposedData = "[['P1', 5], ['P2', 8], ['P3', 6], ['P4', 10]]";
        if (chartDataMatch) {
            proposedData = chartDataMatch[1].trim();
        }

        fullContent += `<section id="${v.id}" class="institutional-section">\n${mockChapter.replace(/<chart-data>.*?<\/chart-data>/s, "")}\n</section>\n`;
        
        // Inject Bloomberg Chart logic into segregated scripts
        allScripts += `
        <script>
            google.charts.setOnLoadCallback(() => {
                const el = document.getElementById('chart_${v.id}');
                if (!el) return;
                const data = new google.visualization.DataTable();
                data.addColumn('string', 'Period');
                data.addColumn('number', 'Institutional Drift %');
                data.addRows(${proposedData});

                const options = {
                    backgroundColor: 'transparent',
                    colors: ['#BFA100'],
                    chartArea: {width: '85%', height: '70%', top: 40, bottom: 60},
                    legend: { 
                        position: 'bottom', 
                        alignment: 'center',
                        textStyle: {color: 'rgba(191,161,0,0.8)', fontSize: 10} 
                    },
                    hAxis: { 
                        title: 'Observation Period (Bloomberg V6.40)',
                        textStyle: {color: 'rgba(191,161,0,0.6)', fontSize: 10}, 
                        titleTextStyle: {color: '#BFA100', fontSize: 11, italic: true},
                        gridlines: {color: 'rgba(191,161,0,0.1)'} 
                    },
                    vAxis: { 
                        title: 'Institutional Drift Delta %',
                        textStyle: {color: 'rgba(191,161,0,0.6)', fontSize: 10}, 
                        titleTextStyle: {color: '#BFA100', fontSize: 11, italic: true},
                        gridlines: {color: 'rgba(191,161,0,0.1)'} 
                    },
                    lineWidth: 3, pointSize: 6
                };
                const chart = new google.visualization.AreaChart(el);
                chart.draw(data, options);
            });
        </script>
        `;
    }

    // 3. Template Wrapping (V6.33 Bloomberg)
    const title = "Bloomberg V6.40 - Masterpiece Smoke Test (Sovereign)";
    const excerpt = "A 13-vertical high-fidelity strategic synthesis of the global and domestic institutional landscape.";
    
    // Pass mock SEO data
    const fullHtml = getBaseTemplate({
        title, excerpt, content: fullContent, dateLabel, 
        type: "article", freq: "weekly", freqLabel: "Weekly Strategic Manor",
        sentimentScore: 72, priceInfo: { last: "24,000", high: "24,150", low: "23,900" },
        seoDescription: "High-fidelity Bloomberg V6.33 terminal article test.",
        seoKeywords: "bloomberg, fintech, nexus, strategy",
        scripts: allScripts
    });

    const fileName = "bloomberg-smoke-test.html";
    const testDir = path.join(__dirname, "..", "articles", "weekly");
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    fs.writeFileSync(path.join(testDir, fileName), fullHtml);
    console.log(`✅  Smoke Test Complete: articles/weekly/${fileName}`);
}

testArticleGeneration();
