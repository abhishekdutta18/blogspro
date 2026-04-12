import crypto from "node:crypto";

// v2 — deploy trigger for full secrets push
// Minimal JWT (HS256)
async function signJwt(payload, secret, expSeconds = 7 * 24 * 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expSeconds, ...payload };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const data = `${enc(header)}.${enc(body)}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const sig = crypto.createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  if (sig !== s) return null;
  const body = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

// Service account → access token for Firestore REST
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  })).toString("base64url");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key, "base64url");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${payload}.${signature}`
    })
  });
  if (!res.ok) throw new Error("token fetch failed");
  const data = await res.json();
  return data.access_token;
}

async function fetchRole(projectId, accessToken, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const doc = await res.json();
  return doc.fields?.role?.stringValue || null;
}

function jsonResponse(body, status = 200, headers = {}, req = null) {
  const origin = req?.headers.get("Origin");
  const corsHeaders = {
    // browser requirement: if credentials are true, origin cannot be '*'
    "Access-Control-Allow-Origin": origin || "https://blogspro.in", 
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...headers }
  });
}

function setSessionCookie(jwt) {
  return {
    "Set-Cookie": `bp_session=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

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
        }
      });
    }

    // Health
    if (path === "/health") return jsonResponse({ ok: true, ts: Date.now() }, 200, {}, req);

    // Parse service account & config
    let serviceAccount = null;
    try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || "{}"); } catch (e) {}
    const projectId = env.FIREBASE_PROJECT_ID || serviceAccount?.project_id;

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
      const obj = doc.name ? { _id: doc.name.split('/').pop() } : {};
      for (const [k, v] of Object.entries(doc.fields)) obj[k] = fsVal(v);
      return obj;
    };
    const fsGet = async (col, docId) => {
      const token = await getAccessToken(serviceAccount);
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${col}/${docId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      return fsDoc(await r.json());
    };
    const fsQuery = async (col, opts = {}) => {
      const token = await getAccessToken(serviceAccount);
      const [orderField, orderDir] = (opts.orderBy || '').split(' ');
      const q = { structuredQuery: { from: [{ collectionId: col }] } };
      if (orderField) q.structuredQuery.orderBy = [{ field: { fieldPath: orderField }, direction: orderDir === 'desc' ? 'DESCENDING' : 'ASCENDING' }];
      if (opts.limit) q.structuredQuery.limit = Number(opts.limit);
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      if (!r.ok) return [];
      const rows = await r.json();
      return (Array.isArray(rows) ? rows : []).filter(x => x.document).map(x => fsDoc(x.document)).filter(Boolean);
    };

    // ── Public Data Routes (no session required) ──────────────────────────────
    const PUBLIC_COLLECTIONS = new Set(['posts', 'site', 'pulse_briefings', 'articles']);
    if (path.startsWith('/api/public/data/') && serviceAccount?.private_key && projectId) {
      const seg = path.slice('/api/public/data/'.length).split('/').filter(Boolean);
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
    if (path.startsWith('/api/data/') && serviceAccount?.private_key && projectId) {
      const seg = path.slice('/api/data/'.length).split('/').filter(Boolean);
      const col = seg[0];
      const docId = seg[1];
      if (!col) return jsonResponse({ error: "Not found" }, 404, {}, req);
      try {
        const opts = Object.fromEntries(url.searchParams);
        if (req.method === 'GET') {
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

    const sessionSecret = env.SESSION_SECRET;
    if (!serviceAccount?.private_key || !sessionSecret || !projectId || !env.FIREBASE_WEB_API_KEY) {
    return jsonResponse({ error: "Not found" }, 404, {}, req);
    }

    // Login
    if (path === "/auth/login" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { email, password } = body;
      if (!email || !password) return jsonResponse({ error: "Email and password required" }, 400, {}, req);

      // Firebase Auth REST: signInWithPassword
      const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_WEB_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return jsonResponse({ error: err.error?.message || "Auth failed" }, 401, {}, req);
      }
      const data = await res.json();
      const uid = data.localId;

      // Role check via Firestore
      let role = null;
      try {
        const token = await getAccessToken(serviceAccount);
        role = await fetchRole(projectId, token, uid);
      } catch (e) {}
      if (role !== "admin") return jsonResponse({ error: "Unauthorized" }, 403, {}, req);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return jsonResponse({ success: true, role }, 200, setSessionCookie(jwt), req);
    }

    // Logout
    if (path === "/auth/logout" && req.method === "POST") {
      return new Response(null, { status: 204, headers: { "Set-Cookie": "bp_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax" } });
    }

    // Me
    if (path === "/auth/me" && req.method === "GET") {
      const cookie = req.headers.get("Cookie") || "";
      const match = cookie.match(/bp_session=([^;]+)/);
      if (!match) return jsonResponse({ authenticated: false }, 401, {}, req);
      const jwt = match[1];
      const payload = verifyJwt(jwt, sessionSecret);
      if (!payload) return jsonResponse({ authenticated: false }, 401, {}, req);
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
        state: redirect
      });
      return Response.redirect(googleAuthUrl);
    }

    // Google Callback
    if (path === "/auth/callback/google") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "/";
      if (!code) return Response.redirect(`${url.origin}/login.html?error=code_missing`);

      // Exchange code for token
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${url.origin}/auth/callback/google`,
          grant_type: "authorization_code"
        })
      });
      if (!tokenRes.ok) return Response.redirect(`${url.origin}/login.html?error=unauthorized`);
      const tokenData = await tokenRes.json();
      
      // Get user info from ID Token (simple parse)
      const idTokenParts = tokenData.id_token.split('.');
      const userInfo = JSON.parse(Buffer.from(idTokenParts[1], 'base64').toString());
      const uid = userInfo.sub;
      const email = userInfo.email;

      // Role check via Firestore
      let role = null;
      try {
        const token = await getAccessToken(serviceAccount);
        role = await fetchRole(projectId, token, uid);
      } catch (e) {}

      if (role !== "admin") return Response.redirect(`${url.origin}/login.html?error=unauthorized&reason=${role || 'missing_role'}`);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return new Response(null, {
        status: 302,
        headers: {
          "Location": state.startsWith("http") ? state : `${url.origin}/${state.replace(/^\//,'')}`,
          ...setSessionCookie(jwt)
        }
      });
    }

    // GitHub OAuth Redirect
    if (path === "/auth/login/github") {
      const redirect = url.searchParams.get("redirect") || "/";
      const githubAuthUrl = `https://github.com/login/oauth/authorize?` + new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: `${url.origin}/auth/callback/github`,
        scope: "read:user user:email",
        state: redirect
      });
      return Response.redirect(githubAuthUrl);
    }

    // GitHub Callback
    if (path === "/auth/callback/github") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "/";
      if (!code) return Response.redirect(`${url.origin}/login.html?error=code_missing`);

      // Exchange code for token
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code
        })
      });
      if (!tokenRes.ok) return Response.redirect(`${url.origin}/login.html?error=unauthorized`);
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Get user info
      const userRes = await fetch("https://api.github.com/user", {
        headers: { "Authorization": `token ${accessToken}`, "User-Agent": "BlogsPro-Auth-Proxy" }
      });
      const userData = await userRes.json();
      const uid = `github:${userData.id}`;
      const email = userData.email || `${userData.login}@github.com`;

      // Role check via Firestore
      let role = null;
      try {
        const token = await getAccessToken(serviceAccount);
        role = await fetchRole(projectId, token, uid);
      } catch (e) {}

      if (role !== "admin") return Response.redirect(`${url.origin}/login.html?error=unauthorized&reason=${role || 'missing_role'}`);

      const jwt = await signJwt({ uid, email, role }, sessionSecret);
      return new Response(null, {
        status: 302,
        headers: {
          "Location": state.startsWith("http") ? state : `${url.origin}/${state.replace(/^\//,'')}`,
          ...setSessionCookie(jwt)
        }
      });
    }

    return jsonResponse({ error: "Not found" }, 404, {}, req);
  }
};
