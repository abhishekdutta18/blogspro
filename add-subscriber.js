// Quick script to add abhishek@blogspro.in as subscriber
// Run this in the browser console on admin.html

(async function addSubscriber() {
  const email = 'abhishek@blogspro.in';
  console.log(`Adding ${email} to subscribers...`);
  
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getFirestore, collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const firebaseConfig = {
      apiKey: "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY",
      authDomain: "blogspro-ai.firebaseapp.com",
      projectId: "blogspro-ai",
      storageBucket: "blogspro-ai.firebasestorage.app",
      messagingSenderId: "940428277283",
      appId: "1:940428277283:web:d3bb414f0992718ca76396",
      measurementId: "G-N7TCB31MRD"
    };
    
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
