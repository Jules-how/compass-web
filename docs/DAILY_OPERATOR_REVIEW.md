# Daily operator prompt review — 8 September 2026

The old prompt is a useful morning triage routine. It is not yet a sufficient specification for the outbound optimisation and business oversight Jules described. Keep the brief/Waves entry point, targeted sync, AI/Jules ownership split and draft-only boundary. Replace the automatic reply thresholds, incomplete data assumptions and narrow learning loop.

Replacement: [DAILY_OPERATOR_PROMPT.md](DAILY_OPERATOR_PROMPT.md). This review and replacement do not alter the existing Cursor schedule or install a second scheduler.

## Evidence from the live system and code

| Finding | Evidence checked | Consequence |
| --- | --- | --- |
| The brief is not complete business coverage. | `agent-brief.ts` caps pipeline rows at 12 and Instantly rows at five; tasks, projects, client issues and mailbox assignments are absent. The live brief called its 12 returned rows `activeCampaigns`, despite cancelled records among them. | Use it as an index. Fix count semantics and provide compact business coverage with explicit totals/truncation. |
| Meetings can be overstated. | `instantly.ts` `buildColdEmailGlance` falls back from booked meetings to interested leads and opportunities; per-campaign `meetings` uses opportunities. | Never treat these fallbacks as booked meetings. Correct the mapping before using the dashboard for meeting optimisation. |
| A platform failure can resemble no campaigns. | Waves GET starts with an empty board and swallows `InstantlyApiError` without returning platform failure status. | Add explicit live/stale/unavailable status and error metadata; never recommend a new launch because a failed fetch looks empty. |
| Demo clients exist in business views. | `/api/agent/cs` returned `source: demo`, five demo clients and two at-risk clients. The standard client list also contained the five `cs-demo-*` rows alongside Kleanly and Ready Builders. | Exclude demo records from decisions and business totals. An overall `ok: true` is insufficient. |
| Capacity is shared, not additive per campaign. | Full Instantly pagination returned 13 connected accounts with configured limits totalling 350/day. The only active campaign, Perth Electrical, has a 180/day campaign limit and uses six accounts whose limits sum to 180. Melbourne Plumber draft uses the same six. Seven accounts totalling 170/day are unassigned to an active campaign. | These are configured ceilings, not proven free capacity. Account for follow-ups, health, reserve status, schedules and ramp before allocating more volume. |
| Yesterday's stale blockers survived into today's recommendation. | The 8 September Waves recommendation still said Apify was over the approved cap and Melbourne Plumber needed preparation, despite the approved US$65 limit and 655-lead draft upload. | Reconcile recommendations against current facts and completion receipts; never blindly carry blockers forward. |
| The useful prose was absent from recent persisted scans. | Recent 6–8 September `scan` records exposed basic campaign/volume keys, with no `writeup`; live `morningWave.writeup` was null. | Explicitly write and read back `scan.writeup`, not just a long recommendation string. This observation does not prove which writer omitted it. |
| Task deduplication is limited to one day. | `home-setup-server.ts` looks up markers prefixed with today's date and derives identity from the title. | A recurring prompt can create a fresh copy tomorrow. Check all open tasks first; use persistent work IDs in a later API improvement. |
| General business records lack enough scheduling detail. | Four top-level tasks had no due dates or project links. Four projects had no target dates and zero associated task counts. | The agent cannot infer the true delivery schedule from these records. Reconcile with calendar/client communications and identify the specific missing commitments. |
| The current local Compass MCP is narrow. | Tool inventory contains brief, campaigns, lead operations, copy and land; no general task/project/client reader, Waves writer or research access. Those surfaces partly exist as HTTP/UI. | The screenshot's integrations are suitable foundations, but tool names do not guarantee all required methods. Add focused MCP access rather than scraping the full UI every morning. |

Live observations were taken around 11:00–11:05 Australia/Sydney on 8 September. They are dated observations, not permanent business facts. Snapshot evidence is in `/tmp/compass-oversight-*.json`; do not use those files as tomorrow's current state.

## Decision gaps in the old prompt

1. **Wrong optimisation signal.** Total reply rate includes rejection and can use total messages rather than unique prospects. Five percent replies can be poor acquisition; a lower reply rate can yield better qualified meetings. Distinguish positive, qualified, booked, held and won outcomes.
2. **Premature decisions.** Fixed cutoffs ignore follow-ups, response lag, sample size and segment. A zero after 100 messages is not a reliable diagnosis of bad copy; zero after 1,000 can still reflect mailbox failure or repeated touches. Investigate the mechanism and predeclare experiment review conditions.
3. **No next-campaign selection method.** The old prompt reacts to existing campaigns. It does not compare candidate segments, inspect reusable inventory, match the offer to published signals, budget preparation or reserve sender capacity.
4. **No clear execution contract.** AI-led could mean recommend, draft or perform a paid action. The replacement identifies allowed preparation, cost boundaries, draft/upload receipts and actions that remain Jules' decisions.
5. **Short memory horizon.** Yesterday's hypothesis/miss misses multiweek experiments and historical segment/offer outcomes. Preserve the full experiment lifecycle in Compass and retrieve relevant history selectively.
6. **Knowledge is disconnected.** Memories alone does not expose the transcript corpus. The replacement points to the existing research index and distillations, separates evidence from creator opinion, and limits external research to useful, attributable additions.
7. **Three plans can become three piles of work.** The new version makes one brief with three sections, ranks the business bottleneck and carries forward only work that still matters.
8. **No failure or rerun semantics.** Without source-level freshness, coverage and write receipts, the agent can report false zeros, duplicate tasks or repeat paid uploads. The revised prompt handles partial visibility and resumable execution.

## Tool setup

The supplied screenshot shows Open Pull Request, Memories, Gmail, Google Calendar, Instantly and compass, with `cursor-grok-4.6-low` selected. This is historical configuration evidence, not proof of current permissions or tool methods. Model choice alone is not a diagnosis of the failures above.

Keep Compass, Instantly, Gmail and Calendar. Keep local repository/research access, or a connected Drive route to the same corpus when running in the cloud. Web/search access is needed only for the optional external learning pass. Memories is optional when experiment history is recorded properly in Compass. Open Pull Request supports proposed software fixes; it is not necessary to produce a morning brief.

Before switching schedules, ensure one writer owns the daily brief. Retire or pause the old Cursor intelligence automation when the replacement takes over; the existing nightly data-sync job is a separate responsibility. Validate the replacement by running it on live data and re-reading its saved Compass output. A prompt file alone does not establish an unattended operational handover.

## Smallest worthwhile Compass changes

1. Correct the meeting mapping, active-campaign count, demo exclusion and explicit source failures. These affect decisions now.
2. Expose paginated task/project/client issue reads and Waves/offer/experiment operations through the existing agent bridge. Preserve source timestamps, totals and truncation indicators.
3. Add an outbound readiness/capacity summary that uses the same eligibility rules as the mill and separates confirmed-valid, catch-all, unknown/error, draft-loaded and actually contacted. Return unknown queue capacity honestly.
4. Give recurring work a stable ID and persist versioned experiment/copy observations so reruns and day-to-day comparisons are reliable.

Prefer these focused changes over a new planner UI, another lead database, a vector database for the whole corpus or a separate multi-agent system. Use the existing Compass records and research structure first.
