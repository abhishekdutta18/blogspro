// ═══════════════════════════════════════════════
// remote-config.js — Firebase Remote Config
// Loads AI provider API keys from Firebase.
// ═══════════════════════════════════════════════
import { remoteConfig } from './firebase.js';
import {
  fetchAndActivate,
  getValue,
  ensureInitialized
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-remote-config.js';


export let AI_KEYS = {};

function hasUsableAiWorkerBase() {
  const candidates = [
    window.__AI_API_BASE__,
    localStorage.getItem('bp_ai_api_base'),
    window.__AI_WORKER_URL,
    localStorage.getItem('bp_ai_worker_url'),
  ]
    .map(v => String(v || '').trim())
    .filter(Boolean);

  return candidates.some((base) => {
    const lower = base.toLowerCase();
    if (lower.includes('github-push.abhishek-dutta1996.workers.dev')) return false;
    if (lower === window.location.origin.toLowerCase()) return false;
    return true;
  });
}

function shouldUseClientKeys() {
  if (window.__USE_CLIENT_AI_KEYS__ === true) return true;
  if (window.__USE_CLIENT_AI_KEYS__ === false) return false;
  // Auto mode: enable client keys when no valid AI worker endpoint is configured.
  return !hasUsableAiWorkerBase();
}


export async function loadRemoteConfig() {
  const useClientKeys = shouldUseClientKeys();
  if (!useClientKeys) {
    AI_KEYS = {};
    console.log('[remote-config] Worker mode enabled: client API keys disabled');
    return;
  }
  try {
    await ensureInitialized(remoteConfig);
    remoteConfig.settings = {
      minimumFetchIntervalMillis: 3600000  // 1 hour cache
    };

    await fetchAndActivate(remoteConfig);

    AI_KEYS = {
      cloudflare: getValue(remoteConfig, 'cloudflare_key').asString(),
      groq:       getValue(remoteConfig, 'groq_key').asString(),
      openrouter: getValue(remoteConfig, 'openrouter_key').asString(),
      together:   getValue(remoteConfig, 'together_key').asString(),
      deepinfra:  getValue(remoteConfig, 'deepinfra_key').asString(),
      gemini:     getValue(remoteConfig, 'gemini_key').asString(),
    };

    NEWSLETTER_CONFIG = {
      url:    getValue(remoteConfig, 'newsletter_worker_url').asString(),
      secret: getValue(remoteConfig, 'newsletter_secret').asString(),
    };

    console.log('[remote-config] AI keys loaded (auto fallback mode)');

  } catch (err) {
    console.warn('[remote-config] Failed to load remote config:', err);
  }
}
