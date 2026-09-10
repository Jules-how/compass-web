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
- `0039_campaign_experiments.sql` — experiment hypothesis / one-factor A/B fields on pipeline campaigns
- `0040_lead_campaign_cohort.sql` — `pipeline_campaign_id` + `cohort_tag` on `lead_contacts`
- `0041_lead_enrich_readiness.sql` — `enrich_status` on `lead_contacts`
- `0043_lead_facts.sql` — `lead_facts` jsonb on `lead_contacts`
- `0044_lead_facts_shape.sql` — engager-fact array comment (`kind` / `claim` / `url`)
- `20260909022151_lead_lists.sql` and `20260909022207_compass_list_integration.sql` — named lists, atomic campaign attachments and paginated cohort queries
- `0045_campaign_wave.sql` — `opener_reviewed_at`, `copy_confirmed_at` on pipeline campaigns
- `0050_drop_wave_cap.sql` — drop unused campaign column
- `0051_opener_track_kind.sql` — `opener_track` + `opener_kind` on `lead_contacts`
- `0052_archive_stale_offers.sql` — archive growth/enablement/reporting; rewrite capture offer
- `0053_lead_icp.sql` — `icp_status`, `review_count`, `hours_label`, `after_hours`, `capture_crack`, `email_origin`
- `0055_offer_sku_desk.sql` — live/testing/retired SKU fields on outbound offers
- `0056_align_fill_capture_sku.sql` — Fill and capture testing row
- `0057_lead_search_indexes.sql` — `lead_contacts` indexes for filter grammar + `(email, id)` keyset
- `0058_lead_inventory_rpc.sql` — `lead_inventory_aggregate` + `lead_list_facets` SQL aggregates
- `0059_lead_archived.sql` — `is_archived` on `lead_contacts` (Leads / Prospects hide archived)

SQLite `data/compass.db` is no longer the operator lead store. UI `/leads` list + upload and `/api/agent/leads` share Supabase `lead_contacts`. One-time copy: `node scripts/migrate-sqlite-leads.mjs --dry-run` (do not run against production from an agent).

Qualify before research. `icp_status=skip` (franchise, no inbound, thin reviews) never needs an opener and never uploads. Real shop + thin card: `icp_status=thin` and `enrich_status=thin`. Harvest pass-only: `GET /api/agent/leads/cohort?icp_status=pass`.

Per-lead first line is Hook compile (signal) or YAML tension. Instantly `{{personalization}}`. Hook PATCHes `opener` / `opener_track` / `opener_kind` / `lead_facts` / ICP fields only on `--stage full --write-compass`. Hook does not tick `opener_reviewed_at` and does not activate Instantly. New campaigns use offer_key `booked-jobs-system` only. Do not bind new waves to `ai-receptionist-system` (killed).

