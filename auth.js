// ═══════════════════════════════════════════════
// auth.js — Auth guard & user session
// ═══════════════════════════════════════════════
import { auth, db }                       from './config.js';
import { onAuthStateChanged, signOut }    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc }                    from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state }                          from './state.js';
import { loadAll }                        from './posts.js';

// Sentry is loaded via admin.html CDN script + Sentry.onLoad().
// It may not be ready when this module first executes, so we wrap
// all Sentry calls in a helper that defers until onLoad fires. ─────────
function sentryCaptureException(err) {
  if (window.Sentry?.captureException) {
    window.Sentry.captureException(err);
  }
}
function sentrySetUser(user) {
  if (window.Sentry?.setUser) {
    window.Sentry.setUser(user);
  } else {
    // Sentry.onLoad hasn't fired yet — queue it
    const orig = window.setSentryUser;
    window.setSentryUser = function(u) {
      if (orig) orig(u);
      if (window.Sentry?.setUser) window.Sentry.setUser(u);
    };
    window.setSentryUser(user);
  }
}

// No hardcoded UIDs or emails — admin status is determined
// exclusively by role: "admin" in the user's Firestore document.
export function initAuth() {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = 'login.html'; return; }

    // Clear any previous Sentry user context on each auth state change
    sentrySetUser(null);

    let isAdmin = false;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const role  = snap.exists() ? snap.data().role : null;
      if (role !== 'admin') {
        console.warn(`🚫 [Auth] Access Denied: User ${user.email} (${user.uid}) has role '${role || 'null'}'. Admin required.`);
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized&reason=' + (role || 'missing_role');
        return;
      }
      isAdmin = true;
    } catch(e) {
      sentryCaptureException(e);
      if (e.code === 'permission-denied' || e.code === 'unauthenticated') {
        console.warn(`🚫 [Auth] Security Error: ${e.code}. User may not have permission to read their own profile.`);
        await signOut(auth);
        window.location.href = 'login.html?error=unauthorized&reason=' + e.code;
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
    sentrySetUser({ email: user.email, id: user.uid });

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
    sentrySetUser(null); // clear user context on logout
    await signOut(auth);
    window.location.href = 'login.html';
  });
}
