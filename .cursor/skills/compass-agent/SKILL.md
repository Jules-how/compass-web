---
name: compass-agent
description: Connect Cursor local/cloud agents to Switchflow Compass (Compass-Web) for lean daily sync, campaign briefs, Instantly lead push/sync, ads data, and outbound offers/copy libraries. Use when syncing Instantly/Google/Meta, pushing cohort leads into Instantly (no CSV), reading/writing outbound offers expressions templates CTAs, running the weekly CS/retention board, or operator metrics without opening the UI.
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

## Lead ledger

Compass is the lead store. Use `/api/agent/*` or Compass MCP. Do not query `lead_contacts` via Supabase MCP, PostgREST, or `SUPABASE_SERVICE_ROLE_KEY`.

- Counts / recency / campaign-id overlap: `GET /api/agent/leads/ledger?vertical=broker` (optional `campaign_ids`, `later_campaign_ids`)
- Page a local CSV: `GET /api/agent/leads/export?vertical=broker&limit=200&cursor=` (max 200, email required)
- Insert: `POST /api/agent/leads` (`commit`). Email and company required. Domain dupe skipped. Never raw table insert.

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads/ledger?vertical=broker" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
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
curl -sS "$COMPASS_BASE_URL/api/agent/outbound/expressions?offer_key=ai-receptionist-system&limit=20" \
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

```bash
# SKU desk (live / testing / retired + campaign results)
curl -sS "$COMPASS_BASE_URL/api/agent/offers/desk" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

Campaign sequence of record: `GET|PATCH /api/agent/outbound/campaigns/:campaignId/copy` (`full=1` for `sequence_draft`). Outbound doctrine is `cold-email/AGENTS.md`. Product/price lock is Compass: `GET /api/agent/offers/desk` (Offers tab). Wave fields: `opener_reviewed_at`, `copy_confirmed_at`. Compact readiness `wave` is on `GET /api/agent/campaigns`. Live targeting (`currentWave`: trade, cluster, remaining, last import) is on `GET /api/agent/brief`. Thin rows are not missing openers. Changing sequence copy clears `copy_confirmed_at`. First line goes in `personalization` and `custom_variables.opener`.

**Operating model:** Compass = workshop · Instantly = mail truck. Activate stays in Instantly. Outbound doctrine is `cold-email/AGENTS.md`.

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

Inbox Instantly classify writes `outbound_status` then marks triage done: positive → `interested`, not now → `not_interested`, wrong person → `wrong_person`, bad offer → `not_interested` + tag `bad_offer`, OOO → `out_of_office`. Meeting booked stays Instantly interest `meeting_booked` (webhook). Compose in Instantly Unibox / Gmail.

**Real-time Instantly:** `POST /api/webhooks/instantly` (Bearer `INSTANTLY_WEBHOOK_SECRET` or `COMPASS_AGENT_SECRET`). Nightly pull remains the backstop.

4. **Drill Instantly / pipeline only when needed**:

```bash
# Legacy Instantly-hot lean list (status/limit/q only)
curl -sS "$COMPASS_BASE_URL/api/agent/leads?limit=40" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

# leads.search: unattached harvest (keyset, 2000/page)
curl -sS "$COMPASS_BASE_URL/api/agent/leads?view=rows&columns=cohort&pipeline_campaign_id=none&vertical=plumber&state=NSW&limit=2000" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

# Commit a list (email upsert; company dupe does not insert). Per-row lead_facts / opener go here or PATCH /mark rows.
curl -sS -X POST "$COMPASS_BASE_URL/api/agent/leads" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"defaults":{"vertical":"plumber","source":"apify"},"rows":[{"email":"shop@example.com.au","company":"Example Plumbing","city":"Marrickville","state":"NSW"}],"on_conflict":"email"}'

# After landing keepers: attach campaign + ICP (company-only name is fine)
curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"emails":["shop@example.com.au"],"pipeline_campaign_id":"campaign-au-plumbers-capture-2026-08","cohort_tag":"inner-west","icp_status":"pass","email_origin":"published"}'

