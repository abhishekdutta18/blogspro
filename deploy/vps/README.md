# BlogsPro pulse on blogspro-ai-vps

Hourly, daily and weekly generation runs on the Oracle A1 instance `blogspro-ai-vps`
(BlogsPro OCI account), driven by systemd timers. This replaces `scripts/oracle-cron-runner.sh`,
which hid generation failures and ran from a crontab with no overlap protection.

| Timer | Schedule (UTC) | Tome type | Generation limit |
|-------|----------------|-----------|------------------|
| `blogspro-pulse@hourly.timer` | 08:00, 16:00, 22:00 IST | market edition | 45 min |
| `blogspro-pulse@daily.timer` | 00:00 | daily strategy (edition pipeline) | 2 h |
| `blogspro-pulse@weekly.timer` | Sunday 01:00 | weekly review (edition pipeline) | 5 h |

Runs share `/var/www/blogspro` and take a lock on it, so they never overlap. Secrets stay in
`/var/www/blogspro/.env`; the rsync to the web VPS excludes it and other key files.

## Install or update

```bash
sudo install -d -m 0755 /opt/blogspro-pulse
sudo install -o root -g root -m 0755 deploy/vps/run-pulse.sh /opt/blogspro-pulse/run-pulse.sh
sudo install -m 0644 deploy/vps/blogspro-pulse@.service deploy/vps/blogspro-pulse@*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blogspro-pulse@hourly.timer blogspro-pulse@daily.timer blogspro-pulse@weekly.timer
```

## Operate

```bash
systemctl list-timers 'blogspro-*'
sudo systemctl start blogspro-pulse@hourly        # run one now
journalctl -u blogspro-pulse@hourly -n 50 --no-pager
```

## Market editions

The `hourly` unit now publishes three market editions a day (`scripts/lib/market-edition/`):

| IST | Edition | Focus |
|-----|---------|-------|
| 08:00 | Morning brief | Overnight US/Europe, Asia now, setup for the Indian open |
| 16:00 | Market close | How Indian indices closed and why |
| 22:00 | Evening wrap | Europe close, US session, setup for tomorrow |

Prices come from Yahoo Finance and headlines from market RSS feeds; the model never supplies the figures.
"Our view" comes from a three-persona analyst board (momentum, risk, macro) whose conviction-weighted stance
the writer must keep. That is about 4 AI calls per edition. If the AI fleet is exhausted the edition still
publishes prices and headlines, marked as missing commentary. Run a specific edition by hand with:

```bash
node scripts/generate-institutional-tome.js --freq=hourly --type=briefing --force --edition=morning
```

## Daily strategy and weekly review

`daily` and `weekly` run the same pipeline as the editions (`REPORTS` in `scripts/lib/market-edition/editions.js`):
3 analyst-board calls plus overview, news and view, about 6 AI calls per run. They used to run the 17-vertical
swarm, roughly 100-170 large calls per run, which ran the shared free-tier quotas dry (one Groq org behind three
pool nodes, the Workers AI daily allowance). The weekly review quotes every move over the last 5 sessions and
gets a digest of the week's edition titles and summaries from the edition snapshots, so it needs no extra research
calls. `REPORT_ENGINE=swarm` in the environment brings back the old swarm for a run; monthly still uses it.

```bash
node scripts/generate-institutional-tome.js --freq=daily --type=article --force
node scripts/generate-institutional-tome.js --freq=weekly --type=tome --force
```

### Token budget

Every edition-pipeline call goes through `scripts/lib/token-budget.js`. Before sending a call it estimates
prompt tokens (4 characters each) plus a 2,500-token reply reserve, and refuses the call when that would pass:

| Cap | Default | Override |
|-----|---------|----------|
| Per run, hourly / daily / weekly | 40k / 40k / 50k | `TOKEN_BUDGET_HOURLY_RUN`, `TOKEN_BUDGET_DAILY_RUN`, `TOKEN_BUDGET_WEEKLY_RUN` |
| All runs in any rolling 24 hours | 200k | `TOKEN_BUDGET_DAY` |

