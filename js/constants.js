// ═══════════════════════════════════════════════
// constants.js — App-wide constants
// ═══════════════════════════════════════════════
 
// ── Cloudinary ────────────────────────────────
export const CLOUDINARY_CLOUD_NAME    = 'dldbsidve';
export const CLOUDINARY_UPLOAD_PRESET = 'blogspro';

// ── Upstox market-data proxy worker ───────────
// URL is resolved from js/endpoints.js (supports CF Workers → GCP Cloud Run swap)
import { ENDPOINTS } from '../endpoints.js';
export const UPSTOX_WORKER_URL = ENDPOINTS.upstox;

 