curl -sS "$COMPASS_BASE_URL/api/agent/leads/cohort?pipeline_campaign_id=campaign-au-plumbers-capture-2026-08&icp_status=pass&enrich_status=none,queued&unverified_only=1&limit=50" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"email":"ada@example.com","outbound_status":"in_instantly","instantly_lead_id":"…","instantly_campaign_id":"…"}]}'

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"id":"…","icp_status":"pass","review_count":82,"hours_label":"Open 24 hours","after_hours":true,"capture_crack":"Two reviews this month say they could not get through after 5","email_origin":"published","opener":"…"}]}'

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"rows":[{"email":"ada@example.com","website":"https://example.com.au"}]}'

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"emails":["ada@example.com"],"email_verify_status":"valid"}'


curl -sS "$COMPASS_BASE_URL/api/agent/campaigns" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

**Push to Instantly** (no CSV). Never activate from Compass.

```bash
# Create a paused Instantly campaign if unbound (optional pushSequence)
curl -sS -X POST "$COMPASS_BASE_URL/api/agent/instantly/ensure" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"campaign-au-plumbers-capture-2026-08","pushSequence":true}'

# Dry-run then push cohort leads. Instantly drops unknown keys: first_name, personalization, custom_variables.opener.
curl -sS -X POST "$COMPASS_BASE_URL/api/agent/instantly/push-leads" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"campaign-au-plumbers-capture-2026-08","dryRun":true}'

curl -sS -X POST "$COMPASS_BASE_URL/api/agent/instantly/push-leads" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"campaign-au-plumbers-capture-2026-08"}'

curl -sS -X POST "$COMPASS_BASE_URL/api/agent/instantly/push-sequence" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"campaign-au-plumbers-capture-2026-08"}'
```

Push marks Compass `in_instantly` / Instantly ids the same turn. Skip workspace dupes; Instantly verifies on import. Activate stays in Instantly after Jules sign-off.

Wave on that list is compact (`cohort`, `blocked`, `readyToActivate`). PATCH review flags via campaign copy:

```bash
curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/outbound/campaigns/<id>/copy" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"opener_reviewed_at":true}'
```

## Daily cron

Vercel hits `GET /api/cron/daily-sync` once per day (`vercel.json`). Auth with `CRON_SECRET` or `COMPASS_AGENT_SECRET`. Agents should **not** re-sync the world on every turn if `brief.lastSyncAt` is fresh.

## Mental model

- Instantly / Ads APIs hold live platform truth.
- Compass mirrors what operators need to see and act on; **outbound libraries are Compass SoT**.
- Agents decide *when* to sync and *how* to plan; Compass shows the result in Home, Inbox, Leads, Sales, Outbound.

## Do not

- Put `SUPABASE_SERVICE_ROLE_KEY` in agent prompts or chat.
- Use Supabase MCP / `execute_sql` / PostgREST for lead CRUD. That is for migrations or a query the agent API does not have yet.
- Call cookie-session `/api/outbound/*` from headless agents (use `/api/agent/outbound/*`).
- Pass `full=1` or dump all kinds unless the turn is editing that row.
- Re-run ads/Instantly sync just to read/write copy libraries.
- Pull unbounded lead lists — page with `cursor` / `limit` (transport cap 5000). Ledger export pages at 200; write a file.
- Use Instantly MCP to add or create leads. Land with Compass MCP `land` or `/api/agent/instantly/push-leads`.
- Download CSVs to load Instantly.
- Activate Instantly campaigns from the agent.

## Cursor MCP

Lean stdio server: `node mcp/server.mjs` from `compass-web/` (or `node compass-web/mcp/server.mjs` from switchflow-os). Loads `compass-web/.env.local` then `COMPASS_BASE_URL` / `COMPASS_AGENT_SECRET`. Hosted default `https://compass-web-eosin.vercel.app`.

Tools: `brief`, `campaigns`, `leads.search`, `leads.commit`, deprecated `leads`/`mark`, `copy`, `land`, `commit`, `ledger`, `export`. Not an Instantly clone. `land.push_leads` defaults to dry-run. This workspace wires it in `.cursor/mcp.json` as server `compass`.
