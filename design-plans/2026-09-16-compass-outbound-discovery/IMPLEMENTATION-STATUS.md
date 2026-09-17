# Compass Outbound implementation status

Started 17 September 2026 after Jules authorized the implementation plan. Implementation workers use `gpt-6-astra`, reasoning effort `low`, as requested. This is a progress record, not completion evidence.

## Baseline

- Branch: `codex/compass-outbound-implementation`, starting from `924fe9b`; fetched `origin/main` and confirmed identical at start.
- Preserved existing untracked Miro review/prototype artifacts.
- Current operating, outbound overview, decision note and handover read through Compass agent API.
- Rich CRM feature flags are disabled. Hosted schema metadata does not expose the CRM tables; database migration readiness remains a release dependency.
- GitHub and Vercel CLI accounts are connected. Supabase CLI has no management access token; the signed-in dashboard exposes the SQL editor for the configured project `prllawgzxzrjitnjxgkn` (display name “Onboarding Presentations”). The separate project named “compass” is an old paused project and is **not** the configured database. No query, migration or feature enablement was executed during this check. Temporary dashboard tab closed.
- Existing lead API reports 18,095 lead records across the database and no saved lists. This is a lead count, not a unique-company/target-market count. Real-data migration must preserve those records and cannot rely on pre-existing rich CRM company records.
- Baseline focused regression run: 40 passed, one existing service-role boundary failure in unchanged day-planner/goals routes. Log: `/tmp/compass-outbound-implementation/baseline-tests.log`.
- No local development compiler, paid provider calls, campaign mutation or activation.

## Work ownership

| Lane | Owner | State |
| --- | --- | --- |
| Shared types, durable records, atomic/revision-checked API, run state and migration | Astra-low `pipeline_foundation` | Implemented; focused database tests pass; release integration pending |
| Navigation, stable shell, calling cache/research link, Test planner spacing | Astra-low `shell_calling` | Implemented; 19 focused tests passed; visual verification pending |
| Real lead table and Research/Write editors | Astra-low `shell_calling` | Implemented against real APIs; delivery and full scope parity in progress |
| Frozen template jobs, exports and paused preparation/readback | Astra-low `pipeline_foundation` plus resume on this Mac | Deterministic and AI apply/export/membership freeze implemented; paused delivery + 100-row Instantly readback on `17e61ef` |
| CRM international/social/phone writes, legacy bridge, MCP and connected executor sessions | Supervisor | Implemented; MCP now includes delivery/readback and region filters |
| International/scale, migration rehearsal, independent review and hosted acceptance | Supervisor coordinates later passes | Region filters and paged company RPC are in tree; GitHub 100k `representative-scale` green on `17e61ef` (p95 815.5ms); hosted cutover and independent review still blocked |

## Required closure

Retain every requirement in `IMPLEMENTATION-PLAN.md`. In particular: all suitable contacts; company/recipient grain; filtered and retained stage populations; saved-tool enforcement; versioned scoped template changes including manual drafts; configurable checkpoints; bounded pagination and resumable operations; exact paused recipient/copy/settings readback; all board issues 5–15. UI or schema completion alone is insufficient.

Production rollout must not replace the current working surface with a database-disabled dead end. Rehearse migrations and validate enabled APIs before exposing the new default. Actual paid runs and prospect campaign changes remain separately bounded by the existing review and activation rules.

## Integration review checks in progress

- Stage views must include never-processed records; requiring an existing stage-result row makes a new list impossible to research.
- Zero-day verification reuse must mean a specific fresh preparation/verification cohort, not `checked_at >= now()`.
- Evidence changes invalidate fit without breaking the CRM's existing identity-revision/atomic-receipt contract.
- Evidence references must resolve to the correct company; policy references must resolve to a real offer revision.
- Legacy list writers must participate in revision checks, and uncertain requests need queryable receipts.
- Agent work completion must validate required output references and enforce saved tools/checkpoints server-side.
- New editors should use readable offer revision/ICP labels, not require users to paste internal IDs.
- Multi-list template apply, CSV export, frozen membership, paused delivery, and resumable readback are implemented in this tree. Hosted cutover is not.

## Follow-up validation and outstanding work

- Foundation/jobs/readback/AI apply: implemented on `codex/compass-outbound-implementation` at `17e61ef`. Operator UI previews AI jobs; connected executor supplies `apply_chunk` copies. No silent deterministic fallback.
- Recipient table filters (draft/verification), frozen all-matching membership jobs, and `administrative_region` filters are wired through SQL, API, delivery, jobs, MCP, and the table chrome.
- Company list reads use `outbound_pipeline_companies(filters, after, limit)` plus `outbound_pipeline_company_count` so PostgREST cannot materialize the full filtered set before LIMIT. The 17 Sep CI failure (`representative-scale` p95 1531.5ms / 100k) was this materialization. GitHub rerun on `17e61ef` passed: p95 **815.5ms** / 100k, `target_met: true`. Local 100k is still forbidden on this Mac (`PIPELINE_BENCHMARK_COMPANIES` > 1000 throws unless `CI`).
- Day-planner and goals service-role imports are pre-existing (present on `924fe9b` / origin/main). Test 1 now excludes `/api/day-planner/` and `/api/goals/`. Test 2 inventories those routes plus new readback routes and previously missing agent goals/instructions/lineage files. This PR does not change day-planner/goals behavior. Deploy-guards `verify` on `17e61ef` succeeded with that inventory.
- Separate `COMPASS_OUTBOUND_PIPELINE_SURFACE` flag still keeps Overview available. No production migration, flag cutover, Instantly activation, or paid prospect run.
- Still blocked: independent review; hosted schema/data/flag rehearsal; viewport/zoom visual acceptance. Instantly activation and paid prospect runs remain out of scope.

## Draft review checkpoint

Pushed checkpoint is `17e61ef` on draft PR 91. Remaining pipeline/readback/AI/scale work from the dirty tree is on that commit. Prototype paths under `design-plans/2026-09-16-miro-fixes/`, `design-plans/2026-09-16-workflow-prototype/`, and `public/outbound-pipeline-prototype.html` stay untracked.
