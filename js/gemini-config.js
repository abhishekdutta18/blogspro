// ═══════════════════════════════════════════════
// gemini-config.js — Google Gemini API Setup
// Manages API keys, model selection, and quota
// ═══════════════════════════════════════════════

/**
 * Gemini Setup Instructions
 * ─────────────────────────
 * 
 * 1. Get Gemini API Key:
 *    - Go to https://aistudio.google.com/app/apikey
 *    - Click "Create API Key"
 *    - Select your project (or create new)
 *    - Copy the key
 * 
 * 2. Add to Firebase Remote Config:
 *    - Go to Firebase Console → Project Settings → Remote Config
 *    - Create new parameter: "GEMINI_API_KEY"
 *    - Value: Your Gemini API key
 *    - Publish
 * 
 * 3. Pricing (Google AI Studio):
 *    - First 60 requests/minute: FREE
 *    - Text generation: 0.075 USD per 1M input tokens, 0.3 USD per 1M output tokens
 *    - Your 100MB plan typically includes 1500 RPM quota
 * 
 * 4. Rate Limits:
 *    - 60 requests/minute (free)
 *    - Increase quota in Google Cloud Console if needed
 */

export const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_MODELS = {
  GEMINI_2_0_FLASH: 'gemini-2.0-flash',      // Latest, fastest
  GEMINI_2_0_FLASH_LITE: 'gemini-2.0-flash-lite', // Lightweight
  GEMINI_2_0_FLASH_EXP: 'gemini-2.0-flash-exp', // Experimental
  GEMINI_1_5_PRO: 'gemini-1.5-pro',          // High quality
  GEMINI_1_5_FLASH: 'gemini-1.5-flash',      // Balanced
};

// Recommended model for BlogsPro (best for content generation)
export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS.GEMINI_2_0_FLASH;

export const GEMINI_CONFIG = {
  apiKey: null, // Loaded from Remote Config
  model: DEFAULT_GEMINI_MODEL,
  maxTokens: 4096,
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
};

let geminiInitialized = false;

/**
 * Initialize Gemini API from Remote Config
 */
export async function initializeGemini() {
  if (geminiInitialized) return true;

  try {
    const { getRemoteConfig, getValue } = await import('./remote-config.js');
    await getRemoteConfig();
    
    const apiKey = getValue('GEMINI_API_KEY');
    if (!apiKey) {
      console.warn('[Gemini] GEMINI_API_KEY not configured in Remote Config');
      return false;
    }

    GEMINI_CONFIG.apiKey = apiKey;
    geminiInitialized = true;
    console.log('[Gemini] Initialized with model:', GEMINI_CONFIG.model);
    return true;
  } catch (err) {
    console.error('[Gemini] Failed to initialize:', err);
    return false;
  }
}

/**
 * Call Gemini API for text generation
 */
export async function callGemini(prompt, options = {}) {
  const initialized = await initializeGemini();
  if (!initialized) {
    throw new Error('Gemini API not configured. Add GEMINI_API_KEY to Firebase Remote Config.');
  }

  const {
    model = GEMINI_CONFIG.model,
    maxTokens = GEMINI_CONFIG.maxTokens,
    temperature = GEMINI_CONFIG.temperature,
    topP = GEMINI_CONFIG.topP,
    topK = GEMINI_CONFIG.topK,
  } = options;

  const url = `${GEMINI_API_ENDPOINT}/${model}:generateContent?key=${GEMINI_CONFIG.apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
          topP,
          topK,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Gemini API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Gemini returned empty response');
    }

    return {
      text,
      model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount || 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      finishReason: data.candidates?.[0]?.finishReason || 'UNKNOWN',
    };
  } catch (err) {
    console.error('[Gemini] API call failed:', err);
    throw err;
  }
}

/**
 * Stream Gemini responses (useful for live typing effect)
 */
export async function* streamGemini(prompt, options = {}) {
  const initialized = await initializeGemini();
  if (!initialized) {
    throw new Error('Gemini API not configured');
  }

  const {
    model = GEMINI_CONFIG.model,
    maxTokens = GEMINI_CONFIG.maxTokens,
    temperature = GEMINI_CONFIG.temperature,
  } = options;

  const url = `${GEMINI_API_ENDPOINT}/${model}:streamGenerateContent?alt=sse&key=${GEMINI_CONFIG.apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini streaming failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const chunk = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunk) yield chunk;
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
  } catch (err) {
    console.error('[Gemini] Stream failed:', err);
    throw err;
  }
}

/**
 * Get estimated cost for Gemini usage
 * Helps track quota usage against 100MB budget
 */
export function estimateCost(inputTokens, outputTokens) {
  // Pricing (as of 2024):
  // Gemini 2.0 Flash: $0.075/1M input, $0.3/1M output
  const INPUT_COST = 0.075 / 1_000_000;
  const OUTPUT_COST = 0.3 / 1_000_000;

  const inputCost = inputTokens * INPUT_COST;
  const outputCost = outputTokens * OUTPUT_COST;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency: 'USD',
  };
}

export default {
  initializeGemini,
  callGemini,
  streamGemini,
  estimateCost,
  GEMINI_MODELS,
  GEMINI_CONFIG,
};
