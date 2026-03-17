import { TEXT_PROVIDERS } from "./providers.js";
import { callProvider } from "./router.js";


const log = (...a) => { if (location.hostname === 'localhost') log(...a); };

const log = (...a) => { if (location.hostname === 'localhost') log(...a); };

export async function runTextAI(prompt) {

  for (const provider of TEXT_PROVIDERS) {

    try {

      log("Trying provider:", provider);

      const result = await callProvider(provider, prompt, "text");

      return { text: result, provider: provider };

    }
    catch (err) {

      console.warn("Provider failed:", provider);

    }

  }

  throw new Error("All AI providers failed");

}
