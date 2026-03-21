import { IMAGE_PROVIDERS } from "./providers.js";
import { workerFetch } from "../worker-endpoints.js";

export async function runImageAI(prompt) {

  for (const provider of IMAGE_PROVIDERS) {

    try {

      console.log("Trying image provider:", provider);

      const result = await callImageProvider(provider, prompt);

      return result;

    }
    catch (err) {

      console.warn("Image provider failed:", provider);

    }

  }

  throw new Error("All image providers failed");

}


async function callImageProvider(provider, prompt) {

  const res = await workerFetch("api/generate-image", {

    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      provider,
      prompt,
      type: "image",
      model: provider === "google" ? "imagen-3.0-generate-002" : undefined
    })

  });

  if (!res.ok) {
    throw new Error(provider + " failed");
  }

  const data = await res.json();

  return data.image || data.url || data.result;

}
