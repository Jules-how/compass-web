# Compass agent bridge

Cursor **local** and **cloud** agents connect to Compass-Web over a secret-authenticated HTTP surface. Compass stays the operator UI + Supabase store; agents orchestrate Instantly / ads / email tools and push mirrored state into Compass.

## Env

| Variable | Purpose |
|----------|---------|
| `COMPASS_AGENT_SECRET` | Bearer / `x-compass-agent-secret` for `/api/agent/*` |
| `CRON_SECRET` | Optional; Vercel Cron bearer (falls back to agent secret) |
| `INSTANTLY_API_KEY` | Instantly glance + lead sync |
| Ad account tokens | Already stored encrypted via Settings → Ad accounts |

Apply migration `0035_compass_agent_sync.sql` for `compass_sync_snapshots`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/agent/brief` | Compact daily brief (~1–2KB). Cached snapshot unless `x-compass-fresh: 1` |
| `POST` | `/api/agent/sync` | `{ sources?: ['ads','instantly','instantly_leads'] }` |
| `GET` | `/api/agent/leads` | Lean Instantly-hot leads (`status`, `limit`, `q`) |
| `GET` | `/api/agent/campaigns` | Pipeline + Instantly campaign glance |
| `GET/POST` | `/api/cron/daily-sync` | Vercel Cron daily runner |

## Instantly ↔ Leads

Daily `instantly_leads` sync lists high-signal Instantly filters (replied / interested / meeting / closed) and upserts `lead_contacts` by `instantly_lead_id` or email. Inbox Instantly already reads those statuses — after sync, Instantly and Compass stay nearly aligned for the leads that matter.

## Agent skill

See [`.cursor/skills/compass-agent/SKILL.md`](../.cursor/skills/compass-agent/SKILL.md).
