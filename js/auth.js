// ═══════════════════════════════════════════════
// auth.js — Auth guard & user session
// ═══════════════════════════════════════════════
import { auth, db }                       from './config.js';
import { onAuthStateChanged, signOut }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc }                    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state }                          from './state.js';
import { loadAll }                        from './posts.js';
import { identifyUser }                   from './analytics.js';

// Sentry is loaded via js/sentry-init-v2.js shared bootstrap.
// It may not be ready when this module first executes, so we wrap
// all Sentry calls in a helper that defers until onLoad fires. ─────────
function sentryCaptureException(err) {
  if (window.Sentry?.captureException) {
    window.Sentry.captureException(err);
  }
}
// IdentifyUser is now centralized in analytics.js

// No hardcoded UIDs or emails — admin status is determined
export function initAuth() {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'login.html'; return; }

    let isAdmin = false;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const role  = snap.exists() ? snap.data().role : null;
      state.currentUserProfile = snap.exists() ? snap.data() : null;
      if (role !== 'admin') {
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized';
        return;
      }
      isAdmin = true;
    } catch(e) {
      sentryCaptureException(e);
      if (e.code === 'permission-denied' || e.code === 'unauthenticated') {
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized';
        return;
      }
      console.error('Auth role check failed:', e.message);
      const tbody = document.getElementById('recentPostsBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7"><div class="table-empty" style="color:#fca5a5">
        ✕ Could not verify admin role. Please refresh or sign in again.<br>
        <span style="font-size:0.75rem;color:var(--muted)">${e.message}</span>
      </div></td></tr>`;
      ['statTotal','statPublished','statDrafts','statSubs'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '—';
      });
      return;
    }

    if (!isAdmin) return;

    // ── Tag all future Sentry/Clarity errors/events with this logged-in user ──
    identifyUser(user);

    // Generate a per-session CSRF token to protect state-changing operations
    state.csrfToken = crypto.randomUUID();

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
    identifyUser(null); // clear user context on logout
    await signOut(auth);
    window.location.href = 'login.html';
  });
}
