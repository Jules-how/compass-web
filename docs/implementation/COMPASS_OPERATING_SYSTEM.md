# Compass operating system implementation

Owner: Jules. Approved behaviour from the Compass interview, 10 September 2026.

## The problem and the result

Compass currently combines provider snapshots, manually selected outreach contacts,
campaign planning flags and prose handovers. Each can disagree without making the
disagreement visible. Work prepared by an agent can be invisible to the queue.
The remedy is a shared operating service over the existing records, with explicit
source evidence and a persistent reviewed order. A new dashboard alone does not
meet this requirement.

Opening Home must identify the next useful action, explain why, show nearby
alternatives and provide the context/materials needed to act. One morning review
sets the order. New interruptions propose a change to the affected portion; they
do not silently replace an accepted day. The same work supports the week and month.

## Confirmed scope and authority

- Business and personal goals, projects, tasks and commitments, with separate views.
- Provider updates, agent writeback, quick human capture, selected-source review
  and broad activity observations. Source coverage and freshness are explicit.
- Observations are evidence, not instructions. A visible brainstorm does not
  automatically become a commitment. Personal capture follows existing exclusions.
- Automatically reconcile observed facts and create explicit commitments/necessary
  follow-ups with stable identity, context and provenance. Inferred work is proposed.
- Prepare agreed work within existing authority and budget. Sending, campaign
  activation, material commercial decisions and accepted schedule changes retain
  their explicit approval boundaries. No arbitrary new sourcing budget.
- Completion evidence is recorded automatically; Jules confirms task completion.
- Existing numeric goals are preserved. Proposed weekly/monthly milestones are
  distinguished from committed targets and actual business results.

## Architecture and implementation order

### 1. Reconcile campaign truth

Persist provider status and analytics independently of campaign intent. Show draft,
active, paused, completed and error states, actual messages sent, people contacted,
remaining first contacts and observation time. A paused campaign retains its sent
history. A missing analytics row remains unknown. Never infer a send from campaign
membership or a scheduled time from daily capacity. Fetch bound campaign details
as well as analytics so empty campaigns remain visible. Integrate refresh with the
existing sync and Home; preserve the last good snapshot on failure.

### 2. Give existing work context and dependable writes

Extend existing task/project records with structured operating context: domain,
reason, intended outcome, next action, done condition, source, links, related goal,
campaign/contact, readiness, dependencies and completion evidence. Add revision
checked, idempotent writeback for agents and operator capture; duplicates return
their original receipt. Inferred work stays proposed. Use existing task identities
when enriching work. No replacement task database or fabricated call outcomes.

### 3. Produce and preserve the operating queue

Rank actual commitments/due work first, then ready work connected to agreed goals.
Blocked dependencies and future availability remain outside the actionable queue.
Show the recommendation, reasons, alternatives and supporting context. Preserve a
reviewed daily order; changes produce a reviewable interruption proposal. Operator
completion updates the original task. Agent evidence marks awaiting confirmation.

### 4. Connect day, week and month

Derive a dated daily proposal and week/month views from canonical tasks, projects
and goals. Retain accepted order. Include due dates, dependencies, estimates and
source coverage. Show unknown capacity when calendars/available hours are absent;
do not invent precise scheduling or reduce approved outcome targets. Allow personal
work in the same queue and filtered views. Persist review state and source revision.

### 5. Capture and prepare across sources

Provide one authenticated ingest contract for provider/agent/manual/document/activity
evidence with source IDs, observed times, confidence and a receipt. A raw capture is
retained until interpreted; only explicit commitments or reviewed proposals create
work. Register prepared batches with exact lead IDs and reviewable artifact links.
Use existing frozen outbound preparation where available and explicit external
preparation receipts for the current local batches. Task/context changes become
visible immediately. Existing source exclusions and missing connections stay visible.

### 6. Run the loop and verify the real workflow

Extend the existing hosted daily sync and use on-open freshness checks; inspect the
existing morning automation before changing a schedule. Background evidence ingest
must report a successful consumed watermark before claiming a source integrated.
Provider status polling works independently of the Mac; desktop activity can only
arrive while its recorder/bridge is running. No promise of off-device screen capture.
Preparation jobs expose queued/running/blocked/finished states and link outputs.
Source/worker failures surface as actionable coverage issues without false zeros.

## Acceptance scenarios

1. Sydney is paused and retains 40 sent; no suggested restart or blind resend.
2. Perth's 21 prepared review recipients and five previously loaded records remain
   distinct. Both appear with their exact sources; neither is called sent.
3. A repeated agent completion report produces one update/receipt, with materials
   attached to the existing task. A competing revision cannot erase another writer.
4. A captured explicit promise creates one contextual follow-up. Ambiguous timing
   remains unresolved. A screen observation alone cannot create an accepted promise.
5. Morning review persists the queue across reloads. A new urgent commitment is
   proposed ahead of the affected work and does not silently replace accepted order.
6. Blocked work cannot be next; unknown durations/capacity are labelled. Personal
   and business filters preserve the same underlying work identity.
7. Weekly/monthly views show linked work and unmet goals without manufacturing
   targets or treating completed tasks as revenue.
8. Provider/API failure preserves previous evidence with stale/error state. Empty
   campaigns, out-of-order reports, midnight/DST and repeat runs are tested.
9. Agent completion evidence leaves tasks open; operator confirmation closes the
   original record. Every write route enforces authentication and origin checks.
10. Signed-in Home verification at desktop and phone widths; production API readback,
    not merely a successful build. One subsequent unattended run remains separate
    acceptance evidence from the implementation rehearsal.

## Delivery status

Plan written. Implementation and live acceptance in progress. Update this section
with actual tests, release evidence, connected sources and remaining limitations.
