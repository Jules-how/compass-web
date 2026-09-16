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
| Frozen template jobs, exports and paused preparation/readback | Astra-low `pipeline_foundation` | Deterministic apply/export implemented and tested; aggregate preparation/readback in progress |
| CRM international/social/phone writes, legacy bridge, MCP and connected executor sessions | Supervisor | Implemented; international and legacy/MCP focused tests pass; executor tests pending |
| International/scale, migration rehearsal, independent review and hosted acceptance | Supervisor coordinates later passes | Pending |

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
- Multiple-list template application, exports, provider adapters and resumable paused-load checking still require their follow-up implementation lanes.

## Follow-up validation and outstanding work

- Foundation/jobs: latest worker run 10/10 pipeline tests, plus earlier CRM rehearsal tests. Serial execution throughout.
- Navigation/calling/Timeline cleanup: latest 41 focused tests pass; scoped semantic UI TypeScript check passed. Browser viewport/zoom acceptance remains pending.
- Canonical international writer and phone classification: additive migration test passed, including old-writer preservation and rejection of phone labels on email records.
- Conservative legacy bridge + MCP: 29 focused tests passed. Bridge retains full source snapshots and never changes the lead ledger's copy, suppression or sending state; exact tuple identities remain unreviewed. A subsequent proposed old-company link addition awaits rerun.
- Memory pressure briefly reached warning (2) after a PGlite run; heavy checks paused. It returned to normal (1), and swap declined from about3.18GiB to1.57GiB before serial checks resumed. No processes killed or extra browser tabs opened.
- Connected executor readiness/lease trigger implemented but awaiting its focused database test. Capability reports are explicitly agent probes, never inferred credentials.
- Separate `COMPASS_OUTBOUND_PIPELINE_SURFACE` flag keeps Overview available during API schema/backfill rollout; bare Outbound changes to Leads only after cutover.
- Remaining behavior: AI template bulk application; consistent recipient filtering; frozen all-matching membership changes; paused delivery/readback completion; international region filters; representative100k CI benchmark; independent review; hosted migration/data/viewport acceptance.
- CI benchmark definition added for100k companies with representative contact/evidence fan-out. It has not run and is not scale acceptance evidence.
- No production migration/flag changes, source push, deployment or live prospect/provider actions yet.

## Draft review checkpoint

Full `npm run verify` passed (deployment guards and repository typecheck). Root integration30/30 passed, including the connected executor reservation guard. Source is being checkpointed to a draft PR so representative-scale CI can run off the Mac. This checkpoint is incomplete: readback, AI apply, remaining integration and hosted cutover remain pending.
