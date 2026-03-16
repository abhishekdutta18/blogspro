import { remoteConfig } from "./firebase.js";

import {
  fetchAndActivate,
  getValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-remote-config.js";


export let AI_KEYS = {};

export async function loadRemoteConfig() {

  try {

    remoteConfig.settings = {
      minimumFetchIntervalMillis: 3600000
    };

    await fetchAndActivate(remoteConfig);

    AI_KEYS = {

      cloudflare: getValue(remoteConfig, "cloudflare_key").asString(),
      groq: getValue(remoteConfig, "groq_key").asString(),
      openrouter: getValue(remoteConfig, "openrouter_key").asString(),
      together: getValue(remoteConfig, "together_key").asString(),
      deepinfra: getValue(remoteConfig, "deepinfra_key").asString(),
      gemini: getValue(remoteConfig, "gemini_key").asString()

    };

    console.log("[config] Remote Config loaded");

  } catch (err) {

    console.warn("[config] Remote Config failed", err);

  }

}


export function cleanEditorHTML(html) {

  if (!html) return "";

  html = html.replace(/<script.*?>.*?<\/script>/gi, "");

  html = html.replace(/<p>\s*<\/p>/g, "");

  html = html.replace(/\n\s*\n/g, "\n");

  return html.trim();

}
