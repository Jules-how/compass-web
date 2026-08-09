---
name: compass-agent
description: Connect Cursor local/cloud agents to Switchflow Compass (Compass-Web) for lean daily sync, campaign briefs, Instantly leads, and ads data. Use when syncing Instantly/Google/Meta, planning outbound strategy, or reading operator metrics without opening the UI.
---

# Compass agent bridge

Compass is the **operator UI + Supabase store**. Cursor agents (local and cloud) are the **connector** to Instantly, Google Ads, Meta Ads, and email automations. Do not dump full tables into context — use the lean agent API.

## Auth

Set secrets (Cloud Agents → Secrets / local `.env`):

- `COMPASS_BASE_URL` — e.g. `https://<your-vercel-host>` or `http://localhost:3100`
- `COMPASS_AGENT_SECRET` — shared with the deployment env

Every request:

```http
Authorization: Bearer $COMPASS_AGENT_SECRET
# or
x-compass-agent-secret: $COMPASS_AGENT_SECRET
```

## Token-efficient workflow

1. **Start with the brief** (cached after daily sync):

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/brief" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

Use `x-compass-fresh: 1` only when you must rebuild counts live.

2. **Sync when data may be stale** (or let Vercel cron do it nightly):

```bash
curl -sS -X POST "$COMPASS_BASE_URL/api/agent/sync" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"sources":["ads","instantly","instantly_leads"]}'
```

Sources:

| Source | Effect |
|--------|--------|
| `ads` | Sync all connected Meta/Google/LinkedIn accounts → Home glance |
| `instantly` | Refresh Instantly cold-email glance snapshot |
| `instantly_leads` | Pull replied/interested/meeting Instantly leads into `lead_contacts` (Inbox Instantly) |

3. **Drill only when needed**:

```bash
# Hot Instantly leads (default statuses)
curl -sS "$COMPASS_BASE_URL/api/agent/leads?limit=40" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

# Pipeline + Instantly campaign glance
curl -sS "$COMPASS_BASE_URL/api/agent/campaigns" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

## Daily cron

Vercel hits `GET /api/cron/daily-sync` once per day (`vercel.json`). Auth with `CRON_SECRET` or `COMPASS_AGENT_SECRET`. Agents should **not** re-sync the world on every turn if `brief.lastSyncAt` is fresh.

## Mental model

- Instantly / Ads APIs hold live platform truth.
- Compass mirrors what operators need to see and act on.
- Agents decide *when* to sync and *how* to plan; Compass shows the result in Home, Inbox, Leads, Sales.

## Do not

- Put `SUPABASE_SERVICE_ROLE_KEY` in agent prompts or chat.
- Call cookie-session operator APIs from headless agents (use `/api/agent/*`).
- Pull unbounded lead lists — always pass `limit` and status filters.
