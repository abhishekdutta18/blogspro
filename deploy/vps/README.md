# BlogsPro pulse on blogspro-ai-vps

Hourly, daily and weekly generation runs on the Oracle A1 instance `blogspro-ai-vps`
(BlogsPro OCI account), driven by systemd timers. This replaces `scripts/oracle-cron-runner.sh`,
which hid generation failures and ran from a crontab with no overlap protection.

| Timer | Schedule (UTC) | Tome type | Generation limit |
|-------|----------------|-----------|------------------|
| `blogspro-pulse@hourly.timer` | every hour at :00 | briefing | 45 min |
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
