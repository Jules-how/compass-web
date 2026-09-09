# Compass client delivery v1

This branch adds an operator workspace at **Operations → Client delivery** (`/operations/delivery`). It implements one residential ducted-replacement enquiry → guided SMS qualification → selected assessment time → booking → follow-up/handoff → observed outcome loop. It does not activate the legacy voice/SMS system or move outbound prospect records.

## What is implemented

- Account-scoped enquiries, contact suppression, messages, evidence, events and scheduled actions in Postgres.
- A transactional outbox: state changes, audit events and the next actions commit together. A bounded worker claims durable leases. No running browser, in-memory conversation map, n8n deployment or extra queue service is required.
- A deterministic, bounded qualification interpreter. It asks for service, suburb, authority, timeframe and address, then offers up to two assessment slots. It does **not** use a language model or make technical, pricing or suitability decisions. Unknown replies go to a named office handoff.
- Explicit homeowner slot selection, expiring offers, buffered calendar availability, stable event identifiers, rescheduling, cancellation and a reminder when booked more than 24 hours ahead.
- Follow-up at 24 and 72 hours after the latest qualification question, shifted into the configured contact window. Replies, takeover, opt-out and terminal outcomes fence stale actions. No indefinite nurture sequence.
- A complete fictional demo using the same worker and database contracts. Demo SMS/calendar/CRM providers make no network calls. Its clock can advance independently of real time.
- Twilio SMS transport and signed inbound/delivery-status endpoints. Missing signature configuration fails closed. Ambiguous replies are saved for assignment rather than guessed.
- A Google Calendar adapter for one assessment resource per client; a manual live CRM reconciliation path and an explicit adapter interface for the first client CRM.
- Observed attendance, quote, win/loss and optional AUD job value, with actor, timestamp and evidence. Elapsed time does not count as attendance. Source/campaign/keyword and Google click identifiers are retained on intake.

## Deliberate limits

This is a reviewable first delivery loop, not a claim of a production launch. There is no AI voice, email nurture, automated technical quoting, postcode geocoding, dispatcher routing, CRM marketplace, Google Ads campaign creation, ad-spend import or offline-conversion upload in this change. Google-origin web enquiries can enter through the intake API; search campaigns and the landing-page server must supply them.

CRM integration currently means **a simulated demo opportunity** or **an office-owned manual update**. A successful manual job is labelled `manual_pending`, never `synced`. Recording a CRM reference changes it to `manual_done`. Implement and test the first actual CRM behind `DeliveryProviders.crm` after its field mapping, access and booking authority are known.

The office handoff is a persisted task in the Compass delivery workspace, with an owner and due time. This version does not notify the client office through SMS/email or expose the workspace to customer accounts. Jules must operate that handoff during the pilot. Guided qualification is deliberately narrower than a conversational LLM agent; review real reply samples before expanding it.

## Try the demo

For a local interface review, run `node scripts/preview-delivery.mjs`. It prints a loopback URL and renders the real delivery route inside the existing Compass shell, with the same sidebar, page header, fonts and CSS. The fixture uses the real delivery engine and an ephemeral PGlite database; it substitutes browser routing/auth and inactive pages. Other Compass pages are not included. It does not exercise hosted authentication or Supabase connectivity, and its fictional records reset when stopped. No `next dev` server or production credentials are required.

1. Apply migration `0080_compass_delivery_engine.sql` to a **review/staging** database with the existing Compass portal/client baseline. Point the review deployment at that database and keep `COMPASS_DELIVERY_LIVE` unset.
2. Sign in as a Compass operator, open **Client delivery**, and create an enquiry that needs qualification.
3. Send fictional replies: `Yes`, `Ryde`, `Yes`, `Next month`, `10 Example Street`. The demo then offers appointment options. Reply `1` or `2` to book; it must never book merely because availability exists.
4. Try `reschedule`, choose a replacement, then `cancel appointment`. The old appointment stays recorded until the replacement is confirmed.
5. Create further enquiries for an outside-area request and no SMS permission. Ask `How much will it cost?` or `Call me` to see office handoff. Send `STOP` to see persistent suppression.
6. Leave a new enquiry unanswered. Advance the demo clock one day, then two more days, to see the finite follow-ups. Advance beyond a booking: attendance must remain zero until recorded with evidence.
7. Inspect the activity history, pending actions, office owner and simulated CRM record.

Demo enquiries are retained, not silently reset. A duplicate intake key or inbound message ID does not create another record. The demo clock is account-wide, so advancing it affects all demo enquiries. Only the demo account can be advanced; the real-time worker excludes demo accounts.

