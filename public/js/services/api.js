// ═══════════════════════════════════════════════
// api.js — Centralized API Service for BlogsPro (Proxy-based)
// Handles Auth, Data, and Swarm operations via the server-side worker.
// ═══════════════════════════════════════════════

const API_BASE = "https://blogspro-auth.abhishek-dutta1996.workers.dev";

async function fetchJson(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "API request failed");
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
    login: (email, password) => post("/auth/login", { email, password }),
    register: (name, email, password, requestedRole) => post("/auth/register", { name, email, password, requestedRole }),
    logout: () => fetchJson("/auth/logout", { method: "POST" }),
    me: () => fetchJson("/auth/me"),
    google: (redirect) => { window.location.href = `${API_BASE}/auth/login/google?redirect=${encodeURIComponent(redirect || window.location.href)}`; },
    github: (redirect) => { window.location.href = `${API_BASE}/auth/login/github?redirect=${encodeURIComponent(redirect || window.location.href)}`; },
    updateEmail: (email) => post("/auth/update-email", { email }),
    updatePassword: (password) => post("/auth/update-password", { password }),
    deleteAccount: () => post("/auth/delete", {}),
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
