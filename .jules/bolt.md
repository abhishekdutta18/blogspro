## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-05-27 - Scroll Event Optimization
**Learning:** Synchronous operations that read layout properties (like `scrollHeight`, `clientHeight`) in high-frequency event listeners (like `scroll`) can cause severe layout thrashing and block the main thread.
**Action:** Optimize high-frequency event listeners by wrapping the DOM read/write logic in `window.requestAnimationFrame()` with a `ticking` flag, and always pass `{ passive: true }` to tell the browser the listener won't call `preventDefault()`, enabling smoother hardware-accelerated scrolling.
## 2024-05-28 - Fixing upstox CI deploy issue
**Learning:** The GitHub CI flow for deploying `blogspro-upstox` failed because it was referencing a non-existent `wrangler.upstox.toml` file.
**Action:** Modified `.github/workflows/deploy-upstox.yml` to reference `wrangler.toml`.
