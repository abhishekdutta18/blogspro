import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testToken(token) {
    if (!token || token.includes('1_2_3')) return { valid: false, reason: 'Placeholder' };
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await res.json();
        return { valid: res.ok, info: data.result, error: data.description };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

async function testDelivery(token, chatId) {
    if (!token || !chatId || chatId.includes('your-')) return { success: false, reason: 'Missing/Placeholder' };
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: String(chatId),
                text: `🔒 BlogsPro Institutional Audit\n\nDiagnostic Handshake: ${new Date().toISOString()}\nStatus: OPERATIONAL\nNode: ${process.env.COMPUTERNAME || 'Local Terminal'}`,
                parse_mode: 'HTML'
            })
        });
        const data = await res.json();
        return { success: res.ok, error: data.description };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function runDiagnosis() {
    console.log("🦾 [BlogsPro-Audit] Starting Multi-Variant Handshake Diagnostic...\n");

    const variants = {
        tokens: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_TOKEN', 'BOT_TOKEN'],
        ids: ['TELEGRAM_CHAT_ID', 'TELEGRAM_TO', 'TELEGRAM_ADMIN_CHAT_ID', 'CHAT_ID']
    };

    const foundTokens = new Set();
    const foundIds = new Set();

    console.log("📋 Found Environment Variables:");
    [...variants.tokens, ...variants.ids].forEach(key => {
        const val = process.env[key];
        if (val) {
            console.log(`- ${key}: ${val.substring(0, 5)}...${val.substring(val.length - 4)}`);
            if (variants.tokens.includes(key)) foundTokens.add({ key, val });
            else foundIds.add({ key, val });
        }
    });

    console.log("\n🧪 Validating Tokens (getMe):");
    const validTokens = [];
    for (const t of foundTokens) {
        const status = await testToken(t.val);
        console.log(`- ${t.key}: ${status.valid ? '✅ VALID (' + status.info.username + ')' : '❌ INVALID (' + (status.error || status.reason) + ')'}`);
        if (status.valid) validTokens.push(t);
    }

    console.log("\n📡 Testing Delivery (sendMessage):");
    for (const t of validTokens) {
        for (const i of foundIds) {
            const status = await testDelivery(t.val, i.val);
            console.log(`- ${t.key} + ${i.key}: ${status.success ? '✅ DELIVERED' : '❌ FAILED (' + status.error + ')'}`);
        }
    }

    if (foundIds.size === 0 || Array.from(foundIds).every(i => i.val.includes('your-'))) {
        console.log("\n🕵️ [Capture-Mode] HELP: No valid Chat ID found.");
        console.log("1. Add your Telegram Bot as an Admin to your target group.");
        console.log("2. Send the command /status or /id to the bot in that group.");
        console.log("3. Since the webhook is active, check the BlogsPro Sentry Worker logs or run 'node scripts/trace-telegram-id.js' in 2 minutes.");
    }

    console.log("\n✅ Diagnosis Complete.");
}

runDiagnosis().catch(console.error);
