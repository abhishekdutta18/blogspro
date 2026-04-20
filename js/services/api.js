// ═══════════════════════════════════════════════
// api.js — Centralized API Service for BlogsPro (Proxy-based)
// Handles Auth, Data, and Swarm operations via the server-side worker.
// ═══════════════════════════════════════════════

const API_BASE = "https://blogspro-auth.abhishek-dutta1996.workers.dev";
const NEWSLETTER_BASE = "https://blogspro-sentry-webhook.abhishek-dutta1996.workers.dev";
const FIREBASE_API_KEY = "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY";

const FIREBASE_ERROR_MESSAGES = {
  "EMAIL_NOT_FOUND": "No account found with this email address.",
  "INVALID_PASSWORD": "Incorrect password.",
  "INVALID_LOGIN_CREDENTIALS": "Incorrect email or password.",
  "USER_DISABLED": "This account has been disabled. Contact support.",
  "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many failed attempts. Please wait and try again.",
  "EMAIL_EXISTS": "An account with this email already exists.",
  "WEAK_PASSWORD": "Password is too weak. Use at least 8 characters.",
  "INVALID_EMAIL": "Please enter a valid email address.",
};

function mapFirebaseError(raw) {
  const code = raw?.error?.errors?.[0]?.message || raw?.error?.message || raw?.error || "";
  return FIREBASE_ERROR_MESSAGES[code] || code || "Request failed";
}

async function fetchWithRetry(url, options = {}, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return res;
            if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
                const delay = backoff * Math.pow(2, i);
                console.warn(`⏳ [API-Retry] Transient failure (${res.status}). Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            return res;
        } catch (e) {
            if (i === retries - 1) throw e;
            const delay = backoff * Math.pow(2, i);
            console.warn(`⏳ [API-Retry] Connection error. Retrying in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

/**
 * Robust JSON fetch wrapper with automatic auth header injection.
 * Supports both absolute and relative worker paths.
 */
async function fetchJson(url, options = {}, timeoutMs = 60000) {
  const token = localStorage.getItem("fb_token");
  const isInternal = url.startsWith("/") && !url.includes("://");
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token && isInternal) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const finalUrl = isInternal ? `${API_BASE}${url}` : url;
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithRetry(finalUrl, { 
      ...options, 
      headers,
      signal: controller.signal 
    });
    
    if (res.status === 204) return null;
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(mapFirebaseError(err));
    }
    
    return res.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out.");
    console.error(`[api] Request Failed: ${finalUrl}`, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
  }
}

async function post(url, data, options = {}) {
  return fetchJson(url, {
    method: "POST",
    body: JSON.stringify(data),
    ...options
  });
}

<<<<<<< HEAD
// ── Auth Service ─────────────────────────────────────────────────────────────
const auth = {
  login: async (email, password) => {
    const res = await post("/auth/login", { email, password });
    if (res.token) localStorage.setItem("fb_token", res.token);
    return res;
=======
async function patch(url, data) {
  return fetchJson(url, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export const api = {
  auth: {
    login: async (email, password) => {
      const res = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        email, password, returnSecureToken: true
      });
      localStorage.setItem("fb_token", res.idToken);
      return res;
    },
    register: async (name, email, password, role = 'reader') => {
      const res = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
        email, password, returnSecureToken: true
      });
      localStorage.setItem("fb_token", res.idToken);
      await post(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`, {
        idToken: res.idToken, displayName: name, returnSecureToken: true
      });
      // Create Firestore user document with requested role via worker
      await fetchJson("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, role }),
      }).catch(() => {}); // non-fatal: worker creates doc on first me() call too
      return res;
    },
    logout: async () => {
      localStorage.removeItem("fb_token");
      try {
        await fetchJson("/auth/logout", { method: "POST" }, 5000);
      } catch (_) {
        // Token already removed locally; worker-side cleanup is best-effort
      }
    },
    me: async () => {
      const token = localStorage.getItem("fb_token");
      if (!token) return { authenticated: false };
      return fetchJson("/auth/me"); // Worker will verify the Bearer token
    },
    google: (redirect) => {
       // Using a simplified direct redirect approach for the migration
       // Standard Firebase Google Auth involves a multi-step popup/redirect.
       // For this phase, we'll keep the specialized Google button logic in the HTML
       // but point it to a direct Firebase handshake if possible.
       // Actually, for simplicity and reliability, we'll implement a 'Firebase Auth Popup' helper in the frontend.
       console.log("Triggering Google Auth via Firebase REST...");
       window.location.href = `${API_BASE}/auth/login/google?redirect=${encodeURIComponent(redirect || window.location.href)}`;
    },
    github: (redirect) => {
       window.location.href = `${API_BASE}/auth/login/github?redirect=${encodeURIComponent(redirect || window.location.href)}`;
    },
    updateEmail: (email) => {
      const idToken = localStorage.getItem("fb_token");
      return post(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`, {
        idToken, email, returnSecureToken: true
      });
    },
    updatePassword: (password) => {
      const idToken = localStorage.getItem("fb_token");
      return post(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`, {
        idToken, password, returnSecureToken: true
      });
    },
    deleteAccount: () => {
      const idToken = localStorage.getItem("fb_token");
      return post(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_API_KEY}`, {
        idToken
      });
    },
>>>>>>> dispatch/hardened-groq
  },
  register: async (name, email, password) => {
    const res = await post("/auth/register", { name, email, password });
    if (res.token) localStorage.setItem("fb_token", res.token);
    return res;
  },
  logout: () => {
    localStorage.removeItem("fb_token");
    return fetchJson("/auth/logout", { method: "POST" }).catch(() => {});
  },
  me: async () => {
    const token = localStorage.getItem("fb_token");
    if (!token) return { authenticated: false };
    const res = await fetchJson("/auth/me");
    if (res.token) localStorage.setItem("fb_token", res.token);
    return res;
  },
  google: (redirect) => {
     window.location.href = `${API_BASE}/auth/login/google?redirect=${encodeURIComponent(redirect || window.location.href)}`;
  },
  github: (redirect) => {
     window.location.href = `${API_BASE}/auth/login/github?redirect=${encodeURIComponent(redirect || window.location.href)}`;
  }
};

