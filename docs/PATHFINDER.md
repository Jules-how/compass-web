# Pathfinder — first implementation

Pathfinder is the default `/planning` view. `/planning?view=records` keeps the existing goals, notes, time and run surfaces. `/planning?goal=<existing ID>` focuses an outcome. No sample goals or synthetic business figures are seeded.

## Delivered scope

- Circular interactive map; strategy/route/execution semantic levels, keyboard Enter, search, list alternative, fit, present, goal focus, achieved/proposed filters and local viewport/position persistence.
- Existing task/project/checkpoint identities and detail experiences. Projects can support multiple outcomes. Contribution and hypothesis links are distinct from existing project prerequisites.
- Extended canonical goals support numeric increase/decrease targets or observable qualitative conditions. Agent edits cannot commit or overwrite approved goals.
- Dated append-only observations bound to a goal revision. Measured, reported and estimate provenance remain distinct; only source-verified measurements satisfy achievement. Task completion is never used to establish an outcome. Legacy goal actuals are visible as earlier entries, not silently verified evidence.
- Stable goal/issue keys, optimistic revisions, source references and append-only audit. A retry cannot create another task for an issue; concurrent task creation is locked in Postgres and calls the existing Sync v2 task creation RPC.
- HTTP and MCP daily-agent context/review, findings shared with Home, and updated operator prompt. No new schedule or external action authority.
- Successful canonical work writes broadcast same-tab and cross-tab refresh. Mounted task/project/Pathfinder caches poll every 30 seconds while the browser document is visible and refresh on focus. Home uses work-change/focus refresh; its integration reads are not polled. Server reads have explicit failure states.

## Deployment

Apply `supabase/migrations/0081_compass_pathfinder.sql` before deploying the application. It requires the existing `compass_settings`, `compass_tasks`, `portal_is_operator()` and `portal_operator_create_task_mutation(jsonb)` schema. The task creation and `portal_operator_apply_task_mutation(text,jsonb,bigint)` functions are inherited infrastructure whose definitions are not in this checkout; verify their deployed signatures. The migration creates only Pathfinder links, observations, findings, audit and the idempotent operator task-link/creation command and an optimistic task-edit wrapper. It does not change any goal, task, schedule or business data.

Restart/reconnect the existing Compass MCP runner after deploy to expose `pathfinder` and `pathfinder.review`. Apply the updated `DAILY_OPERATOR_PROMPT.md` to the existing daily operator configuration; a repo prompt edit alone does not establish deployment.

## API

Operator: `GET/POST /api/pathfinder` (operator session; same origin required for writes).
Agent: `GET/POST /api/agent/pathfinder` (existing agent bearer secret); optional `goal_id` on GET.
`src/lib/pathfinder/contracts.ts` is the executable command schema.

- `link`: validated references to real work; agent may write proposals, operator approves links.
- `observe`: immutable idempotency key, goal revision, value or acceptance, source, observation time and reporting period. Agent provenance is reported/estimate; measured observations require the operator to verify their source. There is no automatic billing-to-MRR adapter in this stage.
- `review`: stable issue key and expected revision (0 to create); actor and timestamps are assigned by the server. Closed issues cannot be reopened by agents.
- `create_task`: operator only; issue ID and optional existing_task_id. The finding offers existing tasks before creation. Reuses the same task on retry, leaves it undated until a date is intentionally assigned. No external action is performed.

## Release checks

Use test fixtures in an isolated environment, not production sample records:
1. Define an approved numeric outcome and link an existing project and task. Edit task status/title from the map and kanban; verify both directions, another tab and a server write. Check project detail and Home too.
2. Record reported, estimated and measured values. Only the measured value can establish achievement; stale evidence and evidence for an earlier definition remain visibly qualified.
3. Complete every supporting task without outcome evidence: outcome remains unknown. Test qualitative acceptance without percentage and decreasing targets.
4. Repeat a finding tomorrow with the same key, changed title and expected revision. It retains identity. Concurrent/repeated Create linked task requests create exactly one canonical task.
5. Propose links or edit assumptions: no task/backlog or target mutation. A changed estimate does not move the chosen date.
6. Attempt agent mutation of a committed goal and agent measured achievement; both reject. Failed/conflicting writes must not show saved success.
7. Navigate all controls by keyboard, Escape back to the trigger, reveal detail by zoom or explicit level buttons, and retain map positions after data refresh/reopen.
8. Run the actual existing daily agent once after deployment and read its persisted output back through both HTTP and the UI. Do not claim recurring integration verified from unit tests or tool registration alone.

## Verification performed locally

Production build, typecheck and deployment guards passed. Lint completed with existing warnings outside Pathfinder.

- 41 focused tests passed: planning contracts, outcome assessment, graph semantics, MCP transport and the actual migration against isolated Postgres-compatible PGlite. Existing task RPCs are test boundaries, not a substitute for checking their deployed implementation.
- Actual Pathfinder and kanban React components were exercised together using labelled local fixtures: map task completion propagated to Done; moving the kanban task to Doing propagated back to the map; outcome remained unknown without observations. A target-level reported observation remained unverified.
- Explicit detail selection and fit preserved visible execution nodes. Keyboard Enter opened the existing task panel, and Escape restored focus to its list trigger. The narrow-screen list had no horizontal page overflow.
- No production data was read or changed for these fixtures. Cross-tab/server polling, migration application, real agent persistence and the daily automation configuration still require the release checks above in a deployed test environment.

## Subsequent stages

Coordinated target/commitment/forecast timeline, capacity allocations, reproducible business-driver projections and fully versioned alternative-route adoption remain subsequent stages. The first release explicitly shows forecast/capacity unavailable rather than using billing projections or task counts as substitutes. Existing execution routines still own external work and its permissions. There is no general-purpose automatic project creation or external execution engine in Pathfinder.
