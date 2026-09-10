# Compass usability overhaul — execution specification

Date: 10 September 2026. Status: implemented in 34c517a; release verification is recorded in COMPASS_USABILITY_RELEASE_2026-09-10.md.
Executor revised by Jules: gpt-6-astra with low reasoning effort for subagents. Repository: /Users/Jules/switchflow-os/compass-web. Production: https://compass-web-eosin.vercel.app.

## Outcome and scope

Make Home, Inbox, Tasks, Outbound, CRM, Installs and Pathfinder readable, useful and fast. This replaces neither the product identity nor the existing outbound rhythm. Preserve capture, dated callbacks, Today/Upcoming, provider reconciliation and weekly learning. Preserve records and existing mutation contracts. Do not send outreach, activate campaigns, change business schedules, mark real work complete or fabricate milestones. Do not launch a local development compiler. Use existing tests/build and hosted preview for verification.

## Delivery order

1. Record baseline navigation timings and screenshots; inspect current AGENTS.md and working tree. Implement shared width, shared kanban and navigation/cache fixes.
2. Implement Outbound composition, CRM operating view, Installs stage workspace and Pathfinder timeline workspace.
3. Implement Inbox source-time correctness and actionable Home/Outbound guidance, including migration only if required by verified schema.
4. Run focused regression tests, production build, hosted visual and interaction checks; correct failures. Deploy to existing Vercel project, verify production alias and report measured results plus any limitations.

Keep changes in reviewable commits by these groups. Do not stop at a plan, CSS-only pass or unverified deployment. Shared CSS must use named component classes, not selectors tied to Tailwind class strings. No new UI framework is needed.

## 1. Shared layout and task board

Files: src/components/OperatorShell.tsx, src/app/folio.css, src/components/ui/kanban-board.tsx, src/components/TasksPanel.tsx.

Verified: .folio-page max-width:1320px overrides the full-width shell. Shared kanban CSS forces peach fill and 24px serif headings; viewport-based four-column layout shrinks cards inside the Outbound sidebar layout.

- Add data-width to shell main. Full workspaces use max-width:none and padding 24px clamp(20px,2vw,40px) 32px; mobile <=650px uses16px side padding. Preserve deliberate narrow document/editor surfaces.
- Use existing DM Sans for operational headings and content; retain editorial page titles. Body14px minimum for primary information; muted text must remain legible.
- Kanban: horizontal grid, columns minmax(290px,1fr),16px gaps, overflow contained inside labelled board. Mobile columns min(86vw,340px). Neutral column fill #f1efec, border #e8e6e3,12px radius and padding. White cards,16px padding and gap.
- Headers use a common approximately96px allocation, grid-aligned dot/title/count/add. Heading15/20 semibold, description12/18. Cards title15/21 ink, description13/20 up to3 lines, metadata12px. Full context remains accessible in detail.
- Keep keyboard status control visible: divided footer with Status label and full-width36px select. Preserve drag/drop, focus restoration and mutation failures. Orange denotes meaningful selection/action, not every card title/background.
- Tasks List alone shows Ready/Waiting/Completed folders; Board uses its actual status lanes. Remove the redundant instruction block. Do not hide or complete old real tasks. Any QA fixture cleanup must use explicit known identity and existing authorised API, never text matching.

## 2. Outbound

Files: src/components/outbound/OfferWavesBoard.tsx, WaveCampaignCard.tsx, OutboundDesk.tsx, src/app/folio.css, src/app/api/outbound/wave-desk/route.ts.

- Board uses full available width. Move Outlook below it as a full-width summary/action section. Folder mode may use minmax(0,1fr) 360px with24px gap only at viewport>=1500px; narrower views put Outlook below. Remove forced260px sidebar override.
- Align view controls and folder controls in one toolbar. Keep one Add campaign action.
- Folder cards:18px sans title,14/21 description, consistent metrics row/footer. Status select minimum190px desktop, full width mobile; no clipped names.
- Outlook: three equal metric cells on wide layouts, stacked mobile. Values28px tabular sans, labels14px and definitions12px. Verify units in source before naming them. Use explicit labels such as Campaigns sending and Leads eligible for recontact. Do not call a lead count an email count. Display unknown/error distinctly from zero.
- Actions: broad rows, title14px semibold, details13/20, dated source context and aligned action. Separate metric summary from work requiring attention; reduce decorative pills.
- Use common brief freshness derivation with Home. Never promote briefs[0].recommendation directly without checking freshness. Historical advice belongs in dated expandable history. Existing actions retain state and dates; do not auto-complete them.

## 3. CRM operating view