## Repeatable client setup

Use `docs/templates/delivery-client.example.json` as the configuration contract. Replace every placeholder with client-approved values. Required operating decisions are the service area, assessment calendar, duration/buffer, lead-time, contact window and named office owner. Revenue alone is not evidence of suitable enquiry volume or appointment capacity.

1. Create/select the existing Compass client. Give it one dedicated, SMS-capable Australian mobile number and one assessment calendar. This initial transport uses the server's configured Twilio account; each client has a distinct bound number.
2. As an authenticated operator, submit the completed JSON to `POST /api/delivery-engine/accounts` with a same-origin request. It creates a **paused** account and returns a one-time intake credential. Save that credential in the landing-page **server** secret store, never browser code. Existing client/number conflicts are rejected; this endpoint cannot buy numbers, enable accounts or change existing accounts.
3. Share the assessment calendar with the configured Google service account and verify its read/write access. Establish who may book or modify that calendar. Compass serializes its own reservations; Google Calendar does not offer an atomic “insert only if still free” operation, so a staff booking racing the API write remains an integration risk. For the pilot, use a dedicated resource and an agreed single booking writer. Staff changes to an existing Compass event are handed over when detected; this version has no calendar watch/sync service.
4. Connect the form's server to the intake endpoint and preserve the original submission ID, consent evidence and attribution. Supply actual customer facts, not inferred facts. Add abuse/rate controls at the landing page and hosting edge before exposing paid traffic.
5. Decide which system owns appointment time and commercial outcomes. With the current Google adapter, Compass writes the assessment calendar and the office mirrors its reference to the CRM. If the CRM calendar is authoritative, build that adapter before switching on automated booking.
6. Complete a consented test through the actual phone, calendar and CRM process. Confirm actual Twilio delivery status, actual provider event and manual CRM reference, plus cancellation and opt-out. The automated suite does not substitute for this test.
7. Configure a scheduler, operator monitoring, retention/deletion policy, privacy/consent copy and handoff staffing. Then separately enable the account and the global live flag. No launch action is performed by this branch.

### Environment contract

Existing Supabase URL, service-role key and Compass operator authentication are required. The migration grants browser operators read access only; customer and anonymous roles cannot execute delivery RPCs. Server routes require operator access, an account intake secret, a worker secret, or a valid Twilio signature before using privileged methods.

| Setting | Purpose |
| --- | --- |
| `COMPASS_DELIVERY_LIVE=1` | Global gate for real SMS/calendar work. Leave unset in a review environment. |
| `COMPASS_DELIVERY_WORKER_SECRET` | At least 24 random characters; unique to the delivery scheduler. |
| `COMPASS_DELIVERY_PUBLIC_ORIGIN` | Exact public HTTPS origin, with no path/query; used in callback URLs and signature verification. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Bound transport account; its SID must match the client account. |
| `GOOGLE_BOOKING_SERVICE_ACCOUNT_JSON` | Google service-account credentials; calendar shared explicitly with that identity. |

The live worker is `POST /api/delivery-engine/worker` with `Authorization: Bearer <worker secret>`. Configure an authenticated scheduler to call it once per minute for the one-client pilot. No scheduler is installed by the migration or this branch. Each wake has bounded work/time; traffic exceeding its capacity requires measured queue-lag monitoring and a larger execution plan. Enabling messaging without a working scheduler will only accumulate pending actions.

Twilio inbound URL: `POST /api/delivery-engine/webhooks/twilio`. Configure inbound delivery retries/alerts in Twilio. Outgoing messages supply their status callback automatically at `/api/delivery-engine/webhooks/twilio/status?job=...`. The signature includes that exact query string. Provider receipts remain accepted after an account is paused. The phone number's SMS opt-out handling and account settings must be verified during provisioning; Compass keeps its own suppression as an additional gate and does not automatically re-enable on START.

### Intake contract

`POST /api/delivery-engine/intake`, server-to-server, using the account's bearer credential. Do not send `accountId`: the authenticated credential determines the destination account. There is no browser CORS shortcut.

```json
{
  "externalId": "stable-form-submission-id",
  "name": "Customer supplied name",
  "phone": "0400000001",
  "facts": {"service": "ducted_replacement", "suburb": "Ryde"},
  "consent": {
    "sms": true,
    "wording": "Exact consent text shown to this customer",
    "source": "installation-landing-page-form-v1",
    "recordedAt": "2026-09-09T00:00:00.000Z"
  },
  "attribution": {
    "source": "google_search",
    "campaign": "Client supplied campaign identifier",
    "keyword": "Captured keyword when available",
    "gclid": "Captured click identifier when available"
  }
}
```

