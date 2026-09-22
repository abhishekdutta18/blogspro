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
  let isScrolling = false;
  window.addEventListener(
    "scroll",
    function () {
      if (!isScrolling) {
        window.requestAnimationFrame(function () {
          const progress = document.getElementById("progress");
          if (progress) {
            const el = document.documentElement;
            // Reading layout properties synchronously during scroll can cause layout thrashing.
            // Wrapped in requestAnimationFrame to execute during the next paint cycle.
            const scrollTop = el.scrollTop || document.body.scrollTop;
            const scrollHeight = el.scrollHeight || document.body.scrollHeight;
            const clientHeight = el.clientHeight;

            const scrolled = (scrollTop / (scrollHeight - clientHeight)) * 100;
            progress.style.width = Math.min(scrolled, 100) + "%";
          }
          isScrolling = false;
        });
        isScrolling = true;
      }
    },
    { passive: true },
  ); // Adding passive: true prevents the listener from blocking scrolling on main thread

  console.log("[BlogsPro] UI Utils loaded.");
})();
