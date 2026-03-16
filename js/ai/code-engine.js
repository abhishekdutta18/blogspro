import { CODE_PROVIDERS } from "./providers.js";
import { callProvider } from "./router.js";

export async function runCodeAI(prompt) {

  for (const provider of CODE_PROVIDERS) {

    try {

      console.log("Trying code provider:", provider);

      const result = await callProvider(provider, prompt, "code");

      return result;

    }
    catch (err) {

      console.warn("Code provider failed:", provider);

    }

  }

  throw new Error("All code providers failed");

}
