# MiroFish backend on the pipeline VPS

The MiroFish Python backend (`mirofish/backend`: Flask + `camel-oasis` +
`camel-ai` + `zep-cloud`) runs as a systemd service on `blogspro-ai-vps`.
It replaces `deploy/cloud-run-mirofish.yaml`, which died when GCP billing closed.

| What | Where |
|------|-------|
| URL (VPS only) | `http://127.0.0.1:5001` (health: `GET /health`) |
| Public port | none: bound to loopback, not reachable from outside |
| Service | `mirofish.service` (user `mirofish`, `Restart=on-failure`) |
| Code | `/opt/mirofish/app` (a `git archive` of `mirofish/backend`) |
| Python | `/opt/mirofish/venv` (3.12, deps from `uv.lock`, CPU torch) |
| Secrets | `/var/www/blogspro/.env`, read by systemd only, never copied |
| Data | `/opt/mirofish/app/uploads` (projects, simulations, reports) |

MiroFish is **not** wired into the briefing pipeline. The daily editions' "our
view" uses the lightweight JS persona board (`scripts/lib/mirofish-qa-service.js`),
not this service. It is also separate from the MiroSync worker.

## Deploy or update

From the repo root, at the commit you want to ship:

```bash
deploy/vps/deploy-mirofish.sh
```

The script is idempotent. It ships `mirofish/backend` and the unit file,
installs `python3.12-venv`, `python3-dev` and `gcc` if missing, creates the
`mirofish` user, installs the locked dependencies, restarts the service and
waits for `/health`.

Notes on aarch64 (all checked on the VPS, 2026-11-22):

- Every locked package installs. `psutil` 5.9.8 has no linux-aarch64 wheel and
  compiles from source, so `gcc` is required. `docopt` and `langdetect` are
  pure-Python sdists, and `pywin32` is skipped (Windows only).
- The lock's Linux `torch` 2.15.0 pulls about 3 GB of CUDA 13 libraries. The
  VPS has no GPU, so the script installs the same version from the PyTorch CPU
  index and skips `nvidia-*`, `cuda-*` and `triton`. Result: a 1.4 GB venv and
  `torch 2.15.0+cpu`, with a clean `uv pip check`.

## Check it

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@130.210.53.134 'curl -fsS http://127.0.0.1:5001/health; systemctl status mirofish --no-pager | head -5'
```

Expected: `{"service":"MiroFish Backend","status":"ok"}`. Logs:
`journalctl -u mirofish -f`.

## Keys (not set yet)

MiroFish starts without keys, but every model and graph endpoint fails until
these are in `/var/www/blogspro/.env`:

| Variable | Needed for | Example |
|----------|-----------|---------|
| `LLM_API_KEY` | ontology, personas, config, every agent action, reports | (secret) |
| `LLM_BASE_URL` | any OpenAI-compatible endpoint | `https://api.groq.com/openai/v1` |
| `LLM_MODEL_NAME` | model id at that endpoint | `openai/gpt-oss-120b` |
| `ZEP_API_KEY` | knowledge-graph build and search (Zep Cloud) | (secret) |

The pipeline does not read these names (only `scripts/test-mirofish*.js` do),
so adding them doesn't change the briefings. **Use a separate provider key
from the pipeline's `GROQ_API_KEY`.** Sharing it puts simulations on the same
free quota that already ran out on 2026-11-22.

Enter the secrets yourself through a hidden prompt (nothing echoes, nothing goes
into shell history or the process list):

```bash
ssh -t -i ~/.ssh/id_ed25519 ubuntu@130.210.53.134 'for v in LLM_API_KEY ZEP_API_KEY; do grep -q "^$v=" /var/www/blogspro/.env && { echo "$v already set, skipping"; continue; }; read -rsp "$v: " s; echo; printf "%s=%s\n" "$v" "$s" >> /var/www/blogspro/.env; done; unset s'
```

Then add the non-secret settings and restart:

```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@130.210.53.134 'printf "LLM_BASE_URL=https://api.groq.com/openai/v1\nLLM_MODEL_NAME=openai/gpt-oss-120b\n" >> /var/www/blogspro/.env && sudo systemctl restart mirofish'
```

## Security choices

- The unit sets `FLASK_HOST=127.0.0.1 PORT=5001 FLASK_DEBUG=false` through
  `env` in `ExecStart`, because values from `EnvironmentFile=` override
  `Environment=`. A `PORT` or `FLASK_HOST` in `.env` can't move the bind.
  `app/config.py` defaults `FLASK_DEBUG` to **True**, and the Werkzeug debugger
  allows remote code execution, so it has to be forced off.
- It runs as the unprivileged `mirofish` user with `ProtectSystem=strict`
  (writes only under `/opt/mirofish`), `ProtectHome`, `PrivateTmp`,
  `NoNewPrivileges` and `MemoryMax=8G`. That user can't read `.env`, because
  systemd injects the variables as root. It does still receive every variable
  in that file, not only the four above.
- It serves with Werkzeug's built-in server (`run.py`, `threaded=True`).
  Moving to gunicorn would also mean moving off the in-process simulation
  registry (`SimulationRunner._processes`). That's acceptable for a
  loopback-only internal tool but isn't built for public traffic.

## AI calls per simulation run

Traced in the code (`app/services/*`, `scripts/run_*_simulation.py`, installed
`oasis`/`camel`). OASIS creates each agent with `max_iteration=1`, so **one
agent action = one chat completion** (a tool call), plus SDK retries on errors.

