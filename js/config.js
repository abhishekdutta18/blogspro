import { remoteConfig, db as _db } from "./firebase.js";

import {
  fetchAndActivate,
  getValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-remote-config.js";

// ── Re-export db so other modules can import it from config.js ──
export { _db as db };

// ── Cloudinary credentials ────────────────────────────────────
export const CLOUDINARY_CLOUD_NAME   = 'blogspro';      // Replace with your actual cloud name
export const CLOUDINARY_UPLOAD_PRESET = 'blogspro_unsigned'; // Replace with your upload preset

export let AI_KEYS = {};

export async function loadRemoteConfig() {

  try {

    remoteConfig.settings = {
      minimumFetchIntervalMillis: 3600000
    };

    await fetchAndActivate(remoteConfig);

    AI_KEYS = {

      cloudflare: getValue(remoteConfig, "cloudflare_key").asString(),
      groq: getValue(remoteConfig, "groq_key").asString(),
      openrouter: getValue(remoteConfig, "openrouter_key").asString(),
      together: getValue(remoteConfig, "together_key").asString(),
      deepinfra: getValue(remoteConfig, "deepinfra_key").asString(),
      gemini: getValue(remoteConfig, "gemini_key").asString()

    };

    console.log("[config] Remote Config loaded");

  } catch (err) {

    console.warn("[config] Remote Config failed", err);

  }

}


export function cleanEditorHTML(html) {

  if (!html) return "";

  html = html.replace(/<script.*?>.*?<\/script>/gi, "");

  html = html.replace(/<p>\s*<\/p>/g, "");

  html = html.replace(/\n\s*\n/g, "\n");

  return html.trim();

}


// ── showToast ─────────────────────────────────────────────────
let _toastTimer = null;
export function showToast(message, type = 'success') {
  let toast = document.getElementById('_bpToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '_bpToast';
    toast.style.cssText = [
      'position:fixed','top:1.2rem','right:1.2rem','z-index:99999',
      'padding:0.65rem 1.1rem','border-radius:4px','font-size:0.82rem',
      'font-weight:600','font-family:var(--sans,sans-serif)',
      'max-width:340px','box-shadow:0 4px 20px rgba(0,0,0,0.4)',
      'transition:opacity 0.3s','pointer-events:none'
    ].join(';');
    document.body.appendChild(toast);
  }
  const colors = {
    success: { bg:'rgba(34,197,94,0.15)',  border:'rgba(34,197,94,0.4)',  color:'#4ade80' },
    error:   { bg:'rgba(239,68,68,0.15)',  border:'rgba(239,68,68,0.4)',  color:'#fca5a5' },
    info:    { bg:'rgba(59,130,246,0.15)', border:'rgba(59,130,246,0.4)', color:'#93c5fd' },
  };
  const c = colors[type] || colors.info;
  toast.style.background = c.bg;
  toast.style.border     = `1px solid ${c.border}`;
  toast.style.color      = c.color;
  toast.style.opacity    = '1';
  toast.textContent      = message;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

// ── sanitize ──────────────────────────────────────────────────
export function sanitize(html) {
  if (!html) return '';
  html = html.replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '');
  html = html.replace(/<(script|style|iframe|object|embed|form)[^>]*/gi, '');
  html = html.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
  html = html.replace(/(href|src)\s*=\s*["']\s*javascript:[^"']*/gi, '$1="#"');
  return html;
}

// ── slugify ───────────────────────────────────────────────────
export function slugify(text) {
  if (!text) return '';
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── stripTags ─────────────────────────────────────────────────
export function stripTags(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

// ── setBtnLoading ─────────────────────────────────────────────
export function setBtnLoading(btnId, txtId, spinnerId, loading, label = '') {
  const btn     = document.getElementById(btnId);
  const txt     = document.getElementById(txtId);
  const spinner = document.getElementById(spinnerId);
  if (btn)     btn.disabled          = loading;
  if (txt)     txt.textContent       = label || (loading ? '…' : '');
  if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
}

// ── parseAIJson ───────────────────────────────────────────────
export function parseAIJson(text) {
  if (!text) return null;
  try {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s === -1 || e === -1 || e <= s) return null;
    return JSON.parse(text.substring(s, e + 1));
  } catch (_) { return null; }
}

// ── Cloudinary config ─────────────────────────────────────────
export const CLOUDINARY_CLOUD_NAME    = 'dldbsidve';
export const CLOUDINARY_UPLOAD_PRESET = 'blogspro';