A refused section is not retried; the piece publishes with what it has (prices, headlines, and any sections
already written), marked as missing commentary if the overview was refused. The 24-hour window rolls, like Groq's limits, so the 00:00 UTC daily run still counts the previous evening's
editions; hourly editions go through the same wrapper and record their spend. Each call is recorded in
`/var/lib/blogspro-pulse/token-ledger.json` (the unit's state directory; `TOKEN_LEDGER_FILE` overrides) and logged
at the end of each run as `🪙 [Budget]`. The figures are estimates for pacing, not provider billing: tune the caps
from the ledger after a few days of runs.

An edition measures about 18k estimated tokens (about 12k in, 6k out over 6 calls); the run caps are about 2x
that, room for one retry per section but not a retry storm. Each ledger entry records the call role and the
in/out split, so the report shows where the spend goes:

```bash
cd /var/www/blogspro && STATE_DIRECTORY=/var/lib/blogspro-pulse npm run -s token-report
journalctl -u 'blogspro-pulse@*' --since today | grep Budget
```

## PDF copies

Every edition, daily strategy and weekly review also gets a PDF next to its page (same name, `.pdf`). The page then
shows a "Download PDF" link, and the JSON manifest gets a `pdf` field. `scripts/lib/market-edition/edition-pdf.js`
renders the page's own print layout in headless Chrome with JavaScript off and all network requests blocked; it
takes about 15 s and the file is about 0.5 MB. If no browser is found or the render fails, the page publishes
without a PDF and the journal shows `⚠️ [PDF] Skipped`. `EDITION_PDF=0` turns PDFs off.

The VPS installs node modules with `PUPPETEER_SKIP_DOWNLOAD=true`, and puppeteer has no linux-arm64 Chrome for the
A1 anyway. Ubuntu's `chromium-browser` is a snap, whose private `/tmp` breaks puppeteer. Use Playwright's arm64
Chromium (found automatically in `~/.cache/ms-playwright`), or point `PDF_CHROME_PATH` at another browser:

```bash
cd /var/www/blogspro && npx playwright install chromium     # as ubuntu: ~/.cache/ms-playwright/chromium-*
sudo npx playwright install-deps chromium                     # system libraries via apt (one time)
```

## Homepage data files

Six timers publish files the homepage loads in the browser. Each runs `run-data.sh <name>`, which writes under
`/var/www/blogspro/data/` atomically and copies the result to the web VPS. Only the forecasts job uses a model
(Google TimesFM through BigQuery `AI.FORECAST`, billed to project `blogspro-ai`); the rest only fetch data.

| Timer | Every | Output | Sources |
|-------|-------|--------|---------|
| `blogspro-markets.timer` | 5 min | `data/markets.json` | Yahoo chart API (17 instruments, quote plus today's 5-minute bars) |
| `blogspro-policy.timer` | 30 min | `data/policy.json` | rbi.org.in; Forex Factory weekly calendar; MoSPI API (latest macro prints plus up to 36 periods of history) |
| `blogspro-data@bonds.timer` | hourly | `data/bonds.json` | CCIL ZCYC parameters and tenor-wise indicative yields; keeps 400 days of 10-year history |
| `blogspro-data@movers.timer` | 15 min | `data/movers.json` | niftyindices.com, Wikipedia and GitHub constituent lists (cached weekly in `/var/lib/blogspro-pulse/constituents.json`); Yahoo per stock for India and Japan; Nasdaq screener for the US |
| `blogspro-data@forecasts.timer` | daily 01:30 UTC | `data/forecasts.json` | Yahoo daily closes, `bonds.json`, `policy.json` -> TimesFM 2.0, 80% interval |
| `blogspro-data@charts.timer` | hourly | `data/charts/*.svg`, `data/charts/index.json` | `bonds.json`, `policy.json`, `forecasts.json` |

Each source keeps its last good data when it fails. Forex Factory answers HTTP 429 to frequent requests,
so do not shorten the policy timer or run it by hand repeatedly. The movers job asks Yahoo for one quote per
stock (about 250 for India and Japan), three at a time, and stops at the first HTTP 429 so the markets feed on
the same endpoint is not rate-limited; it only refreshes a market while it trades. If a file is missing, the
homepage keeps its built-in market snapshot and shows the other sections as unavailable.

```bash
sudo install -o root -g root -m 0755 deploy/vps/run-data.sh /opt/blogspro-pulse/run-data.sh
sudo install -m 0644 deploy/vps/blogspro-markets.* deploy/vps/blogspro-policy.* deploy/vps/blogspro-data@* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blogspro-markets.timer blogspro-policy.timer \
  blogspro-data@bonds.timer blogspro-data@movers.timer blogspro-data@forecasts.timer blogspro-data@charts.timer
journalctl -u blogspro-data@forecasts -n 20 --no-pager
```

### Local TimesFM (forecast fallback)

When BigQuery `AI.FORECAST` fails for a section (sign-in, quota, query error), the forecasts job sends the same
series to TimesFM running on this server: `scripts/lib/home-forecasts/timesfm_local.py` in its own virtualenv,
CPU only. The file records `engine: "bigquery" | "local"` and the model per section. The checkpoint is fetched
once at install and read offline afterwards (`HF_HUB_OFFLINE=1` in the unit).

```bash
sudo mkdir -p /opt/blogspro-timesfm && sudo chown ubuntu:ubuntu /opt/blogspro-timesfm
python3 -m venv /opt/blogspro-timesfm/venv
# CPU-only torch first, so timesfm does not pull the CUDA build (3.3 GB of nvidia libraries this box cannot use):
/opt/blogspro-timesfm/venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
/opt/blogspro-timesfm/venv/bin/pip install "timesfm[torch]==3.0.2"
# Download the checkpoint (1.3 GB, online this once) and check the script end to end (prints JSON forecasts):
echo '{"horizon":3,"series":[{"id":"t","values":[1,2,3,4,5,6,7,8,9,10]}]}' \
  | HF_HOME=/opt/blogspro-timesfm/hf /opt/blogspro-timesfm/venv/bin/python /var/www/blogspro/scripts/lib/home-forecasts/timesfm_local.py
```

Tuning for this server (4-core aarch64, 23 GB; measured 2026-11-23 on the live series):

- **Footprint:** venv 948 MB, checkpoint 1.3 GB, 2.9 GB peak RSS per run. Load is 2.5 s from page cache,
  about 30 s cold; predicting all 17 daily series takes about 1 s. A full fallback run (both sections) took 10.5 s.
- **One run at a time:** the script holds an `flock` on `/opt/blogspro-timesfm/run.lock` (`TIMESFM_LOCK`), so
  the daily and macro sections never load the checkpoint side by side.
- **Threads:** `TIMESFM_THREADS` (default: cores, at most 4), one inter-op thread, `inference_mode`.
- **Context:** the whole history is sent (`TIMESFM_MAX_CONTEXT`, default 512, never binds at 120 sessions).
  A 170-window rolling backtest gave error relative to "no change" of 1.06 with full history vs 1.07-1.08 at
  32-64 points, and 80% bands covering 74% vs 67-70%; symmetric averaging made no difference.
