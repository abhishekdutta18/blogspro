import { initFirebase } from './lib/firebase-service.js';
import dotenv from 'dotenv';
dotenv.config();

async function traceTelegramId() {
    console.log("🔍 [Trace] Searching Telemetry for successful Telegram dispatches...");
    const { db } = initFirebase();
    if (!db) return;

    try {
        const telemetryRef = db.collection('swarm_telemetry');
        const snapshot = await telemetryRef
            .where('event', '==', 'TELEGRAM_DISPATCH')
            .limit(10)
            .get();
        
        if (snapshot.empty) {
            console.log("📭 No recent TELEGRAM_DISPATCH events found.");
            return;
        }

        console.log(`Found ${snapshot.size} events. Extracting IDs...\n`);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`📡 [${data.timestamp?.toDate() || 'N/A'}]`);
            console.log(`   Result: ${data.data?.status || 'unknown'}`);
            console.log(`   Chat ID: ${data.data?.chatId || 'N/A'}`);
            console.log('---');
        });

    } catch (e) {
        console.error("❌ Trace Error:", e.message);
    }
}

traceTelegramId();
