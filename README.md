# BlogsPro

AI-powered fintech blog CMS with autonomous content generation, institutional research synthesis, and multi-agent consensus.

**Live site:** <https://blogspro.in>

---

## Architecture

| Layer | Technology |
| --- | --- |
| Hosting | GitHub Pages |
| Database | Firebase Firestore |
| Auth | Firebase Auth |
| Edge Workers | Cloudflare Workers |
| Email | Resend API (`newsletter@mail.blogspro.in`) |
| Error Monitoring | Sentry |
| AI | Groq (LLaMA), Gemini, Cerebras, OpenRouter |
| CI/CD | GitHub Actions |

---

## Cloudflare Workers

| Worker | Config | Purpose |
| --- | --- | --- |
| `blogspro-newsletter` | `wrangler.toml` | Newsletter sending via Resend Batch API |
| `blogspro-seo-worker` | `wrangler-seo.toml` | SEO meta tag injection for post pages |
| `blogspro-sentry-webhook` | `workers/sentry/wrangler.toml` | Sentry webhook → Telegram alerts + GitHub issue auto-creation |
| `blogspro-upstox` | `api/upstox-worker.js` | Upstox market data proxy |
| `kv-cache` | `api/kv-cache.js` | Cloudflare KV-backed caching layer |

---

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `deploy.yml` | push `main` | Deploy GitHub Pages |
| `deploy-newsletter.yml` | push `api/newsletter-worker.js` | Deploy newsletter worker |
| `deploy-seo.yml` | push `api/seo-worker.js` | Deploy SEO worker |
| `deploy-sentry.yml` | push `workers/sentry/` | Deploy Sentry webhook worker |
| `deploy-pulse.yml` | manual / schedule | Run swarm content generation pulse |
| `deploy-upstox.yml` | push `api/upstox-worker.js` | Deploy Upstox worker |
| `deploy-kv-cache.yml` | push `api/kv-cache.js` | Deploy KV cache worker |
| `seo-build.yml` | cron `*/30 * * * *` | Generate static SEO pages + sitemap |
| `institutional-research.yml` | schedule / manual | Run institutional manuscript swarm |
| `institutional-trials.yml` | manual | Dry-run institutional synthesis |
| `sentry-auto-resolve.yml` | webhook | Auto-create GitHub issues from Sentry errors |
| `sentry-monitor.yml` | schedule | Periodic Sentry health check |
| `firestore-rules-deploy.yml` | push `firestore.rules` | Deploy Firestore security rules |
| `sync-secrets.yml` | manual | Sync secrets across environments |
| `upstox-snapshot.yml` | schedule | Capture daily Upstox market snapshot |
| `kv-prewarm.yml` | schedule | Pre-warm Cloudflare KV cache |
| `dependabot-automerge.yml` | Dependabot PR | Auto-merge minor dependency updates |

---

## Key Directories

```text
api/              Cloudflare Worker source files
js/               Frontend JavaScript modules
scripts/          Node.js build and AI pipeline scripts
scripts/lib/      Shared services (AI balancer, Firebase, MiroFish QA)
p/                Generated static SEO pages (auto-committed by CI)
workers/sentry/   Sentry webhook worker
.github/workflows GitHub Actions CI/CD pipelines
```

---

## AI Pipeline — Swarm Architecture

The institutional content pipeline uses a hierarchical multi-agent swarm to synthesize long-form research manuscripts:

```mermaid
graph TD
    Trigger[GitHub Action / Pulse Dispatch] --> Orchestrator[Swarm Orchestrator]
    Orchestrator --> Researcher[Researcher Agent]
    subgraph Research_Intelligence
        Researcher --> Search[Gemini Fleet Search]
        Researcher --> Wire[News Wire Generator]
    end
    Researcher --> Brief[Research Brief]
    Brief --> Swarm[16-Vertical Swarm]
    subgraph Swarm_Verticals
        Swarm --> Drafter[Drafter Agent]
        Swarm --> Critic[Fidelity Critic]
    end
    Swarm_Verticals --> MiroFish[MiroFish Consensus QA]
    MiroFish --> Editor[Chief Editor]
    Editor --> Governor[Fidelity Governor]
    Governor --> Export[HTML / PDF Output]
    Export --> Firebase[Firebase Archival]
```

**AI Tiers:**

| Tier | Role | Provider |
| --- | --- | --- |
| Tier 1 (Cloud) | Core synthesis | Cerebras-70B, Gemini-1.5, Groq-70B |
| Tier 2 (Remote) | Bulk research | Ollama Prod (70B via Ngrok bridge) |
| Tier 3 (Local) | Utility & repair | Ollama Local, Cloudflare, HuggingFace |

**Core pipeline scripts:**

- `scripts/generate-institutional-tome.js` — primary synthesis engine
- `scripts/lib/ai-service.js` — AI balancer and node pool manager
- `scripts/lib/mirofish-qa-service.js` — multi-agent consensus auditor
- `scripts/lib/firebase-service.js` — telemetry and archival bridge

---

## Firestore Collections

