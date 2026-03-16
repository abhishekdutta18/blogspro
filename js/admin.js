// ═══════════════════════════════════════
// admin.js — Main Admin Loader
// ═══════════════════════════════════════

// Core utilities
import "./config.js";

// Global state
import "./state.js";

// AI engine
import "./ai-core.js";

// Editor logic
import "./v2-editor.js";

// SEO tools
import "./seo-page.js";


// ═══════════════════════════════════════
// BASIC DASHBOARD INIT
// ═══════════════════════════════════════

import { state } from "./state.js";

function initDashboard() {

  const totalPosts = document.getElementById("totalPosts");
  const publishedPosts = document.getElementById("publishedPosts");
  const draftPosts = document.getElementById("draftPosts");
  const recentPosts = document.getElementById("recentPosts");

  if (!state.allPosts) return;

  if (totalPosts) totalPosts.textContent = state.allPosts.length;

  if (publishedPosts)
    publishedPosts.textContent =
      state.allPosts.filter(p => p.status === "published").length;

  if (draftPosts)
    draftPosts.textContent =
      state.allPosts.filter(p => p.status !== "published").length;

  if (recentPosts) {

    if (state.allPosts.length === 0) {

      recentPosts.innerHTML =
        `<tr><td colspan="5">No posts yet</td></tr>`;

      return;
    }

    recentPosts.innerHTML = state.allPosts
      .slice(-5)
      .reverse()
      .map(p => `
        <tr>
          <td>${p.title}</td>
          <td>${p.category || "General"}</td>
          <td>${p.status}</td>
          <td>${new Date(p.date).toLocaleDateString()}</td>
          <td>Edit</td>
        </tr>
      `)
      .join("");
  }
}


// Run dashboard when page loads
document.addEventListener("DOMContentLoaded", initDashboard);
