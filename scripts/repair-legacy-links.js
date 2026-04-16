import dotenv from 'dotenv';
import { initFirebase } from './lib/firebase-service.js';

dotenv.config();

async function repairMetadata() {
    console.log("🛠️ [Metadata-Repair] Initiating Sovereign Realignment...");
    const { db } = initFirebase();
    
    if (!db) {
        console.error("❌ Firestore initialization failed.");
        process.exit(1);
    }

    const brokenPrefix = "https://storage.googleapis.com/blogspro-assets/";
    const targetPrefix = "https://blogspro.in/articles/";

    try {
        const snapshot = await db.collection('posts').get();
        console.log(`🔍 [Metadata-Repair] Auditing ${snapshot.size} records...`);

        let repairCount = 0;
        const batch = db.batch();

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.path && data.path.includes('blogspro-assets')) {
                const oldPath = data.path;
                const newPath = oldPath.replace(brokenPrefix, targetPrefix);
                
                console.log(`🩹 [Repairing] ${doc.id}:`);
                console.log(`   FROM: ${oldPath}`);
                console.log(`   TO:   ${newPath}`);
                
                batch.update(doc.ref, { 
                    path: newPath,
                    updatedAt: new Date().toISOString()
                });
                repairCount++;
            }
        });

        if (repairCount > 0) {
            await batch.commit();
            console.log(`✅ [Metadata-Repair] Successfully realigned ${repairCount} records.`);
        } else {
            console.log("✨ [Metadata-Repair] No broken records found. System is healthy.");
        }
    } catch (e) {
        console.error("❌ [Metadata-Repair] Critical failure:", e.message);
    }
}

repairMetadata().catch(console.error);