Files: src/lib/lead-columns.ts, src/components/ui/records-table.tsx, LeadColumnPicker.tsx, LeadTable.tsx, LeadsPanel.tsx, src/app/globals.css, folio.css.

Verified: CRM forces first name/last name/company, and categories auto-expand up to900px, pushing contact routes out of view.

- Make Company/identity primary, with a truthful fallback for person-only records. Default visible attributes: Company, Location, Status, Phone, Email, Last interaction; use only actual available fields and clearly label what timestamps mean.
- Remove category auto-measure/expansion. Optional Categories shows two tags and accessible +N more. Research/opener/raw fields remain available through Columns; preserve campaign research preset.
- Rows56–64px, text14px, neutral sticky header and sticky identity column. Set stable widths that allow company/status/contact route at1440px without horizontal scroll. Remaining optional columns can scroll in the table.
- Toolbar: view/search/actions; second row common status filters. Less common filters in existing Filters panel. Preserve export, selection, bulk operations, undo, archive/restore, pagination and record detail.
- Version the Operating view preference. Retain existing custom configuration as a selectable legacy/custom view rather than overwriting it irreversibly. Changing defaults alone will not fix saved layouts.
- Phone remains selectable and usable for phone-only contacts.

Reference patterns: configurable visible attributes and record detail rather than a tag wall, as documented by [Attio](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views) and [HubSpot](https://knowledge.hubspot.com/records/customize-index-page-columns?service=website_design). Preserve Compass styling.

## 4. Installs

Files: src/components/delivery-dept/InstallSopGraph.tsx, InstallKanban.tsx and scoped styles.

- Replace clipped horizontal min-w-max workflow strip with numbered vertical stage navigation,280px beside minmax(0,1fr) detail workspace.
- Put template/current-install scope and install selector in header. State scope once, clearly. Each stage shows name, status and owner.
- Selected stage contains purpose, owner/dependencies, checklist and evidence in broad readable columns. Persistent visible action bar shows Save and saved/unsaved/error state.
- Retain moveNode, moveAdjacent, addNode, removeNode, changeStatus, changeBlocker, savePlan, dependency enforcement and template/install distinction. Vertical reorder retains Earlier/Later keyboard alternative.
- Mobile uses stage selector above detail, no clipped flow. Verify dirty-state behavior when changing selection/scope; prevent silent loss.

## 5. Pathfinder

Files: src/components/pathfinder/PathfinderBoard.tsx, PathfinderTimeline.tsx, PathfinderMap.tsx, src/app/planning.css.

- Timeline is default primary workspace, beginning directly under compact toolbar. Map is explicit secondary view, lazy-mounted only when selected.
- Replace The road ahead label with Timeline. Remove200px row cap and10px labels. Use52–64px rows, approximately300px label area,14px text, readable date/status, viewport-aware primary height around420px or more when space permits.
- Goal detail uses neutral340–380px side panel when space permits, below on smaller screens. Avoid duplicate giant goal summaries.
- Preserve Month/Quarter/All dates, navigation, goal filtering, onOpen/onAdd, undated items and saved map positions. One visualization at a time, no empty map above timeline.
- Honest empty state when no milestones/actions are connected, with existing Add/connect actions. Never invent progress to fill space.

## 6. Navigation and loading

Files: src/components/ConsoleNav.tsx, ConsoleHomeInboxKeepAlive.tsx, NavLinks.tsx, src/lib/use-cached-json.ts (verify actual path), OutboundDesk.tsx, CampaignPlanner component, src/app/planning/page.tsx, src/app/api/outbound/wave-desk/route.ts.

- Add Planning and /sales/outbound/rhythm to explicit keep-alive keys and lazy panes. Extract Planning URL view/goal switch to client desk preserving deep links and Back/Forward.
- Share deduplicated destination import loaders between dynamic components and hover/focus/click preloading. Add Pathfinder data prefetch. Do not eagerly mount all desks.
- Retain visited Outbound tabs hidden+inert. Calendar/Timeline view must be controlled, not initialView only. Preserve filters, selection, edits and scroll.
- Start independent wave-desk local reads concurrently. Local work must not await provider analytics. Reuse separately fetched provider result in Waves; current process cache cannot guarantee dedupe across Vercel workers.
- Add active-pane context or enabled option to cache refresh; hidden panes must not poll every30seconds. Refresh stale active content on re-entry without blanking it. Preserve mutation invalidation.
- Derive loading from current query key cache/request state. Prevent previous unrelated data appearing under a new key. Keep stale same-key data with refresh/error indicator.
- Preserve existing optimistic navigation and cache dedupe; extend rather than rebuild.

## 7. Useful Inbox and Home

Files: src/app/api/inbox/route.ts, src/lib/inbox-ui.ts, inbox-triage.ts, src/components/InboxPanel.tsx, src/app/api/inbox/triage/route.ts, src/app/api/inbox/suggest/route.ts, src/lib/instantly-leads-sync.ts, instantly-webhook.ts, relevant lead type/column definitions and provider-event migration; Home brief component and src/lib/wave-morning-server.ts (verify exact path).

Verified: provider sync updated_at is displayed as inbound time; all blocked tasks count as attention; old website leads persist; source errors can degrade to false unread totals; auto-generated suggestions run on every selection; old brief modal merely repeats a stale warning.

- Default Inbox is Current attention, with visible Earlier/unverified, Snoozed and Done access. Current recent boundary is14days based on genuine inbound event time, clearly labelled. Age never marks work handled. Overdue explicit commitments remain in Tasks/Today regardless of age.
- Store/use genuine last inbound timestamp. Provider timestamp_last_reply and actual webhook reply event are evidence; sync updated_at is not. Add last_inbound_at if schema lacks an equivalent. Update atomic event RPC and pull reconciliation monotonically. Do not backfill fabricated dates from sync time. Existing unknown timestamps go Earlier/unverified.
- Done reopens only on a genuine later inbound event, not metadata sync. Snooze expiry works independently. Distinguish positive reply, negative reply and automated/OOO; do not label all as sales opportunities.
- Agent attention requires explicit structured human decision/input, not every blocked task. External waits remain accessible in Tasks/Waiting. If source lacks an explicit request field, add a clear optional typed field/default and preserve legacy items in history; do not classify through fragile title keywords.
- Show received time separately from last checked; real message excerpt when available, otherwise label the limitation. Link to exact source/contact, not a broad CRM status filter. Follow-up scheduling reuses existing rhythm lead/action path; do not create duplicate unlinked tasks.
- Remove automatic AI calls on row selection. Use deterministic next action and explicit optional assistance.
- Counts describe current scope and source coverage. Fetch failures or capped50-row sources must show partial/unavailable coverage, never confident total or zero. Implement paging for history and enough current retrieval to compute honest counts; do not simply raise an unbounded limit.
- Remove duplicate needs-you carousel if current list already serves that function. Desktop master/detail with readable list widths; mobile list then detail with Back.
- Home shows factual current priorities (due callbacks, confirmed replies, unscheduled relevant follow-ups) with direct actions and source freshness. If generated review is stale, show dated history unobtrusively; opening Today's brief must provide useful current facts instead of only a warning. Reuse rhythm/query truth; do not create new recommendations presented as verified decisions.

## Acceptance and evidence

Visual: hosted authenticated screenshots at1920,1440,1024 and390px for Tasks, both Outbound modes, CRM, Installs and Pathfinder; Home/Inbox desktop/mobile. No page-level overflow; intentional board/table overflow contained. Headers/first cards align; no peach board fills; controls and meaningful text readable at100% zoom. All stages discoverable; timeline visible in upper half of900px-tall screen.

Functional focused tests: keyboard status move/focus, failure rollback; CRM custom preferences/phone-only/export/picker; install dependency/save/dirty errors; timeline open/add/undated/map state; inbox old sync versus new reply, Done reopen, snooze expiry, missing timestamp, partial fetch, external wait; current/stale brief rendering; query-key race/error/loading and hidden-pane refresh.

Performance: authenticated same-device baseline and after. Separate cold skeleton paint, cold usable content and warmed content paint. Loop Home/Inbox/Tasks/Outbound/CRM/Installs/Planning/Rhythm10times after first visits. Target warm content paint<150ms without blocking spinner. Record actual median/p95 and methodology; do not claim unmeasured improvement. Test rapid clicks, Back/Forward, deep links and Outbound inner-tab state. No hidden polling or repeated fresh-cache mount requests.

Run repository-required checks and production build once after focused checks pass; broaden only for failures or changed scope. No live business-record mutations for cosmetic QA. Prefer fixtures in tests; any hosted fixture must be explicitly identified and cleaned via allowed API.

## Release

Check concurrent changes before each commit. Deploy preview, inspect actual UI and interactions, then production using existing Vercel project. Verify alias serves the new deployment and key authenticated flows. If schema is required, use an additive migration first, retain compatibility and never destructive cleanup. Rollback UI via previous deployment; additive timestamp field may remain. Deliver commit/deployment links, screenshots, measured performance, test results and explicit remaining limitations. Append checked results and next action to the current Compass handover with a freshly read revision, preserving other writers.
