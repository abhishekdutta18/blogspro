## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-19 - Scroll Event Performance
**Learning:** Synchronous layout reads (like `scrollHeight`, `clientHeight`) inside a `scroll` event handler cause forced synchronous layouts (layout thrashing) and block the main thread, leading to janky scrolling.
**Action:** Optimize scroll listeners by wrapping layout reads and DOM writes in `window.requestAnimationFrame()`, utilizing a `ticking` flag to prevent multiple frames from queueing up, and passing `{ passive: true }` to the event listener.
