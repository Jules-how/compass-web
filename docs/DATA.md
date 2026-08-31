# Compass data layer (Wave 4)

Append-only evidence, component stats, and ranked digest actions.

## Event taxonomy (`compass_evidence_events`)

| Type | Source | Grain | Idempotency key |
| --- | --- | --- | --- |
| `email.sent` | `instantly` | day (backfill) or per-email (webhook/backfill) | `instantly:email.sent_day:{campaign}:{date}` or `instantly:email.sent:{lead}:{campaign}:{ts}` |
| `email.replied` | `instantly` | lead × campaign | `instantly:email.replied:{lead_id}:{campaign_id}` |
| `lead.interested` | `instantly` | lead × campaign | `instantly:lead.interested:{lead_id}:{campaign_id}` |
| `lead.meeting_booked` | `instantly` | lead × campaign | `instantly:lead.meeting_booked:{lead_id}:{campaign_id}` |
| `lead.unsubscribed` | `instantly` | lead × campaign | `instantly:lead.unsubscribed:{lead_id}:{campaign_id}` |
| `email.bounced` | `instantly` | lead × campaign | `instantly:email.bounced:{lead_id}:{campaign_id}` |
| `invoice.created` / `invoice.paid` / `invoice.overdue` | `qbo` | doc | `qbo:{type}:{doc_id}` |
| `form.submitted` | `onboarding` | form | `onboarding:form.submitted:{form_id}` |
| `call.*` | `voice` | call | `voice:{type}:{call_id}` |
| `job.showed` | `delivery` | call | `delivery:job.showed:{call_id}` |
| `page_view` / `cta.tel_click` / `cta.sms_click` / `form.submit` | `sites` | hit | `sites:{type}:{native_id}` |
| `pipeline.stage_changed` | `compass` | lead × stage | `compass:pipeline.stage_changed:{lead}:{stage}:{ts}` |
| `cs.health_scored` | `cs` | client × week | `cs:cs.health_scored:{snapshot_id}` |
| `cs.weekly_summary` / `cs.monday_sms` / `cs.monday_email` / `cs.save_play` / `cs.guarantee` / `cs.qbr` | `cs` | artifact | `cs:{type}:{artifact_id}` |

Client results portal (switchflow-sites `/results/[slug]`) reads this spine. Captured = unique `call.*` call ids. Booked = `call.booked`. Showed = `job.showed`. Estimated recovered revenue = showed × the shop's average job value. Same snapshot writes the Monday SMS and email. Seeded demo: Harbour Pipe Rescue. Do not cite those counts as a live case study.

Tags on Instantly events:

- `campaign` = Instantly campaign id
- `vertical` / `offer` from bound `compass_pipeline_campaigns` (`vertical_tags`, `offer_key`)
- `messaging_component` null at campaign grain

Positive outcomes = `lead.interested` + `lead.meeting_booked`. Ignore opens. Do not trust Instantly `total_opportunities`.

Writers: `src/lib/instantly-webhook.ts` (live), `src/lib/instantly-backfill.ts` (history), `src/lib/evidence-poller.ts` (QBO/onboarding/voice/pipeline), `src/lib/cs-dept/store.ts` (retention snapshots).

## Instantly backfill runbook

Read-only against Instantly. Never activates campaigns or sends mail.

1. Review target env (not production unless intended).
2. Dry-run: `COMPASS_AGENT_SECRET=… node scripts/backfill-instantly.mjs --dry-run`
3. Live (after review): drop `--dry-run`. Dev server on `3100` or set `COMPASS_BASE_URL`.
4. Agent route: `POST /api/agent/instantly/backfill` with `{ dryRun?, reset?, maxCampaigns? }`.
5. Cursor: `compass_sync_snapshots.id = instantly_backfill` (`completed_campaign_ids`, `lead_starting_after`).
6. Reset cursor: `--reset` or `{ reset: true }`.

Per campaign: daily analytics → `email.sent` (day grain); paginated `/leads/list` → reply/interest/meeting/bounce/unsub events; optional `/emails` for per-email sent.

## Component stats (`compass_component_stats`)

Recomputed after Instantly glance in daily sync (`recomputeComponentStats` in `src/lib/component-stats.ts`).

| Grain | Source |
| --- | --- |
| `vertical`, `offer`, `cta`, `subject`, `length` | Instantly campaign analytics + pipeline bind + `outbound-factor-performance` |
| `opener_kind`, `research_kind` | `lead_contacts` + evidence outcomes |

Windows: `7d`, `30d`, `all`. Sorted by `meetings_per_100` then `positive_rate`. Rows with `delivered < 200` are low-confidence in the UI.

Provenance: CTA/subject keys append ` · source` or ` · yours` when `compass_outbound_structures.provenance` is known.

API: `GET /api/component-stats?grain=offer&window=30d` (operator).

## Digest action ranking

Extended in `buildProposedTasks` (`src/lib/evidence-poller.ts`). Uses `src/lib/action-ranking.ts`.

**Score** = `cash_at_stake × urgency × confidence`

| Source | Cash | Urgency | Confidence |
| --- | --- | --- | --- |
| Overdue QBO invoice | `balance` | 1.0 | 1.0 |
| Contracted, no install invoice | `install_aud` | 0.7 | 1.0 |
| Retainer due ≤7d, no monthly invoice | `monthly_aud` | 0.7 | 1.0 |
| Hot lead (replied/interested/meeting), no open task | 1997 | 0.7 | event count |
| Live campaign: 14d positive rate ≪ 90d baseline (≥200 delivered) | 1997 | 0.4 | event count |
| Winning vertical + uncontacted inventory | 1997 | 0.4 | inventory count |

`confidence = min(1, n/30)` for n &lt; 30 (floor 0.2 when n=0).

Top 5 proposed items. Dedupe: skip if an open task has the same `execution_contract.fingerprint`. On accept, proof clauses attach when defined.

Campaign underperforming: 14d positive rate &lt; 60% of 90d baseline, both windows ≥200 delivered.