| Collection | Access |
| --- | --- |
| `posts` | Public list/read (published only); admin full access |
| `posts/{id}/comments` | Public read; auth create |
| `subscribers` | Open (newsletter signups) |
| `users` | Own doc only; admin full access |
| `ai_memory` | Admin only |
| `site` | Public read; admin write |

---

## Local Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Firebase CLI (`npm install -g firebase-tools`)

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file (or pull secrets from the repo):

```bash
node scripts/pull-secrets.js
```

Required variables:

```env
FIREBASE_SERVICE_ACCOUNT_KEY_PATH=/path/to/service-account.json
GROQ_API_KEY=
GEMINI_API_KEY=
CEREBRAS_API_KEY=
OPENROUTER_API_KEY=
RESEND_API_KEY=
SENTRY_DSN=
CLOUDFLARE_API_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

### Audit AI nodes

```bash
node scripts/audit-ai-nodes.js
```

### Build static SEO pages

```bash
node scripts/build-static.js
```

### Generate a blog post

```bash
node scripts/generate-post.js
```

---

## MCP Servers (Claude Code)

Configured in `.claude/settings.json`. Provides Claude Code direct access to:

- **firebase** — Read/write Firestore
- **github** — Manage PRs, issues, Actions for `abhishekdutta18/blogspro`
- **resend** — Send emails, manage subscribers
- **sentry** — Query errors, triage issues
- **cloudflare** — Deploy workers, manage DNS and KV

---

## Security Audit Log

Continuous multi-round cynical audits run against the full codebase. Each round is committed and logged here.

### Round 0 — Post-Generation Pipeline (2026-04-17)

Files: `js/posts.js`, `js/ai-editor.js`, `js/ai-writer.js`, `js/ai-tools.js`, `admin.html`

| # | Severity | File | Finding | Fix |
| --- | -------- | ---- | ------- | --- |
| 1 | CRITICAL | `js/posts.js` | Hardcoded admin email bypass in `checkIfAdmin()` | Removed — role-only check |
| 2 | HIGH | `js/posts.js` | No minimum content gate before publish | Added 100-word floor |
| 3 | CRITICAL | `js/ai-editor.js` | XSS: AI JSON fields (`grade`, `strengths`, `improvements`) injected raw into `innerHTML` | Escaped; auto-fix enum whitelisted |
| 4 | CRITICAL | `js/ai-writer.js` | XSS: `err.message` and section `title` injected raw into `innerHTML` | Escaped with `_escMsg()` |
| 5 | HIGH | `js/ai-writer.js` | `clearJobState()` not called on catch — stale job blocks resume forever | Added to catch block |
| 6 | HIGH | `js/ai-writer.js` | `startIndex` not bounds-checked against `sections.length` — stale resume crashes | Added bounds check |
| 7 | MEDIUM | `js/ai-writer.js` | Chart generation failure silently swallowed | Now logs with `console.warn` |
| 8 | HIGH | `js/ai-tools.js` | No type validation or length limits on slug/tags/excerpt before Firestore write | Added sanitization + limits |
| 9 | HIGH | `js/ai-tools.js` | No duplicate slug guard in Auto Blog | Added slug collision check against `state.allPosts` |
| 10 | HIGH | `admin.html` | `savePostAndNotify()` was undefined — `ReferenceError` on every click | Implemented as publish + newsletter blast record |

Commit: `3c684cb`

---

### Round 1 — Full Codebase (2026-04-17)

Files: `js/editor.js`, `js/main.js`, `js/newsletter.js`, `js/worker-endpoints.js`, `js/seo-page.js`, `api/seo-worker.js`, `api/newsletter-worker.js`

| # | Severity | File | Finding | Fix |
| --- | -------- | ---- | ------- | --- |
| 1 | CRITICAL | `js/editor.js` | XSS: `editor.innerHTML = history[historyIndex]` in undo/redo without sanitization | Wrapped with `sanitize()` |
| 2 | CRITICAL | `js/editor.js` | URL injection: `window.prompt` image URL accepted any protocol including `javascript:` | Blocked — `https?://` required |
| 3 | HIGH | `js/editor.js` | URL injection: `insertLink` accepted `javascript:` / `data:` URLs via `createLink` | Same protocol gate added |
| 4 | HIGH | `js/main.js` | XSS: `err.message` injected raw into `document.body.innerHTML` on fatal boot error | Escaped with `_escHtml()` |
| 5 | HIGH | `js/newsletter.js` | XSS: `b.subject` from Firestore rendered raw into newsletter history `innerHTML` | Escaped with `_esc()` |
| 6 | HIGH | `js/worker-endpoints.js` | SSRF: `localStorage` override for worker URL accepted any protocol | Restricted to `https://` only |
| 7 | HIGH | `js/seo-page.js` | Attribute injection: `c.title` from AI JSON written raw into `data-title` attribute and `innerHTML` | Escaped with inline `_e()` |
| 8 | CRITICAL | `api/seo-worker.js` | XSS: Firestore `title`/`excerpt`/`author` interpolated raw into `<meta content="...">` HTML | HTML-entity encoded; banner URL protocol validated |
| 9 | HIGH | `api/newsletter-worker.js` | HTML injection: subscriber `name` from Firestore used raw in `replace(/{{NAME}}/g, ...)` in email HTML | Stripped HTML chars from name |
| 10 | HIGH | `api/newsletter-worker.js` | DoS: unbounded `do...while (pageToken)` loop could exhaust Worker memory on large subscriber lists | Capped at 50 pagination rounds |

