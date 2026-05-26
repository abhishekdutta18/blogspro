## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2025-02-18 - Scroll Listener Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties like `scrollHeight` and `clientHeight` cause severe layout thrashing by forcing the browser to calculate styles repeatedly during scroll events.
**Action:** Optimize synchronous scroll listeners by wrapping the logic in `window.requestAnimationFrame()` with a ticking flag to throttle layout reads, and add `{ passive: true }` to the listener to prevent main thread blocking and ensure smooth scrolling.
