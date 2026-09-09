# Cold email

Current offer: `installation-booking`, owned by `switchflow-offer/installation-booking.md`. Ads plus booking: focused Google Search plus qualification and booked quote appointments for Sydney residential ducted installations/replacements. Compass owns the ledger and campaign copy. Historical trades campaigns keep their identity and outcomes; do not use them as defaults for the new direction. Activate Instantly only when Jules says go.

## Start here

1. Verify the selected cell belongs to the current `installation-booking` offer. Do not prepare a legacy refill merely because it appears next in an old Wave. `python3 factory_job.py` resolves the next Compass cell (brief `morningWave.activeNext` / `proposedNext`). Jules overrides with `--trade {trade} --city {city}` or `--campaign {id}`. Stdout is the job: cell, copy pointer, Instantly preset, Vortex payload, cohort inventory.
2. Exit 2: refill. Page the cohort URL it prints and skip Vortex. Inventory is not proof of verification: verify missing results, preserve outreach exclusions, then openers.
3. Exit 5: research existing unassigned trade inventory first. Preserve companies without email and verify geography, service fit and outreach history before attaching them. No paid scrape.
4. Exit 0: discovery candidate only after no reusable inventory remains; check budget and actor access before scraping. Run the Vortex payload it prints, then the mill below.
5. Exit 3: missing/current-offer mismatch. Correct the cell or contract; do not fall back to a retired offer.

## Mill

`list-builds/AGENT.md` owns the walk: filter ICP first, site extract then verify on keepers, `mark_verified_email.py`, Compass `commit` (a gate, never skipped), then `openers/AGENT.md` (`generate_openers.py`, no new `.py` per list). Retain the source discovery rows, evidence, exclusions and output receipts. Filtering does not delete staging or another run’s files.

## Copy and load

Copy: the current installation-booking campaign's reviewed Compass sequence. The old fill/capture bodies, breakdown tokens and guarantee are historical, not starting templates. If the current cell has no suitable sequence, prepare and review one against the current contract before upload. Never treat old copy confirmation as approval for a new offer. Personalisation must use published facts and the existing validated mapping/rendering path.

Instantly: `.agents/skills/instantly-load/SKILL.md`. Draft only. 2+ day gap before the bump. Before upload, run `check_campaign.py` against the `get_campaign` JSON with `--leads-csv` and the city timezone. After upload, reconcile the actual uploaded email set and skips, then PATCH Compass `sequence_draft` and `mark` only those uploaded IDs `in_instantly`. Settings passing alone does not mean loaded.

## Do not open on a send

`cold-email/research/`, `offer-create` skill, `icp-offer-research`, other verticals than the cell's trade, `_archive/`, INDEX, playbooks, `future-agents/sales/cold-outbound-research/`, handover files. Research is closed on a send; it still argues killed copy.

## Allowed files on a send

- this file
- `factory_job.py` stdout
- `list-builds/AGENT.md` + `filter_leads.py` + `site_extract.py` + `mark_verified_email.py`
- `openers/AGENT.md` + `generate_openers.py`
- the current installation-booking campaign copy in Compass
- `switchflow-offer/installation-booking.md`; historical vertical documents only when explicitly reviewing history
- `.agents/skills/instantly-load/SKILL.md` + `check_campaign.py`
- Compass `brief`, `ledger`, `commit`, `mark`, waves HTTP

Creating or remaking an offer is `.agents/skills/offer-create/SKILL.md`, not this file.

## Keep the next wave ready

On each planning run, read Compass brief and waves: resolve replies, check remaining unsent inventory, and maintain the next eligible installation-booking cell. Exclude cancelled cells and retired offers. Reuse each cell's uncontacted ledger before paying for Maps. Check actor access and remaining budget for extraction **and verification** before buying a new batch; a capped verifier means finish cached work and record the block, not buy another scrape.

At the weekly results review, sync outcomes before judging copy. Compare one factor at a time against a named control: same offer, audience, send settings and other copy. Record the hypothesis and candidate in Compass, then delivered, positive replies, screens and installs when available. Opens are not the success metric. Small or immature cohorts remain inconclusive. No automatic winner or campaign activation. Use actual cost per eligible unique inbox and dropped-place count to evaluate tools; the current actors are defaults, not a proven best-in-market claim.

Research enters through a reviewed candidate in Compass and a small change to the production engine or copy. The send path stays short; the weekly review may consult the linked research evidence in `openers/generate_openers.md`.
