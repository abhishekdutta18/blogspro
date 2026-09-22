## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).
## 2026-06-16 - Manual Regex Replacements in Generated Files
**Learning:** Attempting to update minified, generated HTML files (e.g., in ) using  or  with multi-line regexes is highly brittle and error-prone. A missed closing brace or bracket can inject fatal s, breaking production pages.
**Action:** When a template changes (like ), rely on the build or regeneration script instead of patching the generated artifacts directly. If regenerating isn't possible and manual edits must be made, verify syntax meticulously in the actual modified file rather than blindly assuming the regex applied perfectly.
## 2024-05-18 - Manual Regex Replacements in Generated Files
**Learning:** Attempting to update minified, generated HTML files (e.g., in `p/`) using `sed` or `replace_with_git_merge_diff` with multi-line regexes is highly brittle and error-prone. A missed closing brace or bracket can inject fatal `SyntaxError`s, breaking production pages.
**Action:** When a template changes (like `scripts/templates/post.html`), rely on the build or regeneration script instead of patching the generated artifacts directly. If regenerating isn't possible and manual edits must be made, verify syntax meticulously in the actual modified file rather than blindly assuming the regex applied perfectly.
