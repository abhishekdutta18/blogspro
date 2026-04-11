// ═══════════════════════════════════════════════
// providers.js — Live LLM provider lists
// Updated March 2026 — latest available models
// ═══════════════════════════════════════════════

// Priority order: best quality first, fastest fallback last
export const TEXT_PROVIDERS = [
  "gemini",      // Primary: Google Gemini 2.0 Flash (stable, cheapest)
  "groq",        // Secondary: Groq Llama 3.3 70B (fast, but rate-limited)
  "cerebras",    // Cerebras Qwen3 235B (requires key; skipped if missing)
  "sambanova",   // SambaNova Llama 3.3 (requires key; skipped if missing)
  "mistral",     // Mistral Large — balanced
  "deepinfra",   // Llama 3.3 70B — reliable
  "huggingface", // HF Inference API free/paid — low priority
  "openrouter",  // Aggregator access
  "together",    // DeepSeek V3 — strong reasoning
  "deepseek",    // DeepSeek Chat — last resort
];

export const CODE_PROVIDERS = [
  "groq",        // Kimi K2 — excellent at code
  "together",    // DeepSeek Coder — specialised
  "openrouter",  // Qwen2.5 Coder
  "deepinfra",   // CodeLlama
  "gemini",      // Gemini 2.0 Flash
  "mistral",     // Codestral
];

export const IMAGE_PROVIDERS = [
  "google",       // Google Imagen (worker-backed) — primary
  "pollinations", // Free, no key — primary
  "huggingface",  // Flux Schnell — fallback
  "cloudflare",   // Workers AI — last resort
];
