# Compass: premium operations product redesign

Current status: Jules selected Folio from round two on 8 September. The complete Home reference is in `folio-reference/` and awaits the responsive-reference approval gate. Production implementation and deployment follow that approval. The original three-direction exploration below is retained as design history; its Meridian recommendation has been superseded by the Folio selection.

## Evidence and diagnosis

Read the live signed-in Home, Inbox, Outbound and Sydney Hvac sequence editor on 8 September 2026. Baseline source SHA: `777aa2ddd836bca94ba8b4fa2caf667c82fe45fa`. Captured Home at 1440, 768 and 390px, Inbox and Outbound at 1440px, editor at 1440 and 390px. Prior audit provides secondary route coverage; it is not assumed to prove current runtime behaviour.

Relevant source: `HomeDashboard.tsx`, `home-data.ts`, `wave-morning.ts`, `InboxPanel.tsx`, `inbox-ui.ts`, `types.ts`, `OutboundDesk.tsx`, `SequenceEditor.tsx`, `outbound-copy.ts`, and current console route structure. Read the Compass brief and one campaign’s saved copy through the agent API. No lead ledger writes, campaign updates, sending, acceptance, or activation were performed.

The current Home shows “Await Roof Safety’s internal decision” as highest leverage even though its task is blocked. A useful operating product distinguishes actionable decisions from external waits. This is a presentation and selection policy change, not a new task status.

Inbox shows 87 “need you”, broken into Agents 4, Instantly 50, Leads 33. Home’s separate Instantly snapshot shows 0 waiting. Those are different scopes and potentially different freshness, not necessarily a counting bug. The redesign should label queue counts, source freshness and unread counts separately. Do not relabel every old item as a fresh reply.

The later Outbound Waves screen shows no live campaigns, while the Home/agent snapshot retains 162 sent today and 1.3% reply rate. Do not flatten these into a fictional current state. Preserve useful snapshots with source and timestamp; resolve freshness before acting on sending status.

The existing editor gives the source library roughly half the working surface, while optional empty slots lengthen the email. The proposed editor gives the letter a stable reading measure, makes optional blocks progressive disclosure, and opens the library as a substantial comparison surface when needed. Preserve source/yours provenance, insertion and drag alternatives. Do not squeeze the actual library into a tiny inspector.

The existing shell has 17 primary destinations, mixing tools, departments and daily work. The proposed information architecture prioritises daily decisions, then growth and delivery; all existing capabilities remain reachable. Calendar is currently a view of Outbound’s campaign planner, not a general personal calendar. Promote navigation access while retaining that scope.

## Three directions

### 01 Meridian — recommended

A composed operating cockpit: Manrope, IBM Plex Mono labels; navy `#182e3b`, limestone `#edece6`, paper `#fbfbf7`, copper `#9f4326`. Fixed 210px desktop navigation; 8px spacing basis, 32px page inset, 22–28px modules. Flat framed panels with 8px radii; 4px control corners. No floating-card shadow field. Copper means the primary decision or selected context, not every label.

