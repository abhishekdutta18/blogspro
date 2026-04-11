// Lightweight worker-side telemetry helpers to avoid firebase-admin bundle bloat.
// Uses plain fetch + OAuth2 JWT; no heavy deps.
import crypto from "node:crypto";

// Extract service account JSON from env.
function getServiceAccount(env) {
  // Prefer explicit JSON blob; fall back to base64 or path (not typical on Workers).
  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.warn("[Telemetry] Invalid FIREBASE_SERVICE_ACCOUNT JSON:", e.message);
    }
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      return JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
    } catch (e) {
      console.warn("[Telemetry] Invalid FIREBASE_SERVICE_ACCOUNT_BASE64:", e.message);
    }
  }
  return null;
}

// Create a short-lived access token for Firestore REST.
export async function getGoogleAccessToken(env) {
  const sa = getServiceAccount(env);
  if (!sa?.client_email || !sa?.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${payload}.${signature}`,
    }),
  });

  if (!res.ok) {
    console.warn("[Telemetry] Token request failed", res.status);
    return null;
  }
  const data = await res.json();
  return data.access_token || null;
}

// Fire-and-forget telemetry log into Firestore via REST.
export async function pushTelemetryLog(event, data = {}, env = {}) {
  const token = await getGoogleAccessToken(env);
  if (!token || !env.FIREBASE_PROJECT_ID) return; // graceful noop on missing creds

  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/telemetry_logs`;
  const body = {
    fields: {
      event: { stringValue: event },
      status: { stringValue: data.status || "info" },
      message: { stringValue: data.message || "" },
      timestamp: { timestampValue: new Date().toISOString() },
    },
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("[Telemetry] Firestore log failed:", e.message);
  }
}

