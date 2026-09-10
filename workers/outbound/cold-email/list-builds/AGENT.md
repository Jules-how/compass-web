# List building

Requirements revised by Jules on 10 September 2026. [The offer contract](../../switchflow-offer/installation-booking.md) owns ICP and signal definitions. This file owns execution design. The local implementation and tested provider routes are documented in [PIPELINE.md](../PIPELINE.md); check its deployment boundary before using hosted preparation.

## 1. City and limits

Use the named city/metro or regional area, real boundary, local timezone, current offer, stable body variant and bounded budget. No pre-Vortex deduplication or full-inventory census. Reuse caches opportunistically. factory_job.py may supply compatible cell metadata; its old inventory-first exits do not override this workflow.

Keep a small coverage register: area, search terms, run ID, cap, completed/failed and uncovered districts. Check that Greater City resolves beyond its CBD; use one polygon when necessary. Do not start with an overlapping run for every suburb.

## 2. Vortex discovery

Actor: vortex_data/google-maps. One geographic method per run: locationQueries or customGeolocation. Keep city out of searchStringsArray. Start with distinct service terms, e.g. air conditioning contractor, air conditioning installation, heating and cooling contractor. The website synonym list is not a list of Maps runs.

- Enable extractContactsFromWebsite. Retain identity, name/address/suburb, phone, website, categories, available rating/review count, place ID, source URL and run metadata, plus returned emails/extra phones/social links.
- Retain names or service evidence only when actually returned with usable provenance. Vortex currently documents contacts, not dependable staff names or structured service/offer evidence. Its first email is a candidate, not automatic approval.
- Leave review text, galleries and full-details add-ons off. Do not pay just to fill a missing review count. Do not use Vortex verification.
- Read current schema/rates and set maxTotalChargeUsd before a paid run. Preserve no-website/no-email businesses. Skip confirmed closed places.
- Avoid strict category/name/query filters that silently exclude electrical or plumbing businesses with AC installation.
- Reuse adequate returned website text; the HTTP pass fills remaining facts without a second paid research exercise.

Consume completed output in bounded batches while the run continues if reliable progress is available. Inspect the final receipt for dropped-place limits, unfinished searches and budget exhaustion. Repair only the affected query/area; no automatic whole-city rerun.

Extend coverage through uncovered districts or missing service categories. ARC/manufacturer dealer directories are optional gap sources, not compulsory cross-checks or independent-ownership proof. No automatic paid directory run. Record unresolved coverage when a cap or documented low-yield stopping point is reached. Maps/directories cannot prove every operating company has been found.

## 3. Research once

Read cache first. Concurrent HTTP-to-text extraction uses the existing site_extract.py as its starting tool. Parallel Extract is only for blocked, empty, JavaScript-only or insufficient essential content.

Homepage first to find real links; then the relevant installation/service page, contact page if needed, and about/project/offer page only where useful. Up to four pages per business, stopping when fit/contact and sufficient signal evidence are available. Do not assume /contact is the actual URL. Save final URLs and extracted text once.

Proposed initial limits to benchmark: 12 concurrent HTTP requests, at most 2 per domain, 3 Parallel fallback requests and 6 compact model assessments/drafts in flight. Respect provider limits and back off on rate limits. Parallelise across independent companies and stages, while preserving evidence → fit → verification/drafting → review → upload dependencies. No agent per company.

One targeted Parallel fallback per business for the most useful failed/insufficient page(s), then move unresolved cases aside. Retry a transient error once with backoff. No automatic Firecrawl/search-provider cascade. With no website, an available official public profile/directory page may establish installation fit; a Maps category alone does not.

Keyword matching finds passages; interpretation establishes fit. Distinguish ducted reverse-cycle, multi-split/multi-head, multiple split-system package and ordinary single split. Do not mistake gas/evaporative, supply-only or repair-only content for qualifying installation. Commercial/mixed trades qualify; unknown independence is irrelevant.

One assessment returns fit/not_fit/unresolved, evidenced system types/priority, residential/commercial/mixed/unknown customer type, operating/area evidence, contact candidates and selected contact/source, strongest supported signal/quote/URL, and next action. Missing optional details do not block a fit company.

## 4. Route and verify

Prefer a published relevant owner/manager inbox when person and role are tied to it. Otherwise use published sales/quotes/general business contact; info@ and a publicly designated business Gmail address are acceptable. Never infer a name from an email handle or buy owner enrichment by default. Exclude designer, supplier, recruitment, privacy and irrelevant support inboxes.

Before verification, make one batch check for repeated addresses, opt-outs/suppression and actual outreach. No fuzzy company merging or parent investigation. An assignment is not a send. A known competing reservation is an administrative issue, not failed ICP. Preserve original rows and skips; never reset history.

Use **Million Verifier through Apify**, actor account56/email-verifier (confirmed from the previous run and current actor documentation). Check its current schema before execution. No Vortex or substitute verification. Batch 50–100 eligible new addresses where practical; do not wait for the whole city. Reuse a prior result for the same unchanged address within a documented freshness window. Proposed default: 30 days, rechecking when source/delivery evidence changes; this is an operating default, not a vendor guarantee.

