# Shape 4: Two clocks

## Idea

Launch time and work time are different. Top: this week’s launches (cassette bays, not hour grid). Bottom: work still owed on those launches (list, openers, copy, bind).

## Route

`/sales/outbound/mock/clocks`

Component: `src/components/outbound/mock/ClocksPreview.tsx`

## Layout

Split, but not 50/50 calendar. Top is a short bay row (same rules as Cassette, shorter). Bottom is a work list for the visible week.

Cadence control in the header.

## Work list rows

One row per dated campaign this week, plus recs that would fill toward target.

Columns: campaign or rec name, trade, offer, checklist chips (list / openers / copy / bind), primary action.

Primary action is the first failing check: attach leads, review openers (open CampaignReviewModal), open editor, bind (link to campaign page Instantly panel). Do not invent a new bind flow.

Empty top bays show in the work list as `Fill this bay` using the same ranked inventory as the live rail, with prefs instead of 3/5.

## Do not

Do not use a Google Calendar week grid on the top half. Do not dump Workshop / library / experiments into the bottom. Do not print “3–5”.
