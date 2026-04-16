const { 
    fetchUniversalNews, fetchRBIData, fetchSEBIData, 
    fetchMultiAssetData, fetchMacroPulse, fetchUpstoxData 
} = require("./lib/data-fetchers.js");
const { askAI } = require("./lib/ai-service.js");

async function audit() {
    console.log("🔍 AGENTIC DATA AUDIT STARTING...");
    
    try {
        const [news, rbi, sebi, assets, macro, upstox] = await Promise.allSettled([
            fetchUniversalNews(),
            fetchRBIData(),
            fetchSEBIData(),
            fetchMultiAssetData(),
            fetchMacroPulse(),
            fetchUpstoxData()
        ]);

        console.log("\n--- [1] UNIVERSAL NEWS (Yahoo, Business Standard, CNBC, Reuters Proxy) ---");
        if (news.status === 'fulfilled') {
            const headlines = news.value.split(' | ');
            console.log(`✅ Success. Total Headlines: ${headlines.length}`);
            headlines.slice(0, 5).forEach(h => console.log(`   - ${h}`));
        } else {
            console.error(`❌ News Fail: ${news.reason}`);
        }

        console.log("\n--- [2] REGULATORY PULSE (RBI & SEBI) ---");
        console.log(`RBI Status: ${rbi.status === 'fulfilled' ? '✅' : '❌'}`);
        if (rbi.status === 'fulfilled') console.log(`   - ${rbi.value.summary}`);
        
        console.log(`SEBI Status: ${sebi.status === 'fulfilled' ? '✅' : '❌'}`);
        if (sebi.status === 'fulfilled') console.log(`   - ${sebi.value.summary}`);

        console.log("\n--- [3] MULTI-ASSET & MACRO ---");
        if (assets.status === 'fulfilled') {
            console.log(`✅ Symbols Tracked: ${assets.value.raw.length}`);
            console.log(`   - Sample: ${assets.value.summary.substring(0, 100)}...`);
        }
        if (macro.status === 'fulfilled') console.log(`✅ Macro: ${macro.value.summary}`);

        console.log("\n--- [4] DOMESTIC TERMINAL (Upstox) ---");
        if (upstox.status === 'fulfilled') console.log(`✅ Pulse: ${upstox.value.summary}`);

        console.log("\n--- [5] AI CONSENSUS (Institutional Fleet) ---");
        try {
            const aiTest = await askAI("Test institutional pulse. Respond with 1 word: ACTIVE.", { role: 'audit' });
            console.log(`✅ Fleet Status: ${aiTest}`);
        } catch (e) {
            console.error(`❌ Fleet Fail: ${e.message}`);
        }

        console.log("\n🏁 AUDIT COMPLETE.");
    } catch (e) {
        console.error("❌ CRITICAL AUDIT FAILURE:", e);
    }
}

audit();
