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
