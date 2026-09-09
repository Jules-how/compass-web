# Compass implementation plan

Written before product edits against `b546299c08b46871455dddf4fbe6729a707a2b71`. User authorised: audit, write plan, then execute. The audit and local evidence are in this directory. No production data writes, campaigns, messages, deployments or automatic archival are part of this plan.

## A. Shared navigation, forms and overlays

Owners: `OperatorShell.tsx`, `ConsoleNav.tsx`, `ConsoleHomeInboxKeepAlive.tsx`, `NavLinks.tsx`, `ui/sidebar.tsx`, `globals.css`, `InboxPanel.tsx`.

1. Correct Inbox native history calls, guard inactive route effects, retain URL driven selection. Prove tab changes, back/forward and leaving Inbox do not corrupt destination URLs. Make tabs keyboard accessible.
2. Derive sidebar badge from the existing shared cache subscription. Respect href query changes in console navigation.
3. Fix mobile menu dismissal and use the installed Radix dialog primitive for focus containment/Escape/return focus. Preserve desktop widths and approved chrome.
4. Allocate viewport height to mobile header plus remaining main area. Switch Inbox from list/detail to split view at `lg`, not `md`.
5. Use shared disabled button styling, readable section captions and visible custom-checkbox focus.
6. Introduce one small Radix-backed `ModalFrame` only because Home, Task and Client manual overlays all lack the same necessary focus behaviour. API should accept `open`, `onClose`, `label` or `labelledBy`, `children`, and existing overlay/content classes. Restore opener focus, handle body scroll and nested dialogs. No dependencies are installed.

## B. Task boards, Home and directories

Owners: `ui/kanban-board.tsx`, `TasksPanel.tsx`, `TaskDetailPanel.tsx`, `home/HomeDashboard.tsx`, `clients/ClientDetailModal.tsx`, `clients/ClientDirectory.tsx`, `clients/ClientDetailPanel.tsx`, `FunctionManager.tsx`.

1. Native task title buttons, two-line titles, keyboard/touch move selector using existing `onMove`; preserve href cards and nested links. Add meaningful metadata labels through optional properties so campaign counters can represent replies and contacts correctly.
2. Remove only the known `daily_setup:` marker from task previews; preserve stored notes and content. Add task status announcements. Use existing native validation for required title.
3. Home grid content sizes itself; bottom metric cards use balanced columns. Brain dump subtitle describes the user action; its modal and task/client modals use the shared accessible boundary.
4. Label searches; make client count accurate; label established demo rows. Represent zero-scope client progress as unscoped, not measured 0%.

## C. Outbound editor and calendar

Owners: `outbound/SequenceEditor.tsx`, `campaigns/CampaignCalendar.tsx`, `outbound/OfferWavesBoard.tsx`, `offers/TestCellsBoard.tsx`, new pure calendar-layout helper if necessary.

1. Responsive editor header: all tabs available at every width, explicit accessible campaign name and save announcements. Desktop tabs must not overlay actions.
2. Mobile access to existing Library/Levers/QA without duplicating editor state. Collapsible small-screen variable tray, retaining preview controls. No business copy or send settings change.
3. Layout overlapping calendar events side by side using calculated lanes, including partial overlap. Preserve actual dates and existing drag/drop. Test overlap, adjacency and non-overlap.
4. Campaign card counters get explicit Replies / Remaining / List size semantics; no attachment icon for contacts.
5. Compact input padding fixes clipped selects. Make selected city/vertical toggle state accessible and explain why no campaign cells need creation.

## D. Focused clarity and failure recovery

Owners: `planning/PlanningBoard.tsx`, `planning/OfferPlan.tsx`, `planning/ExperimentsDesk.tsx`, `delivery-dept/InstallKanban.tsx`, `PasswordLoginForm.tsx`.

1. Remove duplicated page padding and stretched header actions across planning family. Fix record singular/plural and readable goal summaries without changing goal values.
2. Retry Installs read-only and trace its store error. Repair a verified source defect if possible; do not fabricate an empty board or mask a failing dependency. Give the UI a readable unavailable message.
3. Distinguish login connectivity/service failure from invalid credentials while retaining generic authentication rejection.

## Validation and acceptance

Run targeted behavioural/pure tests, `npm run verify`, lint and the production build where the environment permits. Do not start `next dev`. Use a production build or a static fixture rendered from actual changed components for browser checks; fixtures must be labelled and not presented as live data. Recheck keyboard open/close/Tab/Escape and 390px, 768px and desktop layouts. Save after screenshots. Inspect the final diff for data/API scope creep.

Successful implementation requires accessible controls and readable layout plus passing checks. It does not by itself mean deployed. Record exact completed checks, remaining blockers and the disposition of audit items in `RESULTS.md`. Unproven analytics/data findings stay in the audit for follow-up rather than being guessed at.

## Execution refinements

The Installs investigation extended D(2) to `src/lib/delivery-dept/paths.mjs`, `next.config.ts` and a relocated-runtime asset test. The department source path named in the old deploy-copy comment does not exist in this workspace, so the present deploy owner was repaired directly. Explicit file tracing was necessary: after extracting a resolver function, Next's inferred trace omitted the JSON files; the final standalone output includes both. No live API/data writes or dependency changes were introduced.

Browser verification added focus return after keyboard board moves and Inbox back navigation, and route-aware portal dismissal. A lint finding moved CRM `aria-sort` from the sort button to its column header.
