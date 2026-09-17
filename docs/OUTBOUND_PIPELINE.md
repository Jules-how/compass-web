# Durable outbound foundation

The foundation reuses `compass_lead_lists`, `crm_companies`, CRM evidence and contact identities. Company memberships do not require email or a synthetic lead. Existing recipient lists remain intact; this migration does not infer company identities from domains or backfill legacy contacts.

## Availability and authority

Apply `20260915090000_crm_research.sql` before `20260917090000_outbound_pipeline.sql`. Required flags are `COMPASS_CRM_RESEARCH=1`, `COMPASS_CRM_RESEARCH_WRITES=1`, `COMPASS_OUTBOUND_PIPELINE=1`, and `COMPASS_OUTBOUND_PIPELINE_WRITES=1`. Reads require the two enable flags; writes also require both write flags. Missing schema and disabled/read-only states return explicit errors, never fixtures.

Operator endpoints are `/api/operator/outbound/pipeline` and agent endpoints `/api/agent/outbound/pipeline`. Both use the same services/RPCs. Operator POST requires same-origin and operator authentication; agent POST requires agent authentication. Only an operator can approve a run checkpoint or supply an assessment override reason. Agents cannot set draft approval or run state through generic records. No endpoint activates campaigns or dispatches a paid provider request.

## Read contract

`GET /capabilities` reports schema readiness and flags. `GET /?collection=companies&list_id=...&stage=research&limit=50` returns `{schema_version,records,next_after,total_matching}`. Maximum page size is 100. Company pages apply keyset and limit inside `outbound_pipeline_companies(filters, after, limit)` and take `total_matching` from `outbound_pipeline_company_count`. `next_after` is opaque and bound to the collection/filter scope; pass it unchanged as `after`, resetting it when filters change. `fields=id,name,fit` projects bounded output. Companies accept q/city/suburb/country/administrative_region/fit/stage/status. Stage selects a task view: untouched memberships remain visible with ready/held status.

Other collections: lists, memberships, workflows, templates, assessments, stages, recipients, drafts, signals, runs, items, attempts. Use relevant list_id/company_id/recipient_id/run_id/item_id/workflow_version_id/id scope. Non-company collections support `changed_since`. Draft collection is exact immutable history; recipient profiles expose `current_draft_id`. Recipients include company_name, name, role, attribution_status, mailbox_result, checked_at, suppressed and eligibility. `review_policy` is deliberately not a claim of export readiness.

Read uncertain writes with `collection=receipts&request_id=...`; receipt includes payload_hash, authenticated actor, source and original result. Repeating identical commands with the same request ID returns the original receipt. Changed payload/actor conflicts.

## Atomic records

POST root accepts:

```json
{"schema_version":"outbound.pipeline.v1","request_id":"stable-request-uuid","source":"Compass operator","operations":[{"kind":"membership","expected_revision":0,"record":{"id":"new-uuid","list_id":"existing-list-id","company_id":"existing-crm-company-id","active":true,"origin":"operator selection"}}]}
```

One transaction commits all operations or none. Response is `{request_id,results:[{id,kind,revision}]}`. Record kinds and nested policy schemas are in `outbound-pipeline-schema.ts`; exported types are in `outbound-pipeline.ts`. Mutable records require the current revision; immutable versions/history require zero. Legacy list updates advance the same revision.

Workflow versions bind a real `compass_offer_revisions.id` and a saved ICP snapshot (criteria IDs, readable labels/instructions, required/exclusion flags), custom signals, ordered tools, fallback outcomes, retry limits, cache policy, budget, checkpoint stages, roles and verification policy. Updating a workflow creates a new immutable ID. A list must reference matching offer/ICP IDs from that workflow.

Assessments reference current same-company evidence and the company's `input_revision` returned by the table API. This input revision combines identity and a separate evidence revision; evidence inserts do not change the existing CRM identity revision/receipt contract. Explicit positive exclusions produce anti_icp, failed required criteria non_fit, positive evidence with gaps likely_fit, all required supported sure_fit, otherwise unknown. Signals preserve source, quote, observed time, evidence strength, usefulness and correction lineage.

