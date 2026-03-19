// ═══════════════════════════════════════════════
// auth.js — Auth guard & user session
// ═══════════════════════════════════════════════
import { auth, db }                       from './config.js';
import { onAuthStateChanged, signOut }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc }                    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state }                          from './state.js';
import { loadAll }                        from './posts.js';

// No hardcoded UIDs or emails — admin status is determined
// exclusively by role: "admin" in the user's Firestore document.
export function initAuth() {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'login.html'; return; }

    // Clear any previous Sentry user context on each auth state change
    window.Sentry?.setUser(null);

    let isAdmin = false;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const role  = snap.exists() ? snap.data().role : null;
      if (role !== 'admin') {
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized';
        return;
      }
      isAdmin = true;
    } catch(e) {
      window.Sentry?.captureException(e);
      if (e.code === 'permission-denied' || e.code === 'unauthenticated') {
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized';
        return;
      }
      console.error('Auth role check failed:', e.message);
      const tbody = document.getElementById('recentPostsBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="table-empty" style="color:#fca5a5">
        ✕ Could not verify admin role. Please refresh or sign in again.<br>
        <span style="font-size:0.75rem;color:var(--muted)">${e.message}</span>
      </div></td></tr>`;
      ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '—';
      });
      return;
    }

    if (!isAdmin) return;

    // ── Tag all future Sentry errors with this logged-in user ────────
    window.Sentry?.setUser({ email: user.email, id: user.uid });

    state.currentUser = user;
    const el = (id) => document.getElementById(id);
    if (el('userEmail'))   el('userEmail').textContent   = user.email;
    if (el('userInitial')) el('userInitial').textContent = user.email[0].toUpperCase();
    if (el('greetMsg'))    el('greetMsg').textContent    = `Welcome back, ${user.email.split('@')[0]}.`;
    loadAll();
  });
}

export function initLogout() {
  const btn = document.querySelector('.btn-logout');
  if (btn) btn.addEventListener('click', async () => {
    window.Sentry?.setUser(null); // clear user context on logout
    await signOut(auth);
    window.location.href = 'login.html';
  });
}
