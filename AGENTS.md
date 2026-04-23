# AGENTS.md — BlogsPro Cross-Tool Agent Context

> Universal context file for AI coding tools (Claude Code, Codex, Cursor, OpenCode, Gemini CLI, Antigravity).

## Project Identity

**BlogsPro** is an autonomous AI intelligence pipeline that generates institutional-grade strategic research across 4 frequencies (hourly, daily, weekly, monthly). It runs on GKE with Vertex AI / Model Garden as the sovereign AI backbone.

## Core Principles

1. **Sovereign AI** — All AI routing through Vertex AI / Model Garden. No local fallbacks.
2. **Truth-First** — Generated content must be data-driven, cynical, and free of promotional language.
3. **Set and Forget** — The pipeline must run autonomously without manual intervention.
4. **Institutional Density** — Every word must carry analytical weight. No filler, no fluff.
5. **Plan Before Execute** — Complex pipeline changes require implementation plans and phased rollout.

## Architecture Quick Reference

- **Frontend**: Static HTML/CSS/JS on GitHub Pages
- **Backend**: Firebase Firestore + Cloudflare Workers
- **AI Pipeline**: Node.js scripts on GKE (Vertex AI, Gemini, Claude, Llama, Mistral)
- **Python Backend**: FastAPI (mirofish/)
- **CI/CD**: GitHub Actions

## Key Files for AI Tools

When making changes, always check these files first:

| Area | Files to Check |
|------|---------------|
| AI Fleet | `scripts/lib/ai-service.js` |
| Swarm Logic | `scripts/lib/swarm-orchestrator.js` |
| Pipeline Entry | `scripts/generate-institutional-tome.js` |
| Storage | `scripts/lib/storage-bridge.js` |
| Templates | `scripts/lib/templates.js`, `scripts/lib/briefing-template.js` |
| Frontend | `index.html`, `js/`, `css/` |
| Workers | `api/`, `workers/sentry/` |
| K8s | `k8s/`, `Dockerfile` |
| Config | `.env`, `package.json`, `firebase.json` |

## Agent Delegation Guide

| Task | Approach |
|------|----------|
| Pipeline debugging | Check `ai-service.js` fleet rotation and model identifiers first |
| Content quality issues | Review `swarm-orchestrator.js` prompt templates and word count targets |
| Deployment issues | Check `k8s/` manifests and `Dockerfile` |
| Frontend changes | Modify `index.html`, `js/`, `css/` — test locally before pushing |
| API/Worker changes | Modify `api/` files — deploy via corresponding GitHub Action |
| Database changes | Update `firestore.rules` — deploy via `firestore-rules-deploy.yml` |

## Development Rules

- **Never** introduce local AI dependencies (Ollama, localhost endpoints)
- **Always** normalize prompts to strings before sending to any AI provider
- **Always** use absolute paths (`process.cwd()`) in pipeline scripts
- **Always** maintain the 65s fleet exhaustion recovery pause
- **Never** mention "BlogsPro" in generated content body
- **Always** test pipeline changes with `--force` flag before production deployment

## Running the Pipeline

```bash
# Test a single frequency
node scripts/generate-institutional-tome.js --freq=hourly --force

# Full production cascade
node scripts/PROD_LAUNCH.mjs

# Dry run (no side effects)
node scripts/PROD_LAUNCH.mjs --dry-run
```
