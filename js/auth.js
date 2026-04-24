// ═══════════════════════════════════════════════
// auth.js — Auth guard & user session (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { state } from './state.js';
import { loadAll } from './posts.js';
import { identifyUser } from './analytics.js';

function sentryCaptureException(err) {
  if (window.Sentry?.captureException) {
    window.Sentry.captureException(err);
  }
}

export async function initAuth() {
  try {
    const res = await api.auth.me();
    if (!res.authenticated) {
      window.location.href = 'login.html';
      return;
    }

    const { user } = res;
    state.currentUser = user;
    state.currentUserProfile = user; // Profile info is integrated in the proxy me() response

    if (user.role !== 'admin') {
      await api.auth.logout();
      window.location.href = 'login.html?error=unauthorized&reason=' + encodeURIComponent(user.role || 'missing_role');
      return;
    }

    identifyUser(user);
    state.csrfToken = crypto.randomUUID();

    const el = (id) => document.getElementById(id);
    if (el('userEmail'))   el('userEmail').textContent   = user.email;
    if (el('userInitial')) el('userInitial').textContent = user.email[0].toUpperCase();
    if (el('greetMsg'))    el('greetMsg').textContent    = `Welcome back, ${user.email.split('@')[0]}.`;
    
    loadAll();
  } catch (e) {
    sentryCaptureException(e);
    console.error('Auth check failed:', e.message);
    window.location.href = 'login.html?error=proxy_fail';
  }
}

export function initLogout() {
  const btn = document.querySelector('.btn-logout');
  if (btn) btn.addEventListener('click', async () => {
    identifyUser(null);
    await api.auth.logout();
    window.location.href = 'login.html';
  });
}
