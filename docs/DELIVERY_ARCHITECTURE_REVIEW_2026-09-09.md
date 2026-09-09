# Compass delivery architecture review

Date: 9 September 2026. Status: recommendation, not an implementation or production-readiness sign-off.

## Decision

Build the narrowly scoped installation-enquiry workflow as a Compass delivery module, with durable background execution and direct provider adapters. Keep Twilio as transport and the client's CRM/booking system as the authority for its business records. Use MCP for supervised operator actions over the same application services.

Do not add n8n to the first core workflow merely to join these components. It remains a reasonable exception for a client-owned existing automation or a connector that demonstrably saves work. Do not run two independent qualification or scheduling engines for the same lead.

This is a product investment. It is not established as the fastest way to the first paid result. The existing code saves some integration and interface work, but the missing reliability and enquiry model are substantial.

## Scope and evidence boundary

Reviewed the two supplied side-chat notes, Compass repository instructions, delivery/onboarding documentation, intake and SMS routes, booking code, voice persistence, evidence events, relevant database migrations, trade packs, Google integration, reporting, scheduled-job configuration, and focused tests. Checked current primary documentation for queues, scheduling, n8n licensing, and the Google Ads API version in use.

Inspected local source and ran isolated checks. No live SMS, booking, CRM mutation, database migration, campaign, or deployment was performed. Production environment variables, applied migrations, provider configuration, and client-system permissions were not verified. File presence is not evidence of a working hosted deployment.

## What can be reused

- Operator authentication, client directory, interface shell, and existing Supabase integration.
- An authenticated lead-ingest pattern, though its source schema and identity mapping need work.
- Twilio transport and signature-verification helpers, after hardening their callers.
- Google Calendar access helpers, after booking behaviour and concurrency are repaired.
- Configuration-pack structure, with a new installation-assessment configuration.
- Evidence-event structure, with explicit delivery identities and event contracts.
- Onboarding and delivery checklist patterns as operational guidance; these are not proof that the represented steps execute.

## Findings that change the recommendation

### 1. SMS conversations are not durable or lead-linked

`src/lib/voice-sms.ts:176` stores sessions in a process-level Map. `src/app/api/voice/sms/route.ts:66` keys it by client and phone. The route does not persist a homeowner conversation, MessageSid deduplication, or delivery opportunity. Intake at `src/app/api/ingest/leads/route.ts:72` saves an inbound row but does not start a reliable conversation workflow.

The actual parser also failed to extract suburb and job from the natural input `Ryde, ducted replacement, Friday 2pm`: it extracted Friday alone. Existing tests use a separately implemented parser and therefore miss that behaviour.

### 2. Booking does not implement customer slot selection

`src/app/api/voice/sms/route.ts:72` converts the time hint into a broad urgency category, requests one slot, and books it. A controlled route check with explicit labelled fields requested Friday 2pm but attempted the provider's first slot, Wednesday 10am. This was an isolated test using a synthetic calendar response, not a real booking.

Add offered-slot records, explicit customer selection, expiry, availability recheck, appointment identity, cancellation, and rescheduling.

### 3. Current locking and replay behaviour cannot protect bookings

`src/lib/booking.ts:29` keeps slot locks in another process-level Map. Separate runtime instances both successfully claimed the same synthetic slot. The insert operation does not itself recheck availability or supply a stable event ID. Replaying the same synthetic MessageSid through the actual SMS route attempted two bookings.

Database locks must protect the actual resource and overlapping time interval, not only identical start strings. They only coordinate Compass writers; external staff edits require the booking provider's own rules and conflict reconciliation. An uncertain create response must be reconciled before retrying.

### 4. Failure handling can bypass important controls

`src/app/api/voice/sms/route.ts:34` verifies signatures only when the token is configured. With a missing token the isolated handler accepted the request. The route must reject missing authentication configuration.

`src/lib/voice-twilio.ts:11` ignores suppression lookup errors; a synthetic database error was treated as not suppressed. The suppression write also returned without surfacing a synthetic database failure. A failed check should hold the send for recovery.

The current STOP matcher does not recognise `Please stop texting me`. Explicit keywords should be immediate, with broader refusal handling as well. Pending sends must be invalidated when suppression or human takeover changes.

### 5. Callback promises do not establish a human handoff

The SMS route's unavailable-calendar and no-slot branches return "Someone will call you back" without creating an assigned callback task in that branch. The max-turn parser has a similar response. Add a persisted handoff, assigned owner, deadline, delivery acknowledgement, and overdue escalation; pause automation while a person owns the conversation.

