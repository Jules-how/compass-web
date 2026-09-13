# Goals & actions: production build specification

13 September 2026. Written against `d48f7685c6d4ce32a5eab64044bb63f93fc5709d`.

Jules approved the compact v0.4 prototype with “Cool looks good.” This document specifies the proposed implementation of that selected experience. It is a planning deliverable, not evidence of a production release. Source: `codex://threads/01a09804-c8a1-7531-82f0-f7d50030146e`.

## Product decision

Evolve **Planning → Goals & actions** at `/planning`. The morning starting view is a selected goal's weekly board. The goal notebook, actions, project checkpoints, contact activities and outcome evidence share existing Compass identities. Home, Tasks, Projects and CRM show views of those same records.

The first useful release must complete this loop: write a goal → link work → plan the week → open a city session → inspect a prospect → hand off a call → save the result and promise → see the same follow-up on the weekly board → make an explicit change through an authorised chat connection → verify the new state in Compass. A styled board without that persistence is not the completed release.

## Confirmed experience

| Area | Selected behaviour |
| --- | --- |
| Starting point | Weekly board showing the whole plan, with Today and Month available |
| Header | Goal title and Add action on one row; one slim row of four outcome measures |
| Navigation | Actions, Goal notebook, Week & campaigns, Evidence; time and grouping controls alongside when they fit |
| Work area | Board and persistent objective panel fill remaining height, scroll independently on desktop/tablet |
| Density | Desktop weekday headings around 230–280px from the top; v0.4 measures 239px at 1440×900 |
| Writing | Rich goal/contact notebooks: bold, italic, headings, lists, links, undo/redo and a small font choice |
| Calling | City session opens company cards with owner if known and stored phone; details show business context and dated contact history |
| Sequence | Suggest 5–10 eligible lower-priority warm-ups, then priority group, then lower-priority finish; switch to priority at any time |
| Call transport | Click-to-call opens the configured calling application; Compass retains context and captures outcomes explicitly |
| Chat authority | Apply Jules's explicit instructions immediately; keep inferred work and changes as suggestions |
| Success order | Paid customers, positive sales conversations, all sales conversations, market coverage |
| AC week target | One customer with A$2,500 collected; A$2,500/month retainer refundable under the risk reversal |

The actual city/day allocation and available call time are unset. Preview dates and the 60-minute example do not become accepted scheduling data. The retainer's start date and refund conditions are also unset.

## Evidence chain and reuse

The current `/planning` route uses `src/components/planning/PlanningDesk.tsx` and `src/components/pathfinder/PathfinderBoard.tsx`. `GoalPad.tsx`, `TaskDetailPanel.tsx` and `ProjectDetailPanel.tsx` already connect goal context and shared work. Keep these ownership boundaries and existing record/deep-link access; add the weekly composition within them.

The design owner remains `docs/design/WORKSPACE.md`, the Compass UI lock, `OperatorShell`, `FolioChrome` and workspace styles. Use the approved preview's hierarchy and spacing; translate it into those styles instead of copying its standalone global CSS into the product. Font variation is restricted to authored notebook content.

| Capability | Existing owner | Extension needed |
| --- | --- | --- |
| Goal definitions and revisions | `src/lib/planning-core.mjs`, `planning-server.ts`, planning operator/agent routes | Goal notebook reference; versioned document representation; safe mutation receipts |
| Goal/work relationships and observations | `src/lib/pathfinder/{types,core,server,contracts,workspace}` | Read projection for the board; metric identities; explicit source attribution |
| Tasks, projects and accepted work | `src/lib/operating-core.ts`, `operating-server.ts` | Shared completion policy for authenticated direct instructions; reversible explicit schedule edits |
| Goal and contact writing | `src/components/planning/NotebookEditor.tsx`, `src/lib/notebook-model.ts` | Rich-document adapter with faithful persistence and typed canonical task references |
| Calls and promises | `src/lib/outbound-rhythm.ts`, `outbound-rhythm-server.ts`, existing rhythm database operation | Durable session state, conversation signals and undated promises |
| Company data and restrictions | Compass lead ledger and its APIs | Source-backed ranking reasons; read projection for contact details, no duplicate CRM |
| Campaign truth | Existing outbound overview/provider reconciliation | Goal/cohort associations and source freshness in Week & campaigns |
| Payment evidence | `src/lib/agreement-server.ts`, Stripe webhook, existing QuickBooks cache | Actual amount/date evidence and client/offer/goal attribution; receipt-level deduplication |

