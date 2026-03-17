import { CODE_PROVIDERS } from "./providers.js";
import { callProvider } from "./router.js";


const log = (...a) => { if (location.hostname === 'localhost') log(...a); };

const log = (...a) => { if (location.hostname === 'localhost') log(...a); };

export async function runCodeAI(prompt) {

  for (const provider of CODE_PROVIDERS) {

    try {

      log("Trying code provider:", provider);

      const result = await callProvider(provider, prompt, "code");

      return { text: result, provider: provider };

    }
    catch (err) {

      console.warn("Code provider failed:", provider);

    }

  }

  throw new Error("All code providers failed");

}
