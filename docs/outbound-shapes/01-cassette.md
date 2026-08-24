# Shape 1: Cassette

## Idea

The week is a row of bays, not an hour grid. A bay is a launch. Time of day is a default (Sydney 9:00), not a planning act. Bay count follows cadence target when set; otherwise show filled bays plus one empty “add” bay.

## Route

`/sales/outbound/mock/cassette`

Component: `src/components/outbound/mock/CassettePreview.tsx`

## Layout

1. Header: title Cassette, cadence control, week prev/next, Today
2. One horizontal row of bays for the visible week (Mon–Sun is wrong; use launch index 1..N)
3. Under the row: inventory pool (90-day gray cards + fresh runway) to drag onto an empty bay
4. Click a filled bay: existing CampaignReviewModal or a compact facts strip (offer, leads, openers, Instantly)

## Bay

Filled: campaign name, trade, offer, cohort count, readiness (ready / blocked). Blocked = gray.

Empty: dashed `compass-panel`, drop target. Click opens slot composer or places the top rec.

N = `target` if set, else `max(filled, 1)`. If `cap` is set, do not render more empty bays than `cap - filled`.

## Data

Campaigns in the visible week: `go_live_at` (fallback `start_date`) inside that Monday–Sunday. Sort by go live. Map onto bays in order. Extra campaigns beyond N still list under “Overflow” so leftover planned cards cannot hide.

## Drag

Same `INVENTORY_DRAG_MIME` / `placeInventoryCard` as the live rail. Drop onto empty bay → `go_live_at` for that week’s next open Sydney 9:00 slot.

## Do not

Do not render hour rows. Do not add month/year cassette. Do not show “3–5”.