Commit: `9f1d5b8`

---

### Round 2 — AI Core, Workers, Analytics (2026-04-17)

Files: `js/utils.js`, `api/telegram-hil.js`, `api/upstox-worker.js`

| # | Severity | File | Finding | Fix |
| --- | -------- | ---- | ------- | --- |
| 1 | CRITICAL | `js/utils.js` | Sanitize regex missed newline/tab-obfuscated `javascript:` in href/src (e.g. `href=" \njavascript:"`) | Regex updated to strip whitespace before protocol check; added `vbscript:` and `data:` |
| 2 | HIGH | `js/utils.js` | Event-handler regex `\s+on\w+\s*=` missed tab-separated handlers (`onload\t=`) | Regex updated to `[\s\t\r\n]+` |
| 3 | CRITICAL | `api/telegram-hil.js` | `JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)` with no error handling — malformed env var crashes entire Worker with 500 | Wrapped in `try/catch` — returns null gracefully |
| 4 | HIGH | `api/telegram-hil.js` | Job ID from Telegram callback taken verbatim from `data.split(':')[1]` — path traversal / injection into Firestore query | Stripped to `[a-zA-Z0-9_-]{0,64}` |
| 5 | HIGH | `api/telegram-hil.js` | `INNGEST_EVENT_KEY` appended raw to URL — if key contains `/` or `?`, breaks endpoint routing | `encodeURIComponent()` applied |
| 6 | HIGH | `api/upstox-worker.js` | CORS check via `origin.includes('blogspro.in')` bypassable with `evil.blogspro.in.attacker.com` | Replaced with exact `Set` allowlist |

Commit: `441ff16`

---

### Round 3 — Stored XSS, Public Mirror, API Workers (2026-04-17)

Files: `js/posts.js`, `public/js/posts.js`, `public/js/editor.js`, `public/js/main.js`, `api/newsletter-worker.js`, `api/seo-worker.js`

| # | Severity | File | Finding | Fix |
| --- | -------- | ---- | ------- | --- |
| 1 | CRITICAL | `js/posts.js` | Stored XSS: `editor.innerHTML = p.content` — Firestore post content rendered raw into admin editor | Wrapped with `sanitize()` |
| 2 | CRITICAL | `public/js/posts.js` | Same stored XSS in public mirror (unsynchronised with root `js/`) | Same fix applied |
| 3 | CRITICAL | `public/js/editor.js` | XSS: undo/redo without sanitize (public mirror missing Round-1 fix) | `sanitize()` added to both undo and redo |
| 4 | HIGH | `public/js/main.js` | XSS: `err.message` raw into DOM (public mirror missing Round-1 fix) | Escaped with `_escHtml()` |
| 5 | CRITICAL | `api/newsletter-worker.js` | Reflected XSS: `${email}` from URL query param rendered in HTML unsubscribe response | Removed email from response entirely |
| 6 | HIGH | `api/seo-worker.js` | Reflected XSS: `request.url` injected raw into `og:url` meta tag content attribute | Passed through `_attr()` encoder |

Commit: `9f57ec2`

---

### Round 4 — GitHub Actions & CI/CD (2026-04-17)

Files: `.github/workflows/deploy-pulse.yml`, `.github/workflows/manual-dispatch.yml`, `.github/workflows/institutional-research.yml`

| # | Severity | File | Finding | Fix |
| --- | -------- | ---- | ------- | --- |
| 1 | CRITICAL | `deploy-pulse.yml:122` | Hardcoded default secret `BPRO_SWARM_SECRET_2026` used as fallback when `SWARM_INTERNAL_TOKEN` secret is unset — anyone can impersonate the swarm auth | Removed fallback; secret must be explicitly set |
| 2 | CRITICAL | `manual-dispatch.yml:48` | Workflow `frequency` input interpolated directly into `run:` shell command without quoting — shell injection via crafted input value | Moved to `INPUT_FREQ` env var; quoted in all `run:` commands |
| 3 | CRITICAL | `manual-dispatch.yml:84,134` | `FREQ="${{ github.event.inputs.frequency }}"` — same unquoted interpolation in consolidator phase | Fixed: reads from `$INPUT_FREQ` env var |
| 4 | HIGH | `institutional-research.yml:88` | `--freq=${{ inputs.freq }} --type=${{ inputs.type }}` in `run:` step — unquoted injection vector | Quoted both arguments |
| 5 | HIGH | Multiple workflows | Third-party actions pinned to major version tags (`@v3`, `@v2`) not commit SHAs — susceptible to tag-jacking | Documented; SHA pinning recommended for future |
| 6 | HIGH | Multiple workflows | `npm install` without `--ignore-scripts` in CI — postinstall scripts run with access to all injected secrets | Documented; migrate to `npm ci` |

Commit: `9f57ec2`

---

## License

MIT
