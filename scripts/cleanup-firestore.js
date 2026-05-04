import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const serviceAccountPath = './knowledge/firebase-service-account.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function clean() {
    const coll = db.collection('pulse_briefings');
    const snap = await coll.orderBy('timestamp', 'desc').get();
    
    console.log(`Found ${snap.size} total pulse_briefings.`);
    
    // Keep top 20, delete the rest
    const docs = snap.docs;
    const toKeep = docs.slice(0, 20);
    const toDelete = docs.slice(20);
    
    console.log(`Keeping ${toKeep.length}, deleting ${toDelete.length}...`);
    
    let batch = db.batch();
    let count = 0;
    let deletedCount = 0;
    
    for (const doc of toDelete) {
        batch.delete(doc.ref);
        count++;
        deletedCount++;
        if (count >= 400) {
            await batch.commit();
            batch = db.batch();
            console.log(`Committed ${deletedCount} deletions...`);
            count = 0;
        }
    }
    
    if (count > 0) {
        await batch.commit();
        console.log(`Committed final ${count} deletions...`);
    }
    
    console.log(`Successfully deleted ${toDelete.length} ghost links from Firestore.`);
    process.exit(0);
}

clean().catch(console.error);
