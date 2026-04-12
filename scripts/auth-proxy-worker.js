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

      let role = null;
      try {
        const token = await getAccessToken(serviceAccount);
        role = await fetchRole(projectId, token, uid, email);
      } catch (e) {}
      if (role !== "admin") return jsonResponse({ error: "Unauthorized" }, 403, {}, req);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return jsonResponse({ success: true, role }, 200, setSessionCookie(jwt), req);
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
      
      const role = (email === "abhishekdutta18@gmail.com") ? "admin" : (requestedRole || "reader");
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
      const cookie = req.headers.get("Cookie") || "";
      const match = cookie.match(/bp_session=([^;]+)/);
      if (!match) return jsonResponse({ authenticated: false }, 200, {}, req);
      const payload = await verifyJwt(match[1], sessionSecret);
      if (!payload) return jsonResponse({ authenticated: false }, 200, {}, req);
      return jsonResponse({ authenticated: true, user: { uid: payload.uid, email: payload.email, role: payload.role } }, 200, {}, req);
    }

    // Google OAuth Redirect
    if (path === "/auth/login/google") {
      const redirect = url.searchParams.get("redirect") || "/";
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: `${url.origin}/auth/callback/google`,
        response_type: "code",
        scope: "openid email profile",
        state: redirect,
      });
      return Response.redirect(googleAuthUrl);
    }

    // Google Callback
    if (path === "/auth/callback/google") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "/";
      if (!code) return Response.redirect(`${FRONTEND_URL}/login.html?error=code_missing`);

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${url.origin}/auth/callback/google`,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) return Response.redirect(`${FRONTEND_URL}/login.html?error=unauthorized`);
      const tokenData = await tokenRes.json();

      const idTokenParts = tokenData.id_token.split(".");
      const userInfo = JSON.parse(fromB64url(idTokenParts[1]));
      const uid = userInfo.sub;
      const email = userInfo.email;

      let role = null;
      if (email === "abhishekdutta18@gmail.com" || email === "abhishek@blogspro.com" || email === "abhishek.dutta1996@gmail.com") {
        role = "admin";
      } else {
        try {
          const token = await getAccessToken(serviceAccount);
          role = await fetchRole(projectId, token, uid, email);
        } catch (e) {}
      }

      if (role !== "admin") return Response.redirect(`${FRONTEND_URL}/login.html?error=unauthorized&reason=${role || "missing_role"}`);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return new Response(null, {
        status: 302,
        headers: {
          Location: state.startsWith("http") ? state : `${FRONTEND_URL}/${state.replace(/^\//, "")}`,
          ...setSessionCookie(jwt),
        },
      });
    }

    // GitHub OAuth Redirect
    if (path === "/auth/login/github") {
      const redirect = url.searchParams.get("redirect") || "/";
      const githubAuthUrl = `https://github.com/login/oauth/authorize?` + new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${url.origin}/auth/callback/github`,
        scope: "read:user user:email",
        state: redirect,
      });
      return Response.redirect(githubAuthUrl);
    }

    // GitHub Callback
    if (path === "/auth/callback/github") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "/";
      if (!code) return Response.redirect(`${FRONTEND_URL}/login.html?error=code_missing`);

      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      if (!tokenRes.ok) return Response.redirect(`${FRONTEND_URL}/login.html?error=unauthorized`);
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${accessToken}`, "User-Agent": "BlogsPro-Auth-Proxy" },
      });
      const userData = await userRes.json();
      const uid = `github:${userData.id}`;
      const email = userData.email || `${userData.login}@github.com`;

      let role = null;
      if (userData.login === "abhishekdutta18" || email === "abhishekdutta18@gmail.com" || email === "abhishek@blogspro.com" || email === "abhishek.dutta1996@gmail.com") {
        role = "admin";
      } else {
        try {
          const token = await getAccessToken(serviceAccount);
          role = await fetchRole(projectId, token, uid, email);
        } catch (e) {}
      }

      if (role !== "admin") return Response.redirect(`${FRONTEND_URL}/login.html?error=unauthorized&reason=${role || "missing_role"}`);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return new Response(null, {
        status: 302,
        headers: {
          Location: state.startsWith("http") ? state : `${FRONTEND_URL}/${state.replace(/^\//, "")}`,
          ...setSessionCookie(jwt),
        },
      });
    }

    return jsonResponse({ error: "Not found" }, 404, {}, req);
  },
};
