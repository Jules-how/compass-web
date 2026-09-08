# Folio Home reference

Jules selected Folio on 8 September 2026. This approves the direction, not the complete responsive reference or product rollout. This folder refines Home for the second approval gate. Prior concepts and production source are preserved.

## Design intent

Folio treats the daily brief as a working document on a lilac desk. A warm paper surface holds the next decision and useful actions. Waiting work sits in a pinned margin note, explicitly separated from actionable work. Source-labelled outbound figures and retained Inbox counts are supporting context.

Newsreader is reserved for narrative headings and a few numerical values; DM Sans handles navigation, records and controls. Plum denotes selection and the primary action. Semantic success, warning and error colours carry explicit text labels. The shared tokens are in `tokens.css`; `home.css` defines the responsive reference components.

At desktop, a 208px sidebar and two-column document/margin layout keep the brief and context together. At 768px, a bottom navigation replaces the rail while the two-column work surface remains. At 390px, brief and work come first, then the waiting note and source context. All row actions remain accessible. Bottom navigation has content clearance and safe-area padding. Text fields use 16px type on phones.

## Contract mapping

- Brief content and decisions retain `MorningWavePayload` and the existing proposed/accepted/dismissed states. Production calls `/api/home/wave` with `{ action: 'accept' | 'dismiss' }`; the prototype makes no network mutation. Dismissal retains previously accepted next campaigns. Acceptance does not activate a campaign.
- Home actions are projections of the existing brief, not invented persisted tasks. Sydney Hvac remains the saved draft with outstanding copy and opener review. Inventory and payment context are from the retained source brief.
- Waiting projects an existing blocked task. Roof Safety has no agreed follow-up date. The design introduces no status, date or urgency.
- Capture preserves the existing draft → reorganise → selection → task creation flow. The reference uses literal user-entered lines as local suggestions, explicitly labelled. Actual production retains the existing `BrainDumpReorganizeResult` and task API fields; this design does not replace classification with a line splitter. Unselected text stays in the note.
- Outbound's 162 sent and 1.3% reply rate are the frozen 8 September, 18:27 AEST snapshot. The later view did not show live campaigns. These values do not imply current sending status. Inbox 4/50/33 are retained source counts, not new unread replies.
- Navigation to Inbox/Outbound uses earlier Folio studies. Undrawn destinations link to existing Compass in a labelled new tab. Calendar preserves the campaign-calendar scope and explains how to reach its current Outbound view switcher; the existing implementation stores that choice locally and has no URL selector. A direct Calendar destination is part of the later production shell work.

## States and interactions

The review board provides populated, no brief/no waiting work, first loading, first load failure, refresh failure with retained data, accepted, dismissed, and failed decision-save scenarios. Retry returns to the frozen reference data, not a purported live refresh. Failed decision save keeps the brief proposed until retry.

Capture drafts survive closing and reopening the dialog in the browser tab. Empty capture gives a linked inline error. Task selection allows partial acceptance; unselected notes remain. A successful local task creation is shown in a persistent list; local task completion and reopening have explicit state labels. No local task is sent to Compass.

Native dialogs trap focus, close with Escape and restore the trigger or its replacement. Folder tabs support arrows, Home and End. Focus rings are visible. Loading and mutation results have announcements. Reduced motion removes the short dialog entrance and hover transitions. No hover-only primary action or drag-only operation is required.

## Verification

Browser inspection completed at 1440×1000, 768×1024 and 390×844. All 21 populated/data-state combinations fit their viewport without horizontal overflow; locally bundled fonts loaded in every combination. `responsive-checks.json` records the measurements. `screenshots/` includes those 21 viewport captures, three full-page captures, and the brief and navigation dialogs at all three widths.

Verified in the browser: dialog Tab/Shift+Tab cycling; Escape and trigger focus return; arrow-key folder selection; required capture validation; partial task selection; retention of unselected text; local task completion; failed brief save leaving the brief proposed; successful retry updating it to accepted; and clean browser console. The capture test used explicitly labelled temporary reference text and was cleared before the final screenshots.

Contrast checks: body text on paper 12.75:1; muted text on paper 5.68:1, desk 4.90:1 and rail 4.58:1; primary button text 7.28:1; semantic success, warning and error text all above 5.8:1. Reduced-motion handling is present in the reference CSS. Production still requires assistive-technology and real asynchronous API verification.

These are prototype checks, not a claim of deployed functionality or a complete production accessibility audit.

## Approval gate

Approve this Home reference at 390, 768 and 1440px before applying it to production components and extending to Inbox, Tasks, Outbound, sequence editor, Calendar, CRM, Clients, Planning, Installs and Settings. Final product acceptance still requires before/after comparisons, appropriate functional/accessibility checks, live deployment, signed-in browser verification, the final commit SHA and deployment URL.