Draft changes create a new ID with `previous_id` equal to the current draft, exact copy and provenance. A unique successor constraint rejects concurrent replacement. This supports replacing manual drafts and restoring old text as another revision without mutating history. Draft approval is always false. A caller can atomically apply up to 100 successor operations; larger frozen apply jobs and approval/preparation binding are extension work.

`location` updates enrich an existing canonical CRM location with country_code, administrative_region, city, suburb, postcode and IANA timezone using its current revision. Existing CRM creates the initial location/source. Its strict legacy writer has not yet adopted the new fields, so international editing should use this path until that schema is extended.

## Durable run actions

POST `/runs` (or root) uses `{schema_version,request_id,source,action,run_id,expected_revision,data}`. Start uses revision zero and data `{list_id,workflow_version_id,stage,filters?,company_ids?,verification_run_id?}`. Omitting company_ids freezes all matching rows server-side; selected IDs further restrict it. Membership and eligibility are frozen into work items with input revisions. Empty scopes are blocked with an explicit reason.

Contacts starts only from current likely/sure fit. Verify/write expand all suitable recipients and exclude known suppressed companies. Write requires valid verification. `reuse_days>0` permits the saved age window; zero requires an explicitly referenced completed verification run from the same list/workflow and recipient, retaining its exact verification IDs. It does not use an impossible `checked_at >= now()` comparison.

Actions:

- claim: empty data; returns one item, lease_token and five-minute lease. Per-run concurrency is enforced.
- heartbeat: item_id and lease_token.
- reserve_attempt: lease plus attempt_id, saved tool_id, stable provider_request_id, estimated_cost and currency. Saved tool order/fallback/retry and budget are checked atomically before external dispatch.
- report_attempt: lease plus attempt_id, status completed/uncertain/failed, outcome success/empty/insufficient/retryable (nullable), actual_cost (nullable), source_ids and duration_ms (nullable). Reporting already-submitted results remains allowed after cancellation. Unknown actual cost stays null, retaining its reservation.
- finish_item: lease plus status completed/held/failed and result with assessment_ids/recipient_ids/verification_ids/draft_ids or reason. Completed stages require matching persisted outputs and successful attempts when tools are configured. Completion reaches checkpoint, completed or blocked according to saved policy and failures.
- checkpoint: reason; approve: operator only; cancel: prevents new work; resume: only blocked/failed and no uncertain/reserved attempts. Resume cannot bypass a checkpoint.

Every action returns `{request_id,run,item,attempt}`. Use its new run revision for the next action. Interrupted leases are reclaimable unless a submitted/uncertain attempt must first be reconciled. Provider calls are not claimed exactly-once; adapters must reuse provider request identity and reconcile uncertain submissions.

## Remaining release work and extension points

This branch now includes frozen template/export/membership jobs, paused Instantly delivery, resumable provider readback (100-row pages, repeated-cursor detection), AI bulk apply via connected-executor copies, recipient/region filters, and MCP tools for pipeline/jobs/delivery/readback. Remaining before production: independent review; hosted migration/flag rehearsal and cutover; viewport/zoom visual acceptance; live 100k CI confirmation after this push. Do not activate campaigns or run paid prospecting from this work.

Run item completion records durable evidence, not campaign sends. Historical assignments do not establish past outreach. Preparation must still enforce actual prior sends and fresh suppression, exact copy, sender/settings policy and approval independently.

## Validation and rollback

Focused local command: `TZ=UTC node --test --test-concurrency=1 test/outbound-pipeline*.test.mjs test/crm-research-database.test.mjs`. UTC avoids an existing CRM fixture's date-only timestamp dependence. Tests rehearse additive migrations with PGlite and exercise atomic/idempotent writes, stale revisions, foreign evidence, immutable drafts, tool/lease/checkpoint control, untouched stages and zero-reuse verification scope. No production data or provider calls are part of these tests.

Rollback first disables the pipeline write/enable flags and restores the previous UI route. Do not drop new tables, evidence or histories. Existing lists and CRM remain canonical, but old surfaces cannot display pipeline drafts, assessments, run receipts or company-only memberships. Rehearse deployment/backfill separately and reconcile counts before enabling writes.

