## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2024-05-19 - Scroll Event Listener Throttling
**Learning:** Attaching continuous layout recalculations (like `document.documentElement.scrollHeight` and DOM height calculations) directly to raw `scroll` events blocks the main thread, resulting in scrolling stutter and poor layout performance.
**Action:** Always wrap `scroll` event handlers that touch layout metrics or cause DOM updates inside `requestAnimationFrame`, use a ticking lock flag to prevent queuing too many updates, and ensure `addEventListener('scroll', fn, { passive: true })` is used.
