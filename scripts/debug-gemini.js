const { GoogleGenerativeAI } = require("@google/generative-ai");

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        console.error("❌ GEMINI_API_KEY is missing!");
        return;
    }
    console.log("🔑 Key found, listing models...");
    const genAI = new GoogleGenerativeAI(key);
    try {
        // We use the underlying fetch or a dummy call to see what works
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("✔️ gemini-1.5-flash initialization OK");
        
        // List models is not directly in the SDK easily without a lot of boilerplate,
        // but we can try a simple generation.
        const res = await model.generateContent("Hi");
        console.log("✅ Generation Success:", res.response.text());
    } catch (e) {
        console.error("❌ Generation Failed:", e.message);
        if (e.stack) console.error(e.stack);
    }
}

listModels();
