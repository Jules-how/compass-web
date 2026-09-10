---
name: compass-agent
description: Use the Switchflow Compass agent API or MCP for requested campaign briefs, lead-ledger operations, syncs, offers, copy, and operator metrics. Includes local CSV loading limits and API payload details.
---

# Compass agent bridge

Compass is the **operator UI + Supabase store**. Codex agents (local and cloud) are the **connector** to Instantly, Google Ads, Meta Ads, email automations, and outbound copy libraries. Do not dump full tables into context — use the lean agent API.

## Auth

Use the current environment's secret settings or the local `compass-web/.env.local` file:

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
- Search inventory: `leads.search` / `GET /api/agent/leads?view=rows` supports keyset `cursor`, `columns=cohort`, and `pipeline_campaign_id=none`; default page 2000, transport cap 5000. Use only the rows and columns needed.
- Insert: `POST /api/agent/leads` (`leads.commit` or `commit`). Company plus email or a published phone is required. Phone-only rows must include `phone_source_url`; use `contact_source_key` for repeatable imports or an exact existing `id` for enrichment. Read returned `receipts` to verify stable IDs. Domain conflicts remain held. Never raw table insert.

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads/ledger?vertical=broker" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

## Operating work and source evidence

Read `GET /api/agent/operating` for the current queue, contextual tasks/projects,
goals, prepared work and source coverage. Read `GET /api/agent/outbound/overview`
for shared campaign/activity evidence. Use `POST /api/agent/operating` to finish
work with a stable, revision-checked receipt and explicit source; see
`compass-web/docs/OPERATING_WRITEBACK.md` in the workspace. Record inferred work
as a proposal and completion evidence as awaiting confirmation. These reads
supersede historical campaign-name or morning-wave guesses about the next action.
Lead cohort projections retain `lead_facts`; read published evidence before using
it in personalisation, and never treat a thin projection as missing research.

## API recipes

Choose the endpoint needed for the request. These examples are not a mandatory daily sequence or authorisation to sync, write, or activate anything.

1. **General status: brief** (cached after daily sync):

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
curl -sS "$COMPASS_BASE_URL/api/agent/outbound/expressions?offer_key=booked-jobs-system&limit=20" \
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

Campaign sequence of record: `GET|PATCH /api/agent/outbound/campaigns/:campaignId/copy` (`full=1` for `sequence_draft`). Outbound doctrine is `cold-email/AGENTS.md`. The single active offer is ads plus booking, stable key `installation-booking`, contract `switchflow-offer/installation-booking.md`. Earlier booked-jobs/fill-capture examples below are historical; never use them as defaults for new work. Compass desk if Jules has a row. `GET /api/agent/offers/desk` includes `cells`: one Instantly campaign per `offer_key` × first `vertical_tags` × first `location_tags`. City lives in `location_tags`, not the campaign name. One `testing_variable` per cell. Create missing cells with `POST /api/agent/offers/cells` `{ offer_key, verticals, cities, testing_variable, clone_campaign_id?, sample_size_target?, hypothesis? }`. A campaign with the vertical and no city is tagged, not duplicated. Clone copies sequence so only the named variable changes. Wave fields: `opener_reviewed_at`, `copy_confirmed_at`. Compact readiness `wave` is on `GET /api/agent/campaigns`. `GET /api/agent/brief` includes `morningWave` (sending, two next, `landUnlocked`). Do not land live remaining while `landUnlocked` is false. Publish today’s proposed next using the full revision-checked contract in `docs/WAVE_BRIEF_PUBLICATION.md`. Tools/templates: `GET /api/agent/outbound/pathway`. Log runs: `POST /api/agent/outbound/pathway/runs`. Thin rows are not missing openers. Changing sequence copy clears `copy_confirmed_at`. First line goes in `personalization` and `custom_variables.opener`.

