#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
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

async function notifyTelegram() {
    const frequency = process.argv.find(a => a.startsWith('--freq='))?.split('=')[1] || 'daily';
    const type = (frequency === 'weekly' || frequency === 'monthly') ? 'articles' : 'briefings';
    
    console.log(`📡 Sending Telegram Notification for ${frequency.toUpperCase()} (${type})...`);

    if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_TO) {
        console.error("❌ Telegram Credentials Missing.");
        return;
    }

    const dest = String(process.env.TELEGRAM_TO);
    console.log(`📡 Targeting Chat ID: *******${dest.slice(-4)}`);

    try {
        const indexPath = path.join(__dirname, "..", type, frequency, "index.json");
        if (!fs.existsSync(indexPath)) {
            console.error(`❌ Index not found: ${indexPath}`);
            return;
        }

        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        if (index.length === 0) {
            console.error("❌ Index is empty.");
            return;
        }

        const latest = index[0];
        const title = latest.title;
        const htmlFileName = latest.fileName;
        const pdfFileName = htmlFileName.replace(".html", ".pdf");
        const pdfPath = path.join(__dirname, "..", type, frequency, pdfFileName);
        const excerpt = latest.excerpt || "Institutional Strategic Analysis Manuscript. (Terminal login required for full interactive charts).";

        const tgTitle = type === 'articles' ? `📑 *STRATEGIC REPORT: ${frequency.toUpperCase()}*` : `📑 *INTELLIGENCE PULSE: ${frequency.toUpperCase()}*`;
        const linkPrefix = type === 'articles' ? `articles/${frequency}` : `briefings/${frequency}`;
        const tgCaption = `${tgTitle}\n\n*${title}*\n\n🔹 *Executive Abstract:*\n${excerpt}\n\n🔗 *Full Interactive Terminal:* https://blogspro.in/${linkPrefix}/${htmlFileName}`;

        if (fs.existsSync(pdfPath)) {
            console.log(`📎 Attaching Institutional PDF: ${pdfFileName}`);
            const FormData = require("form-data");
            const form = new FormData();
            form.append("chat_id", dest);
            form.append("document", fs.createReadStream(pdfPath));
            form.append("caption", tgCaption);
            form.append("parse_mode", "Markdown");

            const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendDocument`, {
                method: "POST",
                body: form
            });

            if (res.ok) {
                console.log(`✅ Telegram Document Sent: ${title}`);
            } else {
                const err = await res.json();
                console.error(`❌ Telegram API Error:`, err);
            }
        } else {
            console.warn(`⚠️ PDF not found, falling back to text notification: ${pdfFileName}`);
            const tgText = `${tgTitle}\n\n*${title}*\n\n${excerpt}\n\n🔗 View Report: https://blogspro.in/${linkPrefix}/${htmlFileName}`;
            const res = await fetchWithTimeout(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: dest, text: tgText, parse_mode: "Markdown" })
            });
            if (res.ok) console.log(`✅ Telegram Text Notification Sent: ${title}`);
        }
    } catch (e) {
        console.error("❌ Notification Failure:", e);
    }
}

notifyTelegram();