Operator UI also exposes `GET/POST /api/outbound/copy-archive` (+ `[id]` PATCH/DELETE) for saved sequences with vertical tags, component breakdown, Instantly-style performance, and `last_used_at`. Archive overlay uses Instantly send volume plus Compass positive/meeting counts when a row is bound to a pipeline campaign. Sequence editor compose rail: Library (mixer) · Levers (six questions) · QA. Email scaffolds include `risk_reversal` and `ps` slots.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/agent/brief` | Compact daily brief (~1–2KB) plus `currentWave` (campaign, trade, cluster, uncontacted remaining, last import). Cached snapshot unless `x-compass-fresh: 1` |
| `POST` | `/api/agent/sync` | `{ sources?: ['ads','instantly','instantly_leads'] }` |
| `GET` | `/api/agent/leads` | Search. Legacy (`status`/`limit`/`q` only) still returns Instantly-hot lean rows. New: `view=rows\|counts`, shared filters (`q`, `vertical`, `state`, `city`, `cohort_tag`, `source`, `outbound_status` csv, `sync_state`, `pipeline_campaign_id` id or `none`, `instantly_campaign_id`, `enrich_status` csv, `icp_status` csv, `email_origin`, `after_hours`, `min_reviews`, `unverified_only`, `recontact_ready`, `bucket`, `completeness`), `columns=lean\|cohort\|full`, keyset `cursor`, `limit` default 2000 max 5000. Response `{ ok, filters, columns, count, total, next_cursor, leads }`. `Accept: application/x-ndjson` streams header then one lead per line. |
| `POST` | `/api/agent/leads` | Bulk upsert-commit. `{ defaults?, rows[], on_conflict: "email", mark? }`. 8MB body, 500-row write chunks. Email match updates. Company domain or company+city → `company_dupe` (no insert). Never invent emails. Never downgrade hot outbound unless the row sets it. `icp_status=skip` stays skip. `ready`→`enriched`, `qualified`→`pass`. |
| `GET` | `/api/agent/leads/inventory` | Deprecated alias of `GET /api/agent/leads?view=counts` (SQL aggregate, not a 50k load) |
| `GET` | `/api/agent/leads/ledger` | Vertical required. Status, state, last_outbound buckets (`blank`/`0-14`/`15-30`/`31-60`/`61-90`/`90+`), top campaign names. Optional `campaign_ids` vs `later_campaign_ids` overlap. Uses stored `last_outbound_at` |
| `GET` | `/api/agent/leads/export` | Vertical required. Email required. Cursor page, max 200. Agent writes a file; never dump the table in chat |
| `GET` | `/api/agent/leads/cohort` | Deprecated alias of `GET /api/agent/leads?view=rows&columns=cohort`. Accepts `list_id` or `pipeline_campaign_id`; attached lists define a campaign cohort, with campaign-stamp fallback. The canonical search also accepts `cohort_campaign_id`, retains existing filters, and allows `none` (unattached). |
| `PATCH` | `/api/agent/leads/mark` | Deprecated alias. Prefer `POST /api/agent/leads` + `mark`. Still: bulk `ids[]`/`emails[]` (max 500) or `rows[]` (max 50) for facts/opener/website/Instantly land. Facts are `[{kind, claim, url}]`. Website is the company site. `opener_track`: `signal` \| `tension` \| `none`. `opener_kind`: `review` \| `hiring` \| `policy` \| `specialty` \| `location` \| `tension` \| `after_hours` \| `phone_pain` \| `none`. ICP: `none\|pass\|thin\|skip`. `email_verify_status`: `valid` \| `catch_all` \| `invalid` \| `unknown` \| `risky` \| `none`. |
| `GET` | `/api/agent/campaigns` | Pipeline + Instantly glance. Compact `wave` per campaign (`cohort`, `openers`, `signal`, `tension`, `thin`, `skip`, `by_kind`, `blocked`, `readyToActivate`). Thin and skip rows are not missing openers. Skip never uploads. |
| `GET` | `/api/agent/lists` | CRM lists with exact member counts |
| `PATCH` | `/api/agent/lists/:id/members` | Add/remove lead IDs from a list, max 50 |
| `GET` | `/api/agent/outbound/summary` | Library counts + offer keys (~1–2KB) |
| `GET` | `/api/agent/outbound/:kind` | Compact list (`limit` default 40 max 100; `full=1` for bodies/sequences) |
| `POST` | `/api/agent/outbound/:kind` | Create library row |
| `GET` | `/api/agent/outbound/:kind/:id` | Full row |
| `PATCH` | `/api/agent/outbound/:kind/:id` | Partial update (`Prefer: return=minimal` for lean ack) |
| `DELETE` | `/api/agent/outbound/:kind/:id` | Soft-archive |
| `GET/PATCH` | `/api/agent/outbound/campaigns/:campaignId/copy` | Campaign copy + experiment + wave fields (`full=1` includes `sequence_draft`). Changing `sequence_draft` / `cold_expression` clears `copy_confirmed_at` |
| `POST` | `/api/campaigns/:id/challenger` | Operator: spawn one-factor challenger (cookie auth) |
| `POST` | `/api/campaigns/:id/instantly/ensure` | Operator: create paused Instantly campaign + bind (`pushSequence` optional) |
| `POST` | `/api/campaigns/:id/instantly/push-leads` | Operator: bulk-add cohort leads (`dryRun` supported). Never activates |
| `POST` | `/api/campaigns/:id/instantly/push-sequence` | Operator: PATCH Instantly steps from Compass `sequence_draft` |
| `POST` | `/api/agent/instantly/ensure` | Agent twin of ensure (`campaignId`, `pushSequence`) |
| `POST` | `/api/agent/instantly/duplicate-template` | Duplicate `[Template] Switchflow Fill & Capture` (`name` or `campaignId`, optional `templateId`). Binds if the Compass campaign is unbound. Stays paused. |
| `GET` | `/api/agent/outbound/waves` | Morning Waves desk: columns, Instantly rates, 90-day retarget count, suggestions, briefs, actions |
| `POST` | `/api/agent/outbound/waves` | Atomic, revision-checked editorial publication. Requires day, publisher, runId, decisionRevision, expectedRevision and recommendation. See [publication contract](WAVE_BRIEF_PUBLICATION.md). Never activates Instantly. |
| `GET` | `/api/agent/outbound/pathway` | Trade/list recipe: stage tools, opener templates. Honour `skip`. Then run list-builds / `generate_openers.py` |
| `POST` | `/api/agent/outbound/pathway/runs` | Log cost, time, sendable count, opener coverage per run/stage |
| `POST` | `/api/agent/instantly/push-leads` | Agent twin of lead push |
| `POST` | `/api/agent/instantly/push-sequence` | Agent twin of sequence push |
| `GET/POST` | `/api/cron/daily-sync` | Vercel Cron daily runner |
| `GET/POST` | `/api/agent/cs` | Weekly retention run. GET = board counts. POST = recompute + persist drafts (`persist:false` to dry run). Review at `/operations/cs` |

Kinds: `offers` | `expressions` | `structures` | `ctas` | `subjects` | `openers` | `templates`.

List filters: `offer_key`, `vertical`, `location`, `q`, `archived=1`, `limit`, `full=1`.

### Experiment fields (campaign copy)

`hypothesis`, `experiment_factor` (`none|cta|expression|structure|offer|audience`), `experiment_role` (`none|control|challenger|solo`), `parent_campaign_id`, `experiment_status` (`none|queued|running|ready_to_call|won|lost|killed|inconclusive`), `sample_size_target`, `experiment_decision`, `expression_key`, `cta_type`.

One factor per challenger card. A/B = two Instantly campaigns (not Step variants).

### Wave fields (campaign copy)

`opener_reviewed_at`, `copy_confirmed_at`. Activate stays in Instantly — Compass only lists blockers.

PATCH `opener_reviewed_at: true` (or an ISO stamp) / `copy_confirmed_at: true` on the same copy route. Confirm Compass copy matches the Instantly body.

### Outcome metrics

Instantly volume: delivered ≈ sent − bounced. Compass ledger: positive = `interested` or `meeting_booked` (also `booked`/`converted`); meetings = `meeting_booked`/`booked`. Score positive rate and meetings per 100 delivered. Ignore opens. Instantly `total_opportunities` is not meetings.

Example:

```bash
curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/outbound/campaigns/campaign-au-plumbers-capture-2026-08/copy" \
  "${AUTH[@]}" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"hypothesis":"Permission CTA beats timed ask","experiment_role":"control","experiment_status":"queued","cta_type":"permission"}'
