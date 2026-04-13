// Web Crypto helpers (no nodejs_compat needed)
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(str) {
  return atob(str.replace(/-/g, "+").replace(/_/g, "/"));
}

// Minimal JWT (HS256) — Web Crypto HMAC
async function signJwt(payload, secret, expSeconds = 7 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expSeconds, ...payload };
  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const data = `${enc({ alg: "HS256", typ: "JWT" })}.${enc(body)}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const sigBytes = Uint8Array.from(fromB64url(s), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "HMAC", key, sigBytes, new TextEncoder().encode(`${h}.${b}`)
  );
  if (!valid) return null;
  const body = JSON.parse(fromB64url(b));
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

// Google Public Keys Cache
let googleKeysCache = null;
async function getGooglePublicKeys() {
  if (googleKeysCache) return googleKeysCache;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) throw new Error("failed to fetch google keys");
  googleKeysCache = await res.json();
  return googleKeysCache;
}

async function verifyGoogleIdToken(token, clientId) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [hB64, pB64, sB64] = parts;
    const header = JSON.parse(fromB64url(hB64));
    const payload = JSON.parse(fromB64url(pB64));

    // 1. Basic Claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
    if (payload.aud !== clientId) return null;

    // 2. RSA Signature Check
    const keys = await getGooglePublicKeys();
    const keyData = keys.keys.find(k => k.kid === header.kid);
    if (!keyData) return null;

    const key = await crypto.subtle.importKey(
      "jwk", keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false, ["verify"]
    );
    const sigBytes = Uint8Array.from(fromB64url(sB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, sigBytes, new TextEncoder().encode(`${hB64}.${pB64}`)
    );
    
    if (!valid) return null;
    return {
      uid: payload.sub,
      email: payload.email,
      verified: payload.email_verified,
      name: payload.name,
      picture: payload.picture
    };
  } catch (e) {
    return null;
  }
}

// Service account → access token for Firestore REST (Web Crypto RSA)
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const header = enc({ alg: "RS256", typ: "JWT" });
  const claimset = enc({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  });

  const pemStripped = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "")
    .trim();
  const keyData = Uint8Array.from(atob(pemStripped), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyData.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(`${header}.${claimset}`)
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claimset}.${b64url(sigBuf)}`,
    }),
  });
  if (!res.ok) throw new Error("token fetch failed");
  return (await res.json()).access_token;
}

