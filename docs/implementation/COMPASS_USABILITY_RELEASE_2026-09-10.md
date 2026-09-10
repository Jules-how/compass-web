# Compass usability release — 10 September 2026

Implementation commit: 34c517a, pushed to main. Execution used three gpt-6-astra subagents with low reasoning effort, as Jules requested, plus parent integration/review.

Implemented: full-width operational screens; neutral aligned Tasks/Outbound boards; readable Outbound Outlook and lead-count labels; CRM Operating view with retained legacy custom columns; vertical Installs stage workspace and retained drafts; primary Pathfinder Timeline with optional lazy Map; kept-alive Planning/Rhythm and Outbound tabs; active-pane polling and code preloading; current/earlier/snoozed/done Inbox; real inbound timestamp evidence, source coverage and pagination; useful current Home brief links.

Inbox uses the existing outreach-touch ledger. Live inspection found that the older tracked migration 0033_inbox_triage.sql had never been applied to production. It was applied through the connected Supabase migration API to the independently verified production project; the lifecycle columns, triage storage and operator policies are now present. The authenticated Inbox successfully loaded after the repair. Genuine provider reply timestamps are stored separately from metadata sync; undated historical records remain available as unverified. Reply-sync observations are not counted as verified human replies in weekly metrics. Agent decisions require execution_contract.attention.kind=operator_decision; ordinary external waits remain in Tasks and earlier Inbox history. This release does not create business goals or next actions to fill empty screens.

## Verification

- Deploy guards, TypeScript and local production build passed.
- 12 focused inbox/rhythm/cache tests passed, seven inbox/webhook checks passed, 17 workflow checks passed, and 25 Tasks/wave/publication checks passed. Some groups overlap.
- Full current run: 539 tests, 512 pass, 27 fail before updating three obsolete source-shape assertions. Clean HEAD e81e1f6: 529 tests, 504 pass, 25 fail; one baseline failure was caused by an isolated-worktree sibling-fixture path and passed with the same fixture available. There are 24 comparable pre-existing failures. All three new assertion failures were corrected; focused rerun 16 pass and one pre-existing failure. The full suite was not rerun after these assertion fixes. Do not describe the whole suite as green.
- Local logs: /tmp/compass-current-tests.log, /tmp/compass-clean-head-tests.log, /tmp/compass-updated-assertions.log, /tmp/compass-usability-build-final.log.
- Vercel preview built successfully. Browser preview inspection was blocked by Vercel SSO signed into a different account; protection settings were not changed. Production visual verification follows below.

## Production verification

Production alias: https://compass-web-eosin.vercel.app. First verified deployment: https://compass-3d8ue8aib-jules-4233s-projects.vercel.app.

Observed directly in the authenticated production UI: Home snapshot shows 40 sent; brief links to current Inbox and Today & follow-ups; Inbox loads 25 recent replies plus Earlier/unverified history, with provider checked time and genuine reply date. Opening a reply shows contact context, original-message links and a contact-specific follow-up route. Installs switches between the vertical stage navigation and corresponding detail. Tasks uses neutral columns and readable cards. No campaign was activated and no messages were sent.

A provider sync completed successfully: 197 existing reply-status contacts refreshed, zero inserted. This does not imply 197 new replies; genuine provider event timestamps determine freshness.

Live review prompted a second polish pass: sparse Pathfinder timeline height and sidebar breakpoint, constrained CRM column widths, neutral task title inheritance, removed empty task header space, corrected Outlook/campaign order, and unique campaign board membership with verified sending state overriding a local preparation lane. Six focused final regressions passed; deploy guards, TypeScript and production build passed again.

Final polish commit: 27f19b7, pushed to main. Final production deployment https://compass-cq1j1960e-jules-4233s-projects.vercel.app is READY and aliased to https://compass-web-eosin.vercel.app. The existing Compass continuation handover was updated using a fresh revision and returned revision 6. Confirmed from the production alias after reload: Pathfinder's sparse timeline occupies content height with goal context alongside at 1440px; CRM shows Company, Location, Status, Phone, Email and Last outbound without the old category wall; Outbound board columns are neutral and aligned, and Folder view has a 360px Outlook sidebar at 1920px. Inbox detail and triage controls remain usable at 390px. Temporary browser viewport override was reset after testing.

Repeated workspace navigation was exercised with retained screens and local view state. Code preloading, retained panels and inactive polling guards are implemented and focused tests passed. The browser automation read-only evaluation scope did not expose User Timing entries, so no clean click-to-paint or data-ready benchmark is claimed. Automation round-trip timings include tool overhead and are not used as app latency evidence. First visits can still wait for authenticated data.