**Operating model:** Compass = workshop · Instantly = mail truck. Activate stays in Instantly. Outbound doctrine is `cold-email/AGENTS.md`.

**Targeting revision, 10 September 2026:** installation-booking now targets established air-conditioning installers across Australia, including commercial/mixed trades and ordinary single split-system installation. Ducted reverse-cycle is primary. Do not enforce the older Sydney/residential/independence requirements or treat unsent campaign membership as actual outreach. Current process is city → Vortex contacts → cached concurrent HTTP research/fallback → fit/contact routing → Million Verifier through Apify → personalised subject/opener → Jules' review → paused CSV import/readback. The new policy does not itself update deployed preparation code; reconcile its eligibility, flexible draft and timezone/settings contracts before execution. No direct lead CRUD or local API add-leads workaround.

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
curl -sS "$COMPASS_BASE_URL/api/agent/leads?limit=40" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

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
  -d '{"rows":[{"id":"…","icp_status":"pass","review_count":82,"email_origin":"published","opener":"…"}]}'

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

**Push to Instantly** (no CSV). Never activate from Compass. Not from this Mac: Instantly REST add-leads from here returns Cloudflare 1010, and Compass push uses that same API. On this Mac, load the CSV on the campaign Leads tab with Browser Use (see the `instantly-load` skill). The calls below are for hosted Compass / cloud agents.

```bash
# Create a paused Instantly campaign if unbound (optional pushSequence)
curl -sS -X POST "$COMPASS_BASE_URL/api/agent/instantly/ensure" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"campaign-au-plumbers-capture-2026-08","pushSequence":true}'

# Duplicate [Template] Switchflow Fill & Capture (paused). Binds if unbound.
curl -sS -X POST "$COMPASS_BASE_URL/api/agent/instantly/duplicate-template" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"campaign-au-plumbers-capture-2026-08"}'

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

## Morning brief publication

Follow `docs/WAVE_BRIEF_PUBLICATION.md` in compass-web for the current write contract.
Read current decisions and the latest day handover before composing. One publisher:
`compass-morning-pilot`. Every publication requires Sydney day, stable runId,
decisionRevision, expectedRevision and a complete current recommendation/scan.
Read these values live; do not reuse old brief instructions as today's plan.
Legacy recommendation-only, scan-only and `recommend` writes are rejected.
Create campaign records separately, then explicitly reference their IDs.
Metrics refresh is separate and does not review advice. Retry uncertain writes
with the identical payload/runId; re-read and reconcile conflicts before a new run.
Never activate campaigns. Keep tasks open for Jules to confirm.

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
- Pull unbounded lead lists — always pass `limit` and status filters. Export pages at 200; write a file.
- Use Instantly MCP to add or create leads. On this Mac, do not `land` / `push-leads` either (Cloudflare 1010); Browser Use CSV upload on the Leads tab is the load path here.
- Download CSVs to load Instantly from hosted/cloud runs. (This Mac's load path is the one local CSV the mill just wrote, uploaded via Browser Use.)
- Activate Instantly campaigns from the agent.

## Codex MCP

Lean stdio server: `node mcp/server.mjs` from `compass-web/` (or `node compass-web/mcp/server.mjs` from switchflow-os). Loads `compass-web/.env.local` then `COMPASS_BASE_URL` / `COMPASS_AGENT_SECRET`. Hosted default `https://compass-web-eosin.vercel.app`.

Tools: `brief`, `campaigns`, `leads.search`, `leads.commit`, legacy `leads` / `mark`, `copy`, `land`, `commit`, `ledger`, `export`. Not an Instantly clone. `land.push_leads` defaults to dry-run. Codex loads server `compass` from `.codex/config.toml`; the nested Compass configuration supports opening that repository directly.

CRM lists segment the existing lead ledger. Use `/api/agent/lists` and `/api/agent/lists/:id/members`; list and campaign cohorts retain the shared search filters and paging. Research and openers use the existing agent lead API.
