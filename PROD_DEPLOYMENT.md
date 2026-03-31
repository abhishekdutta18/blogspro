# BlogsPro Swarm 4.0: Deployment Guide

## Phase 0: Institutional Trials (Staging)

Before the total production launch, we have provided a mirrored **`trials`** environment. This allows you to validate the 25,000-word swarm logic without affecting the main pulse.

### 1. Populate Trial Secrets
Run the following commands:
```bash
npx wrangler secret put SWARM_INTERNAL_TOKEN --env trials
```

### 2. Manual Dispatch
1.  Navigate to the **Actions** tab in GitHub.
2.  Select **BlogsPro Institutional Trials**.
3.  Click **Run workflow** -> `freq: hourly` -> `type: article`.
4.  Verify results at `https://trials.blogspro.in`.

## Phase 1: Production Deployment (Final)

To ensure high-fidelity security, all internal tokens have been removed from `wrangler.toml`. You must manually add the `SWARM_INTERNAL_TOKEN` to each worker environment.

Run the following commands in your terminal:

```bash
# Core Swarm Orchestrator
npx wrangler secret put SWARM_INTERNAL_TOKEN --env pulse

# Institutional Agents
npx wrangler secret put SWARM_INTERNAL_TOKEN --env data-hub
npx wrangler secret put SWARM_INTERNAL_TOKEN --env relevance
npx wrangler secret put SWARM_INTERNAL_TOKEN --env auditor
npx wrangler secret put SWARM_INTERNAL_TOKEN --env seo
npx wrangler secret put SWARM_INTERNAL_TOKEN --env mirofish

# Sync Bridge
npx wrangler secret put SWARM_INTERNAL_TOKEN --env miro-sync
```

> [!IMPORTANT]
> **Consolidated Token**: Use a long, cryptographically secure string (e.g., `BPRO_SWARM_SECRET_2026_HARDENED`). All workers must share the exact same token to maintain the institutional handshake.

## 2. GitHub Secrets (CI/CD)

Ensure the following 2026 strategic secrets are populated in the **GitHub Repository Settings > Secrets and Variables > Actions > Secrets**:

- `GEMINI_KEY` (Pro-tier for vision/search)
- `GROQ_KEY` (Llama-3-70B capability)
- `MISTRAL_API_KEY` (Failover resilience)
- `CF_API_TOKEN` (Worker deployment)
- `CF_ACCOUNT_ID`
- `R2_ENDPOINT` (e.g., `https://<id>.r2.cloudflarestorage.com`)
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `GH_PAT` (GitHub PAT with `repo` and `workflow` permissions)

## 3. Production Pulse Verification

After populating secrets, run a manual production pulse to verify the pipeline:

1.  Navigate to the **Actions** tab in GitHub.
2.  Select **BlogsPro Institutional Intelligence Pipeline**.
3.  Click **Run workflow**.
4.  Choose `freq: hourly` and `type: article` for a fast sanity check.

## 4. Telemetry Monitoring

Monitor real-time swarm activity via:
- **Cloudflare Analytics Engine**: Check the `swarm_telemetry` dataset.
- **Sentry**: Verify no "Unauthorized Handshake" errors appear (this indicates a `SWARM_INTERNAL_TOKEN` mismatch).

---
**Institutional Support**: contact@blogspro.in | 2026 Operational Horizon
