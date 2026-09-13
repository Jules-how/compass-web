# Compass goals & actions

13 September 2026. Interview and concept v0.4. Jules approved the visual direction with “Yep, I like it.” Jules also approved the compact v0.4 layout with “Cool looks good.” The implementation specification is now prepared in [BUILD-PLAN.md](BUILD-PLAN.md); sample city/date allocations remain illustrative.

Approval source: the direct user reply in codex://threads/01a09804-c8a1-7531-82f0-f7d50030146e on 13 September 2026. Carry forward the weekly board, persistent goal panel, city sessions, prospect details and rich notebook as the selected interface direction. Click-to-call handoff and the weekly payment threshold were subsequently confirmed in the same task. Remaining operational inputs can be configured without reopening these decisions.

Source baseline: Compass commit `d48f7685c6d4ce32a5eab64044bb63f93fc5709d`; current agent operating/planning/outbound reads; hosted Planning inspected through the browser. Existing product source was not changed. The initial screenshot of hosted Planning was blank despite a populated accessibility tree, so no claim is made about its rendered visual quality. The standalone concept was rendered separately.

## What Jules is asking for

A clear place to write, set and edit goals, work with an agent to turn them into projects, milestones and actions, then know what to do today. Manual Compass changes and authorised work from Codex, ChatGPT and ChatGPT Work should reach the same records. The daily interface should maximise execution speed and retain the objective beside the work.

The concrete test is 14–18 September: establish whether the AC installer Ads + booking offer and pricing are commercially viable. Primary cities are Sydney, Melbourne, Brisbane, Perth and ACT; other locations remain optional. Approximate annual revenue of A$1m to A$12–15m is a working targeting description, not verified company data or a new hard eligibility rule.

Confirmed in this interview: success ranks **paid customers → positive sales conversations → total sales conversations → market coverage**. The weekly target is **one customer with A$2,500 collected**, with an A$2,500/month retainer that Jules says will be refundable under the risk reversal. Positive includes apparent value/demand, advancing the conversation, or booking a next meeting. A$5,000 collected is not required for this weekly target. Retainer start timing and the actual refund conditions remain unspecified. These are the interview’s validation target, not a silent edit to the active offer contract.

## Working recommendation and alternatives

Evolve the existing Planning destination into **Goals & actions**. Open a selected goal on its weekly action board, grouped by weekday, with Goal notebook, Week & campaigns, and Evidence alongside it. Today and status-board views are secondary. Keep the existing timeline/map as optional planning views. Use the same records and details in Home, Tasks and Projects.

| Approach | Benefit | Tradeoff | Current recommendation |
| --- | --- | --- | --- |
| Notebook first: goal document with embedded work | Writing and thinking are always immediately available | Daily execution can disappear in a long document | Use as the goal-authoring view |
| Action board plus persistent goal context | Makes the next action and its purpose visible together | Needs an easy jump into serious writing | Confirmed weekly starting view; group by day initially |
| Keep current pages and add links/filters | Smallest interface change | Leaves the operator assembling the workflow across destinations | Useful first implementation slice; insufficient as the final experience |

Do not add an additional independent goals system. Retain existing deep links when implementing the selected navigation direction. Jules confirmed that the morning starting point is the weekly board showing the whole plan. Home should make that view immediate, with Today available for focus. Outbound owns campaign execution and CRM owns company history; the goal workspace offers the relevant actions and context.

## Existing design and evidence

- Governing design: `docs/design/WORKSPACE.md` and `.cursor/rules/compass-ui-lock.mdc`. Linear is the current selected foundation; the older cream/orange style is superseded.
- Owners: `OperatorShell.tsx`, `folio/FolioChrome.tsx`, `workspace.css`, retained `folio.css`, and page styles. Geist Sans, near-white workspaces, quiet grey navigation, restrained violet actions, broad work areas and bounded document measures.
- `/planning` currently renders `PlanningDesk` → `PathfinderBoard`; the primary view is Timeline, with Map and a separate Goals & notes destination. `GoalPad` already supplies a right-side objective and actions. This is a useful starting structure.
- `NotebookEditor` already supports document blocks, undo/redo and Markdown persistence. Its checkbox blocks edit note text; they are not canonical task completions.
- Current goals support daily through yearly periods, parent relationships, qualitative criteria, quantitative targets, drafts and commitments. Outcome observations already carry source, period, provenance and goal revision.
- Tasks, projects, project checkpoints, goal-work links, daily operating projections, preparation receipts and outbound rhythm records already exist.
- No binding exception to the current visual foundation was found. The changes here arise from Jules's requested workflow, not a claim that every existing surface violates the design contract.

