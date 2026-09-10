# Outbound rhythm: implementation plan

10 September 2026. Prepared for Jules. Status: proposed implementation; no product changes, campaign changes or accepted schedule implied.

## Outcome

Open Compass and see who needs attention, what happened last, what to do next, and the planned workload for the coming week. Finish a call or reply by recording its outcome and next action in the same place. Keep enough prepared prospects available that sourcing does not interrupt selling.

First acceptance scenario: open a Perth installer, log a conversation, schedule an agreed callback in Perth time, reload Compass, and find the callback once in Today and Upcoming with the correct context. This must work when the company has a phone but no email.

## Decisions

- Extend the existing lead ledger, outreach history, tasks, lead detail panel and Home. Retain the current cream/orange Folio identity.
- Use ordinary deterministic queue rules. AI can prepare research, drafts and proposed next steps; it is not required to decide whether a dated callback is due.
- Keep individual outreach actions in existing Compass tasks, linked explicitly to leads. Do not create a separate task store or a task for each automated email step.
- Keep actual interactions in outreach history. A task, draft, upload, scheduled email and completed interaction are different records of different facts.
- Deliver a working capture-and-follow-up loop before forecasting, reporting or further agent automation.
- Continue daily selling during implementation. The new interface is not a prerequisite for making the next call.

## Verified starting point

Checked current local source and live Compass notes on 10 September. Local source is not proof of production deployment.

| Existing capability | Evidence | Implementation implication |
|---|---|---|
| Leads allow nullable email in their TypeScript model | `src/lib/types.ts`, `LeadContact` | Preserve lead IDs; inspect actual database constraints before migration. |
| Commit path rejects missing email | `src/lib/lead-commit.ts`, `decideLeadCommit` | Add a supported phone-only route and update import assumptions. |
| Outreach history exists | `src/lib/lead-outreach.ts`; migration `0036_lead_outreach_touches.sql` | Extend this history for manual outcomes, direction and provenance. |
| Existing touch IDs collapse by contact/campaign/day/source | `recordOutreachTouch` | Manual calls need stable event IDs so two calls in a day remain distinct while retries remain idempotent. |
| Tasks have due dates, notes and project links, but no typed lead link in the inspected interface | `src/lib/types.ts`, `CompassTask` | Add minimal typed outreach metadata to existing tasks. |
| Lead detail and recontact panels exist | `src/components/LeadSidecar.tsx`, `LeadRecontactPanel.tsx` | Add capture and next action to the existing detail experience. |
| Cadence currently means campaign launches, with browser-local preferences | `src/lib/outbound-cadence.ts`, `OutboundQueueSection.tsx` | Do not use its one-trade-per-week/campaign-slot rules to rank individual calls. |
| Instantly webhook and reconciliation paths exist | `src/app/api/webhooks/instantly/route.ts`, `src/lib/instantly-leads-sync.ts` | Reuse these integrations and expose freshness. |
| Home can disagree with recent campaign activity | Live brief and handover checked in the preceding review | Current provider state must constrain displayed recommendations. |

Relevant owners: `../cold-email/AGENTS.md`, `../cold-email/PIPELINE.md`, `../switchflow-offer/installation-booking.md`, `docs/CLOUD_MORNING_OPERATING_PLAN.md`.

## Release 1 — Capture a call and make the next action reliable

This is the first independently useful release. Ship and exercise it before expanding scope.

### 1. Support calling-only leads

Extend the existing authenticated lead commit/search path to accept company plus a published phone, without requiring email. Keep email verification and email-export eligibility unchanged.

Identity resolution:

- Prefer a supplied existing lead ID.
- For imports, retain a stable source identity; repeat imports must resolve to the same row.
- Use exact supported contact/domain matches to find candidates, but do not merge ambiguous shared numbers, branches or different people automatically.
- Return an explicit unresolved match when identity is unclear. Never fabricate an email as an identifier.
- Adding a published email later updates the existing confirmed lead; it must not lose call history, suppression or tasks.

