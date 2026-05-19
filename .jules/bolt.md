## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2025-02-18 - Scroll Event Optimization
**Learning:** In `js/ui-utils.js`, the scroll event listener reading layout properties (`scrollTop`, `scrollHeight`, `clientHeight`) caused layout thrashing because it ran synchronously. The `sanitize` function in `js/utils.js` had a regex issue replacing tags and appending a `?` instead of properly closing the bracket.
**Action:** Always wrap layout property reads inside scroll listeners with `requestAnimationFrame` and a ticking flag, and pass `{ passive: true }` to the event listener options to prevent layout thrashing and improve scrolling performance. Fixed the tag replacement in `js/utils.js` to ensure tags are closed correctly.