async function fetchRole(projectId, accessToken, uid, email = null) {
  // 1. Try UID lookup
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  let res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.ok) {
    const doc = await res.json();
    if (doc.fields?.role?.stringValue) return doc.fields.role.stringValue;
  }

  // 2. Try Email lookup (User's preferred schema)
  if (email) {
    url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${email}`;
    res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) {
      const doc = await res.json();
      if (doc.fields?.role?.stringValue) return doc.fields.role.stringValue;
    }
  }

  return null;
}

function isAdmin(email) {
  if (!email) return false;
  const adminEmails = [
    "abhishek.dutta1996@gmail.com",
    "abhishekdutta18@gmail.com",
    "abhishek@blogspro.com",
    "abhishek.dutta1996@admin.blogspro.in"
  ];
  return adminEmails.includes(email.toLowerCase());
}

function jsonResponse(body, status = 200, headers = {}, req = null) {
  const origin = req?.headers.get("Origin");
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin || "https://blogspro.in",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...headers },
  });
}

function setSessionCookie(jwt) {
  return {
    "Set-Cookie": `bp_session=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`,
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const FRONTEND_URL = "https://blogspro.in";

    // CORS Preflight
    if (req.method === "OPTIONS") {
      const origin = req.headers.get("Origin");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin || "https://blogspro.in",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Health
    if (path === "/health") return jsonResponse({ ok: true, ts: Date.now() }, 200, {}, req);

    // Parse service account & config
    let serviceAccount = null;
    try { 
      if (env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); 
      }
    } catch (e) {
      return jsonResponse({ error: `Service Account JSON Parse Error: ${e.message}` }, 400, {}, req);
    }

    const projectId = env.FIREBASE_PROJECT_ID || serviceAccount?.project_id;
    const sessionSecret = env.SESSION_SECRET;
    const webApiKey = env.FIREBASE_WEB_API_KEY;
    const googleId = env.GOOGLE_CLIENT_ID;
    const googleSecret = env.GOOGLE_CLIENT_SECRET;
    const githubId = env.GITHUB_CLIENT_ID;
    const githubSecret = env.GITHUB_CLIENT_SECRET;

    // Diagnostic Check: Pinpoint missing secrets causing 404
    if (!serviceAccount?.private_key || !sessionSecret || !projectId || !webApiKey || !googleId || !googleSecret || !githubId || !githubSecret) {
      const missing = [];
      if (!serviceAccount?.private_key) missing.push("FIREBASE_SERVICE_ACCOUNT (private_key)");
      if (!sessionSecret) missing.push("SESSION_SECRET");
      if (!projectId) missing.push("FIREBASE_PROJECT_ID");
      if (!webApiKey) missing.push("FIREBASE_WEB_API_KEY");
      if (!googleId) missing.push("GOOGLE_CLIENT_ID");
      if (!googleSecret) missing.push("GOOGLE_CLIENT_SECRET");
      if (!githubId) missing.push("GITHUB_CLIENT_ID");
      if (!githubSecret) missing.push("GITHUB_CLIENT_SECRET");
      
      return jsonResponse({ 
        error: "Auth Proxy Misconfigured", 
        missing,
        env_keys: Object.keys(env)
      }, 404, {}, req);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Session Extraction (Hybrid: Cookie OR Authorization Header)
    // ─────────────────────────────────────────────────────────────────────────
    let payload = null;
    const authHeader = req.headers.get("Authorization");
    const cookieHeader = req.headers.get("Cookie") || "";
    
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      // Try verifying as Proxy JWT first, then as Firebase ID Token
      payload = await verifyJwt(token, sessionSecret);
      if (!payload) {
        const fbUser = await verifyFirebaseIdToken(token, projectId);
        if (fbUser) {
          payload = { uid: fbUser.uid, email: fbUser.email, isFirebase: true };
        }
      }
    }
    
    if (!payload) {
      const match = cookieHeader.match(/bp_session=([^;]+)/);
      if (match) payload = await verifyJwt(match[1], sessionSecret);
    }

    // Role Resolution
    let role = payload?.role || "reader";
    if (payload && (!payload.role || payload.role === "reader")) {
      if (isAdmin(payload.email)) {
        role = "admin";
      } else if (!payload.role) {
        try {
          const accessToken = await getAccessToken(serviceAccount);
          const fRole = await fetchRole(projectId, accessToken, payload.uid, payload.email);
          if (fRole) role = fRole;
        } catch (e) {}
      }
      payload.role = role;
    }

    // ── Firestore helpers ─────────────────────────────────────────────────────
    const fsVal = (v) => {
      if (!v) return null;
      if (v.stringValue !== undefined) return v.stringValue;
      if (v.integerValue !== undefined) return Number(v.integerValue);
      if (v.doubleValue !== undefined) return v.doubleValue;
      if (v.booleanValue !== undefined) return v.booleanValue;
      if (v.timestampValue !== undefined) return v.timestampValue;
      if (v.nullValue !== undefined) return null;
      if (v.arrayValue) return (v.arrayValue.values || []).map(fsVal);
      if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, w]) => [k, fsVal(w)]));
      return null;
    };
    const fsDoc = (doc) => {
      if (!doc?.fields) return null;
      const obj = doc.name ? { _id: doc.name.split("/").pop() } : {};
      for (const [k, v] of Object.entries(doc.fields)) obj[k] = fsVal(v);
      return obj;
    };
    const fsGet = async (col, docId) => {
      const token = await getAccessToken(serviceAccount);
      const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}/${docId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return null;
      return fsDoc(await r.json());
    };
    const fsCreate = async (col, docId, data) => {
      const token = await getAccessToken(serviceAccount);
      const fields = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === "string") fields[k] = { stringValue: v };
        else if (typeof v === "number") fields[k] = { doubleValue: v };
        else if (typeof v === "boolean") fields[k] = { booleanValue: v };
      }
      const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}?documentId=${docId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        }
      );
      return r.ok;
    };
    const fsQuery = async (col, opts = {}) => {
      const token = await getAccessToken(serviceAccount);
      const [orderField, orderDir] = (opts.orderBy || "").split(" ");
      const q = { structuredQuery: { from: [{ collectionId: col }] } };
      if (orderField) q.structuredQuery.orderBy = [{ field: { fieldPath: orderField }, direction: orderDir === "desc" ? "DESCENDING" : "ASCENDING" }];
      if (opts.limit) q.structuredQuery.limit = Number(opts.limit);
      const r = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
        { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(q) }
      );
      if (!r.ok) return [];
      const rows = await r.json();
      return (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => fsDoc(x.document)).filter(Boolean);
    };

    // ── Public Data Routes (no session required) ──────────────────────────────
    const PUBLIC_COLLECTIONS = new Set(["posts", "site", "pulse_briefings", "articles"]);
    if (path.startsWith("/api/public/data/") && serviceAccount?.private_key && projectId) {
      const seg = path.slice("/api/public/data/".length).split("/").filter(Boolean);
      const col = seg[0];
      const docId = seg[1];
      if (!col || !PUBLIC_COLLECTIONS.has(col)) return jsonResponse({ error: "Not found" }, 404, {}, req);
      try {
        const opts = Object.fromEntries(url.searchParams);
        if (docId) {
          const doc = await fsGet(col, docId);
          if (!doc) return jsonResponse({ error: "Not found" }, 404, {}, req);
          return jsonResponse(doc, 200, { "Cache-Control": "public, max-age=60" }, req);
        }
        const docs = await fsQuery(col, opts);
        return jsonResponse(docs, 200, { "Cache-Control": "public, max-age=30" }, req);
      } catch (e) {
        return jsonResponse({ error: "Data unavailable" }, 503, {}, req);
      }
    }

    // ── Authenticated Data Routes ─────────────────────────────────────────────
    if (path.startsWith("/api/data/") && serviceAccount?.private_key && projectId) {
      const seg = path.slice("/api/data/".length).split("/").filter(Boolean);
      const col = seg[0];
      const docId = seg[1];
      if (!col) return jsonResponse({ error: "Not found" }, 404, {}, req);
      try {
        const opts = Object.fromEntries(url.searchParams);
        if (req.method === "GET") {
          if (docId) {
            const doc = await fsGet(col, docId);
            if (!doc) return jsonResponse({ error: "Not found" }, 404, {}, req);
            return jsonResponse(doc, 200, { "Cache-Control": "private, max-age=10" }, req);
          }
          const docs = await fsQuery(col, opts);
          return jsonResponse(docs, 200, { "Cache-Control": "private, max-age=10" }, req);
        }
      } catch (e) {
        return jsonResponse({ error: "Data unavailable" }, 503, {}, req);
      }
    }


    // Login
    if (path === "/auth/login" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email, password } = body;
      if (!email || !password) return jsonResponse({ error: "Email and password required" }, 400, {}, req);

      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_WEB_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return jsonResponse({ error: err.error?.message || "Auth failed" }, 401, {}, req);
      }
      const data = await res.json();
      const uid = data.localId;
      const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);

      let role = null;
      try {
        const token = await getAccessToken(sa);
        role = await fetchRole(projectId, token, uid, email);
      } catch (e) {}
      if (role !== "admin") return jsonResponse({ error: "Unauthorized" }, 403, {}, req);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return jsonResponse({ success: true, role }, 200, setSessionCookie(jwt), req);
    }

    // Google Callback (GSI login_uri)
    if (path === "/auth/callback/google" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const credential = formData.get("credential");
        if (!credential) return jsonResponse({ error: "No credential received" }, 400, {}, req);

        const googleUser = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
        if (!googleUser) return jsonResponse({ error: "Invalid Google token" }, 401, {}, req);

        const { uid, email } = googleUser;
        const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
        
        let role = null;
        try {
          const accessToken = await getAccessToken(sa);
          role = await fetchRole(env.FIREBASE_PROJECT_ID, accessToken, uid, email);
        } catch (e) {
          console.error("Role fetch error:", e);
        }

        // Auto-admin for primary account, otherwise default
        if (isAdmin(email)) {
          role = "admin";
        }
        
        const jwt = await signJwt({ uid, email, role: role || "reader" }, sessionSecret);
        
        // Redirect back to admin or home
        const redirectUrl = role === "admin" ? "https://blogspro.in/admin.html" : "https://blogspro.in/";
        return new Response(null, {
          status: 303,
          headers: {
            "Location": redirectUrl,
            ...setSessionCookie(jwt)
          }
        });
      } catch (e) {
        return jsonResponse({ error: "Callback processing failed" }, 500, {}, req);
      }
    }

    // Register
    if (path === "/auth/register" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { name, email, password, requestedRole } = body;
      if (!name || !email || !password) return jsonResponse({ error: "Name, email and password required" }, 400, {}, req);

      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.FIREBASE_WEB_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return jsonResponse({ error: err.error?.message || "Registration failed" }, 401, {}, req);
      }
      const data = await res.json();
      const uid = data.localId;
      
      const role = isAdmin(email) ? "admin" : (requestedRole || "reader");
      await fsCreate("users", uid, { name, email, role, createdAt: new Date().toISOString() });

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return jsonResponse({ success: true, role }, 200, setSessionCookie(jwt), req);
    }

    // Logout
    if (path === "/auth/logout" && req.method === "POST") {
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": "bp_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" },
      });
    }

    // Me
    if (path === "/auth/me" && req.method === "GET") {
      if (!payload) return jsonResponse({ authenticated: false }, 200, {}, req);
      return jsonResponse({ authenticated: true, user: { uid: payload.uid, email: payload.email, role: payload.role } }, 200, {}, req);
    }

    // ── TEST BENCH GATED ROUTES (Admin Only) ──────────────────────────────────
    if (path.startsWith("/api/testbench")) {
      if (role !== "admin") return jsonResponse({ error: "Access Denied: Admin role required for Test Bench" }, 403, {}, req);
      
      const PULSE_URL = env.PULSE_URL || "https://blogspro-pulse.abhishek-dutta1996.workers.dev";
      
      // Proxy Audit Request
      if (path === "/api/testbench/audit" && req.method === "POST") {
        const body = await req.json();
        const res = await fetch(`${PULSE_URL}/api/internal/audit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.INTERNAL_ACCESS_TOKEN || ''}` },
          body: JSON.stringify(body)
        });
        return new Response(res.body, { status: res.status, headers: { ...res.headers, "Access-Control-Allow-Origin": "*" } });
      }

      // Proxy Tracer Logs
      if (path === "/api/testbench/tracer") {
        const res = await fetch(`${PULSE_URL}/api/swarm/telemetry`, {
          headers: { "Authorization": `Bearer ${env.INTERNAL_ACCESS_TOKEN || ''}` }
        });
        return new Response(res.body, { status: res.status, headers: { ...res.headers, "Access-Control-Allow-Origin": "*" } });
      }
    }

    return jsonResponse({ error: "Not found" }, 404, {}, req);
  },
};
