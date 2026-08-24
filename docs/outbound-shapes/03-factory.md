# Shape 3: Wave factory

## Idea

Landing is readiness, not time. Columns are blockers. Each card is one wave (a Compass campaign). Date is a field on the card.

## Route

`/sales/outbound/mock/factory`

Component: `src/components/outbound/mock/FactoryPreview.tsx`

## Columns

Use `campaignReadiness` plus status:

1. Needs list (`no leads` or thin cohort)
2. Needs openers (cohort present, first lines missing) — use `wave_opener_count` vs cohort when present
3. Needs copy (`no copy` / `copy in draft`)
4. Needs bind (`not bound`)
5. Signed off (ready, not live)
6. Live (`status === 'active'` or copy live + bound)
7. Cooling (completed / recently sent; optional, can hide if empty)

A campaign sits in the leftmost matching column. Do not duplicate cards.

## Card

Name, trade, offer, go live as text, cohort, one blocker line. Click opens CampaignReviewModal.

Header: cadence control plus counts per column. No hour calendar.

## Inventory

A thin strip above the board: promotable 90-day groups with `Promote`. That creates a planned campaign (existing queue POST) which then appears in Needs copy / Needs bind / etc.

## Do not

Do not make this a full Linear clone (priorities, health, members). Do not add a calendar. Do not print “3–5”. Treat cadence only as a header signal (under target / over cap), not as column structure.
