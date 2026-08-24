# Shape 2: Runway board

## Idea

The desk is the trade, not the date. Rows = verticals. Time is a consequence of picking a row. One trade per campaign is a row rule.

## Route

`/sales/outbound/mock/runway`

Component: `src/components/outbound/mock/RunwayPreview.tsx`

## Layout

1. Header: title Runway, cadence control, one line `{n} dated this week` (plus under target / over cap if prefs set)
2. Table or stacked cards, one row per vertical from queue `runway` merged with `recontactPool`
3. Right or bottom: this week’s dated campaigns as a compact list (not a calendar)

## Row columns

- Vertical
- Sendable (uncontacted)
- Waves left (`floor(sendable / 50)`)
- Ready 90-day (count, city if one city dominates)
- Last go live (from campaigns tagged with that vertical)
- This week? yes/no (already has a dated campaign this week)

Row action: `Stamp a wave` → schedule or promote onto the next open weekday. Disable if this week already has that vertical. If `cap` is set and this week is at cap, stamp into next week.

Gray the 90-day number until count ≥ 30. At 30+, it is a first-class action (promote), not a calendar ghost.

## Sort

Default: 90-day ready desc, then sendable desc. Rows with zero sendable and zero ready sink.

## Do not

Do not put a week grid on this page. A dated list of this week is enough. Do not print “3–5”.
