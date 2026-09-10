# Workspace redesign verification

The redesign follows Jules' 10 September request and the [implementation plan](../../design-plans/2026-09-10-linear-workspace.md). The source baseline is `6de5ebb`; unrelated changes in the main local checkout were preserved in place.

## Delivered behavior

- Shared neutral shell, consistent sans-serif typography, wider operational surfaces, collapsible desktop navigation, and direct Projects, Documents and Reports destinations.
- Projects timeline with pinned project labels, search, zoom, Today, date editing, creation, board/list alternatives and project sections. Tasks has wider board columns and keyboard-accessible status changes.
- Documents uses the existing revision-checked notes with a library, block editing, blank lines, searchable slash commands, keyboard navigation, undo/redo, Markdown export and draft recovery. Inline bold/italic/link commands insert Markdown; this is not a complete Notion rich-text editor.
- CRM exposes useful default columns, search, filter context, configurable widths and an Overview/Outreach/Research inspector. Reports has three selectable built-in dashboards and browser-local favorites. It does not include an unrestricted report builder or historical metrics that have no source.

## Checks

`npm run verify`, `npm run lint` and the production build pass. Existing warnings remain in unrelated campaign/outbound components and Supabase's Edge import.

The focused project, document, planning, report and records-table run passes **59 tests**. A full-suite comparison used an isolated checkout of the exact baseline: baseline 545 tests, 520 pass, 25 fail; the first redesign run had the same 25 failures plus an obsolete table-width assertion. That assertion was replaced with a rendered-table test validating configured column widths, their summed minimum and the available-width layout; the focused rerun passes. The baseline failures were not hidden or modified to claim a green full suite.

Browser checks used the actual React components in a static harness with labelled fictional records and intercepted API responses. No development compiler or production-record mutations were used. Desktop 1440×1000, tablet 768×1024 and phone 390×844 layouts were inspected. Checks included project creation, date persistence through native keyboard input, task status transitions, document slash-command selection and autosave persistence, failed document/project saves retaining drafts, CRM record opening, dashboard navigation and persisted favorites, and unavailable report sources displaying unavailable values rather than zero.

The checks exposed and fixed background project refreshes resetting open edits, stale detail responses, cached detail reads after saves, failed project creation clearing its draft, timeline labels clipped to short date bars, and mobile navigation overlapping dialogs.

## Remaining scope

The named reference applications guide Compass's layout and interactions. They are not a promise of complete feature parity. Database schemas, permissions, campaign activation and external sending behavior are unchanged. Existing operational tasks stay open for Jules' confirmation.

## Concurrent release integration

Live verification found that the separate operating-system work had been deployed directly from local commits through `8394363` while GitHub main still pointed to the earlier baseline. The combined release merges those existing commits with UI release `39ede01`, preserving both histories and their implementations. The only overlapping source file was the root stylesheet import list, which retains both operating and workspace styles. Direct source comparisons confirm that the operating queue, outbound overview and their services are identical to the concurrent release, and the redesigned Projects, Documents and Reports remain identical to the UI release. The combined focused run passes **129 tests**, including the operating service, outbound overview, MCP, wave and UI regressions.