// ── Data Service (Proxy for Dynamic Collections) ──────────────────────────────
const dataProxy = (publicMode = false) => {
  const base = publicMode ? "/api/public/data" : "/api/data";
  
  return new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== "string") return target[prop];

      // Pattern A: Direct Calls (e.g., api.data.get('posts', '123'))
      if (['get', 'list', 'getAll', 'update', 'delete', 'save'].includes(prop)) {
        return (coll, idOrData, paramsOrData) => {
          let url = `${base}/${coll}`;
          let options = {};

          if (prop === 'get') {
            if (idOrData) url += `/${idOrData}`;
            if (paramsOrData) url += '?' + new URLSearchParams(paramsOrData).toString();
            return fetchJson(url);
          }
          
          if (prop === 'list' || prop === 'getAll') {
            const qs = idOrData ? '?' + new URLSearchParams(idOrData).toString() : '';
            return fetchJson(`${url}${qs}`);
          }

          if (prop === 'save' || prop === 'update') {
             // Handle save(coll, id, data) or save(coll, data)
             const hasId = typeof idOrData === 'string';
             const finalUrl = hasId ? `${url}/${idOrData}` : url;
             const finalData = hasId ? paramsOrData : idOrData;
             return post(finalUrl, finalData, { method: hasId ? 'PUT' : 'POST' });
          }

          if (prop === 'delete') {
            return fetchJson(`${url}/${idOrData}`, { method: 'DELETE' });
          }
        };
      }

      // Pattern B: Scoped Collection Calls (e.g., api.data.posts.list())
      const collectionMethods = {
        get: (id, params) => {
          let url = `${base}/${prop}`;
          if (id) url += `/${id}`;
          if (params) url += '?' + new URLSearchParams(params).toString();
          return fetchJson(url);
        },
        list: (params) => {
          const qs = params ? '?' + new URLSearchParams(params).toString() : '';
          return fetchJson(`${base}/${prop}${qs}`);
        },
        save: (id, payload) => {
          const hasId = typeof id === 'string';
          const url = hasId ? `${base}/${prop}/${id}` : `${base}/${prop}`;
          const data = hasId ? payload : id;
          return post(url, data, { method: hasId ? 'PUT' : 'POST' });
        },
        getAll: (params) => {
          const qs = params ? '?' + new URLSearchParams(params).toString() : '';
          return fetchJson(`${base}/${prop}${qs}`);
        },
        delete: (id) => fetchJson(`${base}/${prop}/${id}`, { method: 'DELETE' })
      };

      // V12.5: Nested Proxy for collection-specific actions (e.g., api.data.swarm.dispatch())
      return new Proxy(collectionMethods, {
        get(target, method) {
          if (target[method]) return target[method];
          if (typeof method !== 'string') return target[method];
          // Route unknown methods as POST actions: api.data.coll.action() -> POST /api/data/coll/action
          return (payload) => post(`${base}/${prop}/${method}`, payload);
        }
      });
    }
  });
};

// ── Public Interface ──────────────────────────────────────────────────────────
const publicApi = {
  // Shorthand used by index.html: await api.public.data('posts')
  data: (col, id) => {
    const base = `/api/public/data/${col}`;
    return id ? fetchJson(`${base}/${id}`) : fetchJson(base);
  },
  subscribe: (email) => post(`${NEWSLETTER_BASE}/newsletter`, { 
    email, 
    source: window.location.hostname 
  }),
  calendar: () => fetchJson(`${API_BASE}/calendar`),
  indiaCalendar: () => fetchJson(`${API_BASE}/calendar-india`)
};

// ── Consolidated API Object ──────────────────────────────────────────────────
export const api = {
  auth,
  data: dataProxy(false),
  public: publicApi,
  testbench: {
    audit: (text, model) => post("/api/testbench/audit", { text, model }),
    tracer: () => fetchJson("/api/testbench/tracer")
  }
};

// Also expose public data on api.data.public for internal consistency
api.data.public = dataProxy(true);