```

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads?view=counts&vertical=plumber" "${AUTH[@]}"
```

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads?view=rows&columns=cohort&pipeline_campaign_id=none&vertical=plumber&state=NSW&limit=2000" \
  "${AUTH[@]}"

curl -sS -X POST "$COMPASS_BASE_URL/api/agent/leads" \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"defaults":{"vertical":"plumber","source":"apify"},"rows":[{"email":"shop@example.com.au","company":"Example Plumbing","city":"Marrickville","state":"NSW"}],"on_conflict":"email"}'
```

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads/cohort?pipeline_campaign_id=campaign-au-plumbers-capture-2026-08&enrich_status=none,queued&limit=50" \
  "${AUTH[@]}"

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"ids":["…"],"pipeline_campaign_id":"campaign-au-plumbers-capture-2026-08","cohort_tag":"inner-west","enrich_status":"queued"}'

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"rows":[{"id":"…","enrich_status":"enriched","lead_facts":[{"kind":"specialty","claim":"SMSF property loans for SMSF trustees","url":"https://example.com.au/services"}]}]}'
```

## Instantly ↔ Leads

**Compass → Instantly (no CSV):** `POST /api/campaigns/:id/instantly/ensure` creates a paused Instantly campaign and binds `instantly_campaign_id`. `push-sequence` writes Compass `sequence_draft` as Instantly HTML steps. `push-leads` bulk-adds cohort leads (`first_name`, `company_name`, `personalization` / `opener`, custom vars), skip-if-in-workspace, verify-on-import, then stamps Compass `in_instantly` + Instantly ids. Never activates.

**Real-time:** Instantly POSTs to `POST /api/webhooks/instantly` on `email_sent` (sets `in_instantly` + last contact, does not downgrade replies) plus reply + interest changes (`reply_received`, `lead_interested`, `lead_meeting_booked`, `lead_not_interested`, `lead_closed`, OOO / wrong person / bounce / unsub). Auth: `Authorization: Bearer <INSTANTLY_WEBHOOK_SECRET || COMPASS_AGENT_SECRET>` (or `x-instantly-webhook-secret`). Upserts `lead_contacts` for Inbox Instantly.

**Nightly backstop:** Daily `instantly_leads` sync (cron + `POST /api/agent/sync`) lists Instantly reply filters (replied / interested / meeting / not interested / OOO / wrong person / closed) and upserts by `instantly_lead_id` or email. Inbox Instantly also reads legacy `replied_positive` / `replied_negative`.

**Operator rule:** Meeting booked is not automatic from calendar. Mark Instantly interest `meeting_booked` when you book — webhook then updates Compass.

## Agent skill

See [`.cursor/skills/compass-agent/SKILL.md`](../.cursor/skills/compass-agent/SKILL.md).

## Cursor MCP

Lean stdio server at `mcp/server.mjs`. Env: `compass-web/.env.local` then process `COMPASS_BASE_URL` / `COMPASS_AGENT_SECRET`. Hosted default `https://compass-web-eosin.vercel.app`. Tools: `brief`, `campaigns`, `leads.search`, `leads.commit`, `leads` (deprecated inventory|cohort), `mark` (deprecated), `copy` (get|patch), `land` (ensure|push_sequence|push_leads), `commit`, `ledger`, `export`. No ads, no library CRUD, no Instantly activate. `push_leads` is dry-run unless `dryRun=false`. switchflow-os workspace: `.cursor/mcp.json` server name `compass` (`node compass-web/mcp/server.mjs`).

Lead CRUD is this HTTP surface or Compass MCP. Not Supabase MCP, not PostgREST, not Instantly MCP create.
