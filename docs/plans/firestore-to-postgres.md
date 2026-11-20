# Replace Firestore and Firebase Auth with Postgres on blogspro-ai-vps

Status: **approved 2026-11-20 — Stage 0 in progress**  ·  Date: 2026-11-20

## Why

Firestore's free daily quota runs out (`429 RESOURCE_EXHAUSTED`). When it does,
`scripts/build-static.js` fails and hourly runs are marked failed. Telemetry writes
have blocked publishing (one `SWARM_QA_COMPLETE` write held a run for ~11 minutes).

## Decisions (made by the user)

| Question | Answer |
|---|---|
| Replacement store | Postgres on `blogspro-ai-vps` (130.210.53.134) |
| Firebase Auth | Replace it |
| Login method | OAuth |
| Existing users | Recovered by email, no password carry-over |

**Interpretation to confirm:** login becomes Google OAuth (through `better-auth`)
plus an emailed sign-in link sent through Resend for anyone without a Google account.
No passwords are stored at all. Existing users are matched to their migrated
profile by verified email, so roles (`admin`, `editor`, `coauthor`, `reader`)
carry over. "Force reset by email" becomes a one-time Resend notice:
"sign in with Google or request a link".

## What we found

- **VPS:** Ubuntu 24.04, aarch64, 4 cores, 24 GB RAM, 84 GB free. nginx is
  active on 80/443. Postgres is **not installed**. Node v22.
- **Firestore call sites:** 20 live files.
  - Pipeline: `storage-bridge.js`, `storage-bridge-worker.js`,
    `firebase-service.js`, `prompt-manager.js`, `reinforcement.js`,
    `mirofish-qa-service.js`.
  - Build: `build-static.js`, `generate-sitemap.js`. They use the Firestore REST
    API and read every post each run.
  - Workers (REST API): `api/newsletter-worker.js`, `api/seo-worker.js`,
    `api/telegram-hil.js`, `workers/sentry/index.js`,
    `scripts/auth-proxy-worker.js`, `scripts/data-worker.js`,
    `scripts/pulse-worker.js`.
  - Frontend (client SDK 10.12.2): `js/firebase.js`, `js/init.js`,
    `js/posts.js`, `js/collections.js`, `auth.js`,
    `scripts/templates/post.html` (comments).
- **Collections:**
  - From the brief: posts, comments, subscribers, users, site, ai_memory, prompts,
    institutional_config, swarm_telemetry, swarm_fragments, telemetry_logs,
    pending_audits, latest_snapshots, pulse_briefings.
  - Found in code but missing from the brief: `institutional_audits` and `verticals`.
- **Auth:** email/password only, with roles enforced in `firestore.rules`.
  `auth-proxy-worker.js` calls identitytoolkit `signInWithPassword`.
- **Tests:** none (`npm test` exits 1). Stage 1 adds the harness.
- Over 30 one-off scripts and macOS duplicates (`prompt-manager 2.js`,
  `audit-site 2.mjs`, …) also touch Firestore. They are out of scope and get
  deleted in Stage 4.

## Architecture

```
 pipeline (systemd, ai-vps) ──pg (localhost)──┐
 build-static / sitemap    ──pg (localhost)──┤
                                             ▼
                                   Postgres 16 (127.0.0.1 only)
                                             ▲
 blogspro-api.service (127.0.0.1:8787) ──────┘  ← nginx blogspro.in/api/* behind Cloudflare
                                                ← frontend fetch + Workers (service token)
                                                ← better-auth (Google OAuth + email link)
```

- Postgres listens on localhost and its unix socket only, and the host firewall
  rejects 5432. Roles have no passwords; peer auth maps `ubuntu` to
  `blogspro_pipeline` and `blogspro-api` to `blogspro_api`.
- **The API extends the existing `blogspro-api.service`**, which already runs as
  its own user behind nginx at `/api/` and `/auth/`. There is no new port and no
  `api.blogspro.in`, and auth cookies stay same-origin. Proxying through
  blogspro-web-vps was rejected: this box already serves `blogspro.in` on 443, so
  the extra hop would add a dependency without removing any exposure.
