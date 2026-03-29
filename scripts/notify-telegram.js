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
        const fileName = latest.fileName;
        const excerpt = latest.excerpt || "New institutional strategic analysis available on the terminal.";

        const tgTitle = type === 'articles' ? `📑 *STRATEGIC REPORT: ${frequency.toUpperCase()}*` : `📑 *INTELLIGENCE PULSE: ${frequency.toUpperCase()}*`;
        const linkPrefix = type === 'articles' ? `articles/${frequency}` : `briefings/${frequency}`;
        const tgText = `${tgTitle}\n\n*${title}*\n\n🔗 View Report: https://blogspro.in/${linkPrefix}/${fileName}`;

        const res = await fetchWithTimeout(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: process.env.TELEGRAM_TO, text: tgText, parse_mode: "Markdown" })
        });

        if (res.ok) {
            console.log(`✅ Telegram Notification Sent: ${title}`);
        } else {
            console.error(`❌ Telegram API Error: ${res.status}`);
        }
    } catch (e) {
        console.error("❌ Notification Failure:", e);
    }
}

notifyTelegram();
