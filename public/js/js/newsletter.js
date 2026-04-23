// ═══════════════════════════════════════════════
// newsletter.js — Newsletter generation and manual sending (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { sanitize, showToast, injectUtm, trackEvent, NEWSLETTER_CONFIG } from './config.js';
import { state } from './state.js';

/**
 * Generates newsletter HTML via AI using the latest published posts.
 */
window.generateNewsletter = async () => {
  const statusEl = document.getElementById('nlStatus');
  const btn = document.getElementById('btnNL');
  const spinner = document.getElementById('nlSpinner');
  const btnTxt = document.getElementById('nlBtnTxt');
  
  if (statusEl) statusEl.textContent = '⏳ Fetching latest posts…';
  if (spinner) spinner.style.display = 'inline-block';
  if (btnTxt) btnTxt.textContent = 'Generating…';
  if (btn) btn.disabled = true;

  try {
    const postsRaw = await api.data.posts.getAll({ orderBy: 'createdAt desc', limit: 5 });
    const posts = (postsRaw || []).filter(p => p.published);

    if (!posts.length) {
      if (statusEl) statusEl.textContent = 'No published posts found.';
      return;
    }

    const style   = document.getElementById('nlStyle')?.value || 'roundup';
    const subject = document.getElementById('nlSubject')?.value.trim() || 'BlogsPro Weekly Digest';
    if (statusEl) statusEl.textContent = '⏳ Writing newsletter…';

    const { callAI } = await import('./ai-core.js');
    const result = await callAI(
      `Write a ${style} style newsletter email for BlogsPro. Subject: "${subject}". 
       Posts: ${posts.map(p => p.title).join(', ')}. 
       Return clean HTML with inline styles. Use a professional fintech theme (Navy & Gold). 
       Include links to each post using internal relative paths like "post.html?id=[ID]".`,
      true
    );

    if (result.error) throw new Error(result.error);

    state.generatedNewsletter = sanitize(result.text || '');
    const preview = document.getElementById('nlPreview');
    if (preview) {
      preview.innerHTML = state.generatedNewsletter;
      preview.style.fontStyle = 'normal';
      preview.style.color = 'inherit';
    }
    if (statusEl) statusEl.textContent = '✓ Newsletter ready!';

    const copyBtn = document.getElementById('copyNLBtn');
    if (copyBtn) copyBtn.style.display = 'inline-block';
    
    // Enable Send Button
    const sendBtn = document.getElementById('btnSendNL');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.background = '#fca5a5';
      sendBtn.style.color = 'var(--navy)';
    }
    
    showToast('Newsletter generated!', 'success');
  } catch (err) {
    if (statusEl) statusEl.textContent = '✕ Error: ' + err.message;
    showToast(err.message, 'error');
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (btnTxt) btnTxt.textContent = '✉ Generate Newsletter';
    if (btn) btn.disabled = false;
  }
};

/**
 * Sends the generated newsletter to all subscribers via the Cloudflare Worker.
 */
window.sendNewsletter = async () => {
  if (!state.generatedNewsletter) {
    showToast('Generate newsletter first!', 'error');
    return;
  }

  const subject = document.getElementById('nlSubject')?.value.trim() || 'BlogsPro Weekly Digest';
  const fromName = document.getElementById('nlFromName')?.value.trim() || 'BlogsPro';
  
  if (!NEWSLETTER_CONFIG.url || !NEWSLETTER_CONFIG.secret) {
    showToast('Newsletter Worker not configured in Remote Config.', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to send this newsletter to ALL subscribers?`)) return;

  const btn = document.getElementById('btnSendNL');
  const originalTxt = btn.textContent;
  btn.disabled = true;
  btn.textContent = '🚀 Sending to all subscribers…';

  try {
    const res = await fetch(NEWSLETTER_CONFIG.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: subject,
        from: fromName,
        html: state.generatedNewsletter,
        secret: NEWSLETTER_CONFIG.secret
      })
    });

    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    
    showToast('Newsletter blast triggered successfully!', 'success');
    trackEvent('newsletter_sent', { subject });
    
    // Save to History
    await saveBlastHistory({
      subject,
      from: fromName,
      recipientCount: state.allSubs?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    window.loadNewsletterHistory(); // Refresh history panel
  } catch (err) {
    console.error('Send Newsletter Error:', err);
    showToast('Failed to send: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = originalTxt;
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

/**
 * Saves a record of the newsletter blast.
 */
async function saveBlastHistory(data) {
  try {
    await api.data.newsletter.blasts.save({
      ...data,
      sentAt: new Date().toISOString()
    });
    console.log('[newsletter] Blast history saved.');
  } catch (err) {
    console.warn('[newsletter] Failed to save blast history:', err);
  }
}

/**
 * Loads previous newsletter blasts and renders them.
 */
window.loadNewsletterHistory = async () => {
  const container = document.getElementById('newsletterHistory');
  if (!container) return;

  try {
    const blasts = await api.data.newsletter.blasts.getAll({ limit: 10 });

    if (!blasts || !blasts.length) {
      container.innerHTML = '<div style="padding:1rem;color:var(--muted);font-size:0.8rem">No previous blasts found.</div>';
      return;
    }

    const _esc = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    container.innerHTML = blasts.map(b => {
      const date = b.sentAt ? new Date(b.sentAt).toLocaleString() : (b.timestamp ? new Date(b.timestamp).toLocaleString() : '—');
      return `
        <div style="padding:0.8rem;border-bottom:1px solid var(--border);font-size:0.82rem">
          <div style="font-weight:600;color:var(--gold)">${_esc(b.subject)}</div>
          <div style="display:flex;justify-content:space-between;margin-top:0.2rem;color:var(--muted)">
            <span>Sent to ${b.recipientCount} people</span>
            <span>${date}</span>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('[newsletter] Load history error:', err);
    container.innerHTML = '<div style="padding:1rem;color:#fca5a5;font-size:0.8rem">Failed to load history.</div>';
  }
};
