// ═══════════════════════════════════════════════
// remote-config.js — Remote Configuration (Proxy-based)
// Loads AI provider API keys and configurations via the secure server proxy.
// ═══════════════════════════════════════════════
import { api } from './services/api.js';

export let AI_KEYS = {};
export let NEWSLETTER_CONFIG = { 
  url: 'https://blogspro-newsletter.abhishek-dutta1996.workers.dev', 
  secret: '' 
};
export let DISPATCH_CONFIG = { ghToken: '' };

/**
 * Loads configuration from the server-side proxy (Firestore settings/remote_config).
 * This replaces the direct Firebase Remote Config SDK.
 */
export async function loadRemoteConfig() {
  try {
    const data = await api.data.get('settings', 'remote_config');
    
    if (data) {
      AI_KEYS = {
        cloudflare: data.cloudflare_key || '',
        groq: data.groq_key || '',
        openrouter: data.openrouter_key || '',
        together: data.together_key || '',
        deepinfra: data.deepinfra_key || '',
        gemini: data.gemini_key || '',
        mistral: data.mistral_key || '',
        cerebras: data.cerebras_key || '',
        sambanova: data.sambanova_key || '',
      };

      NEWSLETTER_CONFIG = {
        url: data.newsletter_worker_url || 'https://blogspro-newsletter.abhishek-dutta1996.workers.dev',
        secret: data.newsletter_secret || '',
      };

      DISPATCH_CONFIG = {
        ghToken: data.gh_dispatch_token || '',
      };

      console.log('[remote-config] Configuration loaded via Proxy API.');
    } else {
      console.warn('[remote-config] No configuration found in settings/remote_config.');
    }
  } catch (err) {
    console.warn('[remote-config] Failed to load configuration via Proxy:', err.message);
  }
}
