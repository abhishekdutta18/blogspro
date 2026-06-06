## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2025-06-06 - [Passive scroll event listeners]
**Learning:** Adding passive: true to scroll listeners combined with requestAnimationFrame avoids blocking the main thread when layout calculations are read within the handler.
**Action:** When working on UI/frontend features and handling repetitive layout interactions like scroll, employ requestAnimationFrame explicitly and consider options like `{ passive: true }` so scroll rendering is not blocked by code execution.
