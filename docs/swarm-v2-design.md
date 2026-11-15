# Swarm v2 — design

**Status:** draft, awaiting approval · **Date:** 2026-11-15

## Why

Google services are gone: Vertex AI, Gemini, Firebase/Firestore, GCS and GKE. The v1 swarm
(about 4,700 lines across `scripts/generate-institutional-tome.js`, `scripts/lib/swarm-orchestrator.js`,
`ai-service.js` and `storage-bridge.js`) is wired to every one of them. It also publishes by pushing JSON
files to GitHub, which races and fails (Sentry → issue #435). Patching it would mean keeping
four dead backends alive behind flags, so v2 is a rebuild.

## Decisions (agreed)

| Question | Decision |
|---|---|
| Where it runs | Oracle VPS, a systemd timer next to `server/` |
| Where output lands | SQLite documents in the `server/` database (collection `pulse_briefings`), read by the site live |
| AI providers | OpenAI-compatible APIs with keys already in `.env`: SambaNova, Groq, Mistral, OpenRouter (Cerebras dropped 2026-11-15) |

## Scope

**In:** hourly and daily briefings, end to end, on the VPS.

**Out for now (later phases):** weekly and monthly tomes, MCTS and ghost simulation, human-in-the-loop,
RL/"learning" persistence, PDF output, Telegram/newsletter fan-out. Each of these comes back only
when there is a concrete reason. None of them is needed to put a briefing on the site.

## Shape

A new package, `swarm/`, of small single-purpose modules. Nothing in it imports from `scripts/lib`.

```
swarm/
  bin/run.js            CLI: --freq=hourly|daily [--dry-run]
  src/config.js         env parsing + validation (fail fast on missing keys)
  src/llm/providers.js  provider table: base URL, model, key env name
  src/llm/client.js     one OpenAI-compatible chat call, timeout, typed errors
  src/llm/fleet.js      ordered fallback across providers; 65s pause only after all fail
  src/news/feeds.js     publisher RSS list (no Google News)
  src/news/fetch.js     fetch + parse + dedupe headlines, time-boxed
  src/pipeline/analyst.js    per-desk analysis (macro, rates/RBI, equities, commodities, FX)
  src/pipeline/editor.js     merge desk notes → one ~1000-word briefing
  src/pipeline/guard.js      output checks: length, no "BlogsPro", no empty sections
  src/store/briefings.js     upsert into pulse_briefings via server/src/documents.js
  deploy/swarm-hourly.{service,timer}, swarm-daily.{service,timer}
  test/                 node:test, fetch and LLM mocked
```

### Flow (one run)

1. Validate config. Exit non-zero and write nothing if keys are missing.
2. Fetch news from publisher RSS. If fewer than N headlines arrive, abort and leave the site on the last briefing.
3. Desk analysts run in parallel, each through the provider fleet.
4. The editor synthesises one briefing in the house persona (truth-first, data-driven, cold).
5. The guard validates it. A failed check means nothing is published (and no retry loop).
6. Upsert to `pulse_briefings` under a deterministic id: `H_YYYY-MM-DD_HH` or `D_YYYY-MM-DD`, in IST.
   Re-running the same hour overwrites instead of duplicating, so the run is idempotent.

### Briefing document

```json
{ "id": "H_2026-11-15_07", "frequency": "hourly", "title": "...", "summary": "...",
  "sections": [{ "heading": "...", "body": "markdown" }], "sources": [{ "title": "...", "url": "..." }],
  "model": "groq/llama-3.3-70b", "generatedAt": "ISO", "published": true }
```

The site renders it. There is no HTML in storage.

## What this fixes, and what it costs

- **#435 goes away by deletion.** No GitHub push, so there is no SHA race.
- **No secrets in CI.** Keys live only in the VPS env file.
- **Cost:** a single box. If the VPS is down, there are no briefings. Acceptable for a content site; the timer catches up on the next tick.
- **SQLite with two processes** (the API and the swarm) is fine: the server already enables WAL. The swarm
  also sets `busy_timeout` so a write during an API read waits instead of failing.

## Open points (defaults chosen; say if wrong)

1. **Google News RSS** is a free public feed, not GCP. Default: drop it anyway and use publisher feeds
   (LiveMint, Economic Times Markets, Moneycontrol, RBI press releases). That removes one more Google dependency.
2. **Frontend:** nothing in `frontend/src` reads `pulse_briefings` yet. A small "latest briefing" island
   on the Astro site is a separate follow-up step, not part of this package.
3. **v1 code** stays in place until v2 has run cleanly for a week. Then delete it, along with the stale
   workflows (`institutional-research.yml`, `manual-dispatch.yml`, `institutional-trials.yml`).
4. **CLAUDE.md** still says "all AI routing goes through Vertex AI". Update it when v2 lands.

## Build order

1. `llm/` + tests (provider fallback is the part most likely to break)
2. `news/` + tests
3. `pipeline/` + guard tests
4. `store/` against a temp SQLite file
5. `bin/run.js --dry-run` end to end, writing to a temp DB
6. systemd units + one supervised live hourly run on the VPS
