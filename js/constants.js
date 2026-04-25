// ═══════════════════════════════════════════════
// constants.js — App-wide constants
// ═══════════════════════════════════════════════

// Import must be at the top of any ES module
import { ENDPOINTS } from './endpoints.js';

// ── Cloudinary ────────────────────────────────
export const CLOUDINARY_CLOUD_NAME    = 'dldbsidve';
export const CLOUDINARY_UPLOAD_PRESET = 'blogspro';

// ── Upstox market-data proxy worker ───────────
// URL is resolved from js/endpoints.js (supports CF Workers → GCP Cloud Run swap)
export const UPSTOX_WORKER_URL = ENDPOINTS.upstox;