- `/var/www/blogspro/.env` goes from 0644 to 0600, so the API user can no longer
  read pipeline secrets.
- One data-access module, `scripts/lib/db/`, holds a `pg` pool, a
  repository per aggregate, and plain-SQL migrations. The pipeline and the API
  both use it.
- Non-essential writes (telemetry, traces) are fire-and-forget with a 2 s
  timeout. They are dropped and logged, never awaited on the publish path.
- Backups run nightly at 03:00 IST:
  - `pg_dump`, then a restore into a scratch database with a table-set check, so
    every night is a restore test.
  - Encryption with `age` to a public key whose private key stays off the box.
  - Upload to R2, with a 14-day bucket lock and 30-day lifecycle.
  - Details in `deploy/vps/postgres/README.md`.

## Schema (first cut)

Typed tables where the shape is known and enforced today:

- `users` (id, email unique, name, role check in 4 values, created_at). better-auth adds its
  own `session` / `account` / `verification` tables.
- `posts`: the 13 fields allowed by `firestore.rules` → typed columns; slug unique;
  `extra jsonb` holds any unexpected fields. Firestore doc id kept as `legacy_id`.
- `comments` (post_id FK, author_id FK nullable, body, status, created_at)
- `subscribers` (email unique, status, source, created_at, meta jsonb)

Pipeline state with loose shape: `kv(namespace, key, value jsonb, updated_at)`.
It covers site, ai_memory, institutional_config, prompts, verticals and latest_snapshots.

Append-only event tables with 30-day retention: `telemetry_events`, which merges
swarm_telemetry and telemetry_logs, plus `swarm_fragments`, `audits` (pending_audits
and institutional_audits) and `pulse_briefings`.

## Stages (one PR each, each VPS deploy approved by you)

0. **Postgres on the VPS:** `deploy/vps/postgres/`.
   - Install pg16 on localhost only, with peer-mapped roles.
   - Tighten `.env` to 0600.
   - Set up the nightly encrypted R2 backup with its restore check, and run a
     manual restore drill as sign-off.
1. **Pipeline and build off Firestore** (fixes the outage):
   - Add a test harness (vitest + testcontainers-pg) and `scripts/lib/db/`.
   - Run a one-shot export from Firestore to Postgres after the daily quota reset.
     It reads each document once.
   - Swap the pipeline and build to Postgres.
   - **Dual-write posts to Firestore**, fire-and-forget, until Stage 2. The
     frontend still reads Firestore and would otherwise miss new posts.
2. **API plus Workers:**
   - The existing `blogspro-api` service (at `blogspro.in/api/`) serves public reads (posts, comments),
     subscriber signup, and service-token endpoints for the 7 Workers.
   - Frontend post and comment reads move to the API.
   - Re-export comments and subscribers written in the meantime, then stop the
     dual-write.
3. **Auth:**
   - better-auth with Google OAuth and the email link; roles move into `users`.
   - Port the admin/editor flows; delete `js/firebase.js`, `auth.js`, and the
     identitytoolkit proxy.
   - Send the one-time Resend notice.
4. **Decommission:**
   - Remove `firebase-admin`, `firestore.rules` and its workflow, and the
     one-off scripts and duplicates.
   - Keep a final Firestore export for 30 days.

## Risks

- **Single point of failure:** login, comments, signups, the newsletter and the
  pipeline all depend on one free Oracle VM. Mitigations are R2 backups, a
  documented restore procedure, and nginx serving cached post JSON if the API is
  down.
- **The frontend keeps burning Firestore quota until Stage 2.** Stage 1 stops
  the pipeline's share of the 429s. Reader traffic still counts against the
  quota until then.
- **OAuth redirect URIs:** a Google Cloud OAuth client (`blogspro-ai` project)
  needs the `https://blogspro.in/api/auth/callback/google` callback. Only you can
  create it.
- **The origin answers on its raw IP:** `130.210.53.134` serves the site and
  bypasses Cloudflare. Restricting 80/443 to Cloudflare's IP ranges is a separate
  hardening task.
- **Unknown post fields:** `extra jsonb` catches them. The export script
  reports any field it routes there.
