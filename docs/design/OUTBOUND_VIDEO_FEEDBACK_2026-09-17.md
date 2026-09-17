# Outbound workspace: 17 September recording

## Source and scope

Implementation follows the supplied 13m46s recording and transcript. Times below are approximate visual alignment, not a forced audio alignment. Base: `0cfb777c68d490c204effbbde9082fd4ac8312e5`. The scope is `/sales/outbound?desk=workflow`, not a replacement of other Compass desks.

| Recording | Request | Implementation |
| --- | --- | --- |
| 00:45–02:30 | Alignment, disconnected list setup, inaccessible workflow selection | Unified setup panel, searchable accessible pickers, visible create/edit actions; workflow selection and creation work before a list exists. |
| 02:45; 11:45–13:46 | Write opens results instead of writing; repeated clicks; multiple signal variants | Write opens the editor; default message plus named, enabled, ordered variations; all/any evidence conditions; shared renderer drives preview and persisted template jobs. |
| 04:45–07:45 | City cards, ICP templates, multi-service businesses and real progress | City and reviewed-service cards; reusable saved-profile filter with explicit outcome selection; unique canonical companies; contacted and assessed coverage; add city in tab-local preferences. |
| 08:15–10:30 | Explain research, offer/profile/criteria, suggest editable cards, recover deletion, editable budget | Offer-snapshot-derived suggestions and saved-workflow bank; criterion and signal cards; undo/redo/revert; documented evidence requirements; native-validating editable numeric inputs. |
| 10:45–12:15 | List vs contacts vs verification, misleading readiness | Contextual five-step navigation, companies/people/mailbox explanations, current-input completed-company receipts, explicit unknown/held statuses, correction of ready + Not started presentation. |
| Throughout | Responsiveness | Query-only native-history navigation; reuse catalogue records instead of duplicate ID reads; count and company-page requests in parallel. Production latency has not been benchmarked. |

## Data meanings and boundaries

- City groups use recorded city names, not inferred metro boundaries. Missing cities remain visible as a coverage count; additional city cards are tab-local, not a new server-side market catalogue.
- A company may appear in several service cards. Counts are unique inside a card and must not be added across cards. Services require reviewed direct observations; names, campaigns and generated copy are not classification evidence. Existing boolean installation facts and additive `services`/`business_types` JSON observations are supported. There is no new bulk service-tagging UI.
- ICP match means likely or confirmed matches divided by **assessed** companies for the chosen saved workflow and current input revision. Unknown companies stay unknown. Selecting a profile defaults to all outcomes; use the adjacent outcome selector to narrow to matches/non-matches/unknowns.
- Contacted means a recorded outbound interaction on a uniquely linked contact. Planned, future and inbound events are excluded. Missing linked history is not evidence that nobody has contacted the business.
- Preparation counts are distinct companies with saved completed receipts for the selected list, workflow and current company input revision. They are not sending statistics or estimates.
- The market index uses authenticated operator reads with RLS, explicit pagination through an empty page and a bounded read limit. Any incomplete or failed read shows an error, never partial totals. The basic companies table can load separately from the market index. Large-ledger server aggregation remains a future performance improvement.
- Offer suggestions are deterministic extraction from the selected snapshot and saved workflow definitions, not a newly invented AI strategy or new researched evidence. Changing the offer does not replace edited cards. Saved versions remain immutable.
- The first enabled matching writing variation wins; otherwise default copy is used. Unsupported, absent or conflicting evidence cannot match. Follow-ups and slots are shared. AI mode cannot silently ignore deterministic variations. Applying templates remains an explicit frozen-scope action with retained previous draft history.
- Authentication, schema readiness gates, optimistic revisions, idempotent request retries, uncertain-save recovery, export limits and explicit run controls remain. No research, verification provider, send, Instantly activation or paid execution was invoked during this work.

## Verification

- `npm run verify`: deploy guards and TypeScript passed after new source files were staged.
- `node --test --test-concurrency=2 test/outbound-pipeline*.test.mjs test/outbound-workspace-repair.test.mjs test/outbound-video-feedback.test.mjs test/crm-research*.test.mjs`: 81 tests passed, including real PGlite migration/transaction regressions. New tests cover renderer routing and backwards compatibility, strict input validation, evidence conflicts, stale assessments, canonical counts, profiles, service classification, actual contact history, pagination contracts and operator-only read scope.
- Actual React component browser fixture: 24 checks passed for initial read-only rendering, profile counts, selecting a workflow before a list, default-open writing, variation editing/slot insertion/save, offer-derived workflow creation/save, criterion deletion/undo/redo, empty-budget validation, picker Escape and responsive layout at 1440/768/390 widths. No React runtime errors in these exercised paths. A mobile fieldset intrinsic-width overflow was found and corrected.
- Browser fixture uses synthetic accounts and mocked API/storage/navigation boundaries. It does **not** establish authenticated live-data end-to-end behavior, real browser reload persistence, Next router integration or production performance. Repository unit tests cover existing draft-buffer and request recovery contracts separately. Screenshots are labeled fixture, not production data.
- Local production build passed (Next.js 15.5.20); existing unrelated warnings remain. GitHub CI/deployment results must still be checked against the final branch commit. Preview access may stop at operator authentication; do not disable authentication to produce a screenshot.

## Release

Review the PR and test the authenticated preview with the actual lead ledger before production merge. No database migration or new external provider is required. Keep the source commit associated with the preview; never substitute an older deployment or remove login. The temporary artifact/bootstrap workflow is removed from the final diff.
