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
- `0045_campaign_wave.sql` — `opener_reviewed_at`, `copy_confirmed_at` on pipeline campaigns
- `0050_drop_wave_cap.sql` — drop unused campaign column
- `0047_lead_website.sql` — `website` + `company_domain` on `lead_contacts`

Operator UI also exposes `GET/POST /api/outbound/copy-archive` (+ `[id]` PATCH/DELETE) for saved sequences with vertical tags, component breakdown, Instantly-style performance, and `last_used_at`.

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/agent/brief` | Compact daily brief (~1–2KB). Cached snapshot unless `x-compass-fresh: 1` |
| `POST` | `/api/agent/sync` | `{ sources?: ['ads','instantly','instantly_leads'] }` |
| `GET` | `/api/agent/leads` | Lean Instantly-hot leads (`status`, `limit`, `q`) |
| `GET` | `/api/agent/leads/inventory` | Uncontacted counts by vertical × state (orient) |
| `GET` | `/api/agent/leads/cohort` | Harvest input: contacts on a pipeline campaign (`pipeline_campaign_id` required; `enrich_status`, `unverified_only=1` skips `email_verified_at`, `limit`, `offset`) |
| `PATCH` | `/api/agent/leads/mark` | Bulk `ids[]` or `emails[]` for campaign/cohort/`enrich_status` / Instantly land / `email_verify_status` / `email_verified` (max 500). Per-row `rows[]` for `lead_facts` / `opener` / `website` / `company_domain` / Instantly ids (max 50). Facts are `[{kind, claim, url}]`. Website is the company site, not an engager fact. `email_verify_status`: `valid` \| `catch_all` \| `invalid` \| `unknown` \| `risky` \| `none`. `valid` and `catch_all` stamp `email_verified_at`. `email_verified: true` stamps now and sets status `valid` if unset. |
| `GET` | `/api/agent/campaigns` | Pipeline + Instantly glance. Compact `wave` per campaign (`cap`, `cohort`, `openers`, `blocked`, `readyToActivate`) |
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
| `POST` | `/api/agent/instantly/push-leads` | Agent twin of lead push |
| `POST` | `/api/agent/instantly/push-sequence` | Agent twin of sequence push |
| `GET/POST` | `/api/cron/daily-sync` | Vercel Cron daily runner |

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
curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/outbound/campaigns/campaign-au-brokers-growth-2026-08/copy" \
  "${AUTH[@]}" -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"hypothesis":"Permission CTA beats timed ask","experiment_role":"control","experiment_status":"queued","cta_type":"permission"}'
```

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads/inventory?vertical=mortgage-brokers" "${AUTH[@]}"
```

```bash
curl -sS "$COMPASS_BASE_URL/api/agent/leads/cohort?pipeline_campaign_id=campaign-au-brokers-growth-2026-08&enrich_status=none,queued&limit=50" \
  "${AUTH[@]}"

curl -sS -X PATCH "$COMPASS_BASE_URL/api/agent/leads/mark" \
  "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"ids":["…"],"pipeline_campaign_id":"campaign-au-brokers-growth-2026-08","cohort_tag":"wave-1-nsw","enrich_status":"queued"}'

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

Lean stdio server at `mcp/server.mjs`. Six tools mapped to the routes above: `brief`, `campaigns`, `leads` (inventory|cohort), `mark`, `copy` (get|patch), `land` (ensure|push_sequence|push_leads). No ads, no library CRUD, no Instantly activate. `push_leads` is dry-run unless `dryRun=false`. Vault: `.cursor/mcp.json` server name `compass`.
