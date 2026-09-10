# Outbound rhythm — release and operating handover

10 September 2026. Product changes deployed to https://compass-web-eosin.vercel.app/sales/outbound/rhythm from commits f984162 and e9726e8. Final CLI production deployment: https://compass-gt25f39h8-jules-4233s-projects.vercel.app.

## Delivered

- Published phone-only contacts use the existing ledger and retain stable IDs when enriched. The city pipeline has a calling handoff with API receipts and readback. No placeholder email is required.
- Lead detail captures outcomes, notes, person reached and a scheduled, closed or unresolved next step. Callbacks reuse shared Tasks, preserve prospect timezone and require explicit completion. Conflicting edits and repeated submissions are checked atomically.
- Today, Next seven days, Ready queue and Weekly review are linked from Outbound and Home. Workload defaults remain proposals until confirmed. Selected prospects can be removed once their actions are closed.
- Email events are deduplicated and ordered; late sends cannot regress replies, late opt-outs are honoured, campaign bindings remain intact. Planned next actions do not count as actual calls. Provider schedules remain explicitly unknown when unavailable.
- Reporting distinguishes calls, office and decision-maker conversations, meetings booked/held, provider sends/replies, recorded work time and first-invoice payment receipts. Commercial totals are whole-business records, not cohort-attributed revenue.

## Verification

- Ten focused tests pass, including actual PostgreSQL-compatible migration execution, permissions, atomic callback saves, retries, conflicting edits, channel restrictions, provider ordering, phone identity and Perth/Sydney timezone handling.
- Deploy guards, TypeScript checks and production builds passed. Existing repository lint warnings remain. The entire repository test suite is not claimed green: a pre-existing source-pattern check in lead-commit.test.mjs expects an obsolete helper; the new phone identity test executes the real module.
- Signed-in production UI: created a clearly labelled synthetic phone-only contact; logged one synthetic conversation with an accepted 16:40 Perth callback; reloaded and found exactly one action in Today, Upcoming and shared Tasks. Completed it through Tasks and verified the exact UTC instant survived. No real person was contacted.
- QA cleanup verified via the agent API: one historical test touch, one completed test task, archived contact, removed from selected cohort, no test counts in the active weekly report.
- Anonymous agent/operator rhythm requests return 401. Mobile review at 390px had no horizontal overflow. Weekly review rendered with its coverage limitations.
- Schema migrations applied: 20260910083241, 20260910083841, 20260910084156.

## Initial operating state

The exact 40 members of `Sydney HVAC | Ads + booking | 40 | 10 Sep` (Instantly ID 4faadbb5-133c-4a65-8668-f1c1e6f405a4) are selected for rhythm visibility. Readback confirmed 40 selected, zero new tasks and zero first-call candidates. Existing suppression was preserved. Selection did not send, schedule or activate anything.

The handwritten Perth calls have not been transcribed into factual outcomes or invented callback dates. Match each actual company, log the real result and agreed time, or leave the next step unresolved. Add reviewed calling candidates from the existing ledger or the published-phone form. The ready queue requires confirmed fit, a usable phone, timezone and eligible contact history.

## Five-day operating trial — still to run

Each selling day: open Today, resolve due commitments and replies, work prepared prospects, save each actual outcome and next action, record selling/preparation/system time, and check tomorrow's workload. At the weekly review, inspect missed callbacks, unresolved next steps, capture effort and buyer conversations before changing the offer or adding software.

This deployment is not evidence of five days of usage, higher conversion, complete historical provider coverage, or new revenue. Actual automated email times remain in Instantly. No paid sourcing run, outreach activation, business task completion or calendar change was performed by this implementation.
