# Outbound shape previews

Coded previews so Jules can pick a landing. Do not replace `/sales/outbound`. Do not restyle Compass.

## Cadence (all four)

Weekly launch count is a preference, not a constant. No `3–5` copy. No `QUEUE_WEEK_SLOT_MIN/MAX` in the preview UI.

Shared helper: `src/lib/outbound-cadence.ts` plus `src/components/outbound/CadenceControl.tsx`.

- `target`: number or null (how many launches he wants this week)
- `cap`: number or null (optional ceiling)
- Persist in `localStorage` key `compass.outbound.cadence.v1`
- Recs use target/cap when set. If both null, rank inventory with no “week full” from a magic number
- Wave size 50 and recontact floor 30 stay (those are cohort rules, not cadence)

## Routes

Index: `/sales/outbound/mock`

| Shape | Path |
| --- | --- |
| Cassette | `/sales/outbound/mock/cassette` |
| Runway | `/sales/outbound/mock/runway` |
| Factory | `/sales/outbound/mock/factory` |
| Two clocks | `/sales/outbound/mock/clocks` |

Each page: `OperatorShell width="full"`, back link to the index, `CadenceControl` in the header.

## Data

Live reads only:

- `GET /api/campaigns`
- `GET /api/campaigns/queue`

Mutations may reuse `POST /api/campaigns/queue` (promote/schedule) and campaign PATCH. Do not add Instantly activate.

## UI lock

`Card` / `compass-panel`, `rounded-2xl` surfaces, `rounded-xl` controls, `shadow-soft`, Geist, orange only for CTA/active. See `.cursor/rules/compass-ui-lock.mdc`.

## Out of scope

Changing nav. Replacing the live calendar. Year/quarter grains. Agent prose recs. New themes.
