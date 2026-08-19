## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2026-08-19 - GitHub Actions paths
**Learning:** When configuring GitHub Actions paths for Cloudflare Workers deployments, if you split configurations or rename files (like moving env configs to `wrangler.toml` from `wrangler.upstox.toml`), you must update the CI workflow file to watch the new paths to trigger the deployment correctly.
**Action:** Verify the `paths` array in workflow files accurately reflects the location of the deployment configuration.
