## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-16 - [Optimize scroll listener performance]
**Learning:** Synchronous scroll event listeners that read layout properties like `scrollHeight` and `clientHeight` cause forced synchronous layouts (layout thrashing) and jank, especially during fast continuous scrolling.
**Action:** When adding scroll event listeners, always use `requestAnimationFrame` with a `ticking` flag to throttle layout reads/writes to the monitor's refresh rate, and pass `{ passive: true }` to unblock the main thread compositing.