## Data and behaviour contracts

### 1. Goal, project, milestone and action

Use “goal” and “objective” for the same product concept. A goal's period is daily, weekly, monthly, quarterly or yearly. Only create a smaller-period goal when it describes a distinct outcome. A daily view can show work contributing to a weekly goal without creating a duplicate daily goal.

A project is optional. Use existing project checkpoints for milestones. Link small goals directly to tasks; do not manufacture a project just to house one action. Keep existing longer-term goals and their commitments intact when adding the AC validation goal.

The weekly board groups canonical tasks by their explicit planned date; an undated lane remains available. The alternative status view derives Next up, In progress, Waiting and Completed from existing task status and contextual readiness. Proposed work is distinguishable from ready work. An action's title, owner, date, project, goal link, next action and done condition are editable in the shared detail panel.

Prefer an explicit date picker/reorder control for the first build. Dragging can call the same mutation later. Changing an accepted date manually is Jules's instruction; inferred rescheduling stays proposed. Retain the previous date and source in history. Existing due promises take precedence over suggested fresh outbound work.

Completing an action changes the work record. It does not establish that its parent goal was achieved. A notebook checkbox is ordinary authored content; a linked action row is visibly a real Compass task and operates on that task ID.

### 2. Notebook persistence

Current `NotebookEditor` renders textarea blocks and writes Markdown, including literal inline formatting syntax. Its schema has no font marks or canonical embedded task node. Retain that legacy reader for existing content and add a rich editor adapter for the approved goal/contact notebook.

Technical recommendation: use Tiptap's React editor with the selected text/heading/list/link/history controls and a restricted Default/Serif/Mono font menu. Its React integration and FontFamily extension provide the relevant editor foundations. Keep Compass styling and storage ownership. [React integration](https://tiptap.dev/docs/editor/getting-started/install/react), [FontFamily extension](https://tiptap.dev/docs/editor/extensions/functionality/fontfamily).

Proposed storage: extend the existing planning note envelope with a versioned structured `document` and derive its readable `body` on the server. The document is authoritative when present; these are not independently editable copies. Add a typed subject reference for a goal or contact and reuse that note ID whenever either surface opens it. A contact notebook belongs to the contact across sessions; it is not reset or duplicated for each call.

Use stable document block IDs and typed task references. Validate allowed nodes, marks, font choices and link protocols server-side. Preserve legacy source/history on conversion, and retain unsupported Markdown as literal content instead of dropping it. A legacy body-only overwrite of a structured note must fail with a clear format/conflict response; agent append/patch commands must preserve formatting they did not edit.

Autosave writing independently of call submission. Keep a recoverable local draft on failure and show saving/saved/failed state near the editor. Never silently truncate: current goal notes cap at 4,000 characters and note body at 20,000, so extend validation and request-size budgets deliberately for the rich representation while keeping a bounded text limit. Reject oversized changes without replacing the saved document.

Prototype `execCommand` and browser-local state are demonstration code and must not become the production persistence implementation.

### 3. City sessions and prospect order

Represent a session as a canonical action plus a small revisioned session record: goal ID, action ID, city/timezone, eligible cohort reference, selected phase, manual order/overrides, next prospect and session status. Store prospect identities, not copied prospect details. Resume by checking the latest ledger, restrictions, replies and handled records.

Warm-up and priority are suggestions, not locks. If fewer than five eligible warm-up records exist, show the available records without padding the list. Completing or pausing a session is distinct from exhausting the city. Keep due callbacks/promises visible above fresh-call phases.

