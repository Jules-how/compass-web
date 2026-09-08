# Morning operator pilot: measurement contract

Pilot: five weekday morning reviews, beginning 9 September 2026. Save each review in Compass Goals & notes → Agent runs. Use a stable run ID per business date and retry that ID; same-day retries do not count as new pilot days. Review the pilot after its fifth morning before expanding execution. The previous three integration checks are baseline system checks, not pilot days.

## Record per run

- Business date, observed start and finish timestamps; work started/finished timestamps for each material preparation. End-to-end elapsed time includes waiting. Report waiting for Jules or an external service separately; never subtract an estimate silently.
- Sources checked with timestamps and reporting windows: Compass goals, offer, Waves, lead ledger, tasks/projects, replies and calendar. Label each current, stale, failed or not checked. Explain any decision affected by a missing input. Count coverage only against sources relevant to that run.
- Planned AI actions; attempted actions; destination-verified outputs by work type; work blocked before execution and why. A queued request is not a completed action. Record retries and recurring failure categories. Never count the same campaign output twice across runs.
- Jules review/preparation/rework minutes from his confirmed records only. Calendar time is planned, not actual. Agent elapsed time and billed model/tool spend remain separate; unknown time/cost is unavailable, not zero.
- Exact output IDs and review status: prepared, technically verified, awaiting Jules, accepted without material change, revised or rejected. Only Jules can establish his acceptance. Fixing a program is not a reviewed campaign. Keep outputs of different types separate.
- New information or correction from Jules and any changed recommendation. A phone/text update can supersede an older email; do not automatically recreate a completed or waiting task.
- Primary business hypothesis, chosen outcome, cohort/copy version, review date/window, evidence and maturity: not executed, running, too early, inconclusive, supported or contradicted. Delivery completion and experiment outcome are different.

## Measures and denominators

1. Execution reliability = destination-verified completed actions / attempted actions. Report counts and exclusions; blocked before attempt is a separate count, not a hidden success. A failed attempt followed by a successful retry is recorded as recovered, not first-pass success.
2. First-pass acceptance = outputs Jules accepts without material revision / outputs Jules has reviewed. Waiting for review stays pending. Define material change as changing audience, offer, claim, facts, required settings or delivery behavior; punctuation edits do not equal a failed campaign.
3. Velocity = median end-to-end time from a fixed preparation brief to a reviewed-ready campaign, compared across like-for-like scope. Also show Jules' human minutes per accepted campaign or per 100 unique eligible researched contacts; do not compare raw scrape rows to fully reviewed leads.
4. Cost = actual paid tool/model cost per verified eligible contact and per reviewed campaign, with currency, covered costs and missing costs explicit. Human effort is separate or priced using Jules' explicit assumption. Reused subscriptions are not automatically zero cost.
5. Rework = actual rework minutes and incidents by cause (targeting, mapping, personalisation, verification, settings, access, stale context). Compounding improvement means lower observed effort/error on later comparable runs, not more agents built or speculative hours saved.
6. Business results = unique positive conversations → qualified screens → booked → held meetings → signed → paid clients; active MRR and cleared cash separately. Rates use unique relevant delivered contacts and named outcome windows. OOO, auto-replies and unsubscribes are not positive conversations. Include ad hoc phone outcomes only with evidence; no attribution from timing alone.

No blended productivity score. No generic meeting guarantee or arbitrary reply threshold proves the offer. The first five runs establish a baseline; they do not prove statistical significance. Inspect any invented fact, ignored opt-out, unauthorised send/spend, duplicate charge or falsely reported completion immediately. Stop the affected operation while correcting the cause; keep independent safe work moving.

## Pilot review

Report actual counts, missing measurements and the most expensive recurring bottleneck. State whether a campaign reached reviewed-ready status and how much Jules had to repair. Recommend one improvement supported by observed effort and expected near-term reuse. If no comparable campaign completed or human time was not captured, say there is no evidence of faster execution yet.
