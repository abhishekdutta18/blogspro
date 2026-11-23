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

## Homepage market figures

`blogspro-markets.timer` runs `run-markets.sh` every 10 minutes: it fetches the homepage instruments from
Yahoo (`scripts/publish-home-markets.js`, no AI), writes `/var/www/blogspro/data/markets.json` and copies it
to the web VPS. The homepage strip and Markets table load that file in the browser; if it is missing, they
keep the snapshot built into the page, labelled with its date. A failed fetch keeps the last good file.

```bash
sudo install -o root -g root -m 0755 deploy/vps/run-markets.sh /opt/blogspro-pulse/run-markets.sh
sudo install -m 0644 deploy/vps/blogspro-markets.service deploy/vps/blogspro-markets.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blogspro-markets.timer
journalctl -u blogspro-markets -n 20 --no-pager
```
