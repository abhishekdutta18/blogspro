## 2024-05-18 - Heavy Event Listeners
**Learning:** Frequent `input` events in the editor and filtering fields caused UI stutter by invoking complex logic (e.g., serializing `editor.innerHTML`, calling filtering methods) on every keystroke. This blocks the main thread.
**Action:** Always wrap `input` event listeners that perform anything heavier than basic state updates with a `debounce` utility (e.g., 300-500ms delay).

## 2024-05-19 - Layout Thrashing in Scroll Events
**Learning:** Synchronous scroll event listeners that read layout properties like `scrollHeight` and `clientHeight` cause layout thrashing and block the main thread, especially when scrolling quickly.
**Action:** Optimize these by wrapping the read/write logic inside `window.requestAnimationFrame()` with a ticking flag to batch DOM updates, and pass `{ passive: true }` to the `addEventListener` options to prevent blocking the compositor thread.

## 2024-05-19 - Wrangler V3 Secret Put without Account ID
**Learning:** Running `npx wrangler@3 secret put` or `deploy` without an interactive prompt requires both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` explicitly defined in the environment. If `CLOUDFLARE_ACCOUNT_ID` is missing, the API call will fail with a 400 error (code 9106) due to missing account context, even if the token is valid.
**Action:** Always ensure `CLOUDFLARE_ACCOUNT_ID` is passed via `env` in GitHub Actions steps that run non-interactive `wrangler deploy` or `wrangler secret put` commands.

## 2024-05-19 - Wrangler V3 Action Usage
**Learning:** Running non-interactive Wrangler v3 deployments via manual bash commands requires careful environment variable propagation (like `CLOUDFLARE_ACCOUNT_ID`). Using the official `cloudflare/wrangler-action@v3` simplifies this by managing the authentication context internally.
**Action:** Use `cloudflare/wrangler-action@v3` for worker deployments in GitHub Actions instead of raw `npx wrangler deploy` commands to ensure robust authentication handling.
