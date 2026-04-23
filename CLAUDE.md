# BlogsPro — Claude Code Context

## Project Overview
AI-powered institutional intelligence pipeline built on Firebase + GitHub Pages + Cloudflare Workers + GKE.

- **Live site:** https://blogspro.in
- **Firebase project:** `blogspro-ai`
- **Cloudflare account:** `b3f4edff1fdc616f329e7d7cb6698307`

## Architecture

| Layer | Technology |
|-------|-----------|
| Hosting | GitHub Pages |
| Database | Firebase Firestore |
| Auth | Firebase Auth |
| Edge Workers | Cloudflare Workers (3 workers) |
| Email | Resend API (`newsletter@mail.blogspro.in`) |
| Error Monitoring | Sentry |
| AI Orchestration | Vertex AI / Model Garden (GKE Workload Identity) |
| AI Fleet | Gemini 1.5 Pro/Flash, Claude 3.5 Sonnet, Llama 405B, Mistral Large (via Vertex MaaS) |
| Secondary AI | Cerebras, Groq, SambaNova, Cloudflare Workers AI, HuggingFace |
| Container Orchestration | Google Kubernetes Engine (GKE) |
| CI/CD | GitHub Actions |

## Swarm Intelligence Pipeline

The core value engine. Generates institutional-grade AI intelligence on 4 frequencies:

| Frequency | Target | Output |
|-----------|--------|--------|
| Hourly | 1000-word briefing | `briefings/hourly/` |
| Daily | Strategic briefing | `briefings/daily/` |
| Weekly | Research manuscript | `articles/weekly/` |
| Monthly | Strategic tome | `articles/monthly/` |

### Key Pipeline Files

| File | Purpose |
|------|---------|
| `scripts/lib/ai-service.js` | AI fleet management, model rotation, Vertex AI integration |
| `scripts/lib/swarm-orchestrator.js` | Multi-agent swarm synthesis, hourly/daily generation |
| `scripts/generate-institutional-tome.js` | Master pipeline orchestrator (all frequencies) |
| `scripts/PROD_LAUNCH.mjs` | Production cascade launcher |
| `scripts/lib/storage-bridge.js` | Firebase/GCS persistence layer |
| `scripts/lib/templates.js` | Institutional HTML templating |
| `scripts/lib/briefing-template.js` | Hourly/daily briefing template |
| `scripts/lib/news-orchestrator.js` | Live news acquisition for pulse priming |

### Pipeline Execution
```bash
# Single frequency
node scripts/generate-institutional-tome.js --freq=hourly --force
node scripts/generate-institutional-tome.js --freq=daily --force

# Full cascade
node scripts/PROD_LAUNCH.mjs
```

### Institutional Persona
- **Tone**: Truth-First, Data-Driven, Cynical
- **Constraint**: NEVER mention "BlogsPro" in generated content body
- **Format**: Professional institutional synthesis, cold authoritative voice

## Cloudflare Workers

| Worker | Config | Purpose |
|--------|--------|---------|
| `blogspro-newsletter` | `wrangler.toml` | Newsletter sending via Resend Batch API |
| `blogspro-seo-worker` | `wrangler-seo.toml` | SEO meta tag injection for post pages |
| `blogspro-sentry-webhook` | `workers/sentry/wrangler.toml` | Sentry webhook → Telegram alerts + GitHub issue auto-creation |

## Key Directories

```
scripts/lib/      AI pipeline core (ai-service.js, swarm-orchestrator.js)
scripts/          Pipeline scripts and utilities
api/              Cloudflare Worker source files
js/               Frontend JavaScript modules
k8s/              Kubernetes manifests
mirofish/         Python backend (FastAPI)
briefings/        Generated hourly/daily briefings
articles/         Generated weekly/monthly manuscripts
dist/             Build output (archived manuscripts)
p/                Generated static SEO pages
workers/sentry/   Sentry webhook worker
.github/workflows GitHub Actions CI/CD pipelines
```

## GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy.yml` | push main | Deploy GitHub Pages |
| `deploy-newsletter.yml` | push `api/newsletter-worker.js` | Deploy newsletter worker |
| `deploy-seo.yml` | push `api/seo-worker.js` | Deploy SEO worker |
| `deploy-sentry.yml` | push `workers/sentry/` | Deploy Sentry webhook worker |
| `seo-build.yml` | cron `*/30 * * * *` | Generate static pages + sitemap |
| `manual-dispatch.yml` | manual | Trigger swarm pipeline runs |

## MCP Servers

Configured in `.claude/settings.json`. Requires these env vars set locally:

```bash
export FIREBASE_SERVICE_ACCOUNT_KEY_PATH="/path/to/service-account.json"
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_..."
export RESEND_API_KEY="re_..."
export SENTRY_AUTH_TOKEN="sntrys_..."
export CLOUDFLARE_API_TOKEN="..."
```

### What each MCP server can do

- **firebase** — Read/write Firestore (posts, subscribers, users, ai_memory, swarm telemetry, prompts)
- **github** — Manage PRs, issues, Actions workflow runs for `abhishekdutta18/blogspro`
- **resend** — Send emails, manage subscriber contacts, create broadcast campaigns
- **sentry** — Query errors, triage issues, view event details for BlogsPro project
- **cloudflare** — Deploy/manage workers, DNS, R2, Zero Trust

## Firestore Collections

| Collection | Purpose |
|-----------|---------|
| `posts` | Published articles and briefings |
| `posts/{id}/comments` | Post comments |
| `subscribers` | Newsletter signups |
| `users` | User profiles |
| `ai_memory` | AI pipeline state persistence |
| `site` | Site configuration |
| `swarm_telemetry` | Pipeline execution logs |
| `swarm_fragments` | Research fragment persistence |
| `prompts` | Server-managed prompt templates |

## Development Conventions
- Feature branches: `claude/general-session-<id>`
- Always push to feature branch and open PR → `main`
- No local AI fallbacks — all AI routing goes through Vertex AI / Model Garden
- 65s fleet exhaustion recovery pause (institutional standard)
- Absolute pathing (`process.cwd()`) enforced in all pipeline scripts
