## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-06-03 - Layout Thrashing in Scroll Listeners
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollHeight`, `clientHeight`, `scrollTop`) cause layout thrashing on the main thread, leading to jittery scrolling performance across the application.
**Action:** Optimize scroll event listeners by wrapping the layout measurement and DOM update logic in `window.requestAnimationFrame()` with a ticking flag, and pass `{ passive: true }` to the event listener options to prevent blocking the compositor thread.
