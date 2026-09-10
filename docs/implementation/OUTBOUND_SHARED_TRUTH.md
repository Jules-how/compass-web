# Shared outbound truth and next actions

Requested by Jules on 10 September 2026 in Assess acquisition machine.

## Outcome

Opening Compass Outbound or asking an agent must return the same observed campaign
state, preparation records, recorded activity, unresolved gaps and recommended next
actions. The shared operating service being built in Prepare outbound targeting owns
provider snapshots, prepared-batch registration and accepted daily task order.
This implementation adds the outbound view over those records; no second ledger.

## Build sequence

1. Add a pure outbound projection with explicit observation times and unknown/stale
   states. Campaign planning status never substitutes for provider status. Missing
   analytics stay unknown. Prepared and loaded recipients remain distinct, deduplicated
   by exact lead ID within each stage; overlapping stages are disclosed.
2. Add one server loader shared by operator and authenticated agent routes. Refresh
   old provider observations using the existing operating refresh, with bounded retry
   and a visible failure. Read calls, commitments and preparation from Compass.
3. Calculate yesterday and today from Australia/Sydney calendar boundaries including
   DST. Report recorded events and exact coverage, not an invented full history.
   Preserve due commitments and proposed work as separate states. Do not infer calls,
   replies, scheduled sends, permission, conversion or revenue.
4. Derive recommendations with stable source IDs and reasons: due promises, replies,
   unresolved outcomes, review existing preparation, call eligible selected accounts,
   review follow-up where actual contact history supports it, then supply planning.
   Existing accepted task order stays intact; recommendations do not create tasks or
   send messages. Geographic options are proposals with stated evidence gaps.
5. Make Overview the default Outbound view. Keep notebook, campaigns and calls
   reachable. Show status/freshness, yesterday/today and the queue, with record links.
   Refresh on activation/visible polling and write events; preserve previous data on
   failure. Use the same endpoint for Home outbound guidance and MCP.
6. Test actual production projection and route boundaries with fake external sources:
   pause retaining sends, missing analytics, prepared/loaded overlap, stale/error
   refresh, no false zero, due/future callbacks, suppressed contacts, repeat records,
   Australian midnight/DST, accepted order, and UI error recovery. Run repository
   checks and coordinate one integrated release with the operating-service owner.

## Acceptance

- Sydney reads paused with 40 sent; it is never offered a blind restart.
- Perth prepared and loaded batches stay distinct and link to the actual review.
- Calls and promises appear immediately after capture. Missing captures are unknown.
- Yesterday counts reflect recorded event timestamps, never current aggregate totals.
- Opening Outbound and reading /api/agent/outbound/overview share the same projection.
- Provider failure shows last good evidence and the failed observation, never 'live now'.
- No campaign activation, prospect message, invented outcome or schedule change.

## Dependencies and delivery

Uses operating-server.ts and its migration, owned by the concurrent operating-service
build. This task owns outbound-overview-* modules, routes, UI, MCP bridge and tests.
Implementation in progress; deployment and production verification will be recorded
here with actual evidence. No claim of perfect or unattended operation from tests alone.
