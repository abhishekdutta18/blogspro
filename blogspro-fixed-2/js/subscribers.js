// ═══════════════════════════════════════════════
// subscribers.js — Subscriber list management
// ═══════════════════════════════════════════════
import { db }        from './config.js';
import { showToast } from './config.js';
import { state }     from './state.js';
import { collection, getDocs, deleteDoc, doc, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function loadSubscribers() {
  const tbody = document.getElementById('subsTableBody');
  if (!tbody) return;
  try {
    const snap = await getDocs(query(collection(db,'subscribers'), orderBy('createdAt','desc'), limit(1000)));
    state.allSubs = snap.docs.map(d=>({id:d.id,...d.data()}));
    const label = document.getElementById('subCountLabel');
    if (label) label.textContent = `${state.allSubs.length} subscriber${state.allSubs.length!==1?'s':''}`;
    renderSubs(state.allSubs);
  } catch(e) { tbody.innerHTML=`<tr><td colspan="4"><div class="table-empty">Failed to load.</div></td></tr>`; }
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
window.exportSubscribers = () => {
  if (!state.allSubs.length) { showToast('No subscribers to export.','error'); return; }
  const csv  = 'Email,Date\n' + state.allSubs.map(s=>`${s.email},${s.createdAt?.toDate?.()?.toLocaleDateString('en-IN')||''}`).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a    = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'subscribers.csv'});
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV downloaded!','success');
};
