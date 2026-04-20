import { initFirebase } from './scripts/lib/firebase-service.js';
import 'dotenv/config';

async function auditTemplates() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './knowledge/firebase-service-account.json';
    const { db } = initFirebase();
    if (!db) {
        console.error("❌ Firebase initialization failed.");
        return;
    }

    try {
        const snapshot = await db.collection('prompt_templates').get();
        console.log(`📡 [Audit] Found ${snapshot.size} cloud templates:`);
        snapshot.forEach(doc => {
            console.log(`- ${doc.id}`);
        });
    } catch (e) {
        console.error(`❌ Audit failed: ${e.message}`);
    }
    process.exit(0);
}

auditTemplates();
