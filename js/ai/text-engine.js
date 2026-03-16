import { TEXT_PROVIDERS } from "./providers.js";
import { callProvider } from "./router.js";

export async function runTextAI(prompt) {

  for (const provider of TEXT_PROVIDERS) {

    try {

      console.log("Trying provider:", provider);

      const result = await callProvider(provider, prompt, "text");

      return result;

    }
    catch (err) {

      console.warn("Provider failed:", provider);

    }

  }

  throw new Error("All AI providers failed");

}
