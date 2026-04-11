// ═══════════════════════════════════════════════
// profile.js — Admin Profile management (Proxy-based)
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { showToast } from './config.js';
import { state } from './state.js';

export async function loadProfile() {
  const user = state.currentUser;
  if (!user) return;

  try {
    // 1. Load Personal Profile (users/{uid})
    const u = await api.data.get('users', user.uid);
    if (u) {
      document.getElementById('profName').value   = u.name || user.displayName || '';
      document.getElementById('profBio').value    = u.bio || '';
      document.getElementById('profAvatar').value = u.photoURL || user.photoURL || '';
    }

    // 2. Load Public Blog "About" (site/about)
    const a = await api.data.get('site', 'about');
    if (a) {
      document.getElementById('aboutHeading').value = a.heading || '';
      document.getElementById('aboutTagline').value = a.tagline || '';
      document.getElementById('aboutBio').value     = a.bio || '';
      document.getElementById('aboutMission').value = a.mission || '';
      
      const s = a.socials || {};
      document.getElementById('socialX').value        = s.x || '';
      document.getElementById('socialLinkedIn').value = s.linkedin || '';
      document.getElementById('socialYouTube').value  = s.youtube || '';
      document.getElementById('socialGitHub').value   = s.github || '';
    }
  } catch (err) {
    console.error('[Profile] Load failed:', err);
    showToast('Failed to load profile data.', 'error');
  }
}

window.savePersonalProfile = async () => {
  const user = state.currentUser;
  if (!user) return;

  const name     = document.getElementById('profName').value.trim();
  const bio      = document.getElementById('profBio').value.trim();
  const photoURL = document.getElementById('profAvatar').value.trim();

  try {
    await api.data.update('users', user.uid, {
      name, bio, photoURL,
      updatedAt: new Date().toISOString()
    });

    if (document.getElementById('userInitial')) {
      document.getElementById('userInitial').textContent = name ? name[0].toUpperCase() : (user.email ? user.email[0].toUpperCase() : '?');
    }
    
    showToast('Personal profile updated successfully.', 'success');
  } catch (err) {
    showToast('Failed to update personal profile: ' + err.message, 'error');
  }
};

window.savePublicAbout = async () => {
  const heading = document.getElementById('aboutHeading').value.trim();
  const tagline = document.getElementById('aboutTagline').value.trim();
  const bio     = document.getElementById('aboutBio').value.trim();
  const mission = document.getElementById('aboutMission').value.trim();
  
  const socials = {
    x:        document.getElementById('socialX').value.trim(),
    linkedin: document.getElementById('socialLinkedIn').value.trim(),
    youtube:  document.getElementById('socialYouTube').value.trim(),
    github:   document.getElementById('socialGitHub').value.trim(),
  };

  try {
    await api.data.update('site', 'about', {
      heading, tagline, bio, mission, socials,
      updatedAt: new Date().toISOString()
    });

    showToast('Public blog profile updated successfully.', 'success');
  } catch (err) {
    showToast('Failed to update blog profile: ' + err.message, 'error');
  }
};

export function initProfile() {
  console.log('[Profile] Initialized');
}
