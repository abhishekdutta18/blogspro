// ═══════════════════════════════════════════════════════════════
// NEWSLETTER TEST SCRIPT
// Run this in browser console (admin dashboard)
// ═══════════════════════════════════════════════════════════════

/**
 * STEP 1: Add Admin Email as Subscriber (if not already)
 * Run this first to ensure admin receives test emails
 */
async function addAdminToSubscribers() {
  const { db } = await import('./js/config.js');
  const { collection, addDoc, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  
  const adminEmail = 'biltu@blogspro.in'; // Change this to your email
  
  console.log('🔍 Checking if admin already subscribed...');
  
  const q = query(collection(db, 'subscribers'), where('email', '==', adminEmail));
  const existing = await getDocs(q);
  
  if (existing.size > 0) {
    console.log('✅ Admin already in subscribers');
    return;
  }
  
  await addDoc(collection(db, 'subscribers'), {
    email: adminEmail,
    subscribedAt: new Date(),
    status: 'active'
  });
  
  console.log('✅ Admin added to subscribers:', adminEmail);
}

/**
 * STEP 2: Generate Test Newsletter HTML
 * Using the same prompt as the UI
 */
async function generateTestNewsletter() {
  const { callAI } = await import('./js/ai-core.js');
  const { db, showToast } = await import('./js/config.js');
  const { collection, getDocs, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  
  console.log('📝 Generating test newsletter...');
  
  // Get 5 latest posts
  const snap = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(5)));
  const posts = snap.docs.map(d => d.data()).filter(p => p.published);
  
  if (!posts.length) {
    console.error('❌ No published posts found! Generate at least 1 blog post first.');
    return null;
  }
  
  console.log(`📚 Found ${posts.length} posts:`, posts.map(p => p.title));
  
  const prompt = `Write a roundup style newsletter email for a fintech blog in a professional tone.
Subject: "Test Newsletter - BlogsPro"
Latest blog posts:
${posts.map(p => `- ${p.title}`).join('\n')}

Return clean HTML email body (no <html> or <body> tags). Use inline styles. Dark-friendly colors. 
Include a brief intro, post summaries with links, and a footer CTA. Make it friendly and professional.`;

  const result = await callAI(prompt, true);
  
  if (result.error) {
    console.error('❌ AI generation failed:', result.error);
    return null;
  }
  
  console.log('✅ Newsletter generated successfully');
  window.TEST_NEWSLETTER_HTML = result.text;
  return result.text;
}

/**
 * STEP 3: Send Test Newsletter to All Subscribers
 */
async function sendTestNewsletter() {
  if (!window.TEST_NEWSLETTER_HTML) {
    console.error('❌ Generate newsletter first!');
    return;
  }
  
  const workerUrl = 'https://blogspro-newsletter.workers.dev';
  const secret = 'biltu123'; // MUST match deployed NEWSLETTER_SECRET
  
  console.log('📧 Sending newsletter via Worker...');
  console.log(`Target: ${workerUrl}`);
  
  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Test Newsletter - BlogsPro',
        html: window.TEST_NEWSLETTER_HTML,
        secret: secret
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ Newsletter sent successfully!');
    console.log(`📊 Sent to ${result.count} subscribers`);
    return result;
    
  } catch (err) {
    console.error('❌ Send failed:', err.message);
    throw err;
  }
}

/**
 * STEP 4: Full Test Flow
 * Run this for complete test
 */
async function runFullNewsletterTest() {
  console.clear();
  console.log('🚀 Starting Newsletter Test Flow...\n');
  
  try {
    console.log('✦ Step 1: Adding admin to subscribers...');
    await addAdminToSubscribers();
    
    console.log('\n✦ Step 2: Generating newsletter...');
    const html = await generateTestNewsletter();
    if (!html) return;
    
    console.log('\n✦ Step 3: Sending to all subscribers...');
    const result = await sendTestNewsletter();
    
    console.log('\n✅ Newsletter test completed!');
    console.log(`The following emails should receive your test newsletter:`);
    console.log(result);
    
  } catch (err) {
    console.error('\n❌ Test failed:', err);
  }
}

/**
 * UTILITY: Check All Subscribers
 */
async function listAllSubscribers() {
  const { db } = await import('./js/config.js');
  const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  
  const snap = await getDocs(collection(db, 'subscribers'));
  const emails = snap.docs.map(d => d.data().email);
  
  console.log(`📩 Total subscribers: ${emails.length}`);
  emails.forEach(email => console.log(`  • ${email}`));
  
  return emails;
}

// ═══════════════════════════════════════════════════════════════
// EXPORT FOR CONSOLE
// ═══════════════════════════════════════════════════════════════

window.nlTest = {
  runFullTest: runFullNewsletterTest,
  addAdmin: addAdminToSubscribers,
  generate: generateTestNewsletter,
  send: sendTestNewsletter,
  listSubscribers: listAllSubscribers,
};

console.log(`
╔════════════════════════════════════════════════════════════════╗
║         NEWSLETTER TEST SCRIPT LOADED                         ║
╚════════════════════════════════════════════════════════════════╝

Available commands in console:

🚀 Full test (all steps):
   nlTest.runFullTest()

📝 Step by step:
   await nlTest.addAdmin()           // Add admin to subscribers
   await nlTest.generate()            // Generate test newsletter
   await nlTest.send()                // Send to all subscribers

📊 Utilities:
   await nlTest.listSubscribers()     // See all subscribers

Examples:
   nlTest.runFullTest()              // Run everything
   await nlTest.listSubscribers()    // Check who will receive email
`);

export { addAdminToSubscribers, generateTestNewsletter, sendTestNewsletter, runFullNewsletterTest, listAllSubscribers };