Initial ranking recommendation: High / Medium / Lower, with evidence grouped into commercial fit, timely buying trigger/capacity and decision-maker access. Preserve manual overrides and their reasons. Company size, installation focus, advertising, growth/hiring and visible acquisition need contribute when evidenced; unknown revenue/team size remains unknown. No numeric weighting or automatically adopted final rubric is specified. The five preview records remain unranked.

Contact detail must show stored number, owner if verified, estimates with source/confidence, relevant services, dated channel history and notebook. Email summaries require actual message content; a send timestamp alone supports only a send event. Handle multiple contacts for one business explicitly so retry/call counts do not masquerade as unique company coverage.

### 4. Calling and follow-ups

Click-to-call uses a validated stored number and the device's telephone handler. Keep the number visible/selectable and provide Copy number. A missing/invalid route or applicable contact restriction explains why Call is unavailable. No embedded dialler, recording or transcription is needed for this release.

The link click and return-to-window event do not establish an attempt or conversation. Do not advance the queue, complete a task or change a metric from handoff alone. Returning leaves the same contact and notebook visible; Jules explicitly records what happened.

Extend existing rhythm capture with structured conversation occurrence and optional positive signals: perceived value, demand, next step, meeting booked. Preserve the existing outcomes for no answer, invalid route, gatekeeper, decision-maker, information requested, meetings, not now, not interested and do-not-contact. A no-answer attempt is not a conversation; ambiguous outcomes need an explicit conversation classification rather than an inferred positive result.

Save the contact activity, any promised follow-up and the session position using one idempotent business operation. Reuse the existing rhythm transaction for activity/task writes; extend that owner instead of writing tasks separately after success. If session position cannot share that transaction, reconcile it from the saved touch ID before presenting the next record, so a lost response cannot duplicate a call.

The current `next` schema requires a due timestamp and only allows proposed/accepted. Extend it to retain a promised action with an unresolved date when Jules does not know the time yet. It remains visible as an undated promise; never invent tomorrow or discard the promise. Accepted dates preserve the contact's timezone. Call/email/SMS restrictions and existing SMS-basis requirements remain applied by the shared owner.

On save failure, keep all entered notes, outcome and promise fields. On conflict, load current history before retrying. A save receipt identifies the contact, activity and follow-up task, letting the board/CRM read the same result.

### 5. Campaign sequencing and execution

Weekly campaign cards reference existing reviewed cohorts/campaign IDs, their preparation receipts and provider observations. Display planned date, next eligible date, actual provider status and freshness as distinct facts. Anchor follow-ups to actual recipient send history; maintain at least two days between first and second email and retain a longer reviewed campaign interval when applicable.

Finishing a preparation task does not activate a campaign. When Jules explicitly requests campaign execution through a supported connection, retain the instruction, provider attempt, resulting receipt and reconciliation. A request that is queued, interrupted or uncertain remains visibly so until readback establishes what happened. Reuse the current platform's authorised upload/activation path; do not introduce a second outbound executor as part of the board.

City allocation and actual call availability are editable planning inputs. Unknown capacity must not produce an invented daily call quota or accepted schedule.

### 6. Outcome evidence

Give each of the four measures an identity and definition revision so several measures can belong to one goal without overwriting one `actual` value. Extend the existing Pathfinder observation owner with metric identity and source references; keep the primary paid-customer goal target separate from supporting observations. Existing observations without a metric ID map to their goal's primary measure during migration.

The primary criterion is one distinct customer with A$2,500 collected for the agreed upfront payment in the goal period. Smaller confirmed payments show cash progress. Do not require A$5,000 collection to count this target. Retainer terms are A$2,500/month and refundable under the risk reversal; no trigger, window or start date has been defined.

Current source findings: `confirmBankPayment` stores a verified-reference confirmation; `reconcileCheckout` records accepted paid-checkout status. `agreementOutcomeSummary` is whole-business and computes amount from agreement terms; it does not establish this goal's client/cohort attribution or actual partial-payment/refund history. The Stripe webhook handles checkout completion/payment success, not refund events. QuickBooks UI explicitly treats QuickBooks as its ledger and Compass as a cache. Connection configuration was not tested in this planning pass.

