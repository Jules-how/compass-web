---
name: compass-agent
description: Connect Cursor local/cloud agents to Switchflow Compass (Compass-Web) for lean daily sync, campaign briefs, Instantly leads, ads data, and outbound offers/copy libraries. Use when syncing Instantly/Google/Meta, reading/writing outbound offers expressions templates CTAs, or operator metrics without opening the UI.
---

# Compass agent bridge

Compass is the **operator UI + Supabase store**. Cursor agents (local and cloud) are the **connector** to Instantly, Google Ads, Meta Ads, email automations, and outbound copy libraries. Do not dump full tables into context — use the lean agent API.

## Auth

Set secrets (Cloud Agents → Secrets / local `.env`):

- `COMPASS_BASE_URL` — e.g. `https://compass-web-eosin.vercel.app` or `http://localhost:3100`
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

2. **Outbound offers / copy** (HTTPS only — no local MCP):

```bash
# Counts first
curl -sS "$COMPASS_BASE_URL/api/agent/outbound/summary" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

# Compact list (no bodies/sequences)
curl -sS "$COMPASS_BASE_URL/api/agent/outbound/expressions?offer_key=ai-enablement&limit=20" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

# Full row only when editing
curl -sS "$COMPASS_BASE_URL/api/agent/outbound/expressions/<id>" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

# Patch (optional Prefer: return=minimal)
curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/outbound/expressions/<id>" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"notes":"..."}'
```

Campaign copy (brief of record): `GET|PATCH /api/agent/outbound/campaigns/:campaignId/copy` (`full=1` for `sequence_draft`).

**Operating model:** Compass = workshop · vault agent = runner · Instantly = mail truck. Do not invent vault `brief.md` for new campaigns.

Kinds: `offers` | `expressions` | `structures` | `ctas` | `subjects` | `openers` | `templates`.

3. **Sync when data may be stale** (or let Vercel cron do it nightly) — not needed for library CRUD:

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
| `instantly_leads` | Pull replied / interested / meeting / not interested / OOO / wrong-person Instantly leads into `lead_contacts` (Inbox Instantly) |

**Real-time Instantly:** `POST /api/webhooks/instantly` (Bearer `INSTANTLY_WEBHOOK_SECRET` or `COMPASS_AGENT_SECRET`). Nightly pull remains the backstop.

4. **Drill Instantly / pipeline only when needed**:

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads?limit=40" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

curl -sS "$COMPASS_BASE_URL/api/agent/leads/cohort?pipeline_campaign_id=campaign-au-brokers-growth-2026-08&enrich_status=none,queued&limit=50" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"id":"…","enrich_status":"enriched","lead_facts":[{"kind":"policy","claim":"No application fee on home loans","url":"https://example.com.au/about"}]}]}'

curl -sS "$COMPASS_BASE_URL/api/agent/campaigns" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

## Daily cron

Vercel hits `GET /api/cron/daily-sync` once per day (`vercel.json`). Auth with `CRON_SECRET` or `COMPASS_AGENT_SECRET`. Agents should **not** re-sync the world on every turn if `brief.lastSyncAt` is fresh.

## Mental model

- Instantly / Ads APIs hold live platform truth.
- Compass mirrors what operators need to see and act on; **outbound libraries are Compass SoT**.
- Agents decide *when* to sync and *how* to plan; Compass shows the result in Home, Inbox, Leads, Sales, Outbound.

## Do not

- Put `SUPABASE_SERVICE_ROLE_KEY` in agent prompts or chat.
- Call cookie-session `/api/outbound/*` from headless agents (use `/api/agent/outbound/*`).
- Pass `full=1` or dump all kinds unless the turn is editing that row.
- Re-run ads/Instantly sync just to read/write copy libraries.
- Pull unbounded lead lists — always pass `limit` and status filters.
- Start a local MCP or Electron for this path.
