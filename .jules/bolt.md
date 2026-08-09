## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-20 - Expensive Word Count Update Optimization
**Learning:** In rich text editors like `userEditor` (found in `dashboard.html` and `dashboard 2.html`), computing the word count on every `input` keystroke using `.innerText` and string manipulation blocked the main thread.
**Action:** When handling `input` events that involve expensive computations (like string splitting or DOM serialization), wrap the handler using the `debounce` utility from `js/utils.js` (e.g., 300ms delay) to prevent UI stutter and unnecessary overhead.
