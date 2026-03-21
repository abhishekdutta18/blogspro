// ═══════════════════════════════════════════════
// profile.js — Admin Profile management
// ═══════════════════════════════════════════════
import { db, auth, showToast } from './config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { state } from './state.js';

export async function loadProfile() {
  const user = auth.currentUser || state.currentUser;
  if (!user) return;

  try {
    // 1. Load Personal Profile (users/{uid})
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists()) {
      const u = userSnap.data();
      document.getElementById('profName').value   = u.name || user.displayName || '';
      document.getElementById('profBio').value    = u.bio || '';
      document.getElementById('profAvatar').value = u.photoURL || user.photoURL || '';
    }

    // 2. Load Public Blog "About" (site/about)
    const aboutSnap = await getDoc(doc(db, 'site', 'about'));
    if (aboutSnap.exists()) {
      const a = aboutSnap.data();
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
  const user = auth.currentUser || state.currentUser;
  if (!user) return;

  const name     = document.getElementById('profName').value.trim();
  const bio      = document.getElementById('profBio').value.trim();
  const photoURL = document.getElementById('profAvatar').value.trim();

  try {
    await setDoc(doc(db, 'users', user.uid), {
      name, bio, photoURL,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Update sidebar UI immediately
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
    await setDoc(doc(db, 'site', 'about'), {
      heading, tagline, bio, mission, socials,
      updatedAt: serverTimestamp()
    }, { merge: true });

    showToast('Public blog profile updated successfully.', 'success');
  } catch (err) {
    showToast('Failed to update blog profile: ' + err.message, 'error');
  }
};

export function initProfile() {
  // Functions are already exposed via window for inline onclicks
  console.log('[Profile] Initialized');
}
