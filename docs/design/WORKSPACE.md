# Compass workspace design

Jules selected Linear as Compass's visual foundation on 10 September 2026 and authorised implementation. This replaces the former cream/orange editorial operator interface. The supplied Linear Projects and Kanban screenshots govern proportions and hierarchy; Notion is the writing reference, and Attio is the CRM and Reports reference.

## Owners

`src/app/folio.css` retains existing presentation classes and compatibility tokens. `src/app/workspace.css`, imported after retained page styles, owns shared shell, typography, control and surface sizing. Page-specific workspace styles extend this system. The `Folio` component prefix is compatibility naming, not a requirement for editorial styling.

`OperatorShell.tsx` owns page width and the persistent layout. `folio/FolioChrome.tsx` owns sidebar, mobile navigation and breadcrumbs. Existing keep-alive surfaces remain in `ConsoleHomeInboxKeepAlive.tsx`. Keep functional data owners and authentication unchanged when styling their consumers.

## Visual language

- One font: the existing self-hosted Geist Sans, exposed through `--workspace-font`. Body and controls use 14px; secondary labels use 12–13px; document writing uses 16px. Use weight and spacing for hierarchy, rather than oversized serif headings.
- Light-grey navigation, near-white surfaces, dark-grey text, subtle grey dividers and restrained violet-blue actions. Status colours retain their meanings. Real records determine all counts, dates and progress.
- Desktop sidebar 232px (208px on narrower desktop), 48px toolbar, 20–24px main insets. Compact pages carry their accessible heading without repeating a large visible heading underneath the breadcrumb.
- Default operational pages fill the available width. Tables, timelines and boards scroll within their working area. Explicit 3xl/4xl reading or form measures remain bounded. Never shrink the whole interface with CSS zoom or transforms.
- Controls are normally 34px tall, with 40px form/action targets on phones. Cards use an 8px radius and subtle outlines. Main workspaces do not nest ornamental cards merely to contain another toolbar.

## Navigation and screen families

Projects, Documents, Planning and Reports are first-class destinations. CRM, Outbound, Clients and Installs remain immediately available. Secondary operational routes stay under More workspaces; settings and sign-out remain accessible. Desktop sidebar collapse is optional and stored on the current browser. On tablet/phone, the navigation dialog and bottom navigation provide access to every destination.

Projects opens into a timeline for new preferences and supports real project overview/tasks/activity, date editing, search and alternative list/board views. Task boards use readable cards and columns that scroll horizontally before becoming narrow. Documents uses the existing revision-checked planning notes and preserves saved bodies, unsaved drafts and conflicts. CRM prioritises record identity and separates detailed workflows. Reports selects real-source dashboards; unavailable data never becomes an invented zero.

## Interaction and verification

Use existing Radix modal boundaries for focus containment, Escape and focus return. Every icon control has a name; record opening and status changes have keyboard alternatives. Keep filter scope, saving state and refresh failures visible. Preserve scroll access to long content, including the Planning timeline and editors. Respect reduced motion.

Verify at 1440×1000, 768×1024 and 390×844 with content extremes and loading/error/empty states. A successful build is not visual acceptance. Record what was tested in the release evidence. Do not mutate live business records for screenshots.

Plan: `design-plans/2026-09-10-linear-workspace.md`.
