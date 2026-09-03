/**
 * ui-utils.js — Global non-module utilities
 *
 * These functions are assigned to 'window' to be accessible
 * from inline 'onclick' handlers regardless of module loading status.
 */

(function () {
  // ── Theme Toggle Logic ──────────────────────────────────────────────
  window.toggleTheme = function () {
    document.body.classList.toggle("light");
    const isLight = document.body.classList.contains("light");
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) {
      themeBtn.textContent = isLight ? "🌙" : "☀️";
    }
    localStorage.setItem("bpTheme", isLight ? "light" : "dark");

    // Dispatch event for other modules
    window.dispatchEvent(
      new CustomEvent("themeChanged", {
        detail: { theme: isLight ? "light" : "dark" },
      }),
    );
  };

  // Initialize theme immediately to prevent FOIT
  if (localStorage.getItem("bpTheme") === "light") {
    document.body.classList.add("light");
  }

  // ── Scroll Progress Logic ───────────────────────────────────────────
  // ⚡ Bolt: Performance optimization
  // What: Batched layout reads and DOM updates in requestAnimationFrame with a ticking flag. Added { passive: true }.
  // Why: Synchronous layout reads (scrollTop, scrollHeight) on scroll block the main thread and cause layout thrashing.
  // Impact: Ensures layout calculation runs at most once per frame, leading to smooth 60fps scrolling and preventing main thread blocking.
  let ticking = false;
  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        window.requestAnimationFrame(function () {
          const progress = document.getElementById("progress");
          if (progress) {
            const el = document.documentElement;
            const scrollTop = el.scrollTop || document.body.scrollTop;
            const scrollHeight = el.scrollHeight || document.body.scrollHeight;
            const clientHeight = el.clientHeight;

            const scrolled = (scrollTop / (scrollHeight - clientHeight)) * 100;
            progress.style.width = Math.min(scrolled, 100) + "%";
          }
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );

  console.log("[BlogsPro] UI Utils loaded.");
})();
