/**
 * Telegram Hardening Trigger (V1.0)
 * -------------------------------
 * Triggers a real-world "Premium" alert to verify layout and link stability.
 */
import 'dotenv/config';
import { dispatchTelegramAlert } from './lib/social-utils.js';

async function runTest() {
    const summary = {
        frequency: 'monthly',
        title: 'Institutional Strategic Pulse: Q2 Fiscal Infrastructure & EV Transition',
        abstract: 'High-density institutional summary detailing the 2026 sovereign rare-earth embargo, mapping a 40% contraction in EV production volumes, and modeling the corresponding 150-200 bps widening in OEM credit spreads against the 2025 LFY baseline.',
        wordCount: 29177,
        url: 'https://blogspro.in/articles/monthly/swarm-monthly-demo.html'
    };

    console.log("🚀 [Test-Trigger] Dispatching Hardened Institutional Alert to Telegram...");
    
    const success = await dispatchTelegramAlert(summary, process.env);
    
    if (success) {
        console.log("✅ [Test-Trigger] Alert dispatched successfully. Check your Telegram chat.");
    } else {
        console.error("❌ [Test-Trigger] Dispatch failed. Verify token and chat ID.");
    }
}

runTest();