For this metric, retain payment identity, verified amount/currency, actual receipt date, client, offer/agreement, source, and goal link. Deduplicate one payment represented by both a provider receipt and an accounting record. Do not substitute agreement terms, invoice creation, a zero balance or a credit memo for verified cash movement. Use source-backed manual confirmation while a provider path is unavailable, labelled reported/confirmed rather than pretending it was fetched automatically.

Keep actual refunds as separate events linked to the original payment. Refund eligibility is a term, not an event. Preserve the historic achievement evidence and surface later reversal for review; the final reporting treatment can be settled before automated refund rollups. No refund processing or invoicing action follows from the goal counter.

Positive conversations count distinct qualifying conversation events with at least one recorded signal; show the supporting signals and company count. Total conversations count events, with distinct businesses available alongside. Proposed default for market coverage: unique eligible companies reached by each channel, plus deduplicated overall reach, divided by a dated eligible-market inventory. If the denominator is unknown, show that fact and known reached counts without a percentage.

## Shared writes and chat authority

### Common server contracts

UI and agent routes must call the same domain operations. Each mutation needs stable entity identity, expected revision/version, operation ID, source and actor. Store a payload hash and receipt with the canonical mutation; a repeated operation ID returns the original result and a reused ID with different content is rejected. Planning currently checks revisions but needs this receipt contract for safe retries after ambiguous responses.

A conflict must preserve the draft, return the current revision and allow a deliberate reconciliation. Cross-domain operations need a transaction or a resumable operation receipt with explicit partial status. Avoid successful-looking UI states before the required records exist.

After a successful write, update/invalidate affected mounted views and refresh on navigation/focus. For changes from another connected session, begin with a short active-view poll (proposed default: five seconds) using revisions; stop while hidden. Show last successful refresh and stale/error state. A real-time transport can replace this later without changing domain ownership.

Paginate reads or return an explicit bounded-coverage state. Existing planning pages and operating/receipt projections have limits; do not show a partial first page as the whole week or market.

### Explicit instruction versus inference

Current gates are real backend constraints: agent routes pass actor `agent`; committed-goal edits are blocked by `assertPlanningAuthority`; `executeOperating` blocks agent completion/day acceptance; rhythm also blocks accepted promises and completion. The shared agent secret identifies a caller but does not prove which user message authorised a particular edit.

Required design: add a narrowly scoped delegated-user instruction path. Retain the authenticated user identity, originating connection/message, exact authorised operation/entities and a digest of the instruction/command. The server verifies its trusted origin and allowed scope, records an instruction receipt, then calls the common operation with delegated authority. It must record the agent as executor and Jules as authoriser, not impersonate an operator session or accept an arbitrary `confirmed: true` flag.

The application/connector must provide the trusted instruction context; a model-authored source string is evidence for a proposal but not independent proof of authority. A quoted instruction in a website or email must not obtain these rights. Inference continues through the existing agent proposal path. Accepting a daily schedule or launching an external campaign requires an instruction covering that action, not merely an unrelated task-completion instruction.

**Engineering dependency to resolve before enabling this path:** demonstrate the actual trusted context available from each intended chat surface. This repository does not currently establish that mechanism for all of Codex, ChatGPT and ChatGPT Work. Build a connection adapter against the surface's supported authentication/authorisation contract and run the test below. If a surface cannot supply the required authority, report its limited capabilities and retain proposals there; do not declare universal two-way integration or weaken the existing guard to pass a demo. This dependency does not block implementing the manual Compass workflow.

## Delivery order and acceptance

These are proposed implementation work packages under the existing Compass build project, not newly accepted dates or tasks.

