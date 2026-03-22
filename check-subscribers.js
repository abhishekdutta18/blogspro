const admin = require('firebase-admin');

// Initialize Firebase
const serviceAccount = require('./firebase-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'blogspro-ai'
});

const db = admin.firestore();

async function checkSubscribers() {
  try {
    const snap = await db.collection('subscribers').get();
    console.log(`Total subscribers: ${snap.size}`);
    snap.forEach(doc => {
      console.log(`- ${doc.data().email} (${doc.data().status})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkSubscribers();
