## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-07-01 - Synchronous Layout Reads in Scroll Events
**Learning:** Adding a scroll event listener that synchronously reads layout properties (such as `scrollTop`, `scrollHeight`, and `clientHeight`) causes layout thrashing and negatively impacts scrolling performance. This pattern blocked the main thread on every scroll tick.
**Action:** Always debounce or wrap scroll logic in `window.requestAnimationFrame()` using a ticking boolean flag, and mark the event listener as `{ passive: true }` to allow the browser to optimize scrolling.