## Frozen template and general export jobs

Apply the additive `20260917100000_outbound_pipeline_jobs.sql` after the foundation. `/pipeline/jobs` uses the same operator/agent authentication and receipt namespace. POST envelope is `{schema_version,request_id,source,action,job_id,expected_revision,data}`; returns `{request_id,job,processed?}`. GET `?job_id=` returns `{job}`; adding `items=1` reads up to 100 frozen items with an opaque `next_after` cursor. No job automatically executes paid tools.

`preview_apply` data is `{current_list_id,list_ids?,template_version_id}` and expected revision zero. Omitted lists default to current list. It freezes every existing current draft across those lists, its exact prior ID/revision, company input revision, and usable signal inputs, including AI templates. Config reports manual_count. Deterministic `apply_chunk` uses empty data and the current job revision; it renders and commits at most 100 frozen items through the same draft transaction. AI `apply_chunk` requires actor `agent` and `data.copies` mapped by frozen item_id; the operator UI previews only and does not submit AI copy. Concurrent draft/evidence changes become conflicts; missing required signals become failures. Existing manual copy is replaced while exact history remains. Provenance is `ai` or `template` from the frozen policy.

`create_export` data is `{list_id,grain:'companies'|'recipients',columns,filters?,company_ids?}` and expected revision zero. This freezes matching rows, including company-only and held outcomes. `export_chunk` commits at most 100 rows using the current revision. GET `/pipeline/jobs/artifact?job_id=` streams only a fully completed artifact, one persisted chunk at a time. CSV uses selectable allowlisted columns, RFC4180 quoting and spreadsheet formula protection. This is a general data export, not approval to send. Current draft edits or evidence changes do not alter a frozen export.

Verify/Write run creation expands all eligible canonical email candidates, preserving people/methods and deduplicating actual mailboxes per list. Suitability independently requires a published general/department inbox or supported current person attribution with a saved target-role match (case-insensitive phrase match). Setting recipient suitable alone cannot bypass this rule. Write runs require template_version_id; their completion output must use the frozen template. Shared mailboxes with multiple supported people do not expose a confident named greeting.

## Cutover and legacy compatibility

`COMPASS_OUTBOUND_PIPELINE_SURFACE=1` is a separate UI cutover flag. Core CRM/pipeline flags can enable schema rehearsal and backfill while a bare Outbound navigation still opens the existing Overview. Set the surface flag only after migration, legacy reconciliation and hosted read/write checks; explicit Leads links remain available for testing real records.

Apply the international contacts and legacy bridge migrations after the foundation, then the jobs/delivery/executor migrations in timestamp order. The canonical CRM writer accepts international fields and preserves them when an older client omits them. Social routes remain separate methods; phone classification belongs to the company/contact candidate. Existing raw values are preserved.

`POST /api/agent/crm/legacy` (operator equivalent) previews up to25 source rows, then imports exact ID/updated-at pairs under an idempotent request ID. No lead or provider records are changed. Each source snapshot is retained, invalid routes are reported, missing-company rows are held, and pre-existing proposed/rejected links need review. Exact historical name/full-site/city/state tuples can share an **unreviewed** company identity; missing tuple fields remain distinct. Domain alone never merges companies. Legacy outbound company correspondences remain proposed. Historical fit and verification are pending evidence, not live eligibility. Original sender/campaign/copy/suppression fields remain on the untouched lead ledger.

Run `node scripts/import-legacy-crm.mjs` to preview. After rehearsal, `--apply --state=/absolute/path/state.json` processes bounded packets with crash-safe request replay and a frozen upper ID boundary. Reconcile imported/held/already-linked counts and retain the state file. A completed migration loop does not imply every held identity was resolved.

See `OUTBOUND_CONNECTED_AGENT.md` for actual connected-agent adapter registration, work leases, saved-tool execution and paused transport boundaries. Capability reports contain no credentials. New attempt reservations require a current probe and attached executor session; already submitted results can still be recorded after disconnect.