Check nullable-email handling in search, lists, sidecar, cohort counts, CSV rendering and Instantly export. Phone-only records appear in calling views and stay out of email uploads.

Update the city pipeline so calling candidates can be committed through the agent API. Retain raw source files and receipts; avoid a separate operational call ledger.

### 2. Extend interaction history

Add backward-compatible fields to the existing outreach touch history for direction, outcome, short note, person/role reached, actor/source, external event ID and any explicit channel restriction. Retain campaign links and copy snapshots.

Use a request ID for manual entries and the real provider event ID where available. Replaying one event produces one row; two separate calls produce two rows. Existing historical rows remain readable without invented detail. Surface a failed write; do not silently report a call saved.

Initial outcome choices:

- No answer.
- Invalid/disconnected route.
- Office or gatekeeper reached.
- Decision-maker conversation.
- Information requested.
- Meeting agreed.
- Not now.
- Not interested.
- Do not contact.

Store conversation result separately from next action and commercial stage. “Office reached” does not mean positive buying interest; “not now” does not mean opted out. An invalid email does not invalidate a published phone. Honour the actual scope of a contact restriction and hold ambiguous restrictions for review.

### 3. Link next actions to existing tasks

Add typed fields sufficient for an outreach task: lead ID, action channel, action reason, due timestamp, prospect timezone, originating interaction ID, and proposed/accepted state. Reuse existing task status, notes and project association. Audit existing task mutations, task creation from replies, and notification readers before changing contracts.

Use existing task due storage if it safely supports timestamps; otherwise add a backward-compatible outreach timestamp without converting unrelated task dates. Store instants in UTC and display the named local timezone. Unknown timezone requires clarification before a precise timed callback.

Default to one primary next action per lead. Permit a second explicit commitment when needed, rather than silently replacing it. A retry must not create another task. Saving a new action must not overwrite a concurrently edited task; use revision-checked atomic writes.

Logging an interaction and recording its next disposition should be atomic. Offer:

- Schedule a next action.
- Close this outreach with a reason.
- Leave the next step unresolved, visibly queued for review.

Always allow factual notes to be saved even when a date is unknown. “Unresolved” must not disappear into history. Logging a call does not automatically complete its task: Jules confirms “Complete action” explicitly.

### 4. Add fast capture to the lead detail panel

Show contact routes, last interaction and open next action together. Add “Log outcome” and “Set next action” with sensible defaults, keyboard support and clear save/failure feedback.

Capture should take about 30 seconds for a routine call; this is an acceptance target to measure, not a performance claim. Do not require a transcript, lengthy qualification form or generated summary.

Allow dictated text through the device's existing input support. Dedicated recording/transcription infrastructure is outside this release.

### Release 1 acceptance

- A real published phone-only prospect can be saved and reopened without a placeholder email.
- Two calls on the same date remain two events; retrying either creates no duplicate.
- An agreed callback persists with the correct prospect timezone.
- The same action is visible in the lead panel and existing Tasks.
- Logging without a known next step preserves the note and creates a visible unresolved disposition.
- Concurrent edits cannot erase another user's or agent's update.
- Existing email preparation and exports still exclude ineligible addresses.

## Release 2 — Today, Upcoming and a prepared queue

### 5. Build one outreach queue from existing records

Add an outreach view within the current Sales/Outbound area and a compact linked summary on Home. Use the same query/ranking service for both and for the agent API.

Default ordering:

1. Buyer replies needing review and due/overdue explicit commitments.
2. Due accepted follow-ups.
3. Interactions with an unresolved next step.
4. Selected new prospects ready for contact.

Within each group use due time, then accepted priority, then stable ID. Show the reason for each row. Explicit prospect-local callback times and channel restrictions take precedence over general ranking. Flag outside-hours calls instead of moving their due dates.

Each row shows company/person, channel, last outcome, next action, due time, and relevant contact/source link. Open the existing lead detail panel to act. Support reschedule, explicit completion and close with reason. Old unrelated campaigns must not supply fresh recommendations for the current offer.

