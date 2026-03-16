// ═══════════════════════════════════════════════
// auth.js — Auth guard & user session
// ═══════════════════════════════════════════════
import { auth, db }                      from './config.js';
import { onAuthStateChanged, signOut }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc }                   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state }                         from './state.js';
import { loadAll }                       from './posts.js';

// No hardcoded UIDs or emails — admin status is determined
// exclusively by role: "admin" in the user's Firestore document.

export function initAuth() {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'login.html'; return; }

    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const role  = snap.exists() ? snap.data().role : null;

      if (role !== 'admin') {
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized';
        return;
      }
    } catch(e) {
      // Only hard-redirect on actual auth/permission errors, not network blips
      if (e.code === 'permission-denied' || e.code === 'unauthenticated') {
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized';
        return;
      }
      console.warn('Auth check non-fatal error:', e.message);
    }

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
    await signOut(auth);
    window.location.href = 'login.html';
  });
}
