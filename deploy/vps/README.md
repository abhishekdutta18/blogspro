# BlogsPro pulse on blogspro-ai-vps

Hourly, daily and weekly generation runs on the Oracle A1 instance `blogspro-ai-vps`
(BlogsPro OCI account), driven by systemd timers. This replaces `scripts/oracle-cron-runner.sh`,
which hid generation failures and ran from a crontab with no overlap protection.

| Timer | Schedule (UTC) | Tome type | Generation limit |
|-------|----------------|-----------|------------------|
| `blogspro-pulse@hourly.timer` | 08:00, 16:00, 22:00 IST | market edition | 45 min |
| `blogspro-pulse@daily.timer` | 00:00 | article | 2 h |
| `blogspro-pulse@weekly.timer` | Sunday 01:00 | tome | 5 h |

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
