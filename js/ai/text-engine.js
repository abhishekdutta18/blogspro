import { TEXT_PROVIDERS } from "./providers.js";
import { callProvider } from "./router.js";

export async function runTextAI(prompt) {

  for (const provider of TEXT_PROVIDERS) {

    try {

      console.log("Trying provider:", provider);

      const result = await callProvider(provider, prompt, "text");

      return { text: result, provider: provider };

    }
    catch (err) {
      if (String(err?.message || "").toLowerCase().includes("endpoint not configured")) {
        throw err;
      }

      console.warn("Provider failed:", provider);

    }

  }

  throw new Error("All AI providers failed");

}
