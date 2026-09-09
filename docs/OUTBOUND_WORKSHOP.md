# Ads + booking outbound workshop

The single active offer is **Ads + booking**, stable key `installation-booking`. The readable source is `switchflow-offer/installation-booking.md` in the Switchflow workspace; the tracked companion is `workers/outbound/switchflow-offer/installation-booking.md`. Compass's offer desk carries the same targeting and operational identity. Earlier offers and the earlier existing-enquiry-only contract are historical.

## Jules' workflow

Open **Outbound → Notebook**. Select the campaign and write the audience, list criteria, angle, follow-up plan and test. This uses the existing Planning note store, with revision checks and a link to the campaign. Save the page; unsaved text is retained in the same browser session when navigating away. Notes do not silently create tasks, schedule touches or change campaign settings.

**Signals, list and output** opens the campaign Prepare tab. Under **Signals, openers and send settings**, add and order signal rules. Each has an evidence field, optional contains condition, editable opener and optional subject override. The first valid match wins. Define a factual fallback, default subject and whether to use an evidenced person name. The complete email sequence stays in the campaign's Copy editor; use `{{subject}}` to consume the chosen subject and `{{personalization}}` for its opener.

Rules use `{company}`, `{service}`, `{service_area}`, `{signal}` or another named evidence field. Every sourced value needs an exact supporting quote, URL and observed timestamp. Ambiguous/conflicting evidence is unavailable. An optional missing signal falls back; a missing required fact or referenced variable holds the row. Rules and source changes invalidate prior preparations and reviews.

**Input list** accepts a CSV of up to 200 rows; agents process larger files in batches. Standard company/website/email aliases are mapped. Original columns are retained. The `evidence`, `verification`, `contact_basis`, and optional `geography_review` columns contain JSON. A column named `verified_email` is not verification proof. No invented contacts or automatic paid scrape occurs on upload. Research and the local worker execute separately; the page labels that waiting state explicitly.

For a researched CSV:

```sh
python3 cold-email/outbound_worker.py --campaign CELL --input-csv RESEARCHED.csv --output-dir JOB_OUTPUT
```

The worker retains each batch, claims its frozen configuration, runs the existing opener engine and reads the persisted output back from Compass. The output folder contains a review CSV, exact batch JSON and a receipt with input/output counts, source hash and preparation versions. Every row is accounted for as ready, held or excluded. Rerunning identical input/configuration reuses the same run. A review CSV is not an Instantly-approved upload.

The UI shows each company's selected signal, verification category, source evidence, opener and both emails. Download all output and hold reasons at any time. Human approval, paused Instantly import and exact recipient reconciliation retain their existing controls. Campaign activation remains Jules' action.

**Research library** provides searchable, dated workspace research snapshots. **Copy and elements** opens the existing editable library; **Lead data and lists** opens the canonical CRM. Research is labelled reference material, not active offer policy.

## Follow-up recommendation

Keep one next action for each selected lead in the existing task list, linked to the account/campaign: channel, due time, reason, owner and last outcome. A reply stops the cold sequence; opt-outs stop outreach; an agreed callback outranks generic cadence. Use selected high-value calls. Text/social need suitable context and contact basis. The notebook is the plan; a note date is not a live reminder or message schedule. A complete multichannel scheduler is not implemented by this change.

## Source freshness and acceptance

The 340 retained Sydney rows contain provider refresh timestamps from 22 February–14 September 2025. The local sendable/unsendable files were modified 2 September 2026; Compass retained the originals 9 September 2026. Modification/import is not original collection time, which remains unverified. They need current research and recorded verification/eligibility checks before contact. Do not count original rows and their researched revisions as additional companies.

The current sequence plans a four-business-day follow-up. Instantly's existing mapping uses calendar-day waits; the saved four-day interval is not proof of four business days. Verify the concrete launch schedule before activation.

The changed engine has cross-language tests covering ordered signals, fallback, changed output, missing variables, evidence conflicts, suburb review, CSV escaping and row accounting. Deployment and real output readback are recorded separately from these tests. No measured reply or conversion claim follows from technical acceptance.
