# Compass agent bridge

Cursor **local** and **cloud** agents connect to Compass-Web over a secret-authenticated HTTP surface. Compass stays the operator UI + Supabase store; agents orchestrate Instantly / ads / email tools and push mirrored state into Compass.

## Env

| Variable | Purpose |
|----------|---------|
| `COMPASS_AGENT_SECRET` | Bearer / `x-compass-agent-secret` for `/api/agent/*` |
| `CRON_SECRET` | Optional; Vercel Cron bearer (falls back to agent secret) |
| `INSTANTLY_API_KEY` | Instantly glance + lead sync |
| Ad account tokens | Already stored encrypted via Settings → Ad accounts |

Apply migrations:
- `0034_compass_outbound_copy.sql` — outbound libraries + campaign copy columns
- `0035_compass_agent_sync.sql` — `compass_sync_snapshots`
- `0037_compass_outbound_copy_archive.sql` — editor Copy Archive (`compass_outbound_copy_archive`)

Operator UI also exposes `GET/POST /api/outbound/copy-archive` (+ `[id]` PATCH/DELETE) for saved sequences with vertical tags, component breakdown, Instantly-style performance, and `last_used_at`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/agent/brief` | Compact daily brief (~1–2KB). Cached snapshot unless `x-compass-fresh: 1` |
| `POST` | `/api/agent/sync` | `{ sources?: ['ads','instantly','instantly_leads'] }` |
| `GET` | `/api/agent/leads` | Lean Instantly-hot leads (`status`, `limit`, `q`) |
| `GET` | `/api/agent/campaigns` | Pipeline + Instantly campaign glance |
| `GET` | `/api/agent/outbound/summary` | Library counts + offer keys (~1–2KB) |
| `GET` | `/api/agent/outbound/:kind` | Compact list (`limit` default 40 max 100; `full=1` for bodies/sequences) |
| `POST` | `/api/agent/outbound/:kind` | Create library row |
| `GET` | `/api/agent/outbound/:kind/:id` | Full row |
| `PATCH` | `/api/agent/outbound/:kind/:id` | Partial update (`Prefer: return=minimal` for lean ack) |
| `DELETE` | `/api/agent/outbound/:kind/:id` | Soft-archive |
| `GET/PATCH` | `/api/agent/outbound/campaigns/:campaignId/copy` | Campaign copy bind fields (`full=1` includes `sequence_draft`) |
| `GET/POST` | `/api/cron/daily-sync` | Vercel Cron daily runner |

Kinds: `offers` | `expressions` | `structures` | `ctas` | `subjects` | `openers` | `templates`.

List filters: `offer_key`, `vertical`, `location`, `q`, `archived=1`, `limit`, `full=1`.

## Instantly ↔ Leads

Daily `instantly_leads` sync lists Instantly reply filters (replied / interested / meeting / not interested / OOO / wrong person / closed) and upserts `lead_contacts` by `instantly_lead_id` or email. Inbox Instantly reads those outbound statuses (plus legacy `replied_positive` / `replied_negative`) so positive, negative, and OOO replies all triage in one place.

## Agent skill

See [`.cursor/skills/compass-agent/SKILL.md`](../.cursor/skills/compass-agent/SKILL.md).
