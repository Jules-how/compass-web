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

```bash
# SKU desk (live / testing / retired gallery + campaign results)
curl -sS "$COMPASS_BASE_URL/api/agent/offers/desk" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"
```

Campaign sequence of record: `GET|PATCH /api/agent/outbound/campaigns/:campaignId/copy` (`full=1` for `sequence_draft`). Outbound doctrine is `cold-email/AGENTS.md`. Product/price contract (guide, mix from economics) is Compass: `GET /api/agent/offers/desk` (Offers tab), file `switchflow-offer/fill-capture-trades.md`. Desk `cells` are one Instantly campaign per `offer_key` × first vertical tag × first location tag. `POST /api/agent/offers/cells` creates missing cells and tags a no-city campaign instead of duplicating it. Wave fields: `opener_reviewed_at`, `copy_confirmed_at`. Compact readiness `wave` is on `GET /api/agent/campaigns`. `GET /api/agent/brief` includes `morningWave` (sending, two next, `landUnlocked`). Do not land while `landUnlocked` is false. `POST /api/agent/outbound/waves` writes `next_campaign_ids`. Pathway tools: `GET /api/agent/outbound/pathway`. Runs: `POST /api/agent/outbound/pathway/runs`. Thin rows are not missing openers. Changing sequence copy clears `copy_confirmed_at`. First line goes in `personalization` and `custom_variables.opener`.

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

**Push to Instantly** (no CSV). Never activate from Compass.

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

## 8am Waves scan

Compass Waves is the shared outbound desk. Instantly activate stays in Instantly.

1. `GET /api/agent/outbound/waves` after Instantly glance is fresh (`POST /api/agent/sync` with `instantly` if `brief.lastSyncAt` is stale).
2. Read `suggestions`, live reply rates, remaining volume, and `outlook.recontactReady`.
3. Recommend one morning move. Examples:
   - ≥5% replies and few leads left → scrape / filter / openers / `push-leads` into that campaign (paused until Jules launches).
   - under 1% replies after 100 sends → propose pause and inspect inboxes before rewriting copy.
   - 0 replies at 1,000 sends → kill / overhaul offer. Do not load more of the same.
4. Persist the call with `POST /api/agent/outbound/waves`:
   - `recommendation`: one or two sentences for the Home yellow card (Switchflow plus Waves)
   - `scan.writeup`: the full Daily Setup synthesis (day / outbound / delivery, AI vs Jules). Home opens this in a popup.
   - `scan.julesLed`: Jules-led items only (`[{ title, detail, task_type }]`). Creates Compass tasks (`source: daily-setup`, due today). Home right rail shows unread ones until Jules opens them.
   - `recommend` cards (lane `recommended`: rationale, list_size, offer, copy_strategy, approach)
   - `actions` on the outlook (volume, copy, city, inboxes, …)
   Do not invent Jules-led busywork. Empty `julesLed` is fine on a wait morning.
5. Manual Jules adds land in **Next campaigns**. Recommended column is agent-only until Jules moves a card.

Do not invent emails. Do not activate Instantly. Write the brief even when the recommendation is “wait.”

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/outbound/waves" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET"

curl -sS -X POST "$COMPASS_BASE_URL/api/agent/outbound/waves" \
  -H "Authorization: Bearer $COMPASS_AGENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"recommendation":"Wait on land. Lists are empty. Confirm locksmith copy if you have ten minutes.","scan":{"writeup":"Outbound: locksmith 3.1 percent, roofing 1.1 percent, both exhausted. No 5 percent top-up. Delivery: none due. Jules-led: confirm locksmith copy.","julesLed":[{"title":"Confirm locksmith copy","detail":"Sequence is live. Tick copy if the Instantly body still matches Compass.","task_type":"SELL"}]},"recommend":[{"name":"Roofing Sydney top-up","rationale":"Live wave is converting. Keep the same copy.","list_size":150,"offer_key":"booked-jobs-system","copy_strategy":"35-word Fill and Capture","approach":"Maps scrape, filter_leads, generate_openers, push-leads paused","vertical_tags":["roofing"],"location_tags":["Sydney"]}],"actions":[{"title":"Top up Sydney roofing","kind":"volume","detail":"150 sendable, same sequence"}]}'
```

Wave memory lives in Compass (`compass_wave_briefs`, `compass_wave_actions`, campaign `wave_*` fields). Do not copy those facts into a second markdown store.

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
