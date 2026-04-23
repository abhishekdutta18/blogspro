import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

async function list() {
    const key = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    console.log("Using Key:", key.substring(0, 10) + "...");
    const genAI = new GoogleGenerativeAI(key);
    try {
        // The SDK doesn't have a direct 'listModels' on the main class usually, 
        // it's often a separate fetch or via a specific client.
        // But let's try the common patterns.
        console.log("Attempting to fetch models via REST directly to be sure...");
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await res.json();
        console.log("Available Models:", JSON.stringify(data.models?.map(m => m.name), null, 2));
    } catch (err) {
        console.error("Error listing models:", err);
    }
}

list();
