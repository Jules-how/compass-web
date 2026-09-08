# Installation booking: agreements, payments and expenses

Supplier confirmed by Jules on 8 September 2026: Julian Howard trading as Switchflow, ABN 70 833 262 837; not GST registered. Default monthly amount AUD 2,500. Setup, start date, scope, cancellation and bank instructions require explicit review for each client.

## On-call workflow

Open a client, complete Agreement & payment, review the exact document, and create a signing link. Copy or open the link; Compass does not send it. The client accepts the immutable document, then follows the agreed payment method. A signed agreement is not proof of payment.

Acceptance creates a per-client delivery project and four tasks once. Kickoff/payment verification is ready; onboarding/baseline, enquiry-to-booking and reporting remain blocked until payment/access/scope are confirmed. Refresh retries task creation after an outage. It does not provision or execute delivery systems.

Bank/Wise: enter verified receiving instructions. Confirm the initial payment only after checking a cleared bank transaction, and record its reference. Subsequent bank payments are currently reconciled manually.

Card: configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the deployment. Register `/api/payments/stripe-webhook` for checkout.session.completed and checkout.session.async_payment_succeeded. Checkout starts a monthly subscription and includes an explicit one-time setup amount when applicable. Checkout uses idempotency keys; the return page alone never marks payment received. Initial amount, currency and document binding are checked. Later subscription payments, cancellation, refunds and failed renewals are managed in Stripe; Compass currently displays initial payment status only. Run a Stripe test-mode payment/webhook check before enabling live collection.

## Storage and access

Agreements and manual expenses use encrypted records in the existing compass_settings table. Encryption and signing-link authentication derive from COMPASS_AGENT_SECRET. Back up that secret securely; rotate only with a record migration or these records and existing links become unreadable. Database row timestamps enforce optimistic concurrency. Agreement links expire after 14 days for acceptance; signed records remain available by their private link.

Hosted builds never use open-operator auto-login. The old embedded password must be replaced and existing sessions revoked during cutover. Only local development supports explicitly configured auto-login. The password setup page consumes a provider-issued, one-time recovery token; no recovery email is sent by this feature.

## Expenses

Operations → Finances records paid AUD expenses with vendor, category, account and source reference, optionally linking a receipt. Retries reuse a request ID to avoid double entry. Page totals cover only the displayed page. There is no automatic bank feed, accounting reconciliation, GST-credit calculation or export yet.

## Readiness

Automated tests cover agreement validation, exact terms, expiry/revocation, immutable acceptance, encrypted storage, task idempotency, checkout reuse, payment reconciliation and webhook tampering. Card tests use mocked provider responses; they are not evidence of a live payment. Production readiness also requires hosted persistence checks, Jules choosing his private password, verified receiving details, settled commercial terms and (if wanted) a connected/tested Stripe account.

Old QBO records are retained as history. New agreement issuance and default daily sync do not use QBO. Retired campaigns and their results remain historical evidence; no campaign activation or external message is part of this release.
