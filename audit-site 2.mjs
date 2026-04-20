import { initFirebase } from './scripts/lib/firebase-service.js';
import 'dotenv/config';

async function auditSite() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './knowledge/firebase-service-account.json';
    const { db } = initFirebase();
    if (!db) return;

    try {
        const snapshot = await db.collection('site').get();
        console.log(`📡 [Audit] 'site' collection docs:`);
        snapshot.forEach(doc => {
            console.log(`- ${doc.id}: ${JSON.stringify(doc.data()).substring(0, 100)}...`);
        });
    } catch (e) {
        console.error(`❌ Audit failed: ${e.message}`);
    }
    process.exit(0);
}

auditSite();
