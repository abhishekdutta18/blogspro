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

## License

MIT