### 6. The current HVAC pack is neither valid nor the target offer

The pack at `../voice-agents/packs/hvac_refrig.json` includes repairs, maintenance, and commercial refrigeration. It also represents Sunday as an empty array, while `src/lib/voice-pack.ts:38` requires every hours array to have exactly two entries. Running the actual validator rejected the supplied HVAC pack. Client hydration catches pack-loading errors and returns null.

Create a validated residential installation-assessment pack with service-area and qualification rules. Verify that its assets are included in the deployed artifact: the current loader searches filesystem directories outside the standalone Compass repository, and the Next tracing configuration only explicitly includes delivery-department JSON.

### 7. Client identity and tenant identity need an explicit mapping

Inbound intake resolves `tenants` by slug. Voice resolves `compass_clients` by a number stored in JSON. A `portal_client_slug` field exists, but the reviewed code does not establish an enforced mapping joining the delivery journey.

Use one explicit account relationship with scoped foreign keys and unique provider bindings. Do not treat `client_id` and `tenant_id` as interchangeable. Service-role webhook handlers need their own verified tenant scoping; browser RLS is not protection for those handlers.

The README references initial portal migrations absent from this checkout. This is a reproducibility gap, not evidence those tables are absent in production.

### 8. Client communications already contain some homeowner call data

Although `compass_client_comm_*` is client-account oriented, `src/lib/voice-calls.ts` already writes caller summaries there. Therefore the side-chat claim that it is exclusively Switchflow-to-client communication is too strong.

Use a dedicated delivery conversation model going forward. Preserve existing records and provide explicit links or a deliberate migration; do not silently relabel history.

### 9. Evidence events are useful but not a workflow engine

`src/lib/events.ts:71` suppresses duplicate inserts, but always returns `inserted: true` with a newly generated ID, including on a duplicate. Do not use that return value to decide whether a send or booking should occur.

The reviewed evidence migration describes append-only usage but grants update/delete to operators. Reuse the event pattern deliberately; it is not an immutable audit guarantee or an atomic transaction with business state.

Namespace identifiers by tenant, provider, account, and object type. Commit a state transition, its event, and its pending action in one database transaction where they must succeed together.

### 10. There is no verified durable nurture runtime

The checked-in Vercel configuration schedules a daily ads/Instantly sync. No production homeowner outbox, due-task worker, or supported trade-CRM adapter was found in the reviewed implementation.

Persist pending actions, attempts, leases, expiry, deduplication keys, and failures. A scheduler wakes a worker; it is not itself durable task state. Recheck the current lead version, contact permission, quiet hours, booking status, and human ownership immediately before an action.

### 11. Legacy reporting cannot be used for installation results

`src/lib/cs-dept/run.ts:58` can classify a booked call as showed merely because its appointment time has passed. `src/lib/cs-dept/engine.mjs:312` derives recovered contribution from showed counts. Neither is evidence of an attended installation assessment or profitable completed installation.

Require observed attendance, quote, accepted-job, completion, and payment events with source and timestamps. Unknown remains unknown. Separate attributed results from demonstrated incremental improvement, and keep raw rejected/duplicate enquiry counts visible.

### 12. The advertising code also needs revalidation

`src/lib/google-attach/api.ts:19` hardcodes Google Ads API v18, which Google sunset on 20 August 2025. The supplied Google HVAC pack contains repair and refrigeration campaigns, not just the selected installation category.

Run the first campaign in the client's Google Ads account using its normal interface. Scope lead attribution and outcome uploads into delivery; automatic campaign creation inside Compass is not required to prove the service.

## Recommended architecture

1. **Ingress:** verified form/provider endpoint persists the received event and queues work before acknowledging success.
2. **Delivery module:** owns enquiry facts, conversation history, qualification, sequence rules, human ownership, and proposed actions.
3. **Durable executor:** claims queued work, loads current state, validates policy, calls a bounded provider adapter, records results, and retries or escalates.
4. **Providers:** Twilio for SMS; the actual client booking system for appointments; a supported CRM adapter for customer/job data and outcome sync.
5. **Compass operator view:** timeline, current facts, next action, provider status, takeover/resume, exceptions, and reconciled metrics.

Use Supabase Queues plus a scheduler and bounded worker as the first implementation candidate. Keep the worker separable from the interactive Next.js application even if they share a repository and domain library. Avoid adding several execution services at once. If requirements justify a managed workflow service later, the domain should not need rewriting.

