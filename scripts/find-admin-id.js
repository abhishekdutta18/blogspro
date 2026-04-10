import { initFirebase } from './lib/firebase-service.js';
import dotenv from 'dotenv';
dotenv.config();

async function findAdminId() {
    console.log("🔍 [Discovery] Searching Firestore for authorized Admin IDs...");
    const { db } = initFirebase();
    if (!db) {
        console.error("❌ Firestore not initialized. Check .env");
        return;
    }

    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.get();
        
        if (snapshot.empty) {
            console.log("📭 No users found in 'users' collection.");
            return;
        }

        console.log(`\nFound ${snapshot.size} users. Scanning for configuration keys...\n`);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`👤 User: ${data.email || 'Unknown'} [Role: ${data.role || 'reader'}]`);
            if (data.telegramId) console.log(`   👉 Telegram ID: ${data.telegramId}`);
            if (data.chatId) console.log(`   👉 Chat ID: ${data.chatId}`);
            console.log('---');
        });

    } catch (e) {
        console.error("❌ Discovery Error:", e.message);
    }
}

findAdminId();
