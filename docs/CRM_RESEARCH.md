# Reusable company research

## Release scope

This additive release implements the first CRM research slice: canonical companies, people and affiliations, locations, contact methods and candidates, evidence, verification history, strict writes, research UI and server queries. It does not run research, enrichment, verification, email-format trials or alternate-recipient outreach. Generated candidates can be retained through the API with their generation inputs; format evaluation and attributed success statistics require a later release.

Existing lead email/phone, campaign membership, outbound preparation, history, suppression and reservations remain authoritative for outreach. Research links never update these fields. A company marked `eligible` has research fit, not permission to send.

## Enablement and rollback

1. Review the branch diff and migration `20260915090000_crm_research.sql`. Check that the hosted database has `lead_contacts`, `compass_outbound_companies`, `compass_lead_list_members`, `portal_is_operator`, and standard Supabase roles. Confirm previous preparation policy and reservation migrations are present.
2. Run unit, isolated database and existing lead/preparation regression tests, `npm run verify`, and `npm run build`. Use a separate test database for migration rehearsals. Do not test by modifying production leads.
3. Apply the migration through the normal reviewed deployment process. It creates tables, RLS, invoker views, functions and indexes only. No existing row is changed and there is no automatic backfill.
4. Deploy integrated source with `COMPASS_CRM_RESEARCH=1`, `COMPASS_CRM_RESEARCH_WRITES=0` first. Verify authenticated capabilities and reads on the actual public alias. Missing schema returns 503 rather than a success-shaped empty result.
5. Enable `COMPASS_CRM_RESEARCH_WRITES=1` for the reviewed operator test. Both flags default off. Writes require operator authentication plus same-origin protection, or the existing agent secret. Database mutation RPC privileges belong to service role only; operator reads use RLS.
6. Review a small explicit mapping manifest before any production backfill. Verify receipts and unchanged legacy fields/history/reservations. Do not start research or enrichment as part of rollout.
7. Roll back immediately by disabling writes, then reads if needed. Retain additive tables and receipts; the legacy UI and sending paths continue to work. Revert the application commit if needed. Do not drop populated research tables or reverse backfill by deleting leads. A destructive schema rollback requires a separately reviewed export/retention decision.

The migration is intended to be applied once through the migration ledger. It is not an idempotent ad hoc SQL script. No migration or production enablement is performed by this code change.

## Storage contract

- `crm_companies`: stable operating-business identity, legal/provider identifiers with evidence references, nonunique domains and optional owned/franchise parent relation. Cycles are rejected. Shared domains do not merge companies.
- `crm_company_locations`: separately sourced premises and service areas. A branch under one operator is a location. A franchisee or independently operated legal business is a company related to its parent. Research does not automatically propagate across the relationship.
- `crm_people` and `crm_company_people`: identity and dated roles/affiliations. Multiple people per business and multiple affiliations per person are supported. Named candidate identity cannot be repointed by changing its affiliation or linked person's name.
- `crm_contact_methods`: immutable normalized route, deduplicated by type/value. A shared general route can link to several companies. Phone normalization removes presentation punctuation but does not invent a country code or merge uncertain national/international forms.
- `crm_contact_candidates`: company/method/optional affiliation and location, initial origin, retained/unresolved/rejected state. Generated inputs retain version, name tokens, domain and up to 20 format IDs. Candidate identity and initial origin are immutable. New origins are evidence, not rewrites of how a candidate was first found.
- `crm_research_sources`: immutable URL/provider/external identifier, capture dates, content hash and cache artifact reference. Compass stores structured facts, exact relevant quotes and references. Raw pages, provider payloads and crawl bundles belong in the bounded shared research cache, not these tables or lead facts. Cache storage/lifecycle is outside this release.
- `crm_research_observations`: immutable typed claim on exactly one subject, source, exact quote or locator, observed/effective dates, extraction context, review status, inference basis and superseded evidence IDs. Conflicting reviewed values remain disputed and are omitted from fit projections. Resolve by appending evidence explicitly superseding the conflicting IDs, never by deleting history. Pending observations are retained without becoming fit facts.
- `crm_verification_events`: immutable check attempts with exact submitted address, provider/result/request/cache identifiers, checked and received dates, mailbox result, raw status/reason and cache reference. Failed/timed-out attempts have no mailbox result. Latest attempt and latest completed result are shown separately. Catch-all, unknown, invalid and risky are retained. A valid mailbox does not support personal ownership.
- `crm_lead_links`: conservative proposed/confirmed/rejected link to an existing lead, evidence and expected lead revision; at most one confirmed company per lead. Optional primary-candidate references must equal the current legacy primary values. They do not change them. New primary changes remain on the existing guarded lead path.
- `crm_legacy_company_links`: explicit mapping from old outbound company stubs, not an automatic domain join.
- `crm_research_receipts`: immutable request hash, actor, source, dispositions, actual stored records and revisions for retry/readback.

