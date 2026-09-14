## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-09-14 - Scroll Event Layout Thrashing
**Learning:** Synchronous layout property reads (like `scrollHeight`, `clientHeight`, `scrollTop`) inside unthrottled `scroll` event listeners block the main thread and cause severe layout thrashing. This is a common performance bottleneck in UI logic such as scroll progress bars.
**Action:** Always optimize scroll event listeners by wrapping the synchronous DOM layout reads and updates within `window.requestAnimationFrame()` using a ticking flag to limit updates to the display refresh rate. Furthermore, always pass `{ passive: true }` to the event listener options to prevent blocking the compositor thread.
