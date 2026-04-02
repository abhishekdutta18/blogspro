// ═══════════════════════════════════════════════
// remote-config.js — Firebase Remote Config
// Loads AI provider API keys from Firebase.
// ═══════════════════════════════════════════════
import { remoteConfig } from './firebase.js';
import {
  fetchAndActivate,
  getValue
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-remote-config.js';


export let AI_KEYS = {};
export let NEWSLETTER_CONFIG = { url: '', secret: '' };
export let DISPATCH_CONFIG = { ghToken: '' };

export async function loadRemoteConfig() {
  try {
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
      mistral:    getValue(remoteConfig, 'mistral_key').asString(),
      cerebras:   getValue(remoteConfig, 'cerebras_key').asString(),
      sambanova:  getValue(remoteConfig, 'sambanova_key').asString(),
    };

    NEWSLETTER_CONFIG = {
      url:    getValue(remoteConfig, 'newsletter_worker_url').asString()
              || 'https://blogspro-newsletter.abhishekdutta18.workers.dev',
      secret: getValue(remoteConfig, 'newsletter_secret').asString(),
    };

    DISPATCH_CONFIG = {
      ghToken: getValue(remoteConfig, 'gh_dispatch_token').asString(),
    };

    console.log('[remote-config] AI keys loaded (auto fallback mode)');

  } catch (err) {
    console.warn('[remote-config] Failed to load remote config:', err);
  }
}
