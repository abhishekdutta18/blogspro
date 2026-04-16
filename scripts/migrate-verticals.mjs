import { initFirebase } from './lib/firebase-service.js';
import { VERTICALS } from './lib/prompts.js';
import 'dotenv/config';

async function migrateVerticals() {
    console.log("🏙️ [Migration] Starting Institutional Vertical Migration...");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './knowledge/firebase-service-account.json';
    
    const { db } = initFirebase();
    if (!db) {
        console.error("❌ [Migration] Firebase synchronization failed.");
        process.exit(1);
    }

    try {
        const configRef = db.collection('institutional_config').doc('verticals');
        await configRef.set({
            list: VERTICALS,
            updatedAt: new Date().toISOString(),
            version: 'V17.0',
            source: 'institutional_migration'
        });
        
        console.log(`✅ [Migration] Successfully uploaded ${VERTICALS.length} research verticals to Cloud.`);
        console.log("📡 [Migration] The swarm is now managed via institutional_config/verticals.");
    } catch (error) {
        console.error(`❌ [Migration] Operation failed: ${error.message}`);
    }
    process.exit(0);
}

migrateVerticals();
