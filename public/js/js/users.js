// ═══════════════════════════════════════════════
// users.js — User management (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { showToast } from './config.js';

export async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  try {
    const usersRaw = await api.data.getAll('users');
    const users = (usersRaw || [])
      .filter(u => u.role !== 'admin')
      .sort((a, b) => {
        const aMs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bMs - aMs;
      });
    
    if (!users.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="table-empty">No other users yet.</div></td></tr>`; return; }
    
    const roleColors = {reader:'color:#8896b3',editor:'color:#93c5fd',coauthor:'color:#c9a84c'};
    const roleLabels = {reader:'Reader',editor:'Editor',coauthor:'Co-Author'};
    
    tbody.innerHTML = users.map(u => {
      const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
      const requested = u.requestedRole && u.requestedRole !== u.role
        ? `<div style="font-size:0.68rem;color:var(--gold);margin-top:0.2rem">Requested: ${roleLabels[u.requestedRole]||u.requestedRole}</div>`
        : '';
      return `<tr>
        <td><strong>${u.name||'—'}</strong></td>
        <td style="color:var(--muted);font-size:0.85rem">${u.email||'—'}</td>
        <td>
          <span style="font-size:0.75rem;font-weight:600;text-transform:uppercase;${roleColors[u.role]||'color:#8896b3'}">${roleLabels[u.role]||u.role||'Reader'}</span>
          ${requested}
        </td>
        <td style="color:var(--muted);font-size:0.83rem;white-space:nowrap">${date}</td>
        <td><select onchange="changeUserRole('${u.id}',this.value)" style="background:var(--navy);border:1px solid var(--border);color:var(--cream);padding:0.3rem 0.5rem;border-radius:2px;font-family:var(--sans);font-size:0.78rem;cursor:pointer;outline:none">
          <option value="reader" ${u.role==='reader'?'selected':''}>Reader</option>
          <option value="editor" ${u.role==='editor'?'selected':''}>Editor</option>
          <option value="coauthor" ${u.role==='coauthor'?'selected':''}>Co-Author</option>
        </select></td></tr>`;
    }).join('');
  } catch(e) {
    console.error('[Users] Load failed:', e);
    tbody.innerHTML = `<tr><td colspan="5"><div class="table-empty">Users unavailable. Please retry.</div></td></tr>`;
  }
}

window.changeUserRole = async (uid, role) => {
  try {
    await api.data.update('users', uid, {
      role,
      requestedRole: role,
      roleRequestUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    showToast(`Role updated to ${role}.`,'success');
    loadUsers();
  }
  catch(e) { showToast('Failed: '+e.message,'error'); }
};

window.backfillUserCreatedAt = async () => {
  if (!confirm('Backfill missing join dates (createdAt) for existing users?')) return;
  try {
    const users = await api.data.getAll('users');
    const missing = (users || []).filter(u => !u.createdAt);
    if (!missing.length) {
      showToast('No users need backfill.', 'success');
      return;
    }

    for (const u of missing) {
      await api.data.update('users', u.id, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    showToast(`Backfilled ${missing.length} user${missing.length === 1 ? '' : 's'}.`, 'success');
    loadUsers();
  } catch (e) {
    showToast('Backfill failed: ' + e.message, 'error');
  }
};