Reference: [Vitsœ 606](https://www.vitsoe.com/gb/606). Borrow modular proportion, strong vertical organisation and restraint; do not imitate a furniture catalogue. Official site screenshot accompanies the original mood study.

Home: one dominant decision, ordered work, separate Waiting column, compact real snapshot data. Inbox: source queue plus a decision case file. Outbound: a preparation register rather than empty draggable columns. Sequence editor: step navigator, letter, preparation/writing context. Mobile prioritises the decision and work queue; desktop context follows on scroll. Tablet removes the permanent shell and uses bottom navigation.

Strength: best fit for an operator moving between decisions, structured data, writing and delivery. Risk: overuse of panels would return to generic dashboard design. Enforce one dominant decision, no empty ornamental cards and one level of nested framing.

### 02 Edition

Editorial workbench: Newsreader titles and DM Sans controls; ink `#2c332b`, parchment `#f4f0e5`, linen `#ccc8b8`, rust `#854733`. Horizontal masthead and index, no sidebar. 40px desktop margins, roughly 60-character reading measure, 8px rhythm. Rules and typography define sections; few card enclosures. Serif is for narrative hierarchy, never tiny table controls.

Reference: [Monocle magazine archive](https://monocle.com/magazine/issues/). The official page was accessible through web research but browser capture met a security check. The board includes a clearly labelled original typography mood study and the reference link; it does not pretend to include an official screenshot.

Home: an authored daily lead story and work index with marginal context. Inbox: correspondence index and case note. Outbound: a ruled ledger and editorial note. Sequence editor: manuscript with a preparation margin; step choices move above the letter. This is a different navigation and reading model, not a light colour theme of Meridian.

Strength: strongest identity for considered planning, briefing and copy craft. Risk: CRM and scheduling need deliberate dense layouts to avoid treating every record like an article. Large editorial titles must not inflate every row.

### 03 Signal

Dispatch console: Space Grotesk plus IBM Plex Mono; carbon `#111714`, forest `#1b231e`, chalk `#e4eadd`, sulphur `#d6ec70`. 94px labelled rail, square cells and state bands. 4px rhythm, 28px canvas, 16px module gaps. High-contrast selected work; no neon glow, decorative charts or terminal theatre.

Reference: [Teenage Engineering Field System](https://teenage.engineering/products/field-system). Borrow functional separation and instrument labelling. The specific dark palette is an original design choice, not a claim about the reference page.

Home: numbered decision queue and status register. Inbox: dispatch rows and an adjacent inspector. Outbound: compact preparation register. Sequence editor: light source writing surface beside a dark rendered output panel. Mobile becomes a single-column action list; retained labels avoid icon-only navigation.

Strength: fast scanning and explicit states. Risk: too much uppercase or dark density makes routine work feel unnecessarily urgent; use sentence case inside records and a light writing surface.

## Recommendation and approval gates

Recommend Meridian as one coherent system. It handles the broadest set of real Compass work without forcing it into a document application or a command console.

Gate 1: Jules selects Meridian, Edition or Signal, with any desired changes. Nothing in the three concept packages implies approval.

Gate 2: refine one complete Home reference in the chosen direction, including populated, quiet/empty, first loading, refresh failure, retry, accepted/dismissed feedback, capture flow, navigation open/closed, keyboard focus and responsive layouts at 390×844, 768×1024 and 1440×1000. Obtain explicit approval of that reference before scaling production changes.

The current board already provides responsive Home candidates and basic state/interaction examples to make the decision concrete. Its generic state selector is a design demonstration, not a full state-specific production implementation or accessibility certification.

## Real data and contracts

| Surface | Existing contract | Presentation change and safeguard |
|---|---|---|
| Home | `HomePayload`, `MorningWavePayload`, `CompassTask` | Derive Do next/Waiting from task state and the daily brief; keep accept/dismiss and real deep links. No invented urgency, goals, time savings or progress. |
| Inbox | `InboxPayload.channels`, `InboxItem`, triage/lifecycle | Preserve item identity, sourceId, channel, related identities, source links, suggestions, undo and classification. Separate item counts from unread and actionable counts. |
| Outbound | `CompassCampaign`, wave lanes and actions | Preserve offers, city/vertical tags, campaign IDs, platform binding and planning fields. A preparation table can project the same records without changing the persistence model. |
| Editor | `OutboundSequence.steps[].slots`, `subject`, `delay_days` | Keep slot identity, saved sequence, provenance, analytics, experiment and archive. Preserve signature and opt-out, no invented merge values. Follow-up in the real saved example is 3 days. |
| Tasks | `CompassTask` | Keep statuses, priority, due, notes, links, parent, execution evidence and mutation APIs. Waiting is a view of blocked work, not a new business status. |
| Calendar | `CampaignPlanner`, `CampaignCalendar`, dates and go-lives | Same planner; accessible agenda on mobile; grid at larger widths. Do not invent availability, appointments or personal schedule data. |
| CRM | `LeadContact`, filters and ledger API | Retain lead coverage and evidence. Desktop table and inspector; mobile records and drill-in. No direct Supabase lead CRUD. |
| Clients | `CompassClient`, comms, work, onboarding, agreements, invoices, channels | Directory → durable client workspace, with existing relationships and actions. No invented revenue or client health. |
| Planning | Goals/notes, projects, functions and linked work | Writing surface plus linked task/project index; preserve current records. |
| Installs | Existing installation graph/queue and dependencies | Stage queue + proof detail. Distinguish fetch failure from no installs. Existing audit found read-side persistence, so inspect implementation before invoking broad live flows. |
| Settings | Existing account integrations and workspace preferences | Purpose-based groups, real connection states, specific failure/retry. Keep secrets out of UI and screenshots. |

Source snapshot used in concepts: `brief.instantly.emailsSentToday=162`, `replyRate=1.3`, snapshot at `2026-09-08T08:27:52Z` = 18:27 AEST. Inbox channel counts 4/50/33 are from the signed-in screen. Sydney Hvac campaign `campaign-5fd67add-23d4-403b-b09b-78cf9d37cd53` updated `2026-09-08T09:32:36Z`, `copy_status=draft`, no Instantly binding, `copy_confirmed_at=null`, `opener_reviewed_at=null`, initial subject “ducted installation enquiries”, follow-up delay 3. Campaign text is copied from that record. No fictitious contacts, copy proof or statistics.

Concept Home work rows are a presentation of the current brief, not a claim that three new task rows exist. The Roof Safety item is a verified blocked task. No tasks were created. All prototype mutation feedback is explicitly simulated. Non-drawn destinations show the proposed surface plan rather than an invented populated screen.

## Navigation contract for implementation

- Today: Home, Inbox, Tasks, Calendar.
- Growth: Outbound and CRM. Outbound retains Waves/Campaigns, Calendar/Timeline, Pathways, craft/library, Offers, offer economics, experiments and sales overview/pipeline access. Existing URLs continue to work.
- Delivery: Clients and Installs. Clients retains finances, retention, onboarding, channel work, agreements and invoices through clear subnavigation and existing routes.
- Workspace: Planning and Settings. Planning retains Goals/notes, Projects and Functions. No capability is removed merely because it no longer receives top-level navigation.
- On mobile: Home, Inbox, Outbound and More. More exposes the complete grouped tree. Editor navigation stays directly addressable and the active campaign survives view changes.

## Production system after approval

Extract tokens for surface, text, borders, semantic states, focus, spacing, type, radii and motion. Implement reusable `AppShell`, `PageHeader`, `SectionHeader`, `ActionRow`, `StatusLabel`, `SourceStamp`, `DataState`, `RecordList`, `RecordInspector`, `Confirm/ReviewDialog`, `SequenceWorkspace` and mobile navigation in the app’s actual component system. These are proposed responsibilities, not required file names or an instruction to add redundant components.

Use real count/status selectors and existing cache ownership. Do not move business logic into visual primitives. Consolidate duplicate state presenters and controls only where the new system requires it. Preserve dirty editor state, autosave and keep-alive navigation intentionally.

First ship the approved Home reference and shell through a scoped production implementation. Compare it to approved screenshots before extending. Then implement Inbox/Tasks, Outbound/editor/Calendar/CRM, and Clients/Planning/Installs/Settings. Check route regressions and retained capabilities after each group.

## Acceptance and deployment

For each core screen: populated state if available, honest empty state, initial load, refresh failure and mutation feedback. Record unavailable populated states as unavailable rather than adding fake fixtures to production.

Functional checks: brief review, capture selection and task creation, task completion/move, Inbox source switching and linked context, classification/undo, sequence slot editing/autosave/history, exact rendered merge output with a real authorised test record, calendar collisions/navigation, CRM filter/table/record detail, client detail, planning edits, installation retrieval/state, settings connection displays. No customer messages, campaign activation, account changes or live test records solely to make a screenshot look populated.

Keyboard: focus order, visible focus, modal trap/return/Escape, source tabs, list/detail return focus, menu, editable fields, non-drag alternatives, screen-reader labels and live mutation messages. Check colour contrast and reduced-motion behaviour. Use short 120–180ms transitions for state changes, never animated decorative telemetry.

Responsive acceptance: 390×844, 768×1024, 1440×1000; no hidden core actions, page-level horizontal clipping, overlapping rows or content under fixed navigation. Screenshots must be compared with the approved reference, not just asserted from a build.

Required repository checks: `npm run verify` before pushing; appropriate lint, production build and meaningful functional tests. Never start a local application compiler unless Jules asks; these static concepts use a file server only.

Deployment is authorised as part of the requested eventual outcome, after design approvals and verification. Final acceptance requires successful live deployment, signed-in browser inspection of redesigned core routes, screenshot comparison at target widths, final SHA, deployment URL, concise visible-change list and any material limitations. A commit/build/preview alone cannot complete the request.

## Artefacts

- `index.html`: direction board, visual references, comparison rationale and interactive width/screen/state selector.
- `concept.html`, `concept.css`, `concept.js`: 12 high-fidelity concept screens, isolated from production source.
- `screenshots/`: before evidence and concept captures; concept images are never labelled as deployed after screenshots.
- `assets/`: locally bundled fonts for consistent review without an external font request.

Open `index.html` using the local static preview at `http://127.0.0.1:8767/`. It has no backend access. Production source has not changed; unrelated existing `design-plans/2026-09-08-compass-audit/` work has been preserved.
