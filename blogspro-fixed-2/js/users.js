// ═══════════════════════════════════════════════
// users.js — User management
// ═══════════════════════════════════════════════
import { db }        from './config.js';
import { showToast } from './config.js';
import { collection, getDocs, updateDoc, doc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  try {
    const snap  = await getDocs(query(collection(db,'users'), orderBy('createdAt','desc')));
    // Filter by role only — no hardcoded UIDs or emails
    const users = snap.docs.map(d=>({id:d.id,...d.data()}))
      .filter(u => u.role !== 'admin');
    if (!users.length) { tbody.innerHTML=`<tr><td colspan="5"><div class="table-empty">No other users yet.</div></td></tr>`; return; }
    const roleColors = {reader:'color:#8896b3',editor:'color:#93c5fd',coauthor:'color:#c9a84c'};
    const roleLabels = {reader:'Reader',editor:'Editor',coauthor:'Co-Author'};
    tbody.innerHTML = users.map(u => {
      const date  = u.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})||'—';
      return `<tr>
        <td><strong>${u.name||'—'}</strong></td>
        <td style="color:var(--muted);font-size:0.85rem">${u.email||'—'}</td>
        <td><span style="font-size:0.75rem;font-weight:600;text-transform:uppercase;${roleColors[u.role]||'color:#8896b3'}">${roleLabels[u.role]||u.role||'Reader'}</span></td>
        <td style="color:var(--muted);font-size:0.83rem;white-space:nowrap">${date}</td>
        <td><select onchange="changeUserRole('${u.id}',this.value)" style="background:var(--navy);border:1px solid var(--border);color:var(--cream);padding:0.3rem 0.5rem;border-radius:2px;font-family:var(--sans);font-size:0.78rem;cursor:pointer;outline:none">
          <option value="reader" ${u.role==='reader'?'selected':''}>Reader</option>
          <option value="editor" ${u.role==='editor'?'selected':''}>Editor</option>
          <option value="coauthor" ${u.role==='coauthor'?'selected':''}>Co-Author</option>
        </select></td></tr>`;
    }).join('');
  } catch(e) { tbody.innerHTML=`<tr><td colspan="5"><div class="table-empty">Failed to load users.</div></td></tr>`; }
}

window.changeUserRole = async (uid, role) => {
  try { await updateDoc(doc(db,'users',uid),{role}); showToast(`Role updated to ${role}.`,'success'); loadUsers(); }
  catch(e) { showToast('Failed: '+e.message,'error'); }
};
