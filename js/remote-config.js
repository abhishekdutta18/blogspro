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

    // Phase 12: Boot Hardening — 5s strict timeout for remote config
    const timeout = new Promise(res => setTimeout(() => res('timeout'), 5000));
    try {
        const result = await Promise.race([fetchAndActivate(remoteConfig), timeout]);
        if (result === 'timeout') {
            console.warn('[remote-config] strict fetch timeout exceeded.');
        } else {
            console.log('[remote-config] activated successfully.');
        }
    } catch (e) {
        console.warn('[remote-config] activation error:', e.message);
    }

    AI_KEYS = {
      cloudflare: (remoteConfig && getValue(remoteConfig, 'cloudflare_key').asString()) || '',
      groq:       (remoteConfig && getValue(remoteConfig, 'groq_key').asString()) || '',
      openrouter: (remoteConfig && getValue(remoteConfig, 'openrouter_key').asString()) || '',
      together:   (remoteConfig && getValue(remoteConfig, 'together_key').asString()) || '',
      deepinfra:  (remoteConfig && getValue(remoteConfig, 'deepinfra_key').asString()) || '',
      gemini:     (remoteConfig && getValue(remoteConfig, 'gemini_key').asString()) || '',
    };

    window.NEWSLETTER_CONFIG = {
      url:    (remoteConfig && getValue(remoteConfig, 'newsletter_worker_url').asString()) || '',
      secret: (remoteConfig && getValue(remoteConfig, 'newsletter_secret').asString()) || '',
    };

    console.log('[remote-config] configuration initialized (safe mode)');

  } catch (err) {
    console.warn('[remote-config] Failed to load remote config:', err);
  }
}
