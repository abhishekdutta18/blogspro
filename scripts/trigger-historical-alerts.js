import dotenv from 'dotenv';
import { dispatchTelegramAlert } from './lib/social-utils.js';

dotenv.config();

/**
 * 🚀 BlogsPro Institutional Historical Trigger
 * ============================================
 * Dispatches hardened alerts for the most recent existing Weekly/Monthly manuscripts.
 */

async function triggerHistorical() {
    console.log("🏙️ [Historical-Trigger] Initializing Batch Dispatch...");

    const manifests = [
        {
            frequency: 'weekly',
            title: 'WEEKLY   Apex Institutional',
            fileName: 'swarm-weekly-1776148081565.html',
            excerpt: 'Strategic Institutional synthesis for BlogsPro 5.0. Macro drift, alpha signals, and risk parity modeling for the current cycle.'
        },
        {
            frequency: 'monthly',
            title: 'MONTHLY   Apex Institutional',
            fileName: 'swarm-monthly-1776097609642.html',
            excerpt: 'Global Macro Roadmap: Sovereign debt dynamics, institutional capital flows, and the 2026 ESG transition framework.'
        }
    ];

    for (const item of manifests) {
        console.log(`📡 [Dispatching] ${item.frequency.toUpperCase()} alert: ${item.fileName}`);
        
        const payload = {
            title: item.title,
            frequency: item.frequency,
            fileName: item.fileName,
            abstract: item.excerpt, // social-utils uses 'abstract'
            wordCount: item.frequency === 'weekly' ? '12,500' : '29,000',
            link: `https://blogspro.in/articles/${item.frequency}/${item.fileName}`
        };

        try {
            await dispatchTelegramAlert(payload, process.env);
            console.log(`✅ [Success] Dispatched ${item.frequency} pulse.`);
        } catch (e) {
            console.error(`❌ [Failure] Failed to dispatch ${item.frequency}:`, e.message);
        }
        
        // Brief pause to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log("\n💎 [Historical-Trigger] Batch Dispatch Complete.");
}

triggerHistorical().catch(console.error);
