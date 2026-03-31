import { askAI } from "./lib/ai-service.js";

async function runTest() {
    console.log("🧪 [Test] Starting Swarm Research Intelligence Validation...");
    
    // 1. Test Internet Search & Deep Read
    console.log("\n🔍 [Test 1] Dynamic Search + Deep Read...");
    const searchPrompt = "Find the latest RBI press release regarding interest rates in 2026 and summarize it. Use search_web and then read_page or vision_parse if you find a PDF.";
    
    try {
        const result = await askAI(searchPrompt, { 
            role: 'research',
            model: 'llama-3.3-70b-versatile', // High-fidelity model for tool-calling
            env: process.env 
        });
        console.log("✅ [Test 1] Result:\n", result);
    } catch (e) {
        console.error("❌ [Test 1] Failed:", e.message);
    }

    // 2. Test Vision/OCR Directly
    console.log("\n👁️ [Test 2] Direct Vision/OCR Validation...");
    const visionUrl = "https://rbidocs.rbi.org.in/rdocs/PressRelease/PDFs/PR2069D1E16892520F499E8F9A4A1C8B490E00.PDF";
    const visionPrompt = `Analyze this RBI document: ${visionUrl}. Extract all key metrics. Use 'vision_parse'.`;
    
    try {
        const result = await askAI(visionPrompt, {
            role: 'research',
            model: 'gemini-1.5-flash', // Direct Flash call for OCR
            env: process.env
        });
        console.log("✅ [Test 2] Result:\n", result);
    } catch (e) {
        console.error("❌ [Test 2] Failed:", e.message);
    }

    // 3. Test Auto-Resolve Chart Injection
    console.log("\n💳 [Test 3] Auto-Resolve Chart Injection Validation...");
    const chartUrl = "https://rbidocs.rbi.org.in/rdocs/PressRelease/PDFs/PR1885C66C5F40608E41FA8B781F4B84F07B7A.PDF";
    const chartPrompt = `Extract the Repo Rate history from this document: ${chartUrl}. Apply the CHART_INJECTION_RULE and output a JSON array inside <chart-data> tags.`;
    
    try {
        const result = await askAI(chartPrompt, {
            role: 'research',
            model: 'gemini-1.5-flash',
            env: process.env
        });
        console.log("✅ [Test 3] Result:\n", result);
    } catch (e) {
        console.error("❌ [Test 3] Failed:", e.message);
    }
}

runTest();