Provider assertions cannot establish personal address ownership. Published personal attribution requires an affiliated person and a source quote containing the full name and exact address. An operator report/inference may establish attribution with dated evidence, locator/quote and explicit reasoning; this is a reviewed decision, separate from mailbox verification. A shared general inbox linked to a person does not become a personal address merely because the person is a decision maker.

## API

Agent namespace: `/api/agent/crm`. Equivalent private operator namespace: `/api/operator/crm`.

- `GET /capabilities`: deployment enablement, writable state, schema version, lead columns and alternate-outreach capability (false).
- `GET /companies`: company-grain search, total matching before cursor, records, stable next cursor.
- `GET /companies/:id`: canonical profile and current fact evidence IDs.
- `GET /leads/:id`: links plus bounded legacy snapshot for compatibility review.
- `GET /collections?collection=...&company_id=...`: independently paginated people, locations, candidates or company observations. Candidate observations use `candidate_id`; verification events use `method_id`. `limit` is 1–100, `after` is stable ID. Unused/unknown scopes are rejected.
- `GET /methods?type=email&value=...`: exact normalized method lookup, not guessed ownership.
- `GET /records/:kind/:id`: exact record including revision.
- `GET /receipts/:request_id`: original committed receipt.
- `POST /research`: one bounded atomic packet, 1 MiB and up to 100 operations. No external calls under the transaction lock.

```json
{
  "schema_version": "crm.research.v1",
  "request_id": "request-stable-id",
  "source": "Reviewed company research",
  "operations": [
    {
      "kind": "company",
      "expected_revision": 0,
      "record": {"id": "company-stable-id", "name": "Example Air"}
    }
  ]
}
```

Full record replacement is revision checked; omitted fields receive schema defaults. Read current records before updating and preserve their supported properties. Unknown properties, invalid enums, bad evidence or wrong subject relationships fail explicitly. `0` means create. Cross-record writes are ordered source/company/person/method before dependents; the server validates all relationships before commit. Any failure rolls back the complete packet. Mutable records are updated in place. Identity-changing corrections require new reviewed records/links rather than repointing historical evidence.

Reuse the exact packet/request ID on uncertain retries. Same ID with different canonical content or actor conflicts. Read the receipt and compare hash, operation count and stored values. The UI retains uncertain packets and drafts in session storage and reconciles receipts before another save. Server receipts remain authoritative if browser storage is unavailable.

Legacy lead commit and mark endpoints now reject unknown fields before writes. Rich evidence must use the research API, not a ninth legacy fact or extra keys in `lead_facts`. Existing allowed legacy fields and protected-state behavior remain. Commit responses include persisted readback and applied-field lists; protected legacy fields may deliberately retain their previous values. Batch commit remains chunked, not globally transactional: inspect failed/skipped/receipts rather than assuming HTTP success means every row changed.

## Fit and full-dataset queries

Typed fields cover operating status, residential-only/mixed/commercial-only customers, installation/system capability, sourced establishment assessment, age with explicit basis, review count/rating/profile/scope, team, quote routes, commercial signals, revenue and capacity. Revenue/capacity remain absent/unknown without supported observations.

The initial AU target uses reviewed company identity, active operation, residential or mixed customers, air-conditioning installation, ducted or multi-split capability, sourced establishment and a supported active service region among Sydney, Melbourne, Brisbane, Perth and Adelaide. Commercial-only, closed and non-AU companies are retained as not-in-target. Incomplete/conflicting evidence yields research-needed. No arbitrary review-count or age cutoff is embedded in eligibility. Age is year-level and retains operating/registration/claimed basis.