Prevent duplicates when an imported reply, existing task and campaign membership concern the same action. Preserve the original source links rather than creating another task per refresh.

### 6. Show the next seven days of known workload

Display accepted manual actions by day, meetings, prepared unscheduled prospects, and provider-confirmed scheduled email activity where available. Clearly distinguish accepted, proposed and externally scheduled work.

Do not invent recipient-level send times from campaign caps. If the provider exposes only a window or estimated workload, label it accordingly. Unknown is not zero. Display source/check time.

Store agreed daily call workload and ready-queue target in Compass, not only browser storage. Starting proposal: ten call attempts per selling day, roughly two selling days of ready prospects. Jules can change these; they do not create calendar events or commit a schedule automatically.

Show queue shortfall and excess due work. Replenishment uses the existing pipeline and a bounded batch, with existing review, spending and sending authority. No automatic paid scrape is introduced.

### Release 2 acceptance

- Home and Outbound show the same due counts and underlying actions.
- A Perth callback displays correctly from Sydney, including daylight-saving date boundaries.
- Completed/closed work leaves Today; unresolved work remains visible.
- Refreshing, retrying and syncing produce no duplicate actions.
- A shortfall is calculated from usable, unreserved records for the selected channel, not raw discovery counts.
- Upcoming distinguishes known commitments from estimates and proposals.

## Release 3 — Reliable channel state and concise learning

### 7. Reconcile email state with manual work

Reuse the existing Instantly webhook and bounded reconciliation job. Keep actual provider state separate from planning status. Record each successful source check and any partial failure.

A reply should surface one review action and suppress further local cold-sequence recommendations for that contact. Do not claim the remote sequence stopped until provider state confirms it. Where Jules agrees a callback while an email sequence is active, show the conflict and a concrete pause/review action rather than quietly running both.

Jules retains campaign activation authority. This implementation does not automatically send emails or texts, place calls, or modify existing campaign settings. Text follow-ups require an evidenced agreed/invited channel; generic cadence enrollment is insufficient.

Stale Home prose must not request a launch for a provider-confirmed active campaign. Mark unsupported readiness or reply coverage as stale/unknown and link directly to the relevant campaign or inbox. Refreshing metrics must not make an old recommendation look newly reviewed.

### 8. Add a small weekly review

Derive counts from saved events and accepted outcomes:

- Call attempts, office conversations and decision-maker conversations separately.
- Actual email sends and human replies by campaign/reporting period.
- Agreed next steps; meetings booked and held separately.
- Signed work and received payments from existing commercial records.
- Founder preparation, selling and system-work time, entered once per work block or daily total.

Keep event counts and unique lead counts distinct. Do not attribute a multi-channel sale solely to the last touch, equate sent-minus-bounced with verified inbox delivery, or include historical-offer results in the current test.

Produce one short review: observed constraint, supporting examples, proposed change and what will remain stable during the next test. Use “insufficient evidence” where appropriate; no automatic winner declaration or strategy rewrite.

### Release 3 acceptance

Replay a reply event, receive it out of order, simulate provider failure, and restore connectivity. State remains correct, duplicates do not appear and freshness does not misrepresent coverage. Verify reporting against a known small fixture containing calls, replies, a rescheduled meeting and a payment.

## Implementation map

Existing files/modules to extend; final migration filenames and any new shared service names should follow current repository conventions at implementation time.

