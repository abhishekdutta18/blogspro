const { askAI } = require("./lib/ai-service.js");

async function testEnv() {
    console.log("🧪 Starting AI Service Environment Test...");
    try {
        // This will trigger the environment check log
        // Using a short prompt to verify connectivity if Gemini is present
        const response = await askAI("Hi! Just a test.");
        console.log("\n✅ AI Service Test Passed!");
        console.log("Response Preview:", response.substring(0, 50), "...");
    } catch (err) {
        console.error("\n❌ AI Service Test Failed!");
        console.error(err.message);
    }
}

testEnv();
