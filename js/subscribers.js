// ═══════════════════════════════════════════════
// subscribers.js — Subscriber list management (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { showToast } from './config.js';
import { state } from './state.js';

export async function loadSubscribers() {
  const tbody = document.getElementById('subsTableBody');
  if (!tbody) return;
  try {
    const subs = await api.data.getAll('subscribers');
    state.allSubs = (subs || []).sort((a, b) => {
        const aMs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bMs - aMs;
    });
    const label = document.getElementById('subCountLabel');
    if (label) label.textContent = `${state.allSubs.length} subscriber${state.allSubs.length!==1?'s':''}`;
    renderSubs(state.allSubs);
  } catch(e) {
    console.error('[Subscribers] Load failed:', e);
    tbody.innerHTML = `<tr><td colspan="4"><div class="table-empty">Subscribers unavailable. Please retry.</div></td></tr>`;
  }
}

function renderSubs(subs) {
  const tbody = document.getElementById('subsTableBody');
  if (!tbody) return;
  if (!subs.length) { tbody.innerHTML=`<tr><td colspan="4"><div class="table-empty">No subscribers yet.</div></td></tr>`; return; }
  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  tbody.innerHTML = subs.map((s,i) => {
    const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
    return `<tr><td style="color:var(--muted);font-size:0.82rem">${i+1}</td><td><strong>${escHtml(s.email)||'—'}</strong></td>
      <td style="color:var(--muted);font-size:0.83rem;white-space:nowrap">${date}</td>
      <td><button class="action-btn delete" onclick="deleteSub('${s.id}')">Remove</button></td></tr>`;
  }).join('');
}

window.filterSubs  = (q) => renderSubs(state.allSubs.filter(s=>s.email?.toLowerCase().includes(q.toLowerCase())));
window.deleteSub   = async (id) => {
  if (!confirm('Remove this subscriber?')) return;
  try {
    await api.data.delete('subscribers', id);
    state.allSubs = state.allSubs.filter(s=>s.id!==id);
    renderSubs(state.allSubs);
    const label = document.getElementById('subCountLabel');
    if (label) label.textContent = `${state.allSubs.length} subscriber${state.allSubs.length!==1?'s':''}`;
    showToast('Subscriber removed.','success');
  } catch(e) { showToast('Failed: '+e.message,'error'); }
};

window.loadSubscriberAnalytics = async () => {
  try {
    const all = await api.data.getAll('subscribers');
    const active = (all || []).filter(s => s.status !== 'unsubscribed');
    const totalEl = document.getElementById('totalSubscribers');
    const activeEl = document.getElementById('activeSubscribers');
    const lastEl = document.getElementById('statsLastUpdated');
    if (totalEl) totalEl.textContent = (all || []).length;
    if (activeEl) activeEl.textContent = active.length;
    if (lastEl) lastEl.textContent = new Date().toLocaleTimeString('en-IN');
  } catch (e) {
    showToast('Failed to load stats: ' + e.message, 'error');
  }
};

window.exportSubscribers = () => {
  if (!state.allSubs?.length) { showToast('No subscribers to export.','error'); return; }
  const csv  = 'Email,Date\n' + state.allSubs.map(s=>`${s.email},${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : ''}`).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a    = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:'subscribers.csv'});
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV downloaded!','success');
};
