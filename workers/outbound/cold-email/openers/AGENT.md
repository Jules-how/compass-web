# Openers & Subjects

Fill slots from the row. Do not freewrite. Do not requalify the list.

**One production engine.** `generate_openers.py` is the live opener script. Do not write `generate_{trade}_{city}_openers.py`. The v2 trial packer is merged (site-extract `specialty` / `services` column order now wins over the Maps blob) and archived under `_archive/v2/`. Do not write Python or CSVs to the switchflow-os root or to this folder top. Broker and reactivation one-offs live in `_archive/`.

Sentences and tier order live in `generate_openers.py`. Readable copy: `generate_openers.md`. Do not quote those lines here.

Load the relevance spec and opener waterfall from the offer Jules named (default: `switchflow-offer/installation-booking.md`). Facts come from the row. If a required slot is empty and Jules asked, use the `icp-research` skill.

Pull input from `../list-builds/out/{trade}/`. Do not copy lists into `in/`. The sendable sheet must already have `verified_email` plus a recorded `email_status` / Compass `email_verify_status` (promote after site extract + verify). This job refuses a sheet that still uses `Email`. Rows with no usable address go to the opener unsendable file.

For an installation-booking preparation, run `../outbound_worker.py --campaign <cell-id> --run <run-id>`. It calls this engine’s `render_preparation_ticket` with Compass’s frozen recipe and quoted facts, and submits the full rendered emails. Missing facts produce a hold; no legacy fallback applies.

For historical campaigns, if Compass has a pathway for this trade/list, GET `/api/agent/outbound/pathway` and keep generating with this script (one engine). After commit, Jules edits templates and siblings on the Pathways desk. Do not rewrite this `.py` from a Compass overlay.

Run:

```
python3 generate_openers.py --trade {trade} --city {city}
```

Write only `out/{trade}/{trade}-{city}-sendable-{YYYYMMDD}.csv` and `-unsendable-{YYYYMMDD}.csv`.

Retention: keep source rows, evidence and receipts. The engine no longer removes staging, pipeline or quarantine files. Preparation source and output are immutable Compass records; CSV is transport.

Named rows: opener is one line, `Hi {firstName}, saw …`. Unnamed rows: `firstName` blank, opener starts at `Saw`. Never write `there`. Never write `{shop} team`. Instantly email 1 starts with `{{personalization}}`, so a campaign-level `Hi {{firstName}},` would turn a blank name into `Hi ,`.

---

## Field mapping

Read input columns dynamically. Origami Title Case (`Business Name`, `Raw Data`, `First Name`, `Hours Claim`, `Review Count`, `Suburb`) maps to snake_case. The live address column is `verified_email`. Also `business_name`/`company`/`company_name`/`title`, `suburb`/`city`, `hours_claim`, `paid_demand`, `services`, `specialty`, `trade`, `review_count`, `website`/`website_url`, `raw_data`. Apify `status`/`valid`/`accept_all` folds to `email_status`. A lead status like `interested` does not.

Uses Paid Demand → Specialty → Fallback. Specialty is detected column-first: the site-extract `specialty` then `services` cells in the shop's own order, then saved Compass specialty facts, then the Maps blob as fallback. Specialty keywords, shop-sign tails, identity, and the campaign trade noun come from `switchflow-offer/verticals/` for that `--trade`. No Hipages and no specialty still gets a trade-noun opener.


- **firstName:** Real person/owner in `staffs`, `first_name`, or lead data → first token only (`Trent Goetze` → `Trent`). Slogan copy (`Australian owned`, `Your local`), placeholders, or the first word of the shop sign → blank. Opener starts at `Saw`.
- **company:** Casualise the shop sign (`All Kind Gas & Plumbing Brisbane` → `All Kind`, `WPS PLUMBING & LEAK DETECTION` → `WPS`). Strip legal suffixes: `Pty Ltd`, `P/L`, `Services`, `Co`, `Group`, `Specialists`, `Contractors`, trailing city, plus shop-sign tails from the vertical files. If the sign is a person’s name, second person (`you`), not the company name.
- **suburb:** Micro suburb over metro (`Cleveland` over `Brisbane`, `Gold Coast`).
- **trade:** Natural noun from that vertical’s Campaign trade noun line. Never the appliance.

Waterfall: first matching tier in the script wins. Subjects lowercase. Do not invent a close time. Family / since 19xx is not a tier in the script.

---

## Output

1. **Sendable** `out/{trade}/{trade}-{city}-sendable-{YYYYMMDD}.csv`: keepable inbox (`ok`, `catch_all`, `unknown`, `error`; quality `good`/`risky`). Missing status is pending, even if the column is called verified_email or quality is good. Archived, no-recontact, suppressed, ICP-skipped, held-for-review, and existing non-uncontacted outreach states are excluded. Duplicate inboxes go to unsendable. Columns: `firstName`, `subject`, `opener`, `Opener`, `companyShort`, `service`, then original lead columns (`raw_data` last). Instantly: `{{Opener}}`, `{{companyShort}}`, `{{service}}`, `{{suburb}}`.
2. **Unsendable** `…-unsendable-{YYYYMMDD}.csv`: missing, pending or invalid/bad email, prior outreach, or duplicate inbox. Keep the row. Label why. No paid demand and no specialty still gets the fallback opener.

Before save: unnamed openers do not start `Hey` or `Hello`. Named openers are one line `Hi {firstName}, saw …`. Every opener is 1–2 complete sentences ending `.` or `?`. No guessed hours. No leftover `{tags}` or empty slots.