- Valid/provider ok → email candidate, subject to current eligibility and review.
- Catch-all, unknown, invalid, disposable, error or missing → not a valid email lead. Missing is pending; preserve exact results. A suggested typo correction is not a published email and must not be silently adopted.
- Try at most one already published alternative inbox for an otherwise good prospect.
- High fit + no valid email + published phone → cold-call-fit CSV. Distinguish no_email, invalid, catch_all, unknown and verification_error. A transient verification failure may also remain retryable.
- High fit with neither usable email nor phone → unresolved contact. Non-fit and incomplete-evidence rows remain in the register.

Call CSV: company, area, phone, website, system types/priority, fit evidence, strongest signal/source, published contact name if known, email-route reason and outreach restrictions. This is a fit list, not calling permission; no automatic calls, SMS or call-task system.

## 5. Compass and writing

Compass owns the lead ledger and reviewed copy. Use its agent API/MCP, never direct Supabase CRUD. Existing commit requires company/email; no-email businesses stay in the local register/call CSV. Use supported existing-record joins; do not invent an email to create a record. Preserve status and report administrative skips separately.

As valid contacts finish, use their compact cached evidence for [subject/opener drafting](../openers/AGENT.md). Produce one version, check it and retry only a failed field once. Move review-ready batches of 25–50 onward without waiting for exceptions. Freeze the approved export; never rebuild it from a differently sorted spreadsheet.

One run folder under cold-email/list-builds/out/hvac/: raw data/receipts, page cache, resumable register, email-review CSV, cold-call-fit CSV and unresolved rows. Record groups: source ID/identity; fit/evidence; contact/source; verifier/time; signal/connection; subject/opener/body variant; stage/reason; import result. Reuse existing fields/files; no new database or separate sheet for every stage.

Report raw listings → assessed source business rows → fit rows → candidate inboxes → distinct addresses checked → valid addresses → reviewed rows → uploaded inboxes, plus callable/unresolved counts. Explain skips in the correct unit. Without identity consolidation, source rows and inboxes are not unique-company counts.

## 6. Prove before scale

After the necessary code changes, test 10 representative cached businesses covering ducted, multi-head, multiple-unit, single split, commercial, mixed trades, no-email, failed-page and non-fit cases (cases may overlap). Exercise a real fallback/verifier path only within an authorised cap; otherwise reuse valid results. All rows must route with evidence, supported copy and an unchanged stable body. After Jules' review, prove one paused CSV import against full readback. Rerunning completed work must not repeat fetches, verification or uploads.

Measure elapsed time, fallbacks, tokens, charges and accepted contacts. Proposed faster benchmark: 100 cached businesses in 5–10 minutes of automated processing; ordinary fresh websites in 10–20 minutes. Record discovery, verifier queue, human review and upload times separately rather than hiding them. These are unproven targets, not measured end-to-end throughput or guaranteed valid contacts. The 10-company test must establish a realistic total before scaling; adjust only from measured bottlenecks.

Remove: pre-discovery identity reconciliation, inventory-exhaustion gates, independence research, compulsory directory checks, paid reviews/photos, catch-all sending, copy regeneration, scripts per list and blocked local API imports. Retain evidence, bounded verification, one human review and full paused-import readback.

## Cost controls and implementation order

Current public pricing checked 10 September 2026: Vortex's undiscounted base is US$1/1,000 places, plus US$1.50/1,000 places where the contact add-on returns contacts, plus the small start fee. Thus 1,000 places with contact enrichment on every row is about US$2.50 before start fees. This is not 1,000 qualifying contacts. Million Verifier's published price is US$1/1,000 decisive results. Parallel/model usage and subscriptions are separate; report actual receipts and currency, not a fabricated all-in total. No new subscription is proposed.

Keep one authorised total cap with reserved verification/fallback headroom. The earlier A$25 approval was for the Sydney task; do not silently renew it for every city. A proposed 10-company proof can use an A$2 incremental paid-tool cap, subject to remaining authority/headroom, with no paid discovery if cached businesses suffice. Extra model billing must be included if applicable. A cap is permission to stop, not a claim that all work will fit it.

Implement in this order: (1) remove obsolete ICP/history/timezone gates and align valid-only status handling; (2) extend the existing fetcher/worker to cache a compact evidence packet and resume bounded concurrent stages; (3) add evidence-constrained subject/opener drafting while freezing the rest of the reviewed copy; (4) prove the minimal CSV mapping, settings and exact paused readback with 10 companies. Do not start with a new dashboard, scheduler, orchestrator or data platform. Do not change an existing live campaign to perform the test.

Sources: [Vortex capabilities](https://apify.com/vortex_data/google-maps), [input schema](https://apify.com/vortex_data/google-maps/input-schema), [pricing](https://apify.com/vortex_data/google-maps/pricing), [Million Verifier actor](https://apify.com/account56/email-verifier). These vendor capabilities and prices must be checked at execution.
