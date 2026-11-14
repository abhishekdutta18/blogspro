# BlogsPro VPS API — design

**Why:** Firebase (Auth + Firestore) is unusable while billing is disabled on `blogspro-ai`, and the
Cloudflare auth worker depends on it. The Oracle VPS already serves the site, so auth and admin
data move there.

## Shape

- One Node 22 service, **no npm dependencies**: `node:http`, `node:sqlite`, `node:crypto`.
- Listens on `127.0.0.1:8787`. nginx proxies `blogspro.in/auth/*` and `blogspro.in/api/*` to it,
  so the site and API share an origin: no CORS, first-party cookies.
- Code lives in `server/` (deployed to `/opt/blogspro-api`, never into the webroot).
  Data: `/var/lib/blogspro-api/blogspro.db`. Secrets: `/etc/blogspro-api.env` (root-owned, 0600).
- Runs as a systemd service under its own unprivileged user.

## Data

| Table | Purpose |
|---|---|
| `users` | id, email (unique), name, password_hash (scrypt), role, requested_role, provider, email_verified |
| `sessions` | SHA-256 of the session token, user id, expiry. Revocable server-side. |
| `documents` | collection, id, JSON data, timestamps. Mirrors Firestore so the admin panel's generic collection API and a one-time Firestore import both stay simple. |

## Auth

- **Sessions:** opaque random token in an `HttpOnly; Secure; SameSite=Lax` cookie. No JWTs in
  localStorage or in URLs.
- **Password accounts:** scrypt hashes. New accounts are always `reader`; editor/co-author is
  stored as `requested_role` for the admin to approve.
- **Google / GitHub:** server-side authorization-code flow with a state cookie (same helpers the
  worker uses, `server/src/oauth.js`). Callback: `https://blogspro.in/auth/callback/{provider}`.
- **Admin:** the email allow-list applies **only to provider-verified emails** (Google/GitHub).
  Password accounts are unverified (no email sending yet), so they never become admin by email.
- **CSRF:** SameSite=Lax cookie, plus non-GET requests must come from the site's own Origin and send JSON.

## Permissions

| Collection | Read | Write |
|---|---|---|
| `posts` | public: published only; staff: all | staff |
| `site`, `settings` | public | admin |
| `users` | admin; a user can read their own | admin; a user can update their own `name` |
| `subscribers` | admin | admin (public signup via `POST /api/subscribe`) |
| other (pipeline) | staff | admin |

Staff = admin, editor, coauthor.

## Not moved yet

- Swarm/newsletter actions (`POST /api/data/{collection}/{action}`) answer 501.
- The pipeline (`build-static.js`, `generate-sitemap.js`) still reads Firestore.
- Firestore content import: not written yet (needs Firestore reads, blocked while billing is off).
- First admin without Google/GitHub: `server/scripts/set-role.mjs` (run on the VPS).
