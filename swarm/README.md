# blogspro-swarm

Hourly market briefings. It reads publisher RSS feeds, sends four desk analysts (macro & policy,
Indian equities, rates & FX, global risk) through a non-Google AI fleet, has an editor merge their
notes, and checks the result. The briefing is then saved into the API's SQLite database as
`pulse_briefings/H_YYYY-MM-DD_HH` (IST). The site reads it at `/api/public/data/pulse_briefings`.

Design: [`../docs/swarm-v2-design.md`](../docs/swarm-v2-design.md). No npm dependencies; Node ≥ 22.13.

## Run locally

```bash
npm test
npm run hourly:dry      # live news + live AI, writes nothing, prints the briefing JSON
```

`hourly:dry` loads keys from `../.env`.

## A run publishes nothing when

| Log event | Cause |
|---|---|
| `config.invalid` (exit 2) | no provider key set, or a bad number in the env |
| `run.failed` `not_enough_news` | fewer than `SWARM_MIN_HEADLINES` fresh headlines |
| `run.failed` `NotEnoughSignalError` | fewer than 2 desks produced notes (often: every AI key failing) |
| `run.failed` `EditorOutputError` | the editor returned unusable JSON twice |
| `run.failed` `guard_failed` | wrong length or section count, too few or invalid citations, names the publication, or mentions being an AI |

In every case the previous briefing stays live.

## Deploy (VPS)

```bash
sudo rsync -a --delete bin src package.json /opt/blogspro-swarm/
sudo install -m 0640 -g blogspro-api deploy/blogspro-swarm.env.example /etc/blogspro-swarm.env   # then fill in keys
sudo cp deploy/blogspro-swarm-hourly.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start blogspro-swarm-hourly.service && journalctl -u blogspro-swarm-hourly -o cat -n 50
sudo systemctl enable --now blogspro-swarm-hourly.timer
```