| Responsibility | Starting points |
|---|---|
| Lead identity and phone-only commits | `src/lib/lead-commit.ts`, `lead-import-shared.ts`, `lead-search.ts`, `types.ts`, agent lead routes |
| Interaction storage and rendering | `src/lib/lead-outreach.ts`, `recontact-eligibility.ts`, `LeadRecontactPanel.tsx`, additive migration |
| Task linkage and atomic disposition | `src/lib/types.ts`, existing task services and `src/app/api/tasks/`, corresponding authenticated agent endpoint |
| Fast operator capture | `src/components/LeadSidecar.tsx`, `LeadsPanel.tsx`, existing task detail components |
| Today and Upcoming | `src/components/outbound/OutboundHub.tsx`, `src/components/home/FolioHome.tsx`, existing Home data services |
| Provider truth and freshness | `src/lib/instantly-leads-sync.ts`, `src/app/api/webhooks/instantly/route.ts`, Home/brief services |
| Pipeline call-list handoff | `../cold-email/outbound_pipeline.py`, `outbound_worker.py`, `PIPELINE.md` |
| Metrics | `src/lib/outbound-outcome-metrics.ts`, existing commercial outcome readers |

All lead operations go through Compass's supported API; application implementation may extend its server-side storage as required. Enforce existing operator/agent authentication and row-level security on new fields/endpoints. Keep reads paginated and indexed for lead, due time, status and event identity.

## Delivery order and verification

1. Recheck working tree, migrations and deployed state; preserve other in-progress work. Confirm exact task/date and identity constraints. No redesign or global cleanup.
2. Implement Release 1 as one coherent slice. Test on fixtures and a hosted preview. Measure the capture flow.
3. Implement Release 2 against the same records. Use seeded cases for timezones, duplicates, overdue callbacks and unresolved next steps.
4. Integrate Release 3 without making Release 1 dependent on a healthy external provider.
5. Run focused regression tests, typecheck, required deployment guards and production build. Verify keyboard use, mobile capture and error recovery in the changed interface. No local dev compiler unless Jules requests it.
6. Deploy through the repository's authorised release process. Use additive migrations; if necessary disable the new view while preserving saved records. Verify production readback before claiming completion.
7. Run a five-selling-day operator trial, with day-one usability review. Keep live outreach running throughout. Adjust remaining implementation based on observed friction.

Planning estimates after the initial dependency check: Release 1, 1–2 focused development days; Release 2, 1–2; Release 3, approximately 1. These are provisional effort ranges, not accepted calendar allocations. If Release 1 exceeds its range, narrow it to phone-only save, call outcome and linked callback before adding more views. Do not respond by creating a larger architecture.

## Initial data and operating trial

Start with today's Perth calls, the current Sydney campaign and genuinely active warm opportunities. Do not migrate the entire historical ledger into a new cadence.

The photos show nine numbered entries while Jules reports ten calls. Reconcile the missing entry and ambiguous handwriting with Jules during actual capture; retain unknowns. Draft interpretations may be prepared, but do not invent contact details, consent, promised callbacks or buyer interest. Actions without agreed dates remain proposals until accepted.

During the trial Jules works due commitments first, then the chosen new-contact block; records outcomes immediately; and leaves tomorrow's queue ready. Agents prepare batches and drafts and flag gaps. They do not mark Jules' tasks complete or change his accepted schedule without instruction.

Success criteria after five selling days:

- Every captured interaction has a dated next action, explicit closure or visible unresolved disposition.
- No accepted callback is lost between lead history, Tasks and Today.
- No selling block is delayed by rebuilding the day's list, or the exact cause is recorded.
- Routine capture approaches the 30-second target.
- At least two repeat preparation runs have measured founder minutes and usable-contact output.
- A weekly review identifies the next constraint using actual conversations and outcomes.

Commercial wins are tracked, but a sale within five days is not a software acceptance criterion. A functioning queue is not proof of offer-market fit.

## Scope boundary

This plan adds the operating loop Jules requested. Broader Pathfinder redesign, offer-planner expansion, a universal agent, automated cold calls/texts, recording infrastructure, new vendors and speculative revenue forecasting are deferred. Existing first-client agreement/payment and live delivery acceptance work continue as separate bounded obligations; this build must not displace a ready buyer or promised follow-up.

The first implementation task is Release 1: phone-only lead, logged call, linked callback, persistent readback. All subsequent work should earn its place by making that loop more useful.
