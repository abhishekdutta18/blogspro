import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import { app } from "./firebase.js";

export let AI_KEYS = {};

export async function loadRemoteConfig() {

  const rc = getRemoteConfig(app);

  rc.settings = {
    minimumFetchIntervalMillis: 3600000
  };

  await fetchAndActivate(rc);

  AI_KEYS = {

    cloudflare: getValue(rc, "cloudflare_key").asString(),
    groq: getValue(rc, "groq_key").asString(),
    openrouter: getValue(rc, "openrouter_key").asString(),
    together: getValue(rc, "together_key").asString(),
    deepinfra: getValue(rc, "deepinfra_key").asString(),
    gemini: getValue(rc, "gemini_key").asString()

  };

  console.log("[config] Remote Config loaded. Keys:", Object.keys(AI_KEYS));

}
