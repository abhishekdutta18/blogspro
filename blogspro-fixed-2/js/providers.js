// ═══════════════════════════════════════════════
// providers.js — Live LLM provider lists
// Updated March 2026 — latest available models
// ═══════════════════════════════════════════════

// Priority order: best quality first, fastest fallback last
export const TEXT_PROVIDERS = [
  "groq",        // Kimi K2 1T MoE — best quality, fastest
  "openrouter",  // Access to many frontier models
  "together",    // DeepSeek V3 — strong reasoning
  "deepinfra",   // Llama 3.3 70B — reliable
  "gemini",      // Gemini 2.0 Flash — Google fallback
  "mistral",     // Mistral Large — European fallback
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
  "pollinations", // Free, no key — primary
  "huggingface",  // Flux Schnell — fallback
  "cloudflare",   // Workers AI — last resort
];