A queue's delivery guarantee does not guarantee exactly one external SMS or appointment. Provider idempotency, reconciliation of uncertain results, and careful retries remain application responsibilities.

## Data and authority

Distinguish a person/contact, an installation enquiry/opportunity, a conversation, an appointment, and a job. A repeat enquiry from the same phone is not automatically a duplicate opportunity. Treat contact permission and automation ownership separately from commercial stage: a booked customer can opt out or be under human management without becoming a lost lead.

Store messages, structured facts with provenance, a compact summary, state version, pending actions, external mappings, and outcome events. Store relevant context under an explicit retention policy; do not send all historical transcripts or unrelated client records to the model each turn. Share tested rules and aggregate learning across clients, not private customer conversations.

The CRM owns staff-entered job, quote, and sales outcomes. The actual scheduling system owns confirmed appointments. Compass owns its automation state and conversation history. Set field ownership, sync-loop prevention, webhook deduplication, revision handling, and periodic reconciliation. A connector must state which capabilities are supported; not every CRM supports availability or every downstream event.

MCP is suitable for operator review, diagnostics, pause/resume, and controlled actions. Use direct API/webhook adapters for the core journey where available. MCP does not replace credentials, provider capabilities, rate limits, or failure handling.

## Product scope and rollout

### Foundation

Confirm tenant/account mapping, recover the migration baseline, establish separate demo data, validate the installation pack, fix fail-open controls, and decide one scheduling authority and one client-system adapter.

### One reliable enquiry-to-assessment path

Implement durable intake/conversation state, bounded interpretation, explicit slot selection, confirmed booking, cancellation/rescheduling, staff handoff, and an operator timeline. Test provider retries, parallel replies, corrections, process restarts, and conflicting actions.

### Follow-up and outcomes

Add a finite no-response sequence, appointment reminders, current-state cancellation, one CRM outcome feed, and visible manual reconciliation where a provider cannot supply a fact. Add quote follow-up only after quote status and human ownership are reliable.

### Repeatable deployment

Separate reusable workflow code from approved client configuration. Provision scoped credentials/numbers, test the destination system, version changes, retain rollback, monitor queue delays and provider failures, and document offboarding/export. Require a real two-client isolation test before onboarding a second live client.

Initial scope: Google-origin enquiries, residential ducted replacement or one other selected installation category, SMS, one assessment type, one booking authority, one supported CRM, and client-office callbacks. Voice, broader nurture, a general workflow builder, CRM replacement, and multi-channel campaign automation are later decisions.

## Alternatives and economics

| Approach | Best reason to choose it | Cost or constraint |
| --- | --- | --- |
| Existing client CRM automation | It already handles messaging, ownership, and scheduling reliably | Less consistency across clients; must still verify outcomes |
| n8n-led workflow with Compass reporting | A supported connector or existing client installation materially speeds the pilot | Split state and debugging; licensing/hosting choice; reusable business logic still needed |
| Compass delivery module with durable execution | Repeating one managed workflow across comparable clients with one operator view | Upfront engineering, on-call responsibility, provider maintenance, tenant isolation |

Recommend the third for the intended repeatable service, with an exception for a client system that already solves most of the workflow. Do not justify custom development solely by sunk code or a lower software subscription. Compare total engineering, maintenance, support, provider spend, and client onboarding effort. Track reusable product development separately from per-client setup and weekly operation; do not hide the former inside a low-priced first pilot.

## Verification results

- Focused existing test run: **13 passed, 10 failed** across 23 reported checks. Failures were missing legacy package/migration paths and missing trade-pack fixtures. These do not prove a production outage.
- Passing SMS/lock tests largely mirror implementations or inspect source strings, rather than test the deployed path.
- Additional isolated actual-source checks reproduced parser limitations, HVAC schema rejection, missing-secret acceptance, suppression error handling, repeated booking attempts for one MessageSid, ignoring a requested specific appointment, and independent in-memory locks.
- No production provider behaviour, permissions, or readiness claim is made from these tests.

## Primary platform references

- [Supabase Queues](https://supabase.com/docs/guides/queues): durable Postgres-backed work delivery with visibility windows.
- [Supabase Cron](https://supabase.com/docs/guides/cron): scheduling SQL/functions/HTTP work.
- [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs): retries and concurrency remain relevant application concerns.
- [n8n licensing guidance](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case): distinguish client-instance consulting from hosting client workflows and credentials.
- [Google Ads v18 sunset](https://ads-developers.googleblog.com/2025/07/google-ads-api-v18-sunset-reminder.html): current repository API version is retired.
