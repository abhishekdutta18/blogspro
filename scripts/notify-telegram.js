import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

/**
 * Institutional Messenger Logic (BlogsPro 5.0)
 * -------------------------------------------
 * Sends PDFs and executive summaries to the user's mobile terminal via Telegram.
 */
export async function notifyTelegram(filePath = null, frequency = 'daily', type = 'briefing', env = process.env) {
    const token = env.TELEGRAM_TOKEN || env.TELEGRAM_BOT_TOKEN;
    const chatId = env.TELEGRAM_TO || env.TELEGRAM_CHAT_ID;
    
    if (!token || !chatId) {
        console.warn("⚠️ Telegram Credentials Missing (TELEGRAM_TOKEN/TELEGRAM_TO). Skipping dispatch.");
        return { status: "skipped", message: "Missing credentials" };
    }

    console.log(`📡 Sending Telegram Notification for ${frequency.toUpperCase()} (${type})...`);

    try {
        // Resolve file if not provided (fallback to index.json logic)
        let pdfPath = filePath;
        let title = "Institutional Briefing";
        let htmlFileName = "";
        let excerpt = "Institutional Strategic Analysis Manuscript. (Terminal login required for full interactive charts).";

        if (!pdfPath) {
            const indexPath = path.join(__dirname, "..", "briefings", frequency, "index.json");
            if (fs.existsSync(indexPath)) {
                const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
                if (index.length > 0) {
                    const latest = index[0];
                    title = latest.title;
                    htmlFileName = latest.fileName;
                    pdfPath = path.join(__dirname, "..", "briefings", frequency, htmlFileName.replace(".html", ".pdf"));
                    excerpt = latest.excerpt || excerpt;
                }
            }
        } else {
            // Extract title or frequency from filePath if possible
            title = path.basename(pdfPath, '.pdf').replace('swarm-', '').toUpperCase();
        }

        const tgTitle = type === 'articles' ? `📑 *STRATEGIC REPORT: ${frequency.toUpperCase()}*` : `📑 *INTELLIGENCE PULSE: ${frequency.toUpperCase()}*`;
        const linkPrefix = type === 'articles' ? `articles/${frequency}` : `briefings/${frequency}`;
        const tgCaption = `${tgTitle}\n\n*${title}*\n\n🔹 *Executive Abstract:*\n${excerpt}\n\n🔗 *Full Interactive Terminal:* https://blogspro.in/${linkPrefix}/${htmlFileName || ''}`;

        if (pdfPath && fs.existsSync(pdfPath)) {
            console.log(`📎 Attaching Institutional PDF: ${path.basename(pdfPath)}`);
            const form = new FormData();
            form.append("chat_id", String(chatId));
            form.append("document", fs.createReadStream(pdfPath));
            form.append("caption", tgCaption);
            form.append("parse_mode", "Markdown");

            const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
                method: "POST",
                body: form
            });

            if (res.ok) {
                console.log(`✅ Telegram Document Sent: ${title}`);
                return await res.json();
            } else {
                const err = await res.json();
                console.error(`❌ Telegram API Error:`, err);
                return { status: "error", error: err };
            }
        } else {
            console.warn(`⚠️ PDF not found, falling back to text notification.`);
            const tgText = `${tgTitle}\n\n*${title}*\n\n${excerpt}\n\n🔗 View Report: https://blogspro.in/${linkPrefix}/${htmlFileName || ''}`;
            const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: String(chatId), text: tgText, parse_mode: "Markdown" })
            });
            if (res.ok) {
                console.log(`✅ Telegram Text Notification Sent: ${title}`);
                return await res.json();
            } else {
                const errData = await res.json();
                console.error(`❌ Telegram Text Dispatch Failed:`, errData.description);
                return { status: "error", error: errData.description };
            }
        }
    } catch (e) {
        console.error("❌ Telegram Dispatch Failure:", e);
        return { status: "error", message: e.message };
    }
}

// Standalone support for CLI
const isEntryPoint = process.argv[1] === __filename;
if (isEntryPoint) {
    const freq = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'hourly';
    notifyTelegram(null, freq);
}