| Step | Build | Acceptance evidence |
| --- | --- | --- |
| A | Resolve schema/migration and one chat authority adapter; prove rich-document roundtrip | Existing notes preserved; fonts/marks survive; one supported direct instruction has a verifiable receipt |
| B | Compose compact goal workspace with weekly board, notebook and shared task details | Edit a goal and task, reload, then see the same IDs/versions in Home, Tasks and Projects |
| C | One real Sydney session using existing contacts, rich notebook, app handoff and rhythm capture | Controlled call handoff plus explicit result produces exactly one activity and one follow-up visible in CRM and the board |
| D | Shared explicit-chat mutation path and active-view refresh | “That task is done” changes that exact task once; inference remains proposed; a stale concurrent edit conflicts safely |
| E | Campaign projection, attributable commercial evidence and weekly review | Actual cohort/provider state agrees; A$2,500 evidence meets the one-client criterion; missing data stays unknown |

Complete A–E before calling the end-to-end release finished. B–C can be demonstrated while a particular external chat connection is still being resolved, but that connection's gap must remain visible.

Required behavioural checks:

1. Write mixed formatting, fonts, links, ordinary checkboxes and linked tasks. Reload and read through the agent route. Nothing is flattened or lost; ordinary checkboxes do not complete canonical tasks.
2. Two writers edit one note/goal. The later stale save cannot overwrite the earlier accepted revision; each draft remains recoverable.
3. Retry an action creation, task completion and call capture after losing the response. Each produces one mutation and one receipt. Reject operation-ID reuse with altered payload.
4. Start warm-up, switch early to priority, pause and resume. Recheck latest restrictions/replies; manually overridden order survives. Never rank unknown preview records automatically.
5. Open/cancel a telephone handoff using a controlled test number. No call or conversation is recorded until an outcome is saved. Retain notes and use Copy number if no handler is configured.
6. Save a call with a dated promise, then one with an unresolved date. Correct contact, timezone and canonical follow-up persist in CRM and on the board.
7. Mark a contact restricted during a session from another client. It becomes ineligible for the affected channel before the next outbound action.
8. Apply one explicit task and one explicit committed-goal change through each actually connected chat surface; verify receipt and readback. Test an inferred proposal, unauthorised source and unavailable connection.
9. Verify payment threshold, partial payment, duplicate provider/accounting representation and later refund evidence using test fixtures. No real charge or refund is required for this acceptance test.
10. Verify missing provider data, pagination boundaries, unknown market size, mobile wrapping and independent desktop scroll regions. Long content stays accessible without shrinking task text.

Repository validation during implementation: extend the relevant tests in `test/notebook-editor.test.mjs`, `planning-core.test.mjs`, `planning-persist.test.mjs`, `planning-workspace.test.mjs`, `tasks-kanban.test.mjs`, `operating-service.test.mjs`, `outbound-rhythm.test.mjs`, `outbound-rhythm-database.test.mjs`, `pathfinder-core.test.mjs`, `pathfinder-database.test.mjs` and payment tests. Run focused behavioural tests, then `npm run verify`, `npm run lint` and the required production build. Do not start a local dev compiler unless Jules requests it.

Before any authorised release, integrate against fresh `origin/main`, preserve others' changes, apply migrations compatibly and verify the public Compass alias and affected APIs. Feature rollback must leave new document/session/evidence data intact and provide a readable fallback; an old writer must not silently downgrade new-format records.

## Boundaries and unresolved inputs

The visual layout and core workflow are approved. The editor/storage/adapter details above are engineering recommendations. Actual priority assignments, call capacity, city scheduling and refund terms remain inputs, not reasons to invent records or keep reopening the approved layout.

This build does not automatically launch campaigns, contact prospects, charge clients, migrate accounting systems, rewrite the live offer agreement, alter unrelated accepted schedules or create an always-on agent. Review source ownership again if the baseline changes. A failure to preserve old data, verify delegated authority or reconcile an external result blocks that capability's release claim; report the exact gap while continuing independent work.

After implementation acceptance, record the selected weekly-board hierarchy, compact header and desktop scroll behaviour in `docs/design/WORKSPACE.md`; document new authority and mutation contracts in `docs/OPERATING_WRITEBACK.md` and the agent bridge documentation. The current planning pass leaves those production documents and product code unchanged.
