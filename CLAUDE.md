# BlogsPro — Claude Code Context

## Project Overview
AI-powered fintech blog CMS built on Firebase + GitHub Pages + Cloudflare Workers.

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
| AI | Groq (LLaMA), Gemini, OpenRouter |
| CI/CD | GitHub Actions |

## Cloudflare Workers

| Worker | Config | Purpose |
|--------|--------|---------|
| `blogspro-newsletter` | `wrangler.toml` | Newsletter sending via Resend Batch API |
| `blogspro-seo-worker` | `wrangler-seo.toml` | SEO meta tag injection for post pages |
| `blogspro-sentry-webhook` | `workers/sentry/wrangler.toml` | Sentry webhook → Telegram alerts + GitHub issue auto-creation |

## Key Directories

```
api/              Cloudflare Worker source files
js/               Frontend JavaScript modules
scripts/          Node.js build scripts (static pages + sitemap)
p/                Generated static SEO pages (auto-committed by CI)
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
| `sentry-auto-resolve.yml` | webhook | Auto-create GitHub issues from Sentry errors |
| `firestore-rules-deploy.yml` | push `firestore.rules` | Deploy Firestore security rules |

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

- **firebase** — Read/write Firestore (posts, subscribers, users, ai_memory, site config)
- **github** — Manage PRs, issues, Actions workflow runs for `abhishekdutta18/blogspro`
- **resend** — Send emails, manage subscriber contacts, create broadcast campaigns
- **sentry** — Query errors, triage issues, view event details for BlogsPro project
- **cloudflare** — Deploy/manage workers, DNS, R2, Zero Trust for account `b3f4edff1fdc616f329e7d7cb6698307`

## Firestore Collections

| Collection | Access |
|-----------|--------|
| `posts` | Public list/read (published only); admin full access |
| `posts/{id}/comments` | Public read; auth create |
| `subscribers` | Open (newsletter signups) |
| `users` | Own doc only; admin full access |
| `ai_memory` | Admin only |
| `site` | Public read; admin write |

## Development Branch Convention
Feature branches: `claude/general-session-<id>`
Always push to feature branch and open PR → `main`.
