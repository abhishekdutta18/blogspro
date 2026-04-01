// ═══════════════════════════════════════════════
// subscribers.js — Subscriber list management
// ═══════════════════════════════════════════════
import { db }        from './config.js';
import { showToast } from './config.js';
import { state }     from './state.js';
import { collection, getDocs, deleteDoc, doc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const FIREBASE_TIMEOUT_MS = 12000;
function withTimeout(promise, ms = FIREBASE_TIMEOUT_MS, label = 'request') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function loadSubscribers() {
  const tbody = document.getElementById('subsTableBody');
  if (!tbody) return;
  try {
    const snap = await withTimeout(
      getDocs(query(collection(db,'subscribers'), orderBy('createdAt','desc'), limit(1000))),
      FIREBASE_TIMEOUT_MS,
      'subscribers query'
    );
    state.allSubs = snap.docs.map(d=>({id:d.id,...d.data()}));
    const label = document.getElementById('subCountLabel');
    if (label) label.textContent = `${state.allSubs.length} subscriber${state.allSubs.length!==1?'s':''}`;
    renderSubs(state.allSubs);
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="table-empty">Subscribers unavailable. Please retry.</div></td></tr>`;
  }
}

function renderSubs(subs) {
  const tbody = document.getElementById('subsTableBody');
  if (!tbody) return;
  if (!subs.length) { tbody.innerHTML=`<tr><td colspan="4"><div class="table-empty">No subscribers yet.</div></td></tr>`; return; }
  // FIX: Escape email to prevent XSS (anyone can subscribe with malicious input)
  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  tbody.innerHTML = subs.map((s,i) => {
    const date = s.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})||'—';
    return `<tr><td style="color:var(--muted);font-size:0.82rem">${i+1}</td><td><strong>${escHtml(s.email)||'—'}</strong></td>
      <td style="color:var(--muted);font-size:0.83rem;white-space:nowrap">${date}</td>
      <td><button class="action-btn delete" onclick="deleteSub('${s.id}')">Remove</button></td></tr>`;
  }).join('');
}

window.filterSubs  = (q) => renderSubs(state.allSubs.filter(s=>s.email?.toLowerCase().includes(q.toLowerCase())));
window.deleteSub   = async (id) => {
  if (!confirm('Remove this subscriber?')) return;
  try {
    await deleteDoc(doc(db,'subscribers',id));
    state.allSubs = state.allSubs.filter(s=>s.id!==id);
    renderSubs(state.allSubs);
    const label = document.getElementById('subCountLabel');
    if (label) label.textContent = `${state.allSubs.length} subscriber${state.allSubs.length!==1?'s':''}`;
    showToast('Subscriber removed.','success');
  } catch(e) { showToast('Failed: '+e.message,'error'); }
};
window.loadSubscriberAnalytics = async () => {
  try {
    const snap = await withTimeout(
      getDocs(collection(db, 'subscribers')),
      FIREBASE_TIMEOUT_MS,
      'analytics query'
    );
    const all = snap.docs.map(d => d.data());
    const active = all.filter(s => s.status !== 'unsubscribed');
    const totalEl = document.getElementById('totalSubscribers');
    const activeEl = document.getElementById('activeSubscribers');
    const lastEl = document.getElementById('statsLastUpdated');
    if (totalEl) totalEl.textContent = all.length;
    if (activeEl) activeEl.textContent = active.length;
    if (lastEl) lastEl.textContent = new Date().toLocaleTimeString('en-IN');
  } catch (e) {
    const { showToast } = await import('./config.js');
    showToast('Failed to load stats: ' + e.message, 'error');
  }
};
window.exportSubscribers = () => {
  if (!state.allSubs.length) { showToast('No subscribers to export.','error'); return; }
  const csv  = 'Email,Date\n' + state.allSubs.map(s=>`${s.email},${s.createdAt?.toDate?.()?.toLocaleDateString('en-IN')||''}`).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a    = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'subscribers.csv'});
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV downloaded!','success');
};
