import fs from 'fs';
import path from 'path';
import { generatePDF } from './lib/pdf-service.js';
import { notifyTelegram } from './notify-telegram.js';

async function verifyDelivery() {
    console.log("🧪 [Verification] Starting Mock Institutional Delivery Trial...");
    
    const frequency = 'hourly';
    const type = 'briefing';
    const mockFileName = `mock-swarm-${Date.now()}.html`;
    const rootDir = process.cwd();
    const targetDir = path.join(rootDir, "briefings", frequency);
    
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    
    const htmlPath = path.join(targetDir, mockFileName);
    const mockContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mock Institutional Briefing</title>
            <style>
                body { font-family: sans-serif; padding: 40px; color: #111827; }
                h1 { border-bottom: 2px solid #111827; padding-bottom: 10px; }
                .terminal-card { border: 1px solid #E5E7EB; border-radius: 8px; padding: 20px; background: #F9FAFB; }
            </style>
        </head>
        <body>
            <h1>📑 INSTITUTIONAL PULSE: HOURLY</h1>
            <div class="terminal-card">
                <h2>Strategic Simulation: Alpha-Vector 9</h2>
                <p>This is a mock manuscript generated to verify the PDF delivery pipeline for BlogsPro Swarm 5.0.</p>
                <p>Timestamp: ${new Date().toISOString()}</p>
            </div>
        </body>
        </html>
    `;
    
    fs.writeFileSync(htmlPath, mockContent);
    console.log(`✓ Created Mock HTML: ${htmlPath}`);

    try {
        console.log("📑 Step 1: Converting to PDF...");
        const pdfPath = await generatePDF(htmlPath, frequency);
        
        console.log("📡 Step 2: Dispatching to Telegram...");
        // Use process.env or empty object if keys missing
        const env = process.env;
        const result = await notifyTelegram(pdfPath, frequency, type, env);
        
        console.log("\n🏁 [Verification] Trial Complete!");
        console.log("Result:", JSON.stringify(result, null, 2));
        
        if (result.status === 'skipped') {
            console.log("\n💡 Note: Telegram skipped as expected (Keys are empty in .env).");
            console.log("To complete the final handshake, populate TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.");
        }
    } catch (err) {
        console.error("❌ Verification Failed:", err);
    }
}

verifyDelivery();
