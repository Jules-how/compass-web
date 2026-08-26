# Database reactivation (Wave 5a)

Attach-line for consented SMS-led win-back and dead-lead reactivation. Packs live in `database-reactivation/packs/`. Runtime is cron-driven via `reactivation` in `ALL_AGENT_SYNC_SOURCES`.

## Flow

1. **Import** — Operator uploads CSV (or JSON rows) via `POST /api/clients/:id/reactivation` with `pack_id`. Rows are mapped, hygiene-checked, and stored as `pending` contacts. List status → `review`.
2. **Review** — `GET /api/clients/:id/reactivation` returns counts, consent %, sample rendered SMS, reject sample.
3. **Activate** — `PATCH /api/clients/:id/reactivation/:listId` with `{ action: "activate", confirm: true }`. Broker pack also requires `licensee_signoff: true`. Enrolls eligible contacts (`state: enrolled`, `next_touch_at` computed).
4. **Send** — Daily cron (`syncReactivationLists`) sends due SMS touches for `active` lists only. Checks `sms_suppressions`, quiet hours, and contact state. **Nothing sends before activation.**
5. **Inbound** — `POST /api/reactivation/sms` (Twilio webhook). STOP → suppress + ack. Any other reply → suppress touches, escalation task, events.
6. **Outcomes** — Operator marks `booked` or `showed` via contact PATCH. `booking.showed` is the bonus money event.

## Pack schema

Each pack JSON (`database-reactivation/packs/{pack_id}.json`):

| Field | Purpose |
| --- | --- |
| `pack_id` | Stable id (matches filename) |
| `icp` | brokers, dental, physio, trades |
| `import_map` | Column aliases for CSV mapping |
| `consent_policy` | `allowed_bases`, `max_inferred_age_days`, `comment` |
| `segments` | Lapse bands (`min_days`, `max_days`) |
| `lapse_floor_days` | Minimum age before eligible |
| `sequence` | Touches: `channel`, `day_offset`, `template_id`, `template` |
| `escalation_rules` | Reply classes → suppress / escalate |
| `caps` | `max_touches`, `monthly_contact_cap` (1000) |
| `compliance_gate` | `licensee_signoff_required` (brokers: true) |
| `bonus_metric` | `attended_meeting` (brokers) or `showed_booking` (clinics/trades) |
| `quiet_hours` | `start` / `end` local (default 08:00–21:00) |
| `stop_ack_template` | Sent after STOP |

Templates must include sender identity (`{business_name}`) and `Reply STOP` on every SMS.

Loader: `src/lib/reactivation-pack.ts`. Override path with `REACTIVATION_PACKS_DIR`.

## Compliance rules

- **Spam Act**: express consent, or inferred only within provable ongoing relationship. Rows without valid `consent_basis` are rejected (`consent.missing` event). Never sent.
- **Brokers**: advice-preserving only. Book a chat with `{broker_name}`. No products, rates, lenders, or credit suitability in copy. `licensee_signoff_required` gate before activation.
- **Quiet hours**: 08:00–21:00 in client timezone (`voice.timezone`, default `Australia/Sydney`).
- **STOP**: honoured immediately via `sms_suppressions` + contact `opted_out`.
- **Reply**: any non-STOP reply suppresses further touches and creates a `compass_tasks` escalation.

## Pricing (commercial)

| Item | Amount |
| --- | --- |
| Install | $1,497 ex GST |
| Standalone monthly | $997 ex GST (first 1,000 eligible contacts) |
| Broker bonus | $150 / attended advice meeting, cap $1,500/mo |
| Dental / physio bonus | $40 / showed booking, cap $800/mo |
| Trades attach | Included in retainer |

Store commercial terms on `compass_clients.deal_terms` (existing). Bonus wiring reads `booking.showed` or attended-meeting events from `compass_evidence_events`.

## Events

Source: `reactivation`. Key types: `list.imported`, `contact.rejected`, `consent.missing`, `sequence.enrolled`, `message.sent`, `reply.received`, `optout.honoured`, `booking.requested`, `booking.confirmed`, `booking.showed`.

## Database

| Migration | Tables |
| --- | --- |
| `0069_compass_reactivation_lists.sql` | `compass_reactivation_lists`, `compass_reactivation_contacts` |
| `0070_compass_reactivation_messages.sql` | `compass_reactivation_messages` |

RLS: `portal_is_operator()` on all three (same pattern as `compass_qbo_docs`).

## API routes

| Method | Path | Role |
| --- | --- | --- |
| GET | `/api/clients/:id/reactivation` | List health + samples |
| POST | `/api/clients/:id/reactivation` | CSV/JSON import |
| PATCH | `/api/clients/:id/reactivation/:listId` | activate / pause |
| PATCH | `/api/clients/:id/reactivation/:listId/contacts/:contactId` | mark booked / showed |
| POST | `/api/reactivation/sms` | Twilio inbound webhook |

## How to add a vertical pack

1. Copy an existing pack JSON in `database-reactivation/packs/`.
2. Set `pack_id`, `icp`, `import_map`, `consent_policy` (justify `max_inferred_age_days` in `comment`).
3. Write production SMS copy with `{business_name}`, merge fields, and `Reply STOP`.
4. Define `segments`, `sequence` (3–4 touches, ≥14 days apart for clinics; day 0 / 5 / 12 for trades).
5. Set `compliance_gate` and `bonus_metric`.
6. Add pack id to `REACTIVATION_PACK_IDS` in `reactivation-pack.ts` if you want it in the picker default list.
7. No code deploy needed for copy-only changes if loader finds the file.

## UI

Component: `src/components/clients/ClientReactivationPanel.tsx`. Not mounted by default — add to `ClientDetailPanel` when ready.

## Twilio

Point reactivation numbers at `https://{host}/api/reactivation/sms`. Voice missed-call SMS stays on `/api/voice/sms` (untouched).

## ICP order

1. Brokers (dead leads)
2. Dental
3. Physio
4. Trades (existing customers attach)
