## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## $(date +%Y-%m-%d) - Passive Scroll Listeners with rAF
**Learning:** Attaching synchronous `scroll` event listeners that recalculate layout properties (like `scrollHeight`, `clientHeight`) on every scroll tick causes significant layout thrashing and main thread blocking, leading to jittery scrolling.
**Action:** Always optimize heavy scroll or resize listeners by wrapping the DOM interaction inside a `window.requestAnimationFrame()` call with a ticking flag (`let isScrolling = false`), and always pass `{ passive: true }` to allow the browser's compositor to handle scrolling independently of the JavaScript event loop.
