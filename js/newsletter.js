// ═══════════════════════════════════════════════
// newsletter.js — Newsletter generation and UTMs
// ═══════════════════════════════════════════════
import { db, sanitize, showToast, injectUtm, trackEvent } from './config.js';
import { state }     from './state.js';
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Generates newsletter HTML via AI using the latest published posts.
 */
window.generateNewsletter = async () => {
  const statusEl = document.getElementById('nlStatus');
  if (statusEl) statusEl.textContent = '⏳ Fetching latest posts…';

  try {
    const snap  = await getDocs(query(collection(db,'posts'), orderBy('createdAt','desc'), limit(5)));
    const posts = snap.docs.map(d=>d.data()).filter(p=>p.published);

    if (!posts.length) {
      if (statusEl) statusEl.textContent = 'No published posts found.';
      return;
    }

    const style   = document.getElementById('nlStyle')?.value || 'roundup';
    const subject = document.getElementById('nlSubject')?.value.trim() || 'BlogsPro Weekly Digest';
    if (statusEl) statusEl.textContent = '⏳ Writing newsletter…';

    // Note: callAI is usually imported from ai-core.js or similar.
    // Assuming callAI is available globally or via window.callAI
    const callAI = window.callAI;
    if (!callAI) throw new Error('AI Engine (callAI) not loaded');

    const result = await callAI(
      `Write a ${style} style newsletter email for BlogsPro. Subject: "${subject}". Posts: ${posts.map(p=>p.title).join(', ')}. Return clean HTML with inline styles.`,
      true
    );

    if (result.error) throw new Error(result.error);

    state.generatedNewsletter = sanitize(result.text || '');
    const preview = document.getElementById('nlPreview');
    if (preview) preview.innerHTML = state.generatedNewsletter;
    if (statusEl) statusEl.textContent = '✓ Newsletter ready!';

    const copyBtn = document.getElementById('copyNLBtn');
    if (copyBtn) copyBtn.style.display = 'inline-block';
    
    showToast('Newsletter generated!', 'success');
  } catch (err) {
    if (statusEl) statusEl.textContent = '✕ Error: ' + err.message;
    showToast(err.message, 'error');
  }
};

/**
 * Copies newsletter HTML to clipboard with automated UTM injection.
 */
window.copyNewsletter = () => {
  if (!state.generatedNewsletter) {
    showToast('No newsletter to copy!', 'error');
    return;
  }

  const container = document.getElementById('nlPreview');
  if (!container) return;

  // Create a temporary clone to manipulate links with UTMs
  const clone = container.cloneNode(true);
  const links = clone.querySelectorAll('a');
  
  links.forEach(link => {
    const originalHref = link.getAttribute('href');
    if (originalHref && !originalHref.startsWith('#')) {
      link.setAttribute('href', injectUtm(originalHref, 'newsletter', 'email', 'digest'));
    }
  });

  const html = clone.innerHTML;
  navigator.clipboard.writeText(html).then(() => {
    showToast('Newsletter HTML copied with UTM tracking!', 'success');
    trackEvent('newsletter_copied', { utm_source: 'newsletter' });
  }).catch(() => {
    showToast('Failed to copy newsletter.', 'error');
  });
};
