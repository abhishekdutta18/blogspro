## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-18 - Scroll Event Listener Layout Thrashing
**Learning:** Synchronous scroll event listeners that read layout properties (like `scrollTop`, `scrollHeight`, `clientHeight`) can cause severe layout thrashing by forcing the browser to perform synchronous layout recalculations on every single scroll frame.
**Action:** When implementing or fixing scroll event listeners that read layout properties or modify the DOM, always use a `ticking` flag to throttle updates, wrap the layout reads and DOM updates in `window.requestAnimationFrame()`, and pass `{ passive: true }` to the event listener options.
