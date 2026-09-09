# List building

The job comes from `cold-email/factory_job.py`, run before anything here. Exit 0 prints the Vortex payload for this cell. Exit 2 means refill: page the cohort URL it prints and skip Maps entirely. Exit 3 means the current cell/contract needs correction. Exit 5 means review existing unassigned inventory (including companies without email); do not scrape. These candidates still require geography, evidence and outreach checks. Jules can still name `--trade {trade} --city {city}` on the gate. Default offer: `switchflow-offer/installation-booking.md`. Never invent an email.

```
factory_job.py (gate: scrape vs refill)
  → Vortex Maps (place price; only on exit 0)
  → filter_leads.py
  → site_extract.py (httpx, then Parallel on failures)
  → verify published inboxes
  → mark_verified_email.py
  → Compass commit (gate: do not openers without it)
  → generate_openers.py
  → Instantly draft (fill)
```

Do not run Google Ads or Meta Ads scrapers, the Apify website finder, or FindAll. Do not fetch sites before filter. Website contacts and reviews on Vortex are extra events. Leave them off unless Jules pays for them.

## 1. Maps

Actor `vortex_data/google-maps`. Use the payload `factory_job.py` prints; do not hand-roll one. One geographic method per run: named `locationQueries` or `customGeolocation`, never both. City stays out of the search term. Terms from `switchflow-offer/verticals/{trade}.md`.

```json
{
  "searchStringsArray": ["<terms from the vertical file>"],
  "locationQueries": ["Greater {City}, {State}, Australia"],
  "maxCrawledPlacesPerSearch": 2000,
  "languages": ["en"],
  "geoStrictMatch": false,
  "keepUnverifiedLocations": true,
  "skipClosedPlaces": true,
  "skipPlacesNotMatchingSearch": true,
  "extractContactsFromWebsite": false,
  "maxReviewsPerPlace": 0
}
```

Perth is the exception: named `Greater Perth, Western Australia, Australia` geocodes as a 4.8 km CBD polygon, so the gate emits a `customGeolocation` GeoJSON polygon (Two Rocks to Mandurah, coast to Mundaring) instead of `locationQueries`.

If `limitPlacesDropped` is not 0, raise the cap and run once more. Do not geoStrict a CBD radius. Do not suburb-loop unless Jules names a hole. Skip off-profile stays on (Google pads with other trades). Jules can say “keep Google padding” to turn that off.

Save every field the place event already returns (name, categories, address, phone, website, rating, review count, hours, owner, `placeId`, pin). Stage in `in/`.

## 2. Filter

```
python3 filter_leads.py in/{file}.csv --trade {trade}
```

Cheap name/trade walk. Report every unsendable row (name, reason, email). Open that CSV. Do not fetch or verify unsendable rows. After site extraction, review strong contradictions between the business and its website (another trade, platform/parking-page inbox, national supplier, builder or renovator rather than the target service). Hold those rows with a reason before verification; a Maps category is not proof when the website contradicts it. Preserve missing/uncertain evidence for review rather than inventing a factual opener.

## 3. Site text

```
python3 site_extract.py out/{trade}/{trade}-{city}-sendable-{YYYYMM}.csv --trade {trade}
```

Homepage, then `/contact` if still no inbox. httpx first. Parallel only when httpx failed. Firecrawl off unless `--firecrawl`. `--resume` reuses cache and does not redo a paid hop. Spec: `site_extract.md`.

## 4. Verify

ICP keeper sheet only; deduplicate published addresses and exclude archived, no-recontact, already contacted/suppressed or company-duplicate ledger records before spending. Check actor access and remaining account budget before a new Maps run, leaving room for verification. If unavailable, resume cached work and log the block in Compass. Actor `account56/email-verifier` unless Jules names MillionVerifier. Keep ok, catch-all, unknown, timeout/error. A returned unknown/error is a recorded result; a missing result is pending and must not be promoted. Clear **invalid** only under the current policy. Still none → blank. Do not drop the company.

## 5. Mark verified, then Compass

```
python3 mark_verified_email.py out/{trade}/{trade}-{city}-sendable-{YYYYMM}.csv --results-json /tmp/verifier-results.json
```

Use the actor dataset with actual `email` and `status`; results join by address. Pending addresses stay in `published_email`, with `verified_email` blank; exit 2 means verification remains incomplete. Existing column names or quality labels alone do not prove verification. Invalid rows stay blank. Then Compass `POST /api/agent/leads` (`commit`) for rows with company + `verified_email`. Record every domain/company skip and its existing lead ID. Preserve previous outreach states; never reset them to uncontacted. Reconcile input unique inboxes = committed + explicit skips + failures. Do not wait for Instantly. After Instantly load, `mark` `in_instantly`.

Then openers. Instantly is always fill. Activate only when Jules says go.

Do not leave CSVs at `list-builds/` top. `filter_leads.py` retains staging, source rows and sidecar receipts. Retention cleanup is a separate explicit operation.

## Other tool paths (only if Jules names them)

- **Free Maps:** browser-use into Jules' Google account. Then filter onward.
- **Origami:** archived. [_archive/origami.md](_archive/origami.md).
- **Apify finder:** archived for this offer.
