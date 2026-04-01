import { db, showToast } from './config.js';
import { state } from './state.js';
import { doc, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function setFormValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value || '';
}

function setSaveLoading(loading) {
  const btn = document.getElementById('adminAccountSaveBtn');
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Saving…' : 'Save Account';
}

function readField(id) {
  return document.getElementById(id)?.value?.trim?.() || '';
}

export async function loadAdminAccount() {
  const uid = state.currentUser?.uid;
  if (!uid) return;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const profile = snap.exists() ? snap.data() : {};
    state.currentUserProfile = profile;

    setFormValue('adminAccountName', profile.name || state.currentUser?.displayName || '');
    setFormValue('adminAccountPhotoURL', profile.photoURL || '');
    setFormValue('adminAccountBio', profile.bio || '');
    setFormValue('adminAccountEmail', profile.email || state.currentUser?.email || '');
    setFormValue('adminAccountRole', profile.role || 'admin');
  } catch (e) {
    showToast('Failed to load account: ' + (e.message || e.code), 'error');
  }
}

export async function saveAdminAccount() {
  const uid = state.currentUser?.uid;
  if (!uid) {
    showToast('You are not logged in.', 'error');
    return;
  }

  const name = readField('adminAccountName');
  const photoURL = readField('adminAccountPhotoURL');
  const bio = readField('adminAccountBio');

  setSaveLoading(true);
  try {
    const payload = {
      name,
      photoURL,
      bio,
      email: state.currentUser?.email || state.currentUserProfile?.email || '',
      role: state.currentUserProfile?.role || 'admin',
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    state.currentUserProfile = { ...(state.currentUserProfile || {}), ...payload };

    const initial = name?.[0] || state.currentUser?.email?.[0] || 'A';
    const userInitial = document.getElementById('userInitial');
    if (userInitial) userInitial.textContent = initial.toUpperCase();

    showToast('Account updated.', 'success');
  } catch (e) {
    showToast('Failed to save account: ' + (e.message || e.code), 'error');
  } finally {
    setSaveLoading(false);
  }
}

export function initAdminAccount() {
  window.saveAdminAccount = saveAdminAccount;
}

