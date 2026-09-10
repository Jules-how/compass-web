# Cold email

Current ICP: [Ads + booking](../switchflow-offer/installation-booking.md), key installation-booking. Jules broadened targeting on 10 September 2026 to established Australian air-conditioning installers. Residential, commercial, mixed electrical/HVAC and plumbing/AC businesses qualify; ordinary single split-system installation qualifies too. Ducted reverse-cycle is the priority. The contract supersedes the old residential-only, Sydney-only and explicit-independence gates.

## Operating path

1. Jules selects a city/area. Record boundary, timezone, run budget and stable body variant.
2. Vortex collects business listings and available website contacts. No pre-scrape deduplication project or mandatory inventory audit.
3. Reuse returned facts and cached pages. Concurrent HTTP-to-text extraction collects service evidence, contacts and signals together; Parallel Extract handles failed/insufficient pages.
4. Assess each business once. High fit plus published email goes to Million Verifier through Apify. High fit without a valid email plus a phone goes to the cold-call-fit CSV. Retain unresolved/non-fit rows with reasons.
5. Use Compass's writing process for a personalised subject and relevant opener from the evidence. Freeze the remaining body and follow-up within the named variant.
6. Jules reviews exact recipients, openers and counts. One review, not approval rounds for internal stages.
7. Upload the finished CSV into a paused Instantly campaign via Chrome, configure the reviewed settings, and read back every recipient and merge value. Activate only on Jules' instruction.

Owners: [list building](list-builds/AGENT.md), [subjects/openers](openers/AGENT.md), [stable copy](email-copy/AGENT.md), [Instantly loading](../.agents/skills/instantly-load/SKILL.md).

## Keep it efficient

- Use existing worker/extraction tools. One resumable run folder, one research result per source business row, one reviewed export. Compass owns leads/copy; files retain raw evidence, call list and receipts. No extra platform, agent framework or database.
- No fuzzy matching, parent-tree investigation or cross-run deduplication phase. Reuse exact cached URLs automatically. Before verification/upload, check repeated email addresses, suppression and actual prior sends once. An unsent campaign assignment is not outreach; resolve known competing reservations separately.
- Completed batches continue while exceptions wait. One fallback extraction attempt per business; one published alternative email when useful; retry transient failures once. Do not rerun whole cohorts or regenerate acceptable copy.
- Research only facts needed for fit, contacts or a useful commercial connection. No paid reviews/photos/full Maps details, broad ad research or compulsory ARC/dealer checks.
- Reuse recent unchanged verification. Valid-only email is the default; catch-all/unknown/error are not valid. Preserve every excluded/pending row.
- Keep budgets and receipts with the run. Report listings, assessed business rows, fit rows, valid addresses, callable rows and uploads separately. Without identity consolidation, do not call listing counts a census of unique companies.

## Implementation status

The local city pipeline is implemented in `outbound_pipeline.py` through `outbound_worker.py --pipeline`. Use [PIPELINE.md](PIPELINE.md) for the tested model/connector handoffs, limits and exact restart command. The 10-company Perth proof produced five valid email contacts and five call-list companies. The Australian evidence-draft preparation policy is deployed. The subsequent 50-record and fresh ten-record tests are documented in their job folders; live-model speed is improved, but first-pass copy quality remains below the acceptance target. Human review and Instantly import/launch remain separate. Legacy inventory-first and narrow-name filters do not govern this pipeline.

Historical data/campaigns keep their identity. A targeting-document update does not authorise campaign changes. Keep at least two days between emails. After authorised execution, sync actual replies, opt-outs, bounces, meetings and outcomes through Compass's API. Compare one named copy change at a time, retaining signal type. Uploads, active status and opens do not prove commercial success.
