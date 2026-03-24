// ═══════════════════════════════════════════════
// newsletter.js — Newsletter generation
// ═══════════════════════════════════════════════
import { callAI }    from './ai-core.js';
import { sanitize, showToast, db, setBtnLoading } from './config.js';
import { state }     from './state.js';
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


window.generateNewsletter = async () => {
  setBtnLoading('btnNL','nlBtnTxt','nlSpinner',true,'Generating…');
  const statusEl = document.getElementById('nlStatus');
  if (statusEl) statusEl.textContent = '⏳ Fetching latest posts…';

  const snap  = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(5)));
  const posts = snap.docs.map(d=>d.data()).filter(p=>p.published);

  if (!posts.length) {
    if (statusEl) statusEl.textContent = 'No published posts found.';
    setBtnLoading('btnNL','nlBtnTxt','nlSpinner',false,'✉ Generate Newsletter');
    return;
  }

  const style   = document.getElementById('nlStyle')?.value || 'roundup';
  const tone    = document.getElementById('nlTone')?.value  || 'professional';
  const subject = document.getElementById('nlSubject')?.value.trim() || 'This Week in Fintech';
  if (statusEl) statusEl.textContent = '⏳ Writing newsletter…';

  const result = await callAI(
    `Write a ${style} style newsletter email for a fintech blog in a ${tone} tone.\nSubject: "${subject}"\nLatest blog posts:\n${posts.map(p=>p.title).join('\n')}\n\nReturn clean HTML email body (no <html> or <body> tags). Use inline styles. Dark-friendly colors. Include a brief intro, post summaries with fictional placeholder links, and a footer CTA.`,
    true
  );

  setBtnLoading('btnNL','nlBtnTxt','nlSpinner',false,'✉ Generate Newsletter');

  if (result.error) {
    if (statusEl) statusEl.textContent = '✕ ' + result.error;
    showToast(result.error,'error');
    return;
  }

  state.generatedNewsletter = sanitize(result.text||'');
  const preview = document.getElementById('nlPreview');
  if (preview) preview.innerHTML = state.generatedNewsletter;
  if (statusEl) statusEl.textContent = '✓ Newsletter ready! Review and send.';

  const copyBtn = document.getElementById('copyNLBtn');
  const sendBtn = document.getElementById('btnSendNL');
  if (copyBtn) copyBtn.style.display = 'inline-block';
  if (sendBtn) sendBtn.disabled = false;
  showToast('Newsletter generated!','success');
};

window.copyNewsletter = () => {
  if (!state.generatedNewsletter) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = state.generatedNewsletter;
  navigator.clipboard.writeText(tmp.textContent).then(() => showToast('Copied to clipboard!','success'));
};

window.sendNewsletter = async () => {
  if (!state.generatedNewsletter) {
    showToast('Generate a newsletter first!','error');
    return;
  }

  const subject = document.getElementById('nlSubject')?.value?.trim() || 'This Week in Fintech';
  
  setBtnLoading('btnSendNL','sendNLBtnTxt','sendNLSpinner',true,'Sending to subscribers…');
  const statusEl = document.getElementById('nlStatus');
  if (statusEl) statusEl.textContent = '⏳ Sending to all subscribers…';

  try {
    // Call Cloudflare Worker endpoint
    const workerEndpoint = 'https://blogspro-newsletter.abhishek-dutta1996.workers.dev';
    const secret = 'biltu123';
    
    const response = await fetch(workerEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject,
        html: state.generatedNewsletter,
        secret: secret
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    setBtnLoading('btnSendNL','sendNLBtnTxt','sendNLSpinner',false,'✉ Send Newsletter');
    if (statusEl) statusEl.textContent = `✓ Sent to ${result.count || '?'} subscribers!`;
    showToast(`Newsletter sent to ${result.count || 'all'} subscribers!`,'success');
    
    // Reset form
    state.generatedNewsletter = '';
    const preview = document.getElementById('nlPreview');
    if (preview) preview.innerHTML = '';
    const sendBtn = document.getElementById('btnSendNL');
    if (sendBtn) sendBtn.disabled = true;
    
  } catch (err) {
    console.error('[Newsletter Send Error]', err);
    setBtnLoading('btnSendNL','sendNLBtnTxt','sendNLSpinner',false,'✉ Send Newsletter');
    if (statusEl) statusEl.textContent = '✕ ' + err.message;
    showToast(`Failed to send: ${err.message}`,'error');
  }
};

// Get subscriber count and details
window.getSubscriberStats = async () => {
  try {
    const snap = await getDocs(collection(db, 'subscribers'));
    const subscribers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return {
      count: subscribers.length,
      subscribers: subscribers,
      activeCount: subscribers.filter(s => s.status === 'active').length
    };
  } catch (err) {
    console.error('[Get Subscribers Error]', err);
    return { count: 0, subscribers: [], activeCount: 0, error: err.message };
  }
};

// Load subscriber analytics
window.loadSubscriberAnalytics = async () => {
  const stats = await getSubscriberStats();
  
  // Update dashboard stat card
  const statEl = document.getElementById('statSubs');
  if (statEl) statEl.textContent = stats.count;
  
  // Update subscribers view counters
  const totalEl = document.getElementById('totalSubscribers');
  if (totalEl) totalEl.textContent = stats.count;
  
  const activeEl = document.getElementById('activeSubscribers');
  if (activeEl) activeEl.textContent = stats.activeCount || stats.count;
  
  const timestampEl = document.getElementById('statsLastUpdated');
  if (timestampEl) timestampEl.textContent = new Date().toLocaleTimeString();
  
  // Update subscriber list
  const listEl = document.getElementById('subscribersList');
  if (listEl && stats.subscribers.length > 0) {
    listEl.innerHTML = stats.subscribers.map(s => `
      <div style="padding:0.75rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:0.9rem;color:var(--cream)">${s.email}</div>
          <div style="font-size:0.7rem;color:var(--muted)">Status: ${s.status || 'active'}</div>
        </div>
        <div style="font-size:0.75rem;color:var(--muted)">${new Date(s.subscribedAt?.toDate?.() || s.subscribedAt).toLocaleDateString()}</div>
      </div>
    `).join('');
  } else if (listEl) {
    listEl.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted)">No subscribers yet</div>';
  }
};

// Subscribe to real-time updates
window.initSubscriberRealtimeUpdates = () => {
  // Load initial stats
  loadSubscriberAnalytics();
  
  // Reload every 30 seconds
  setInterval(loadSubscriberAnalytics, 30000);
};

// Add subscriber manually
window.addSubscriberManual = async () => {
  const email = document.getElementById('addSubEmail')?.value?.trim();
  if (!email) {
    showToast('Please enter an email address', 'error');
    return;
  }

  const statusEl = document.getElementById('addSubStatus');
  const btn = document.querySelector('button[onclick="addSubscriberManual()"]');
  if (statusEl) statusEl.textContent = '⏳ Adding…';
  if (btn) btn.disabled = true;

  try {
    const { addDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const { serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    
    await addDoc(collection(db, 'subscribers'), {
      email: email,
      subscribedAt: serverTimestamp(),
      status: 'active'
    });

    if (statusEl) statusEl.textContent = '✓ Subscriber added!';
    if (statusEl) statusEl.style.color = '#4caf50';
    document.getElementById('addSubEmail').value = '';
    showToast(`${email} added to subscribers!`, 'success');
    
    // Refresh the list
    await loadSubscriberAnalytics();
  } catch (err) {
    console.error('Add subscriber error:', err);
    if (statusEl) statusEl.textContent = '✕ ' + err.message;
    if (statusEl) statusEl.style.color = '#f87171';
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

