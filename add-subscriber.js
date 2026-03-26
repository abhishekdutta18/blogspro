// Quick script to add abhishek@blogspro.in as subscriber
// Run this in the browser console on admin.html

(async function addSubscriber() {
  const email = 'abhishek@blogspro.in';
  console.log(`Adding ${email} to subscribers...`);
  
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getFirestore, collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const { firebaseConfig } = await import('./js/firebase-config.js');
    
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    await addDoc(collection(db, 'subscribers'), {
      email: email,
      subscribedAt: serverTimestamp(),
      status: 'active'
    });
    
    console.log(`✅ Successfully added ${email}!`);
    
    // Refresh subscriber list
    if (window.loadSubscriberAnalytics) {
      await window.loadSubscriberAnalytics();
      console.log('✅ Subscriber list updated');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
