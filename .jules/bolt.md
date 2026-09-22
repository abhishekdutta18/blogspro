## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-06-30 - Optimizing scroll listeners
**Learning:** Synchronous DOM reads (like `scrollHeight` and `clientHeight`) in scroll event listeners cause layout thrashing because they force the browser to synchronously calculate the layout on the main thread during high-frequency events.
**Action:** Use `requestAnimationFrame` with a ticking flag for scroll listeners to batch read/write operations and pass `{ passive: true }` to avoid blocking scrolling performance.
