// ═══════════════════════════════════════════════
// users.js — User management
// ═══════════════════════════════════════════════
import { db }        from './config.js';
import { showToast } from './config.js';
import { collection, getDocs, updateDoc, doc, serverTimestamp, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  try {
    const snap  = await getDocs(collection(db,'users'));
    // Filter by role only — no hardcoded UIDs or emails
    const users = snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(u => u.role !== 'admin')
      .sort((a, b) => {
        const aMs = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const bMs = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return bMs - aMs;
      });
    if (!users.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="table-empty">No other users yet.</div></td></tr>`; return; }
    const roleColors = {reader:'color:#8896b3',editor:'color:#93c5fd',coauthor:'color:#c9a84c'};
    const roleLabels = {reader:'Reader',editor:'Editor',coauthor:'Co-Author'};

    // Count pending requests for badge
    const pendingCount = users.filter(u => u.requestedRole && u.requestedRole !== u.role).length;
    _updatePendingBadge(pendingCount);

    tbody.innerHTML = users.map(u => {
      const date  = u.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})||'—';
      const hasPending = u.requestedRole && u.requestedRole !== u.role;
      const requested = hasPending
        ? `<div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.35rem;flex-wrap:wrap">
             <span style="font-size:0.68rem;color:var(--gold)">⏳ Requested: ${roleLabels[u.requestedRole]||u.requestedRole}</span>
             <button onclick="approveRoleRequest('${u.id}','${u.requestedRole}')" style="background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#22c55e;padding:0.2rem 0.5rem;border-radius:2px;font-family:var(--sans);font-size:0.68rem;font-weight:700;cursor:pointer;transition:all 0.15s" onmouseover="this.style.background='rgba(34,197,94,0.25)'" onmouseout="this.style.background='rgba(34,197,94,0.12)'">✓ Approve</button>
             <button onclick="rejectRoleRequest('${u.id}')" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#fca5a5;padding:0.2rem 0.5rem;border-radius:2px;font-family:var(--sans);font-size:0.68rem;font-weight:700;cursor:pointer;transition:all 0.15s" onmouseover="this.style.background='rgba(239,68,68,0.18)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">✕ Reject</button>
           </div>`
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
  } catch(e) { tbody.innerHTML=`<tr><td colspan="5"><div class="table-empty">Failed to load users.</div></td></tr>`; }
}

// ── Approve a pending role request ────────────────
window.approveRoleRequest = async (uid, requestedRole) => {
  try {
    await updateDoc(doc(db,'users',uid),{
      role: requestedRole,
      requestedRole: deleteField(),
      roleRequestUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast(`Role approved → ${requestedRole}.`,'success');
    loadUsers();
  } catch(e) { showToast('Approve failed: '+e.message,'error'); }
};

// ── Reject a pending role request ─────────────────
window.rejectRoleRequest = async (uid) => {
  try {
    await updateDoc(doc(db,'users',uid),{
      requestedRole: deleteField(),
      roleRequestUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast('Role request rejected.','success');
    loadUsers();
  } catch(e) { showToast('Reject failed: '+e.message,'error'); }
};

// ── Direct role change (existing dropdown) ────────
window.changeUserRole = async (uid, role) => {
  try {
    await updateDoc(doc(db,'users',uid),{
      role,
      requestedRole: deleteField(),
      roleRequestUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    showToast(`Role updated to ${role}.`,'success');
    loadUsers();
  }
  catch(e) { showToast('Failed: '+e.message,'error'); }
};

// ── Update the pending-request badge on Users nav item ──
function _updatePendingBadge(count) {
  let badge = document.getElementById('usersPendingBadge');
  const navItem = document.querySelector('.nav-item[data-view="users"]');
  if (!navItem) return;

  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'usersPendingBadge';
      badge.style.cssText = 'margin-left:auto;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;font-size:0.62rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:8px;min-width:18px;text-align:center';
      navItem.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

window.backfillUserCreatedAt = async () => {
  if (!confirm('Backfill missing join dates (createdAt) for existing users?')) return;
  try {
    const snap = await getDocs(collection(db, 'users'));
    const missing = snap.docs.filter(d => !d.data()?.createdAt);
    if (!missing.length) {
      showToast('No users need backfill.', 'success');
      return;
    }

    for (const d of missing) {
      await updateDoc(doc(db, 'users', d.id), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    showToast(`Backfilled ${missing.length} user${missing.length === 1 ? '' : 's'}.`, 'success');
    loadUsers();
  } catch (e) {
    showToast('Backfill failed: ' + e.message, 'error');
  }
};

