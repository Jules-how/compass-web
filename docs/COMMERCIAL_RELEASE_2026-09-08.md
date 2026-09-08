# Commercial workflow release — 8 September 2026

## Delivered

- Current offer: installation-booking. Original Booked jobs terms, associated copy and relevant source files preserved in archives/offer-transition-2026-09-08 and removed from active offer planning.
- Public Switchflow website aligned with installation enquiry-to-quote-appointment management. Existing design retained.
- Compass client Agreement & payment tab: explicit terms review, immutable signing document, private link, dated acceptance, print/save PDF and independent initial-payment status.
- Verified supplier details: Julian Howard trading as Switchflow, ABN 70 833 262 837; Jules confirmed not GST registered. AUD 2,500 monthly default; setup/cancellation require review.
- Bank/Wise instructions and manual cleared-receipt confirmation. Stripe subscription checkout and signed payment-notification handling implemented, disabled while unconfigured.
- Signing creates one per-client delivery project with four tasks. Three delivery tasks remain blocked until payment/access/scope are confirmed. No delivery agents provisioned automatically.
- Future delivery projects created in Compass; earlier delivery tools moved out of the default client view.
- Manual expense records with vendor, actual AUD amount/date, category, source account, transaction reference and optional receipt link. Duplicate-request protection. QBO removed from new agreement flow and default daily sync.
- Hosted auto-login disabled; shared operator credential retired; previous account sessions rejected. Owner is jules@switchflow.agency. Private password setup is open in Chrome; Jules must choose his password.

## Verification

- 10 agreement/payment tests and 3 access/password tests passed. Payment-provider responses in these tests are mocked.
- Six website regression checks passed.
- Deploy guards, TypeScript checks and hosted production builds passed. Existing unrelated build warnings remain.
- Hosted preview and production tests verified encrypted agreement persistence, valid acceptance, rejected hash/replay, pending payment after signing, four tasks after retries, expense persistence/deduplication, unauthenticated access rejection and rejected unsigned payment notification.
- Browser review verified the published website, public agreement/payment state, client Agreement & payment tab, and persisted expense row.
- All synthetic client, activity, project, task, agreement and expense records were removed and removal was read back.
- No real contract accepted, payment collected, external message sent or campaign activated by verification.

## Remaining before use with a real client

1. Jules chooses his private Compass password using the prepared one-use setup link.
2. Enter verified receiving-account details, or connect Stripe and complete a provider test-mode checkout/webhook test before live card collection.
3. Decide setup fee, start date and cancellation terms; review the exact agreement for the client. The agreement has not had independent legal review.

Card checkout currently collects setup and the first monthly payment together, then renews on the payment anniversary. Subsequent subscription invoices, cancellation, failures and refunds are managed in Stripe; Compass displays initial payment only. Bank payment schedules can be explicitly edited in the agreement.

This release is the offer-alignment, signing and basic expense phase. It does not establish that the full daily/weekly/goals agent, automatic financial reconciliation, delivery agents or live card processing are complete.

## Release references

Compass local release branch: codex/installation-commercial-20260908, commit 469ea53.
Website local release branch: codex/installation-offer-site-20260908, commit 67c7cc7.
These isolated releases preserve unrelated working-tree edits; they have not been merged into the original working branches.

Production deployment: dpl_6uXNHAxSdtBxAmcUaf37zxSB8RB3 (READY).
Live Compass: https://compass-web-eosin.vercel.app
Live website: https://switchflow.agency
