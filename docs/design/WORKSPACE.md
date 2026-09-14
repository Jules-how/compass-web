# Compass workspace design

Jules' instruction on 14 September 2026 is to match Linear with a very slight orange accent. He opened his actual Linear workspace and asked to get the match right. That live light-theme reference supersedes the cream and orange site palette from 13 September. Use Linear as the common visual foundation across Compass, preserving the business workflows and document writing measures.

Reference inspected: `https://linear.app/switchflow1/team/SWI/all` and `https://linear.app/switchflow1/projects/all`, 14 September 2026. The official refresh rationale is `https://linear.app/now/behind-the-latest-design-refresh`. Measurements below come from the live rendered UI, not estimates from its marketing site.

## Owners

`src/app/folio.css` retains existing presentation classes and compatibility tokens. `src/app/workspace.css`, imported after retained page styles, owns shared shell, typography, control and surface sizing. Page-specific workspace styles extend this system. The `Folio` component prefix is compatibility naming, not a requirement for editorial styling.

`OperatorShell.tsx` owns page width and the persistent layout. `folio/FolioChrome.tsx` owns sidebar, mobile navigation and breadcrumbs. Existing keep-alive surfaces remain in `ConsoleHomeInboxKeepAlive.tsx`. Keep functional data owners and authentication unchanged when styling their consumers.

## Visual language

- Inter Variable is self-hosted in `public/fonts/inter`, with its SIL Open Font License. The console uses `--workspace-font`; public surfaces retain their existing typeface. Navigation and dense controls use 13px, secondary labels 12px, and document writing 16px. Navigation text is weight 500.
- Measured Linear colours: canvas `lch(97.94 0.5 282)`, sidebar `lch(94.44 0.5 282)`, main text `lch(9.794 0 282)`, navigation text `lch(37.776 1.25 282)`. Cards are white. The main workspace has a 12px radius, an 8px outer inset and a very light shadow. Status colours retain their meanings; they are not brand decoration.
- Orange `#b85a30` is limited to small emphasis: the Compass mark, selected-navigation dot, checkboxes and keyboard focus. Legacy `--folio-plum` and soft-accent tokens are neutral so retained panels do not turn orange. Primary controls are charcoal, secondary controls neutral.
- Desktop sidebar 244px (208px on narrower desktop), 28px navigation rows with 14px icons, a 44px location bar and a separate compact view toolbar. Dense boards/timelines run to the workspace edges with small insets. Compact pages retain their accessible heading without repeating a large visible heading under the location bar.
- Default operational pages fill the available width. Tables, timelines and boards scroll within their working area. Explicit 3xl/4xl reading or form measures remain bounded. Never shrink the whole interface with CSS zoom or transforms.
- Controls are normally 28–32px tall, with 40px form/action targets on phones. Cards use an 8px radius and subtle outlines. Task boards use 340px columns and 8px gaps. Main workspaces do not nest ornamental cards merely to contain another toolbar.

## Navigation and screen families

Projects, Documents, Planning and Reports are first-class destinations. CRM, Outbound, Clients and Installs remain immediately available. Secondary operational routes stay under More workspaces; settings and sign-out remain accessible. Desktop sidebar collapse is optional and stored on the current browser. On tablet/phone, the navigation dialog and bottom navigation provide access to every destination.

Projects opens into a timeline for new preferences and supports real project overview/tasks/activity, date editing, search and alternative list/board views. Task cards have a status icon beside the title, backed by the existing labelled native select and focus restoration after a move. Columns scroll horizontally before becoming narrow. Documents uses the existing revision-checked planning notes and preserves saved bodies, unsaved drafts and conflicts. CRM prioritises record identity and separates detailed workflows. Reports selects real-source dashboards; unavailable data never becomes an invented zero.

## Interaction and verification

Use existing Radix modal boundaries for focus containment, Escape and focus return. Every icon control has a name; record opening and status changes have keyboard alternatives. Keep filter scope, saving state and refresh failures visible. Preserve scroll access to long content, including the Planning timeline and editors. Respect reduced motion.

Verify at 1440×1000, 768×1024 and 390×844 with content extremes and loading/error/empty states. A successful build is not visual acceptance. Record what was tested in the release evidence. Do not mutate live business records for screenshots.

Plan: `design-plans/2026-09-10-linear-workspace.md`.
