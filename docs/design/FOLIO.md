# Compass / Folio

Folio is the selected operations design direction: a lilac desk, warm paper documents, plum actions and a quiet editorial hierarchy. Business records determine counts, status, dates and next actions. Narrative headings orient the operator; they never imply invented performance.

## Reusable system

`src/app/folio.css` owns the namespaced production tokens. Folio Sans (DM Sans) is used for controls, records and body text. Folio Editorial (Newsreader) is reserved for page, document and account headings. Fonts are self-hosted in `public/fonts/folio`.

The desk is #eeecf3, paper #fffefa, navigation #e8e4ee, ink #352f40, secondary text #6c6279, and primary action #654c7d. Surfaces use a fine #d9d2e0 rule, 12px document corners and 7px control corners. Folio uses an 8px base spacing unit, generally 24–36px page/document insets and compact, divided records. Compatibility aliases keep retained product components consistent without changing their public props.

`FolioChrome` provides the persistent rail, breadcrumb, mobile navigation, related workspace links and keyboard-safe navigation dialog. `FolioPrimitives` provides document folders, loading/error states, notices and dialogs. Folder controls are native buttons with pressed state; they remain reachable with normal Tab navigation. Modals reuse the existing Radix boundary for focus containment, Escape dismissal and return focus.

## Workspace layout

- Home: one daily document, a waiting note in the margin, source-labelled metrics and actionable task reviews. Proposed briefs retain the existing accept/dismiss API. Blocked work appears in Waiting, never Ready to move. Captured thoughts use the existing persisted note and task-creation flow.
- Inbox: channel folders, an index of conversations and a paper reading pane. Retains triage, classification, snooze, task creation and destination links.
- Tasks: a list of real tasks grouped into ready, waiting and completed folders. The board, creation form and detail editor remain available. Status changes use the existing mutation path.
- Outbound: campaign folders, manuscript-style summaries and a compact supporting outlook. The board is an alternative view. Brief notes and the full action list expand on demand.
- Sequence editor: one selected email on the writing surface. Full writing tools open on demand; hidden steps retain their existing data. Empty optional slots can be added explicitly. Autosave and campaign contracts are unchanged.
- Calendar: existing campaign planner on larger screens; a date-ordered campaign agenda on phones. These are campaign dates, not appointments.
- CRM: a paper records surface and compact table hierarchy. Clients use account folders with last contact and recorded next actions. Planning retains the outcome map and record views; Installs retains delivery configuration and its existing queue. Settings retains the connection and account controls.

## Responsive and interaction rules

At desktop widths, use a 208px rail (186px below 1150px) and a 66px top bar. Below 900px use the compact header and bottom navigation. Below 650px stack Home's margin notes beneath the document, show the campaign agenda, collapse record grids and preserve readable input sizes. Verify at 390px, 768px and 1440px, including dialogs and the editor.

Use subtle colour transitions and short opacity/position entry motion. Honour reduced motion. Use visible focus outlines and descriptive labels on icon controls. Distinguish empty data from load failures and preserve the last loaded snapshot when refresh fails. Never mutate operational records merely to produce a screenshot.

## Delivery evidence

Before/after captures and signed-in verification observations are recorded separately. A build or commit alone is not evidence that the live interface matches this system.