| Stage | LLM calls | Source |
|-------|-----------|--------|
| Ontology | 1 | `ontology_generator.py` |
| Knowledge graph | 0 on our key (Zep extracts on its side, using Zep credits) | `graph_builder.py` |
| Agent personas | N (up to 3N with retries), 5 at a time | `oasis_profile_generator.py` |
| Simulation config | 2 + ⌈N/15⌉ | `simulation_config_generator.py` |
| **Simulation** | **P × R × A** | `run_parallel_simulation.py` |
| Report | about 10–40 (2–5 sections, ReACT loop of up to 5 iterations, some tools call the LLM) | `report_agent.py`, `zep_tools.py` |

- **N** = entities (agents) extracted into the graph, typically 15–60.
- **P** = platforms: the API default `platform: "parallel"` runs Twitter **and**
  Reddit, so P = 2. Use `"twitter"` or `"reddit"` for P = 1.
- **R** = rounds = `total_simulation_hours × 60 / minutes_per_round`. The LLM
  picks these (24–168 h, 30–120 min; default 72 h at 60 min, so 72 rounds).
  **Nothing caps R unless `/api/simulation/start` gets `max_rounds`.**
  `OASIS_DEFAULT_MAX_ROUNDS` in `config.py` is read by nothing.
- **A** = active agents per round = min(random target, agents whose
  `activity_level` roll passes in their active hours). The target is between
  `agents_per_hour_min` and `agents_per_hour_max` (fallback N/15 to N/5), times
  1.5 at peak and 0.3 off-peak. That averages about 0.1N–0.3N.
- Interviews (`/api/simulation/interview*`) add 1 call per agent asked.
- Each agent call sends its profile, the action tool schemas and its feed:
  about 2–3k input tokens and 100–200 output tokens, **plus reasoning tokens**
  with a reasoning model such as `gpt-oss-120b`. Those count against the same
  limits, and MiroFish does not lower `reasoning_effort`, so treat the token
  column below as a floor.
- Simulated time starts at 00:00 and the generated config makes the small
  hours nearly inactive (multiplier 0.05). With defaults, **rounds 1–9 act
  almost nobody**, so a run shorter than about 12 rounds produces no agent
  actions at all.

| Run | N | P | R | Calls (total) | Tokens (approx.) |
|-----|---|---|---|---------------|------------------|
| Small, capped: `platform=twitter`, `max_rounds=14` | 15 | 1 | 14 | about 50–110 | about 0.2M |
| Default settings | 30 | 2 | 72 | about 480–1,400 | about 1.2–3.5M |
| Large | 60 | 2 | 168 | about 2,100–6,150 | about 5–15M |

Calls = setup (1 + N + 2 + ⌈N/15⌉) + P × R × A (A = 0.1N–0.3N) + report (10–40).

### What that means on free tiers

Groq's free limits for `openai/gpt-oss-120b`, as last published (check the
current numbers at https://console.groq.com/settings/limits): about 30 req/min,
1,000 req/day, **8,000 tokens/min and 200,000 tokens/day**. The token caps bind
first:

- About 3 agent calls per minute. The simulation fires up to 30 concurrent
  requests (`semaphore=30`), so it will hit HTTP 429s right away. Each 429
  costs extra retries and can fail a round.
- About 80 calls per day at about 2.5k tokens each. **A default-settings run
  needs about 6–17 days of that model's daily quota.** Even the small capped
  run uses roughly a full day.

So on a free key, use **at most one small, capped run per day** (`platform:
"twitter"`, `max_rounds` 14 or more, about 15 agents) on a key **not** shared
with the briefing pipeline. A default-sized run needs a paid key or a provider with
a much larger daily token allowance. The three daily editions should keep
using the JS persona board (a handful of calls), not this service.

### Measured test run (2026-11-24, Groq `gpt-oss-120b`)

One tiny end-to-end run on the VPS: a 5-sentence market note, Twitter only,
6 agents, `max_rounds=14`, no report.

| Stage | Result |
|-------|--------|
| Ontology | 10 entity types, 7 edge types, 1 call |
| Zep graph build | 20 s, 1 chunk, 6 edges |
| Personas and config | 6 personas, 2.5 min, two HTTP 429s from Groq |
| Simulation | 54 s; agents active only from simulated 09:00; 6 agent turns, giving 1 `create_post` and 5 `quote_post`; 0 errors |

## Known issues

| Issue | Status |
|-------|--------|
| Groq rejects camel's schema for no-argument OASIS tools (`do_nothing`: "'required' present but 'properties' is missing"), so **every agent action failed** | Fixed: `scripts/tool_schema_compat.py`, installed in the three simulation runners |
| Rounds 1–9 are nearly idle because simulated time starts at 00:00 | Open: use `max_rounds` ≥ 14, or change the start hour |
| `/api/simulation/stop` leaves the simulation `paused`, which `/start` won't accept, so a stopped run can't be restarted through the API | Open |
| `/start` requires `reddit_profiles.json` even for Twitter-only simulations once the state is no longer `ready` | Open |
| `run-status` stays `running` at round 0 when rounds produce no actions, and never reports completion | Open: watch `simulation.log` for the loop-complete line instead |
| Reasoning tokens from `gpt-oss-120b` add to every call; `reasoning_effort="low"` cut a test tool call to 155 tokens | Open: not passed by MiroFish today |
