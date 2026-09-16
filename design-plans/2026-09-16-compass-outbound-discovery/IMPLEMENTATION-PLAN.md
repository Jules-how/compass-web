# Compass Outbound implementation plan

Prepared and approved by Jules on 17 September 2026. Implementation is in progress; implementation workers use Astra with low reasoning effort as requested. See [implementation status](IMPLEMENTATION-STATUS.md) for checked progress and remaining work. This plan does not itself report deployment or provider execution.

Sources: [Compass Outbound Miro board](https://miro.com/app/board/uXjVH8K4o7g=/), all board text and twelve screenshots inspected on 16 September; Jules' interview answers through 17 September; repository baseline `924fe9b29fab02f2b50c1e74d0562ef438f7f9fc`; hosted capabilities checked again on 17 September. [Discovery and annotation evidence](DISCOVERY.md) records individual board links, screenshots and current-code findings. Later explicit user decisions take precedence over older defaults in the repository or operating skills.

## 1. Recommendation and intended result

Rebuild the outbound working surface inside Compass around durable company records, list memberships, evidence and stage results. Extend the existing company research, list, copy and preparation services. Retire the live use of the localStorage demonstration workflow. A separate application would duplicate Compass's identity, navigation and ledger; a cosmetic revision would leave the demonstrated workflow's persistence and stage problems unresolved.

The normal experience is: open Outbound, select or create a list from the real database, filter its companies through List → Research → Contacts → Verify → Write, edit research or writing in a focused view, and export or prepare a paused Instantly campaign. Every excluded, unresolved and failed record remains available with its reason. Research and contact spend follows eligibility and saved tool policy. Writing and export use individual recipients; upstream qualification uses companies.

Implement one complete, real path before broadening the UI. Use one supervising integration agent and, after contracts are fixed, at most two workers with separate ownership. Review independently after integration. This offers useful concurrency without splitting coupled database decisions across agents or overloading the 8 GB Mac. A hierarchy of supervisors is unnecessary.

The first complete release includes all Miro issues 5–15, configurable saved workflows, UI/MCP parity, agent execution, CSV export, paused Instantly loading and actual readback checks. A hosted unattended runner is a later milestone using the same contracts. No campaign activation is part of this plan's release boundary.

## 2. Settled product contract

| Decision | Required behavior |
| --- | --- |
| Default destination | Outbound opens the lead table. Keep the existing operational overview as a secondary destination. |
| Working surface | Stage filters over the same durable list; dedicated Research and Write editing views. Preserve list, filters, selection, scroll position and current record when returning. |
| Record grain | Company rows through qualification; recipient rows in Write/export. Show both company and recipient counts where expansion occurs. |
| Fit | Anti-ICP: explicit exclusion matched. Non-fit: required criterion failed. Likely fit: positive evidence with gaps. Sure fit: all required criteria supported. Missing evidence remains unknown. |
| Progression | Likely-fit and sure-fit companies enter contact sourcing by default. Unknown, non-fit and anti-ICP companies remain visible. An explicit override records its reason and actor. |
| Contacts | Prepare **all suitable contacts by default**. Keep generic inboxes and phone-only outcomes. Do not silently choose one best person per company. |
| Signal strength | Includes usefulness for personalisation and evidence quality; preserve both dimensions so usefulness cannot hide weak evidence. |
| Writing | Deterministic templates by default. Allow an explicitly selected, saved AI writing mode grounded in recorded evidence. |
| Template application | Choose affected lists, with the current list selected initially. Apply to draft recipients, including manually edited drafts. Show the previous template and preserve exact previous drafts for comparison and restoration. |
| Execution | Connected agent first. Agent follows saved tools, order, fallback conditions and limits; no silent tool substitution. |
| Checkpoints | Configurable per workflow. User has not mandated a particular initial preset. |
| Release output | Selectable-column CSV plus paused Instantly loading and recipient/copy/settings checking. Loading is distinct from activation and sending. |
| Scale | User estimates 2,500–3,500 companies for the current AU offer, then 10,000–100,000+ internationally. These are planning inputs, not verified market counts. No fixed user batch ceiling was specified. |

Other board requirements remain binding: UI and MCP list creation; optional location and list-size filters; offer/ICP association; visible membership; city/suburb/ICP/stage filtering; editable research and signal definitions; configured research tools and fallbacks; source and attempt histories; comparable cost/speed/quality reporting; named work contacts, generic emails, distinct phone categories and social profiles; document-like editors; signal-slot and fallback control; calling improvements; clearer contrast and normal-scale layout; stable header; relocated secondary workspaces; test-calendar whitespace removal; marked Timeline removal.

The following are implementation recommendations, not additional user commitments: checkpoints after research and before loading finished copy; version comparison and restoration; the initial sizing and performance targets below; conservative verification freshness. They are configurable product defaults, not reasons to reopen settled requirements.

## 3. User experience

### Table and stage filters

Use one stable shell: page title/list selector, persistent destinations, then stage filters and the table's own toolbar. Put overview and calling in predictable secondary navigation. Remove the competing demonstration progress bars and Define/Review/Load/Observe view hierarchy. Runs and load receipts open from the relevant action or activity panel; they are not another mandatory navigation system.

Stage filters describe the current task over a retained population; they are not a destructive funnel. Provide ready, held, completed and failed subfilters with readable reasons. Selecting Research still permits inspecting anti-ICP and unknown outcomes. Stage counts distinguish companies, people and unique deliverable mailboxes. A progress summary must never label drafted or loaded records as sent. Let database exports explicitly choose company or recipient grain and columns; distinguish a general data export from a send-ready recipient manifest.

The real database chooser supports saved lists, searching, stage, country/region/city/suburb and ICP assessment. Offer and ICP are selectable and versioned. Geography and list size are optional. Preserve membership indicators and membership history; add/remove membership without deleting the company. Support records with no email. Provide a persistent selection summary and distinguish “this page” from “all matching records.” Freeze all-matching selections server-side before a bulk mutation; do not enumerate 100,000 IDs in a browser request.

Company rows expose fit/reason, location, research completeness, strongest usable signals, contact availability and stage outcome. A detail panel shows sources and contacts without expanding every record into a huge table. Write shows each eligible recipient and its company, address, draft status and copy. Phone-only companies stay available for calling even when they cannot enter email writing.

### Research editor

Provide three connected areas: selected ICP and exclusion criteria; signal definitions; research strategy. Show a real sample company and its evaluated results alongside configuration. Save a version, show the affected scope and distinguish saving configuration from executing paid research.

A signal definition has a stable key, human label, type, collection instructions, acceptable evidence, usefulness guidance and writing eligibility. Support geography, street/address, services, specialisations, brands, founding date and custom facts rather than adding a column for every HVAC concept. Adding/removing a signal changes future collection and evaluation; it does not erase historical evidence. Explicit corrections retain the original observation and identify the correcting actor.

The strategy editor selects tools, their order, triggers for fallback, field scope, cache/freshness rules and spending limits. HTTP-to-text, Firecrawl, Parallel, fetch and search are board examples: list an option as executable only after its adapter and credentials pass capability checks. If a saved tool is unavailable, show the affected step and remedy. Run an allowed fallback only when the saved conditions permit it.

Represent evidence quality and personalisation usefulness separately, each high/medium/low/none with a reason. Recommended summary: the weaker supported dimension limits writing strength. Missing/unassessed is distinct from an assessed “none.” Conflicting evidence is visible and cannot become a confident claim merely through an LLM score. Research completion indicates attempted coverage, not truth or fit. Show evidence URL, extract, observation date, tool and applicable freshness for each fact.

Fit is evaluated against a specific ICP version. An explicit exclusion takes precedence; a supported required-criterion failure produces non-fit; positive support with missing required evidence produces likely fit; full required support produces sure fit; no adequate positive support produces unknown. Do not treat zero configured required criteria as automatic sure fit. Conflicting decisive evidence requires resolution or a recorded override. Optional criteria can prioritise without silently becoming hard gates.

### Contacts and verification

Define suitability through the selected workflow's target roles and contact attribution, not mailbox validity alone. Retain every discovered person and method, with source and confidence. Prepare all suitable, eligible contact recipients; named work contacts have display priority, then suitable generic business inboxes. Keep less complete results and phone-only companies visible.

Deduplicate delivery by normalized mailbox. Two people sharing an inbox do not cause two emails to the same address. Preserve both people and record which greeting/attribution is safe; ambiguous names require generic copy or review. A person can have several methods and affiliations. Keep mobile, work and business phone classification separate from raw and normalized phone values; retain unknown classification rather than infer ownership from number format. Store social network/type and profile URL without a LinkedIn-only restriction.

Verify only selected eligible email methods. Recommended default: only explicitly valid results advance; catch-all, unknown, invalid, error and stale/unverified results remain held. Store provider status, raw result and timestamp so mapping is auditable. Freshness is configurable; initially require verification for the current preparation run unless an explicitly saved reuse policy permits a prior result. Email attribution, verification, suppression, company fit and past outreach are independent checks. An unsent campaign assignment does not prove prior outreach.

### Write editor and template changes

Use a clean document-style view with subtle subject/opener/body/CTA/unsubscribe labels, inline signal slots, adjustable slot priority and explicit fallback branches. Preview the exact rendered recipient email beside the evidence used. Support follow-up steps and spacing without exposing compiler bookkeeping as the main interface. Keep email text semantics separate from Markdown note-editor formatting.

Use one renderer for UI preview, saved drafts, CSV and provider preparation. Required missing slots block a draft with an actionable reason. Optional slots use only the saved fallback; never invent facts to fill a gap. Show when no suitable personalisation is available. AI mode stores the model/prompt policy and evidence inputs, then persists the result; retrying export must not generate a different email.

On template apply: select lists (current list preselected), preview counts including manual edits, freeze the affected recipient IDs and current draft revisions, then apply a new draft revision. Preserve previous template version, exact previous draft and edit provenance. A concurrent edit produces a visible conflict instead of an overwrite. A partially applied large job reports applied/conflicted/failed counts and resumes safely. Restore creates another revision, preserving history.

Already approved/frozen outputs retain their exact copy. Editing drafts invalidates approvals for a future release from those changed drafts. It does not mutate exported files, already-loaded campaigns or sent messages. Updating a paused campaign requires a newly reviewed change set and fresh provider checks. This protects historical truth while honoring Jules' instruction that template changes affect manual draft edits.

### Loading and reconciliation

Replace generic manual checkboxes with system results: ready, uploading, checking, complete or attention needed. Show exact counts for intended, confirmed, missing, duplicate/held and unexpected recipients, plus concrete copy/settings differences. Offer only actions that resolve those exceptions. The operator selects the intended campaign, recipients, copy and settings; software performs mechanical checks.

On this Mac, the supported first-release transport is a finished CSV uploaded through the connected agent's Chrome session. Compass prepares the artifact and tracks the handoff; it must say “awaiting connected agent” when execution is unavailable. Do not route local uploads through REST/MCP add-leads, Compass `land` or `push-leads`. A fully automatic cloud transport belongs to the later hosted milestone.

## 4. Shared data and service design

Use existing Compass authentication and server-side access. UI routes and MCP tools call the same domain services; neither writes independent copies of business state. LocalStorage may hold view preferences and recoverable unsaved editor buffers, never canonical list membership, workflow definitions, evidence or job status.

Existing foundations to extend:

- `lead-lists.ts`: `compass_lead_lists`, lead membership and campaign-list relationships. Add company membership to the same logical list identity so a company can be selected before any contact exists. Bridge legacy recipient membership explicitly.
- `crm-research-*`: `crm_companies`, locations, people, affiliations, methods, candidates, observations, sources, verification events and legacy/lead links. Hosted capability checks currently return `enabled:false,writable:false`; migration presence in the repo does not prove deployed readiness.
- `outbound-preparation-*`: version/context hashes, source artifacts, immutable bundles, worker claims, leases, receipts, approval boundaries, export and reconciliation. Generalize the campaign/HVAC-specific assumptions without discarding these safeguards.
- `outbound-copy.ts` and `SignalRecipeEditor.tsx`: reusable sequence and deterministic rendering concepts. Avoid importing the entire campaign editor and its unrelated tabs into the focused Write view.

Add the following domain records; final table names belong to the contract migration, not an invented claim about existing infrastructure:

| Record | Scope and invariant |
| --- | --- |
| Workflow + immutable versions | Selected offer/ICP versions, ordered stages, signals, tool policy, defaults, checkpoint policy and budgets. Active runs keep their starting version. |
| List-company membership | Stable list/company identity, origin and membership events; optional selected recipient relationship. Multiple lists can share one company. |
| ICP assessment | Company + ICP version + evidence/input revision, criterion outcomes, result, reason, freshness and overrides. Shared facts do not imply shared eligibility. |
| Stage result | List/workflow version + company or recipient + stage, input hash, output references, status/reason and supersession. Avoid one global lead-stage column. |
| Signal definition/observation | Typed, versioned definition; source-backed value, timestamps, two strength dimensions, conflict/correction lineage. Extend reusable CRM observations. |
| Run, work item and attempt | Frozen scope, stage dependencies, leases, retries, provider request IDs, costs, checkpoints and completion receipts. |
| Template and recipient draft revisions | List-scoped recipient copy, template/input versions, manual or AI provenance, prior exact content and approval relationship. |
| Export/load manifest and receipt | Frozen unique recipients, rendered content, configuration, baseline provider membership, hashes, readback cursor and differences. Reuse preparation artifacts where possible. |

Facts and contacts are reusable company/person evidence. Eligibility and drafts are scoped to an offer/ICP/list/workflow context. Changing one list's strategy cannot silently overwrite another list's copy or assessment. Updating a shared fact marks affected downstream results stale; it does not silently re-run paid work. Recalculate deterministic results or propose the required work with a visible scope.

International support is part of the data foundation: country code, administrative region, city/locality, suburb, postcode, raw address and IANA timezone where known. Retain legacy AU regions for compatibility without treating their five-city enum as the world. Do not infer exact timezone from ambiguous geography. Format Australian phones in local grouping; display other countries appropriately while preserving canonical values.

Use stable UUID identities and explicit mapping to legacy `lead_contacts` and outbound company records. Normalize identity conservatively; shared domains/franchises are not sufficient proof of one company. Uncertain links remain reviewable. Do not create fake contacts to make company-only records fit an email-centric schema.

Require revision checks, stable idempotency keys and actor/source metadata for mutations. Enforce organization/operator access and approval authority at the server boundary. Provider credentials remain server-side or in the authorized agent environment. Treat scraped content as evidence, never instructions that can change tool policy, spending, approvals or recipients.

## 5. Agent execution and MCP contract

Agent-first means a connected agent executes durable work through Compass. Clicking Run creates the versioned run and shows whether an executor has claimed it; it does not imply a hidden background daemon. If the local agent or Mac stops, work pauses after the lease expires and resumes from persisted results. An independently hosted agent can use this contract only when its actual tools and permissions are verified. Mac-off unattended execution is not a first-release promise.

Recommended state machine: queued → running → checkpoint or blocked → running → completed, with cancelling/cancelled and failed outcomes. Work items have leases and heartbeat timestamps. Cancel prevents new provider calls, records in-flight results and never pretends an already-submitted request was undone. Resume skips unchanged completed work and retries only eligible failed/unknown items. Changing workflow settings creates a new version; it does not rewrite an in-flight run.

Provider adapters expose capabilities, supported fields, quotas, request identity and structured outcomes. Tools are selected from the saved allowlist in its saved order. Fallback triggers include specified missing fields, insufficient evidence and retryable failures; all are visible. Distinguish empty results from unavailable tools and exhausted budget. Reuse fetched pages and cached evidence when policy permits.

Reserve estimated cost before dispatch and record actual, estimated or unknown cost honestly. Bound concurrency per provider and per run. A provider timeout after submission creates an uncertain attempt; reconcile its request/result before a chargeable retry where possible. Compass can deduplicate its own writes, but cannot promise exactly-once external calls without provider support. No monetary budget is authorized by this planning conversation.

Checkpoint approval belongs to the operator. Agents can submit evidence and request continuation; they cannot approve their own checkpoint or activate campaigns. Policy can disable intermediate checkpoints, but it cannot silently remove existing provider activation boundaries. Recommended initial preset: review company qualification and finished recipient copy before paused loading.

Define focused, typed MCP operations alongside HTTP handlers. Names below are proposed, not currently available tools:

| Tool family | Operations and bounded outputs |
| --- | --- |
| Capabilities | Read enabled adapters, read/write readiness and constraints without credentials. |
| Lists | Search/create/update, query companies/recipients, add/remove membership, freeze selection. Return cursor, counts and requested fields. |
| Workflows/research | Read/save versions; manage signals, strategy and ICP selection; preview an assessment. |
| Runs | Start/read, claim/heartbeat/report, pause/cancel/resume; submit or read checkpoints. Operator approval uses its existing authority boundary. |
| Templates/drafts | Read/save/preview/apply, history/restore, bounded recipient edits and impact summaries. |
| Exports | Create/status/artifact using selected columns; return an artifact reference, not an entire large CSV in tool text. |
| Loads | Prepare/read status/request reconciliation/read receipt. Expose the supported local upload handoff, not a prohibited upload bypass. |

Read APIs need filtering, keyset pagination, field projection and changed-since/event cursors. Mutation results need request receipt, affected counts, revisions and per-item failures. The UI and an agent must produce equivalent persisted outputs for the same command. Document examples and capability errors in the MCP instructions so agents do not fall back to browser data scraping or direct database CRUD.

## 6. Paused Instantly delivery contract

1. Freeze one canonical preparation manifest: distinct intended mailboxes and Compass links, exact subject/body/follow-ups and merge values, approved template/draft versions, selected senders, schedule/timezone, settings, and export column mapping. Record suppressed/held/duplicate exclusions separately.
2. Check attribution, current verification policy, suppression and actual prior sends. Configuration must retain visible opt-out, reviewed threading/plain-text behavior and at least two days between first and second email. Use approved sender capacities and campaign settings; do not increase limits automatically. Location selection stays optional for lists; loading still requires an explicit valid sending timezone/schedule.
3. Bind the actual provider campaign UUID to Compass and confirm it is paused. Capture existing recipient baseline when using a nonempty paused campaign. Final expected membership is that approved baseline plus the approved delta, not an assumed empty campaign. Hold unresolved baseline collisions for review.
4. Reserve the batch before uploading. A company reservation must allow several distinct suitable mailboxes within the same approved batch; protect against conflicting concurrent loads without collapsing the company to one recipient. Mailbox-level deduplication still applies.
5. Generate the exact finished CSV and upload once through the supported local browser transport. Record upload outcome even when uncertain. Disable unapproved paid import enrichment/verification. Inspect provider support for the chosen custom-variable representation with a controlled fixture before promising arbitrary per-recipient body rendering.
6. Read all provider recipient pages, used merge values, sequence, selected senders, schedule and settings. Compare both content and actual rendering semantics against the manifest. Minimal HTML serialization must not change approved plain-text wording, links or opt-out. If provider templates cannot express the requested draft variation, fail preparation with a clear compatibility error instead of silently dropping content.
7. Reconcile exact sets and copy. Unexpected extras, missing recipients, duplicate mailboxes, changed copy/settings, repeated pagination cursors or incomplete traversal prevent a complete receipt. Re-check paused status and configuration after traversal. Record the observed time and provider drift; a readback is not a permanent lock on external edits.
8. On partial or ambiguous upload, compute the missing delta after readback. Resume only that delta. Update Compass from confirmed recipients and store the exact receipt. “Loaded and checked, paused” is the endpoint. Activation remains a separate explicit instruction.

The current `reconcileBrowserLoad` implementation accumulates pages in one request and stops at 100 × 100 records. Replace that path with resumable paginated reconciliation and persisted progress. Never turn the page ceiling into a successful 100,000-record result. Keep UI requests short; process large exports and readbacks in leased chunks. A resumable reconciliation job can be driven by the connected agent in v1, without a scheduled cloud runner.

The existing local [instantly-load skill](/Users/Jules/switchflow-os/.agents/skills/instantly-load/SKILL.md) defines the current transport and reviewed operational checks. Its historical single-city/HVAC assumptions must not become mandatory eligibility rules for the new configurable product. Preserve sender safety, exact copy, pause state and receipts while parameterizing valid offer/geography choices.

## 7. Visual, navigation and calling work

Preserve Compass's current Inter, neutral-white surfaces and restrained orange identity. Strengthen separators, surface contrast and semantic status color through shared tokens. Status meaning must remain legible without color. Do not introduce an unrelated design system.

Measure the current interface at normal zoom before changing sizes. Recommended prototype baseline: 14px operational text, 16px document editing text, 32–36px desktop controls and larger touch targets. Compare the same task density against two established table/editor products at the same CSS viewport and zoom, then lock tokens. These numbers are design proposals, not measured defects or mandatory global replacements.

Test 1440×1000, the user's laptop viewport, 768×1024 and 390×844, and browser zoom at 75%, 100%, 125%, 150% and 200%. Diagnose widths, fixed heights, overflow and redundant wrappers. Do not counter browser zoom with CSS `zoom` or transforms. Allow a horizontally scrollable data table where appropriate; keep primary controls usable and avoid unnecessary page-level overflow. Keyboard focus remains visible even when removing the heavy orange mouse-focus treatment.

Make `OutboundDesk` reserve one consistent header structure across destinations. Move Evidence, Notebook and Waves under More workspaces, preserving content. Update both stored desk preferences and deep links. Because the main route is kept alive, handle query changes and browser back/forward while already on Outbound; changing a link's URL alone is insufficient. A normal sidebar Outbound click must reliably open the table even after visiting the old overview. Explicit links to preserved secondary desks must still work.

Remove the marked Timeline surface, navigation entry and exclusively owned imports/tests after tracing dependencies. Preserve Test planner and shared calendar/project records. Reclaim the test calendar's unused top space separately. Redirect old Timeline links to a useful retained outbound destination; do not drop business data.

For Calling, improve script region headings and numbering, and make notes feel like a document. Add bounded per-lead caching and small adjacent-record prefetch while retaining keyed draft isolation, abort handling and stale-response guards. Revalidate cached records by revision/time policy. Switching A → B → A during delayed requests must never display or save another lead's details. Uncertain note writes remain recoverable. Show missing research and queue the relevant subset through the same research workflow, with visible status and any required checkpoint; do not create a second research engine.

## 8. Scale, observability and proposed performance targets

Use server-side filtering/sorting with indexed company/list/stage/ICP/location keys and stable keyset cursors. Fetch approximately 50–100 rows per page; bound rendered rows and detail caches. Avoid full-population React state, client-side joins, large synchronous exports or 100,000-record tool outputs. Counts and quality/cost aggregates may use maintained summaries with visible freshness rather than expensive full scans on every navigation.

Record attempts with workflow/tool version, company, field scope, source outcome, cache use, duration, estimated/actual cost and currency. Show useful accepted facts, contact yield and verification outcomes alongside spend and elapsed time. Compare like-for-like cohorts and strategies; do not rank tools solely by an LLM's self-reported quality. Unknown cost is unknown, not zero. Preserve native currency; any converted cost needs an explicit rate and date.

Proposed release targets, measured on a documented representative environment: warm table/filter requests p95 under 1 second at 100,000 companies; cached lead switching visibly updates within 150ms; no layout shift of the shared header on destination changes; browser memory remains bounded while paging; interrupted jobs resume without repeating confirmed work. Establish baseline and representative contact/evidence fan-out before accepting these targets. Do not claim scale success from 100,000 empty company rows or from an untested estimate.

Run large fixtures and load tests in CI/staging or a suitable remote environment. On the Mac, keep heavy work sequential, inspect pressure/swap before and after sustained rendering, reuse one temporary browser tab and close it. Do not add a local dev server unless Jules requests it.

## 9. Implementation sequence and ownership

These are construction milestones. The release is complete only after the full acceptance matrix passes.

| Milestone | Work and deliverable | Exit condition |
| --- | --- | --- |
| 0. Baseline and contract | Rebase on current main; inventory production schemas/flags/legacy data and active work. Freeze domain types, identity mapping, state transitions, capability responses and API/MCP examples. Make one disposable UI fixture for company and recipient views. | A reviewed contract covers no-email companies, multiple contacts, cross-list drafts, tool policy, versions and paused delivery. No unresolved ownership conflict. |
| 1. Durable foundation | Add company list membership, configurable versioned policy/signals, assessment/stage/run/draft records and required indexes. Extend existing CRM APIs and preparation primitives. Build read/write parity and migration/rollback scripts. | Real records survive reload and agent handoff; unauthorized/stale writes fail; migration rehearsal reconciles identity and counts. |
| 2. Complete vertical slice | Connect a small controlled set through selection → evidence/fit → all suitable contacts → verification → deterministic drafts → frozen CSV → paused upload/readback. Use real domain services throughout. | One exact receipt proves the selected path; exclusions and failures remain visible. Paid calls and campaign writes occur only within separately authorized execution scope. |
| 3. Full configuration and editing | Complete Research and Write editors, custom signals, source history, configured fallback adapters, optional AI mode, checkpoint UI, multi-list template application/restore and tool reporting. | UI/MCP parity, scope preview, conflict recovery and tool-policy enforcement pass representative tests. |
| 4. Full board and scale closure | Finish shared shell/scale/contrast, secondary navigation, Timeline removal, Test planner spacing and Calling. Complete international filters, large exports, chunked reconciliation, performance and failure testing. | Every issue 5–15 and every settled interview requirement has acceptance evidence. |
| 5. Cutover and release | Rehearse additive migrations and feature flags in staging; deploy the supported surface; verify hosted routes and real persisted data; review the controlled paused-load receipt; remove obsolete demo entry points. | Hosted acceptance is recorded, remaining limitations are explicit, and rollback has been rehearsed. No inferred activation. |
| Later. Hosted runner | Supply an authorized hosted executor, provider credentials, scheduling, quota/concurrency control and cloud upload transport to the existing run contract. | Mac-off execution, recovery, cost limits, cancellation, checkpoints and paused delivery demonstrated end to end. |

### Agent organization

The supervising integration agent owns architecture, shared domain types, migrations, authorization/approval boundaries, dependency ordering, merged behavior and acceptance evidence. It should implement the foundational contract inline before delegation, and resolve shared-file changes itself. It also owns final shell/calling integration or schedules it as a bounded follow-up after a worker lane finishes.

Worker A owns the table and Research/Write views, scoped CSS and UI adapters under `src/components/outbound/workflow/` plus agreed new components. It receives frozen types and realistic fixtures. It does not change migrations, API semantics or global tokens independently.

Worker B owns provider adapters, runner/MCP bindings, CSV/load/reconciliation integration and their focused tests under agreed `src/lib/`, `src/app/api/` and `mcp/` files. It works against the supervisor's shared types and authority boundaries. If a worker changes the Python executor, designate one canonical source and update tracked worker copies/source hashes deliberately; avoid two divergent implementations.

Assign exact file ownership at dispatch, tell each worker that others are editing the repository, and prohibit reverting another lane's work. Use isolated worktrees/branches if useful for review, but keep artifacts and contracts versioned and consistent. No two agents own the same migration or shared type file. Workers propose contract changes to the supervisor before implementing them.

After integration, have an independent reviewer examine data loss, scope leakage, concurrency, cost retries, recipient duplication, copy rendering and navigation/calling regressions. The supervisor fixes findings and runs acceptance. Keep no more than three active implementation agents including the supervisor; serialize compilers, rendering and large tests. More agents would add coordination and memory cost without improving these tightly coupled decisions.

### Existing code ownership map

Repository root is `/Users/Jules/switchflow-os/compass-web`.

| Area | Existing owner and implementation consequence |
| --- | --- |
| Route/shell | `src/components/ConsoleHomeInboxKeepAlive.tsx`, `outbound/OutboundDesk.tsx`, `outbound/OutboundDeskSwitch.tsx`, `src/lib/outbound-desk.ts`, `folio/FolioChrome.tsx`, `OperatorShell.tsx`. Edit the actual keep-alive route owner, not an unused alternative page. |
| Demo replacement | `src/components/outbound/workflow/WorkflowWorkspace.tsx`, `model.ts`, `BatchInventory.tsx`, `workflow.css`, `example-cohort.json`. Replace production state/persistence; any retained fixture must be development-only. |
| Canonical records | `src/lib/lead-lists.ts`, `crm-research-{schema,server,api,query,http,client}.ts`, `supabase/migrations/20260915090000_crm_research.sql`, existing `/api/agent/crm/` and `/api/agent/lists/` routes. |
| Execution/delivery | `src/lib/outbound-preparation.ts`, `outbound-preparation-server.ts`, `outbound-preparation-command.ts`, `outbound-csv.ts`, `outbound-sourcing.ts`, `workers/outbound/`, `mcp/lib.mjs`. Audit rigid evidence enums, 200-row chunk limits and reconciliation limits. Internal chunk sizes need not limit list size. |
| Copy/editor primitives | `src/lib/outbound-copy.ts`, `outbound/SignalRecipeEditor.tsx`, `outbound/SequenceEditor.tsx`, `planning/NotebookEditor.tsx`. Extract useful primitives; do not import unrelated campaign-editor complexity. |
| Calling/calendar | `src/components/outbound/calling/CallingWorkspace.tsx`, `calling/calling.css`, `outbound/TestPlanner.tsx`, its styles, and Timeline dependencies traced from `OutboundDesk`. |
| Shared visual rules | `src/app/folio.css`, `src/app/workspace.css`, `docs/design/WORKSPACE.md`, `.cursor/rules/compass-ui-lock.mdc`. Update the documented size decisions alongside tokens after visual validation. |

## 10. Migration, rollout and recovery

Use additive migrations first. Snapshot counts, identity links, list memberships, draft/preparation artifacts and campaign bindings before backfill. Rehearse on representative staging data. Verify that the deployed rich CRM schema exists and its authorization works before enabling its read/write flags. Missing infrastructure is an actionable preflight failure, not a reason to fall back to demo data.

Backfill deterministic identities and legacy links with source records and an audit receipt. Hold ambiguous mergers. Preserve legacy recipient memberships and company-only records. Existing fit labels are historical observations until mapped to the selected ICP/version; never relabel every legacy eligible company as sure fit. Existing drafts and sent/campaign artifacts retain their original text and provenance.

Enable the new surface behind a rollout flag; compare count/membership/read behavior, then make the lead table the default for new and returning users. Migrate stored desk preferences and explicit route aliases carefully. Keep old overview and preserved workspaces accessible. Do not leave two writable ledgers active. Rollback switches the UI/read path without dropping newly written evidence, versions or receipts; document which new writes old surfaces cannot display.

Retire demo persistence and obsolete Timeline-only code after dependency and route tests pass. Do not delete shared calendar data or unrelated untracked prototypes. Preserve existing working-tree changes while starting implementation. Update operating evidence with the deployed revision, migrations, validation and limitations; keep project/task completion awaiting Jules' confirmation.

## 11. Acceptance and verification

Write tests for material invariants and failure paths, not superficial mirrors of the implementation. Use schema/domain tests, database integration tests, API/MCP parity tests and a small set of browser flows. Run the repository's required checks; distinguish pre-existing failures from regressions and report each honestly. A narrow passing suite is not a repository-wide green claim.

| Area | Required evidence |
| --- | --- |
| List/database | UI and MCP create the same durable list; company-only selection works; optional geography/size stays optional; membership and all-matching scope survive reload; no demo rows enter production. |
| Fit and stages | Cases for all five outcomes, missing/conflicting evidence, exclusion precedence, zero required criteria, ICP version change and explicit override. Held/excluded rows stay inspectable; only default-eligible companies consume contact spend. |
| Contacts | Several suitable people all become intended recipients; shared inbox sends once; generic and phone-only results survive; multiple affiliations and unknown phone classification remain correct. |
| Verification | Invalid/catch-all/error/stale results held; attribution is separate; configured reuse works; suppression and actual sends outrank historical planning flags. |
| Writing | Exact preview/CSV/manifest parity; deterministic slots and fallbacks; unsupported claims blocked; saved AI output reused; explicit multi-list apply changes manual drafts, preserves history and catches concurrent edits. |
| Execution | Saved tool order/fallback only; unavailable adapter, rate limit, exhausted budget, ambiguous paid request, lease expiry, cancellation and checkpoint recovery. Restart does not repeat confirmed work or self-approve. |
| Cross-list/version isolation | Shared company facts do not overwrite another offer's assessment or draft; in-flight versions stay frozen; stale outputs/approvals are identified. |
| Paused load | Distinct contacts within one company permitted; frozen artifact; existing-campaign baseline handled; partial upload resumes missing delta; exact recipients/merge values/copy/settings checked; extras fail; pause state verified; no activation. |
| Large reconciliation/export | More than 10,000 provider records traversed to actual completion; repeated cursor/page ceiling fails visibly; 100,000+ company fixture with representative contacts/evidence is paginated and resumable; CSV formula escaping and quoting correct. |
| Navigation/layout | Normal Outbound opens table; preserved desk deep links work on an already-mounted route; back/forward works; header does not jump; More workspaces retains data; Timeline removed, Test planner retained and spacing fixed. |
| Calling | A→B→A with delayed responses never crosses identity; note drafts/retries remain isolated; warm switching measured; missing-research action uses the shared run. |
| Accessibility/visual | Keyboard selection/editing/dialog focus, screen-reader names, color-independent statuses, visible focus, normal scale and zoom/viewport matrix. Compare current shared surfaces for global-token regressions. |
| Migration/release | Backfill count/identity reconciliation, uncertain mappings held, authorization checked, rollout/rollback rehearsal and hosted post-deploy route/data verification. |

Use a synthetic fixture covering multiple countries/timezones, no-email companies, multiple people, shared inboxes, conflicting facts, stale verification, manual edits and partial provider outcomes. Controlled provider integration checks require an authorized small cohort and paused campaign; never send test outreach to prospects as a software test.

## 12. Completion and remaining technical preflights

The product intent is sufficiently clear to implement. Remaining work is technical verification: enabled provider adapters/credentials, deployed CRM migrations and flags, actual provider custom-variable rendering, current deployment limits, existing data mappings and measured performance. Resolve these with capability checks and test evidence, not another general interview.

The first release is done when Jules can use real Compass data through the agreed stages and editors, prepare all suitable contacts, apply scoped template changes with history, run the saved policy through a connected agent, and obtain an exact paused-load receipt, while all board navigation/calling/visual changes work at the stated scale. Export, load, activation and sends remain separate reported outcomes. Hosted unattended execution is explicitly later.
