# Client onboarding (Wave 1c)

Tokenised public forms populate the client profile, delivery tasks, and install invoice with no manual copying.

## Flow

1. **Signed deal** — operator opens the client in Compass.
2. **Send form** — Overview → **Send onboarding form**. Creates a `compass_onboarding_forms` row, copies `https://{APP_ORIGIN}/onboard/{token}`.
3. **Client completes on phone** — one section per screen, autosave on each Continue. First load sets `opened_at`.
4. **Submit** — server validates required fields, writes `compass_clients` + `deal_terms.delivery`, creates delivery project/tasks, drafts QBO install invoice (or a Compass task if QBO is offline).

Public access never hits Postgres anon RLS. Routes validate the token, then use the service role client.

## Question packs

Packs are JSON data, not hard-coded UI.

| Path | Purpose |
| --- | --- |
| `onboarding/missed-call-booking.json` (repo root) | Canonical pack for missed-call booking |
| `compass-web/onboarding/missed-call-booking.json` | Deploy copy (Vercel root = `compass-web`) |

Loader search order: `cwd/onboarding`, `../onboarding`, `compass-web/onboarding`.

**Filename:** offer key uses underscores (`missed_call_booking`); pack file uses hyphens (`missed-call-booking.json`).

### Pack schema

```json
{
  "offerKey": "missed_call_booking",
  "title": "Switchflow onboarding",
  "subtitle": "…",
  "sections": [
    {
      "id": "billing",
      "title": "Billing & legal",
      "description": "optional",
      "fields": [
        {
          "id": "legal_entity_name",
          "label": "Legal entity name",
          "help": "optional",
          "type": "text",
          "required": true,
          "blocks": "invoice",
          "options": [{ "value": "x", "label": "X" }]
        }
      ]
    }
  ]
}
```

**Field types:** `text` | `tel` | `email` | `select` | `multiselect` | `hours` | `toggle` | `textarea` | `file_note`

**`blocks`:** `invoice` | `delivery` | `null` — documents which downstream systems consume the field (mapping in `src/lib/onboarding-pack.mjs`).

**Placeholders:** `{{BOOKING_GRANT_EMAIL}}` in `help` is replaced from env `BOOKING_GRANT_EMAIL` (default `booking@switchflow.agency`).

**`hours` answers:** object keyed by weekday (`monday` … `sunday`), each `{ open, close, closed }`.

Validation: `validateOnboardingPack()` / `collectPackErrors()` in `src/lib/onboarding-pack.mjs`.

## Add an offer pack

1. Copy `missed-call-booking.json` → `onboarding/{offer_key}.json` (both repo root and `compass-web/onboarding/`).
2. Set `offerKey` to match the filename stem (underscores).
3. Include an `authorisation` toggle with the legal wording required for that offer.
4. Run `node --test test/onboarding.test.mjs`.
5. Wire operator send if the offer is not `missed_call_booking` (optional `offerKey` on `POST /api/clients/:id/onboarding`).

## API

| Route | Auth | Action |
| --- | --- | --- |
| `GET /api/clients/:id/onboarding` | operator | Latest form status + URL |
| `POST /api/clients/:id/onboarding` | operator | Create form + return URL |
| `GET /api/onboarding/:token` | public (rate limited) | Pack + saved answers |
| `PATCH /api/onboarding/:token` | public (rate limited) | Autosave answers |
| `POST /api/onboarding/:token` | public (rate limited) | Validate + submit pipeline |

## Env

| Variable | Use |
| --- | --- |
| `APP_ORIGIN` or `NEXT_PUBLIC_APP_ORIGIN` | Link host in operator copy |
| `BOOKING_GRANT_EMAIL` | Calendar share instructions |
| `SUPABASE_SERVICE_ROLE_KEY` | Public route writes after token check |
| QBO vars | Install invoice on submit when connected |

## Migration

`supabase/migrations/0058_compass_onboarding_forms.sql` — table + operator RLS + service role grant. No anon grants.

## Tests

```bash
npm run test -- test/onboarding.test.mjs
```
