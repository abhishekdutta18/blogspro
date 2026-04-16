import { initFirebase } from './scripts/lib/firebase-service.js';
import 'dotenv/config';

async function auditCollections() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './knowledge/firebase-service-account.json';
    const { db } = initFirebase();
    if (!db) return;

    try {
        const collections = await db.listCollections();
        console.log("📡 [Audit] Root Collections:");
        collections.forEach(c => console.log(`- ${c.id}`));
    } catch (e) {
        console.error(`❌ Audit failed: ${e.message}`);
    }
    process.exit(0);
}

auditCollections();