The example is fictional. Omit optional fields that were not captured. Accepted attribution also includes `gbraid`, `wbraid` and `landingPage`. A repeated `externalId` returns the existing enquiry without rewriting its evidence. A missing SMS permission creates an office handoff; consent does not override a prior opt-out for that client's contact.

## Failure handling and ownership

- Every external action is checked against the current account, consent, suppression, conversation epoch and lease before execution. There is an unavoidable boundary once a provider request has left the server: an opt-out arriving then suppresses later actions but cannot retract the request already sent.
- Read-side transient provider failures retry with backoff, with at most four attempts. Expired worker leases are recoverable. Google event IDs support reconciling a booking retry against the existing provider record.
- SMS dispatch intent is saved before transport. If the send may have happened but its result is unknown, the job becomes `uncertain`; it is never blindly resent. A receipt arriving before the create response is stored and replayed when the message is committed.
- An uncertain SMS/calendar result pauses automation and blocks **Resume follow-up**. The office can keep handling the enquiry. An operator must reconcile the actual provider record; this initial version has no automatic repair tool for an SMS whose create response was lost or for an uncertain calendar mutation. Do not clear reservations or retry writes by guessing. Database repair, if required, must record the actual provider identity and an audit event before resuming.
- A rescheduling failure preserves the previously confirmed appointment. An uncertain reservation continues blocking its resource. A confirmed cancellation releases capacity.
- Booking conflicts, missing capacity, unsupported requests and pricing/technical questions become office work. They are not rejected with invented explanations or sales claims.
- Disabling `delivery_accounts.enabled` stops new processing/intake for that account. Unsetting the global live flag stops provider actions. Preserve Twilio callback acceptance and manually reconcile requests already in flight. Neither switch deletes data or cancels existing appointments.

## Measurement and improvement

The desk shows milestone counts for the selected account: replies (excluding opt-out-only replies), qualified, booked, attended, quoted and won. “Booked” is a historical milestone, so a later cancellation does not erase it. Current booking state remains separate. Only explicit outcome evidence advances commercial milestones.

Use the ledger to calculate reply time, qualification-to-booking rate, attendance rate, quote-to-win rate and failure/handoff reasons. Current UI counters are not an advertising ROI dashboard: ad spend and contribution margin are not integrated. The snapshot shows the latest 100 enquiries, 500 messages, 300 jobs and 300 events for operator use; aggregate counts cover the whole selected account. Export/paginated reporting should be added when actual volume requires it.

For the first pilot, review every handoff and a sample of successful conversations daily. Record why each enquiry failed, whether the office met its handoff commitment, and whether booking/CRM references agree. Change one question, rule or cadence at a time; add a representative regression case before promoting it. Do not attribute jobs to advertising solely because an enquiry exists in this ledger. Reconcile the captured click/source identifiers and actual outcomes before building offline conversion reporting.

Productisation here is a shared engine, versioned `installation-v1` rules, one client configuration, an adapter contract, a repeatable demo, tests and the setup/runbook above. A second client should change configuration and the supported integration mapping; it should not require copying a separate workflow tree.

## Verification

The delivery-only branch is `codex/compass-delivery-live`, based on production `main` at `8ba9b764a112bd14aaaa94ba022ba4789a9000ab`. Vercel's canonical alias was checked on 9 September 2026 and resolved to deployment `dpl_B1SpeMjsjm4a7i17iTP8RZR6Gcxm`. The earlier `codex/compass-delivery-loop` branch also contains unrelated planning and interface work; it is not the release base for this change. The production shell, sidebar implementation and global design tokens are unchanged on the delivery-only branch; navigation gains only the Client delivery entry. Recheck the production revision before a later release.

```sh
node --test test/delivery-engine.test.mjs
npm run verify
npm run build
```

The delivery suite executes the actual TypeScript modules and actual migration in PGlite/Postgres, including disk restart, duplicate intake/replies, leases, early delivery receipts, opt-out races, bounded follow-up, competing reservations, rescheduling/cancellation, tenant/phone boundaries, RLS, webhook signatures and mocked Google API behaviour. PGlite provides a single embedded backend: multi-session lock contention and the deployed Supabase environment still require staging verification. No automated test sends a real SMS or writes a real calendar/CRM record.

Protocol references: [Twilio request validation](https://www.twilio.com/docs/usage/security), [Twilio messages](https://www.twilio.com/docs/messaging/api/message-resource), [Google event creation and IDs](https://developers.google.com/workspace/calendar/api/guides/create-events), [Google events list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [PGlite](https://pglite.dev/docs/).
