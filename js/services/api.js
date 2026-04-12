// ═══════════════════════════════════════════════
// api.js — Centralized API Service for BlogsPro (Proxy-based)
// Handles Auth, Data, and Swarm operations via the server-side worker.
// ═══════════════════════════════════════════════

const API_BASE = "https://blogspro-auth.abhishek-dutta1996.workers.dev";

const FIREBASE_API_KEY = "AIzaSyDEUQApHIitL89yXcFq6vEY8yDKZBQYWBY";

async function fetchJson(url, options = {}) {
  const token = localStorage.getItem("fb_token");
  const isWorkerRequest = url.startsWith("/") && !url.includes("https://");
  
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token && isWorkerRequest) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const finalUrl = isWorkerRequest ? `${API_BASE}${url}` : url;
  
  const res = await fetch(finalUrl, {
    ...options,
    headers,
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error?.message || err.error || "API request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

async function post(url, data) {
  return fetchJson(url, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

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
    register: async (name, email, password) => {
      const res = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
        email, password, returnSecureToken: true
      });
      localStorage.setItem("fb_token", res.idToken);
      // Update display name
      await post(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`, {
        idToken: res.idToken, displayName: name, returnSecureToken: true
      });
      return res;
    },
    logout: () => {
      localStorage.removeItem("fb_token");
      // Optional: background logout on worker
      return fetchJson("/auth/logout", { method: "POST" }).catch(() => {});
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
  },
  data: {
    get: (col, id = null, opts = {}) => {
      let url = `/api/data/${col}`;
      if (id) url += `/${id}`;
      const params = new URLSearchParams(opts);
      const qs = params.toString();
      return fetchJson(qs ? `${url}?${qs}` : url);
    },
    getAll: (col, opts = {}) => api.data.get(col, null, opts),
    create: (col, data) => post(`/api/data/${col}`, data),
    // For convenience: save auto-picks create or update
    save: (col, id, data) => id ? patch(`/api/data/${col}/${id}`, data) : post(`/api/data/${col}`, data),
    update: (col, id, data) => patch(`/api/data/${col}/${id}`, data),
    delete: (col, id) => fetchJson(`/api/data/${col}/${id}`, { method: "DELETE" }),
    
    // Shortcuts for common collections
    posts: {
      getAll: (opts = {}) => api.data.get("posts", null, opts),
      get: (id) => api.data.get("posts", id),
      save: (id, data) => api.data.save("posts", id, data),
      delete: (id) => api.data.delete("posts", id),
    },
    users: {
       getAll: (opts = {}) => api.data.get("users", null, opts),
       get: (id) => api.data.get("users", id),
       updateRole: (id, role) => api.data.update("users", id, { role }),
    },
    subscribers: {
       getAll: (opts = {}) => api.data.get("subscribers", null, { orderBy: "createdAt desc" }),
       delete: (id) => api.data.delete("subscribers", id),
    },
    newsletter: {
       blasts: {
         getAll: (opts = {}) => api.data.get("newsletter_blasts", null, { orderBy: "sentAt desc", ...opts }),
         save: (data) => api.data.create("newsletter_blasts", data),
       }
    },
    swarm: {
       dispatch: (freq) => post(`/api/swarm/dispatch?freq=${freq}`, {}),
       telemetry: () => fetchJson("/api/swarm/telemetry"),
       triggerGithub: (data) => post("/api/swarm/api/trigger-github", data),
       archive: () => fetchJson("/api/swarm/archive"),
    }
  },
  public: {
    data: (col, id = null, opts = {}) => {
      let url = `/api/public/data/${col}`;
      if (id) url += `/${id}`;
      const params = new URLSearchParams(opts);
      const qs = params.toString();
      return fetchJson(qs ? `${url}?${qs}` : url);
    },
    trackView: (id) => post(`/api/public/track/view/${id}`, {}),
    subscribe: (email) => post(`/api/public/newsletter/subscribe`, { email })
  }
};
