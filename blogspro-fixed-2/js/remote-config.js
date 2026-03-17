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
    };

    console.log('[remote-config] AI keys loaded');

  } catch (err) {
    console.warn('[remote-config] Failed to load remote config:', err);
  }
}