Company query filters: `q`, `region`, `customer_mix`, `fit_status`, `established_status`, `system`, `min_reviews`, `min_rating`, `min_age`, `age_basis`, `freshness`, `fresh_days`, `missing_fact`, `origin`, `attribution`, `mailbox`, `role`, `include_archived`. Origins/attribution/mailbox/role must match the same candidate. Missing/disputed customer mix matches the unknown filter. Research freshness uses the oldest current field date, with unknown dates explicit; freshness is a prioritization filter, not permission to send.

Sort: `name`, `review_count`, `review_rating`, `age_years`, `updated_at`, `research_observed_at`, plus `direction=asc|desc`; nulls last, stable ID tie-break. Cursor binds filters/sort/direction. Totals are full matching totals. Live concurrent changes can move rows between pages; use a separately frozen manifest for a research cohort, not interactive pagination as a snapshot guarantee.

Legacy lead UI headers now request server sorting before pagination. `sort`/`sort_dir` are supported by agent/UI/export queries. `company_customer_mix`, `company_system`, `company_region`, `company_fit`, `company_min_rating`, `company_min_age`, `company_freshness` narrow confirmed company links while preserving existing list scope. Campaign/list membership is not copied into the company record.

## UI

`/leads?view=companies` adds a focused research view in the existing neutral Compass design. It exposes full-dataset filtering/sorting, company facts and evidence freshness, people, alternate contacts, locations and independent history pagination. The lead Research tab includes shared company research and conservative linking; its legacy facts remain visible.

Operator forms support company creation/identity review, sourced observations, people, published general/personal routes, service locations, and recording an already obtained provider result. They never execute provider jobs. Evidence drawers retain exact quotes, dates, source and cache references. Establishment assessments and contradiction resolution require supporting/superseded observation IDs visible in the drawer. This deliberately small first release uses IDs for those less frequent review operations; a visual evidence picker can follow without schema changes.

## Backfill

No backfill runs automatically. Start with existing companies created and reviewed in CRM, then prepare a maximum 20-entry explicit identity mapping:

```json
{"entries":[{"lead_id":"existing-lead-id","company_id":"reviewed-company-id","source_url":"https://example.test/about","reason":"Reviewed operating-business identity evidence"}]}
```

- `node scripts/crm/backfill.mjs /absolute/path/manifest.json` performs bounded agent API reads and writes a local `.packets.json` dry-run artifact. No lead, company or campaign write occurs.
- Review every mapping, retained primary route, source and held issue. Existing confirmed links are held. No domain-only auto merge. National phone formats remain distinct unless separately reviewed.
- After explicit backfill authorization: `node scripts/crm/backfill.mjs /absolute/path/manifest.json.packets.json --apply` sends those exact research packets and saves readback receipts after each. Retry the same file. If a later packet fails, earlier receipts remain committed; reconcile those receipts before producing a replacement packet.
- Existing primary routes become `legacy_unknown` candidates, with no guessed person. Existing verification remains legacy evidence, including unknown provider/date. Legacy facts become pending notes, preserving original kind/claim/URL and unknown observation dates. They do not become invented structured fit.
- Existing outbound preparation evidence stays intact. Historical preparation import is a separate reviewed mapping using immutable preparation/run/candidate IDs as source references, original quotes/dates, historical affiliation and verification context. Do not infer current employment, canonical companies or fresh verification from an old preparation. This automatic historical extraction is intentionally not included in the bounded lead backfill tool.

## Acceptance and remaining release checks

New tests exercise strict schema rejection, generated inputs, attribution/verification separation, normalization, cursor binding, isolated migration, RLS, receipt retry/conflict, atomic rollback, evidence conflict/supersession, shared-domain identities, primary/revision guards and unchanged suppression. Run existing lead commit/mark/query and outbound preparation database suites to check compatibility. Rehearse global numeric ordering with ties/nulls and >1 page, same-candidate combined filters, concurrent request IDs and mutable revisions, and user/agent auth failures.

Before enabling writes, complete authenticated UI checks for narrow layouts, keyboard focus/evidence drawer, failed-save draft retention, uncertain retry, read-only/disabled schema states, and company changes visible from two linked leads. No deployed/UI validation is implied by source or database tests alone.

Deferred: deterministic format trial registration/result attribution, cohort statistics, research worker orchestration, cache storage implementation, automatic historical preparation extraction, company merge UI, and alternate-address sending. The approved future pipeline remains Luna-only with bounded workers and shared caches. Nothing here launches it.
