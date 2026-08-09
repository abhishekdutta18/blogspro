## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-06-14 - Optimize Scroll Events
**Learning:** Synchronous scroll event listeners that read DOM layout properties (`scrollTop`, `scrollHeight`, `clientHeight`) cause synchronous layout thrashing. The scroll event fires frequently and doing work on every fire can lead to jank.
**Action:** Optimize scroll events by wrapping the logic in `window.requestAnimationFrame()` with a `ticking` flag and passing `{ passive: true }` to the event listener options.