## Inspiration and the parts worth taking

1. [Linear initiatives](https://linear.app/docs/initiatives): connect strategic purpose to supporting projects and keep context/resources with it. [Milestones](https://linear.app/docs/project-milestones): make stages visible within projects. Borrow the compact organisation; do not equate completed work with proof of a business outcome.
2. [Notion shared task views](https://www.notion.com/help/guides/give-your-to-dos-a-home-with-task-databases): one central task collection, linked project views and inline status changes. Borrow the document-plus-connected-work experience.
3. [Sunsama daily planning](https://help.sunsama.com/docs/usage-guides/daily-planning/): select work from weekly objectives, consider available time and order the day. Borrow deliberate daily selection and time allowances. Actual calling capacity is still unknown.

These are design references, not proposed subscriptions or migrations.

## The prototype

Open `preview.html`. It is standalone HTML, CSS and JavaScript with a local copy of the existing Geist font. A small static server can show it; no Compass compiler is needed.

- Actions: a time-scope selector, Next up/In progress/Waiting board, collapsed completed work and a persistent goal panel. Open a card to change its status, owner, planned day, time allowance and done condition.
- Goal notebook: directly edit the title, hypothesis, success criteria and scope/notes. Working notes and contact notebooks demonstrate bold, italic, underline, headings, quote, lists, links, undo/redo and a small font choice. Its linked actions open the same objects as the board.
- Week & campaigns: an illustrative daily emphasis and a campaign-state snapshot. The actual order and sending allocation remain to agree.
- Calling session: a city prospect board with business/owner/phone cards and a contact detail view. Phase navigation shows warm-up, priority and finish groups. The five real record snapshots remain unranked; this preview does not invent commercial fit or priority. The older fictional call demo remains isolated in the initial markup. A Call button demonstrates the selected app handoff, keeping the contact open and prompting outcome entry; the preview does not place a real call or transmit messages. The revised city board includes five real Sydney record snapshots from the Compass lead API and their contact history from the rhythm API. All call outcomes entered in the preview remain simulations.
- Evidence: prioritised commercial measures and the recorded simulated calls. Preview interactions are kept in local browser storage and can be reset.
- New goal/add action: demonstrates manual authoring. Other app destinations in the sidebar are visual context, not working navigation.

The sample 60-minute call session is a proposed interaction example, not an agreed workload. Unknown result counters are intentionally not displayed as zero. The prototype is not connected to Compass or a live provider.

## Product model to settle in the interview

Use **goal** and **objective** as the same concept in the product unless Jules needs a real distinction. A period is a property of a goal. Create a daily/weekly subgoal only when it describes a distinct outcome; do not duplicate a weekly goal into five date-labelled goals just to populate a view.

| Concept | Meaning | AC example |
| --- | --- | --- |
| Goal | The outcome and why it matters | Validate whether installers will buy this offer |
| Project | Optional body of work that serves a goal | AC offer validation campaign |
| Milestone | A meaningful checkpoint with a done condition | Week's commercial review recorded |
| Action | Work someone can perform | A Sydney calling session; a promised follow-up |
| Contact activity | What actually happened with a business | No answer, pricing discussion, requested outline |
| Outcome evidence | Evidence about goal achievement | Confirmed payment and the client/offer it relates to |

A small goal can link directly to actions. A project is not required for every action. Milestones should remain the existing project checkpoints where appropriate. A goal-specific checkpoint outside a project needs an explicit modelling choice; do not silently invent a project just to store it.

Jules requested a Notion-like notebook with a full formatting toolkit, including bold, italic, headings and some font choice. Keep font choices inside authored document content while retaining the existing workspace chrome. The production editor/schema must be assessed for faithful formatting persistence; the prototype’s native browser formatting is not a production editor recommendation.

The notebook should have a small structured header—outcome, period, date, success definition—and flexible writing below it. Linked task rows are references to real tasks. Ordinary note checkboxes must remain distinguishable from those linked rows. Converting selected writing to an action should preserve the source text and attach the new/existing task once.

## Daily execution loop

1. Read selected goals, existing obligations, current campaign/contact state and confirmed available time.
2. Show due buyer promises and a proposed short order of ready work, with the reason each action matters. Keep genuine prerequisites visible.
3. Open a calling session to reach an ordered list: the business, published phone, scale/fit evidence, previous emails/calls, relevant pitch notes and next step. Keep due promises explicit. For fresh calls, suggest 5–10 eligible lower-priority prospects as warm-up, the bulk of high-priority prospects next, and remaining lower-priority prospects at the end. Jules can enter the high-priority phase at any time. Record manual order/overrides and resume position; the UI must never lock him into completing the warm-up. Eligibility is separate from priority; low fit or restricted records are not warm-up material. Use city timezones when choosing call windows.
4. Capture outcome once. A conversation belongs to the contact; its agreed follow-up is the same action visible on the board and in CRM. An unanswered attempt does not count as a sales conversation.
5. Update the board and progress evidence. Finishing a session is different from exhausting a city's eligible call list. Stopping for the day retains the queue position.
6. Reassess the next action when a buyer responds. Propose changes to the agreed plan unless Jules explicitly changes that authority. Do not silently move accepted dates.
7. At the weekly review, assess the commercial evidence in Jules's confirmed order and choose what to retain, revise or test next.

SMS is a channel in the existing activity model. Any actual contact action still needs its supported channel, published route, restrictions and the user's execution instruction. This planning request does not launch messages or campaigns.

## Confirmed calling handoff

The production contact detail offers **Call [business]**, handing its stored, validated number to the device's configured calling application through a telephone link. Retain the notebook draft, current prospect, session position and selected phase while the user is away. When the user returns, the same contact context and explicit outcome controls remain available.

A handoff establishes only that Jules requested the calling application. It cannot establish that the call connected, completed or even started. Do not auto-create a call activity, increment conversation counters, complete a task or advance the queue from the link click or browser focus change. Jules saves an outcome explicitly; that outcome and any promised follow-up use the existing rhythm owner and idempotent mutation. Notebook autosave remains independent of saving a call outcome.

Keep the number visible/selectable with a Copy number fallback, since some devices have no configured calling handler and the browser cannot reliably detect that. Missing/invalid numbers and current contact restrictions prevent the call action with an explanation. Use a named, keyboard-accessible control, visible focus and associated status text. A production device handoff test is needed before claiming dialing works. The prototype deliberately simulates handoff without a telephone link to the real snapshot numbers.

## Measures and campaign sequencing

The confirmed weekly success condition is **one customer with A$2,500 collected**, attached to this offer and goal period. The A$2,500/month retainer is refundable under the risk reversal; its first month does not raise the weekly collection threshold to A$5,000. Retainer start date, refund triggers, eligibility window and amount have not been specified. This records Jules's product-planning decision, not a completed client agreement or an update to the active offer contract.

Proposed measurement rule: count distinct clients with linked, confirmed receipts totalling at least A$2,500 for the agreed upfront payment. A smaller partial payment shows cash progress but does not meet that threshold. Retain the payment source, date, currency, client, offer and goal revision; signatures, invoice creation and verbal interest do not establish collection. Show refundable retainer terms separately from cash actually refunded. If money is later refunded, retain the original receipt and refund as separate evidence and surface the change; do not silently erase history or assume refund eligibility means a refund occurred. Confirm reversal reporting before automating this metric.

Jules defines positive broadly: the offer appears valuable or wanted, the conversation advances, or a next meeting is booked. Retain specific signals (value, demand, next step, booked meeting) and supporting notes so broad interest remains distinguishable from a concrete commitment. Do not silently tighten this into “meeting booked only”.

Total conversations needs a choice between distinct businesses engaged and conversation events; show both when useful. Market coverage needs a supported denominator of eligible unique companies, channel-specific reach and a snapshot date. Loaded addresses, first emails, follow-ups, calls and distinct companies cannot be added into a single “market reached” total. Several inboxes or branches can belong to the same business.

Provider evidence read at approximately 09:48 Sydney on 13 September: Sydney 124 and the earlier Sydney 40 are separate paused campaigns, with 124/40 cumulative sent and contacted respectively. Both report zero replies in their available campaign analytics. Four other city campaigns are paused and their numeric send analytics were unavailable. These are source snapshots, not a forecast or a full audit of all conversations. Preserve exact cohort identities and verify current provider state before execution.

The current shared handover still contains older upload-blocker statements, while newer preparation/load records exist. This demonstrates why provider/load receipts and source timestamps must outrank stale narrative in the new workspace. Do not repair or reclassify campaign records as a side effect of designing this page.

Actual weekly sequencing must consider reviewed recipients/copy, inbox allocation, local send windows, reply handling and calling time. A follow-up is anchored to the recipient's actual send history, not the day a Kanban card moved. Maintain at least the workspace's two-day gap; specific existing campaign intervals may be longer. Represent dates as proposed, eligible, scheduled or observed rather than implying a single date means all four.

## Backend approach

Reuse current owners first:

| Capability | Existing owner | Required design work |
| --- | --- | --- |
| Goals and notebook pages | `planning-core.mjs`, `planning-server.ts`, `/api/planning`, `/api/agent/planning` | Compose goal metadata and linked full note body; preserve revisions/history |
| Goal relationships and evidence | `lib/pathfinder/*`, `/api/pathfinder`, `/api/agent/pathfinder` | Reuse links and observations; bind new action rows to canonical IDs |
| Tasks/projects and daily view | `operating-core.ts`, `operating-server.ts`, `/api/operating`, `/api/agent/operating` | Shared mutation contracts and refresh across Home/Tasks/Projects/Goals |
| Calls and promises | `outbound-rhythm.ts`, `outbound-rhythm-server.ts`, operator/agent outbound rhythm APIs | Reuse capture/outcomes/contact restrictions; add session presentation and only missing session state |
| Campaign status | Outbound overview and existing provider reconciliation | Same freshness, receipts and provider status everywhere |
| Payment-backed goal evidence | Existing client/payment and outcome records to inspect next | Confirm the actual authoritative payment path before choosing an integration |

Goal `notes` currently caps at 4,000 characters; note `body` supports 20,000. Use the existing goal-linked note body for sustained writing. The notebook block model serialises Markdown; typed task links need a tested representation that round-trips through it rather than pretending checkboxes are real tasks.

All routes should use a common server operation for each real mutation. A write includes stable identities, expected revision/current task version, actor and source. Retried writes reuse an operation ID. A conflict preserves the user's draft, reloads the latest record and offers a reconcile path. A timeout is uncertain until a receipt/readback establishes the result.

For calls, commit the activity and next action together where the existing rhythm transaction supports that. For an external campaign instruction, record requested work, provider attempt, provider result and reconciliation separately. A queued request is not a completed send. Do not promise exactly-once provider execution; use deduplication and reconciliation after ambiguous results.

After a write, invalidate/reload affected shared views. Another session should read the same record and revision. Decide whether event-driven updates or the current refresh mechanism is sufficient after measuring the first working slice; a new always-on agent is not necessary to establish persistence.

### The authority mismatch

Current `assertPlanningAuthority` rejects an agent committing or changing a committed goal. `applyOperatingCommand` requires the operator for task completion and day acceptance. These are stronger than “ask the user first”: a direct chat instruction is not currently sufficient at those endpoints.

Jules explicitly confirmed: **his direct chat instructions should apply immediately; agent-inferred changes stay suggestions**. The design must therefore distinguish **Jules explicitly says this is done/change this goal** from **an agent infers completion/recommends a change**, without asking him to confirm the same instruction again in Compass. Establish how an authenticated chat-origin instruction carries verifiable user authority and a retained source. Preserve the current operator/agent separation until that mechanism is designed. Do not accept an arbitrary `confirmed: true` flag from an agent as proof, impersonate the operator, or broadly remove the guard.

Each desired surface—Compass UI, local Codex, ChatGPT, ChatGPT Work—needs an independent read/write/readback acceptance test with its actual connection and permissions. Successful local Compass MCP/API use does not prove cloud access or all-chat visibility. Only connected and authorised sessions participate.

## Proposed delivery slices after the interview

1. **One working goal:** notebook + goal side panel + linked canonical tasks; manual editing/completion persists and refreshes across Home/Tasks/Projects. Preserve existing routes/history.
2. **One real calling session:** selected Sydney records, activity capture, resume position and linked promises; no duplicate task/activity after retry. Extend the current rhythm owner.
3. **One complete agent round trip:** read that goal, carry out one authorised change, write evidence, verify it in Compass, and read it from another authorised environment. The confirmed explicit-instruction policy must have a tested authenticated implementation first.
4. **Week/month views and campaign sequencing:** project/milestone views, reviewed cohort states and timing, accepted capacity and visible proposed changes.
5. **Commercial evidence and weekly review:** agreed metrics, payments, conversations, market denominator, uncertainty and decision history. No progress percentage derived from arbitrary task counts.

## Acceptance scenarios

- Edit a goal in the notebook; it persists after reload and appears in its side panel with the same ID. A second writer gets a conflict instead of overwriting unsaved work.
- Complete a linked task in Compass; Home, Tasks, Project and the notebook show that same task complete. Goal achievement remains unverified until its own evidence supports it.
- Direct the connected agent to add an agreed action; it appears once. Retry after a lost response produces one task and one receipt. Inferred work remains clearly proposed.
- Record a call and a promised follow-up. Both attach to the correct contact, preserve timezone, and survive a failed/retried response without duplication. A contact restriction removes the record from the affected outreach queue.
- Activate click-to-call on a controlled test number/device. The intended app receives the correct number; returning preserves notes and position. Cancel the dial or use a device without a handler: no call, task completion or conversation is inferred. The visible number/copy fallback remains available.
- Enter linked payment evidence of A$2,500 for one customer: the weekly paid threshold can be met without collecting A$5,000. Duplicate receipts do not count twice, smaller payments remain progress, and an actual refund stays distinct from refundable retainer terms.
- Stop and resume a call session. The correct unhandled/eligible business is next; changed restrictions/replies are rechecked.
- Change a provider campaign state. The workspace shows observed status and freshness, distinct from a planning card's status. Analytics failures show unknown instead of zero.
- Change the weekly goal definition. Earlier observations retain the goal revision against which they were recorded. The agent cannot silently adopt the change.
- Inspect wide desktop, tablet and phone with long goal titles, long notes, many actions, loading, no goals, save failure and conflict states. Boards scroll without shrinking text; editors preserve drafts.
- Complete a read/write/readback in each actual chat environment before claiming that environment is connected. Test unavailable access and a later reconciliation.

Existing focused checks include `planning-core`, `planning-persist`, `planning-workspace`, `tasks-kanban`, `operating-service`, `pathfinder-core` and `pathfinder-database` tests. The implementation should extend relevant behavioural checks and pass `npm run verify`; run the required release build only when product changes are authorised. No production test suite was needed for this isolated HTML concept.

## Confirmed decisions and remaining inputs

Confirmed: weekly board first; one customer with A$2,500 collected and an A$2,500/month retainer refundable under the risk reversal; click-to-call app handoff; broad positive signals; city session cards opening a business-card list; 5–10 eligible lower-priority warm-up suggestions, then priority prospects and lower-priority finish; manual move to priority whenever ready; rich goal/contact notebooks; immediate application of explicit chat instructions, with inferred changes proposed.

Remaining operational inputs: actual available call time and weekly city/campaign allocation; the final evidence-based priority rubric and treatment of revenue/team estimates. Retainer start timing and refund conditions belong in subsequent offer-term reconciliation, not guessed values in this prototype.

Final round: preserve accepted schedule authority separately from explicit completion; notebook formatting/relations and mobile experience; simple project/milestone hierarchy versus richer nesting; smallest first production slice and its cross-environment acceptance demonstration.

Do not treat this document, sample daily sequence or the illustrated weekly goal as an accepted schedule. Preserve current work while the interview proceeds. After the workflow is agreed, replace the provisional sections with a self-contained implementation plan and refresh the source baseline before coding.


## v0.2 source and preview notes

Five Sydney contacts were read from `leads.search` with full columns, followed by `/api/agent/outbound/rhythm?lead=<id>` for each. Stored numbers and three email-sent timestamps were returned. These reads did not establish owner names, scale, lead ranking or the full email message bodies. The contact view labels those gaps. A dated send event can be displayed now; a substantive email summary needs the actual message source during implementation. No contact selection, ranking, lead modification, dialing or sending was performed.

The prospect board has a phase selector and a visual priority curve. Because the actual records are unranked, switching phase does not claim a new evidence-backed ordering. Producing the real ranked list is future authorised preparation after the priority rubric is agreed.

## Prospect priority proposal after Jules's follow-up

Jules considers company size, installation focus, growth/capacity, existing advertising and a visible acquisition problem useful, and asked for additional ideas. Recommendation: add a timely buying trigger, a reachable decision-maker and evidence the business can fulfil profitable installation work. Group evidence into commercial fit, timing and accessibility; start with High / Medium / Lower tiers and a visible reason. No numeric score or weighting has been adopted. Estimates show confidence/source; unknown does not mean poor fit. Buyer replies, due callbacks and promises take precedence over fresh-call warm-up sequencing. Warm-up candidates must still be eligible commercial prospects. Some capacity/economics facts are learned in the call rather than invented during research.

Confirmed since the priority discussion: click-to-call handoff and A$2,500 collected as the weekly paid threshold; A$2,500/month retainer refundable under the risk reversal. Remaining: final priority rubric, weekly time/campaign allocation, retainer/refund details and production slice approval.

## Preview verification

Browser checks verified initial task opening, status change reflected in the linked notebook, goal-title editing reflected in the board heading, a simulated call creating a linked follow-up, and persistence of simulated results after reload. The revised city session opens five real contact snapshots with dated history; contact notes persist when the contact is closed and reopened. Formatting controls are present and bold was exercised; the complete editor toolkit has not had a production-grade acceptance test. Script syntax checks pass. Desktop 1440×1000, tablet 768×1024 and phone 390×844 were inspected across the iterations. The tablet sidebar was removed at that breakpoint after inspection to give the board more room. Board columns deliberately scroll horizontally at narrower widths.

These are prototype checks only. No live task-completion, real call capture, payment integration, chat-authorisation change or cross-environment sync was tested. The saved project evidence and dated handover were written through Compass APIs; the handover was read back with the previous content intact.


v0.3 focused verification: revised A$2,500 collection target rendered on the board and objective rail. The contact handoff button was reached with Tab and activated with Return; its associated status changed while the same contact remained open and the call outcome remained unset. Visible keyboard focus and the desktop contact layout were inspected. This demonstrates only the browser-local simulation; no real call or provider handoff was tested. Existing custom notebook text is preserved when migrating the preview defaults.


## Selected density refinement — 13 September 2026

Jules identified excessive header, metric and introductory height above the first actions and proposed five specific changes. Applied these to the isolated prototype: title/Add action on one row; remove the weekly-focus eyebrow and move the description to the notebook; show four measures in one slim row with definitions retained in the objective panel; put workspace tabs and time/group controls in one wrapping navigation bar; replace preview/board banners with a small sample-plan badge; let board and objective use the remaining viewport height with separate scrolling. Task typography was retained.

Implementation artifacts: preview.html owns the compact header/navigation structure and notebook description; compact.css owns viewport layout, metric presentation and responsive sizing; interview.js moves the existing action controls into the shared navigation row after each render. No production source was changed. Use these selected presentation requirements when composing the production workspace; do not add another layer of permanent banners.

Verified at 1440×900: weekday headings at 239px, first card at 271.5px, each work pane 677px tall. At the original current 1710×952 viewport, headings moved from 362.5px to 239px. The user's screenshot estimate of roughly 650px was not reproduced at that viewport. Independently scrolling the board changed its scroll position to 125.5px while the objective stayed at 0; scrolling the objective to 76.5px left the board position unchanged. Header/navigation stayed fixed. Day/status switching and the relocated notebook description were checked. Inline and refinement-script syntax checks passed.

Tablet 768×1024 and phone 390×844 were inspected. On desktop/tablet, the objective remains a separate pane. On phone, controls wrap, metrics and the board can scroll horizontally, and the objective follows the board in the shared content scroll area to retain readable width. The phone's two-line title places weekday headings at about 290px; no smaller task font was used to force the desktop target. No page-width overflow was observed at 390px. Production must also check long titles/notes, focus access to each scroll region and changed task counts.


## Layout approval and build specification — 13 September 2026

Jules approved the compact layout with “Cool looks good.” BUILD-PLAN.md is the implementation handoff for the selected experience and supersedes the provisional delivery outline in this discovery log. It records existing owners, rich-document migration, canonical task/session/call/promise behaviour, explicit chat authority, campaign state, attributable payment evidence, delivery order and acceptance checks. Technical choices remain engineering recommendations; production implementation has not started in this design task. The available trusted authorisation context for each chat surface remains an explicit integration dependency. Actual city/time allocation, priority assignments and refund terms remain unset.

Additional source inspection found existing agreement payment confirmation and QuickBooks cached invoice views. Their current aggregate payment summary is whole-business and derives amounts from terms; goal-specific attribution, actual payment amounts/dates and refund history need explicit evidence handling. A cached paid invoice/credit memo alone is not the new goal metric. The current editor serialises Markdown with literal inline syntax and lacks font/task-node representation; the proposed rich adapter must preserve old content and support structured writes. No payment, call, provider or live agreement action was performed.
