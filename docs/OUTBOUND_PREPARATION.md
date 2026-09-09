# Outbound preparation: first slice

The installation-booking campaign screen now retains candidates, reviews quoted evidence and both rendered emails, approves an immutable batch, and reconciles a browser CSV import against the paused Instantly campaign. It does not activate or send. Historical campaign controls remain separate.

## Ownership and flow

Compass stores companies (including those without an inbox), raw source snapshots, normalized candidates, quoted evidence, source URLs and observation times, verification provenance, pass/hold/exclude decisions, exact recipe/sequence/settings, approvals, reservations and receipts. Source JSON also goes to a private content-addressed storage bucket. Immutable records cannot be updated or deleted through the app; a research edit creates another run preserving the earlier source. Source retention is deliberately explicit; no automatic deletion job is included.

The local worker calls `render_preparation_ticket` in the existing `cold-email/openers/generate_openers.py`. Compass independently validates its substitutions and stores its complete output. The UI displays that output rather than generating another opener. Required service/area/identity/contact evidence cannot be filled by a generic legacy fallback. A blank unused person name is valid; any referenced blank variable holds the row. Signatures and visible opt-outs are included in the reviewed email.

One configuration and batch schema serve the first Sydney/HVAC cell. Required evidence and eligibility intentionally reflect only the current installation-booking contract. Cross-offer policy generalization, discovery providers, paid verification execution, hosted worker scheduling, automatic Instantly loading, reply/meeting analytics and new delivery features are deferred.

## Worker API

`GET /api/agent/outbound/preparation?campaign_id=<cell>` returns configuration, the latest ten runs, preparations, approvals and receipts. GET does not seed or mutate a pathway.

`POST` to that endpoint accepts a discriminated action:

- `configure`: `recipe`, `settings`, current `revision` (zero for creation).
- `create`: `rows`, 1–200 original source objects; retains every row before assessment.
- `import_inventory`: optional `lead_ids`; otherwise all attached inventory, with an explicit error if more than 200 records require selection.
- `revise`: `run_id`, `candidate_id`, reviewed `changes`; creates a source-linked replacement run.
- `claim`: `run_id`; returns a five-minute attempt token and the frozen candidates/context. Already-ready runs are no-ops.
- `heartbeat`: `run_id`, `token`, optional failure `error`.
- `complete`: `run_id`, `token`, `outputs`. Unknown candidate IDs, duplicate outputs and stale attempts are rejected. Candidate holds remain in the preparation even if they cannot render.
- `reserve`, `export`, `reconcile`: `preparation_id`; require a current approval and the relevant platform checks.

The operator route is `/api/operator/outbound/preparation/<cell>`. It requires an operator session and same-origin mutations. Only that route can dispatch `approve` (`preparation_id`, exact `hash`) with the authenticated human's database client. The worker secret cannot approve; the approval RPC records `auth.uid()` and checks operator membership.

Run the local worker once per run:

```sh
python3 cold-email/outbound_worker.py --campaign CELL_ID --run RUN_ID
```

The worker uses the existing Compass configuration loader. A lost completion response is not marked failed; retries reuse the run and completed output. The UI has a Refresh control and a selector for its latest ten retained runs. The editor’s Review preparation button opens this tab directly.

## Import and reconciliation

1. Review all ready records, rendered emails, uncertain verification results and settings in the campaign's Prepare tab. Approve the exact batch.
2. Create/bind a paused Instantly campaign using the established browser/MCP setup path, and apply the reviewed sequence, sender pool and schedule. Follow-up delays belong under the preceding email; the first slice requires at least two days. A blank follow-up subject remains blank.
3. **Check paused campaign** validates the live settings/copy and atomically reserves each company and inbox. Competing batches cannot claim a reserved identity. There is intentionally no automatic reservation release: an interrupted import must be reconciled before reuse.
4. Download the approved CSV; import it on the campaign's Leads tab in Chrome. Map all exported columns. Campaign duplicate check on; list/workspace checks and import verification off unless separately instructed.
5. **Check imported recipients** reads every page from Instantly, verifies paused settings again, and compares inboxes and merge values. Only exact confirmed provider IDs update the lead ledger. Missing, duplicate, unexpected or changed recipients keep the load incomplete. The history retains each receipt, and identical receipts are idempotent.

This path needs Instantly read API access even when browser upload is required. If readback fails, the load remains unresolved; a count or screenshot is not substituted for an exact recipient receipt. Instantly remains authoritative for sending and can still be changed directly by its operator after the check. Compass has no activation operation.

## Migration and release

Apply `supabase/migrations/0082_outbound_preparation.sql` and `0083_outbound_function_privileges.sql` before deploying the new routes. They add eight new tables, a private artifact bucket, narrowly scoped RPCs and invalidation triggers. The follow-up migration explicitly removes Supabase's default service-role execution grant from human approval and removes API execution grants from trigger functions. Authenticated clients have SELECT only on the new tables; the approval RPC is the only human write path. The invalidation trigger runs as its owner so normal operator copy edits can invalidate protected runs without gaining broad write access.

Existing ledger rows, historical campaign history and verification statuses are not bulk rewritten. Legacy import enrichment now preserves every established non-uncontacted outreach state. The legacy Instantly API mapper's delay/subject and chunk-receipt bugs are fixed, and installation-booking cannot bypass preparation through old push/template endpoints.

If application rollback is needed, redeploy the previous app while retaining these additive records. Do not drop source, approval, reservation or receipt tables as a rollback shortcut. Reserved batches must remain held until their external state is reconciled.

The companion workspace edits live outside this Git repository: the local worker; the existing Python engine and tests; filter retention; blank-merge validation; and the active cold-email/load instructions. `workspace-companion.tar.gz` in the local handoff directory contains those exact files for transport, not another runtime. The prior Instantly skill is retained in its `history/2026-09-09-before-preparation.md` file.

## Checks

```sh
npm ci
npm run verify
npm run lint
npm run build
node --test test/outbound-preparation*.test.mjs
```

The preparation suite executes production TypeScript, the actual migrations in PGlite/PostgreSQL with Supabase-style default function grants, database JSON round trips, operator/worker route boundaries, and legacy chunk handling. Optional fields omitted by JSON storage do not alter the input fingerprint. Recorded rendering fixtures were produced by the actual Python engine. On the Switchflow workspace, verify the engine against those fixtures with:

```sh
SWITCHFLOW_WORKSPACE=/Users/Jules/switchflow-os node --test test/outbound-preparation.test.mjs
python3 -m unittest discover -s cold-email -p 'test_outbound_worker.py'
```

To deliberately regenerate reviewed synthetic fixtures, add `RECORD_OUTBOUND_RENDER_FIXTURES=1` to the first command and inspect the diff. Fixture updates are not a substitute for checking why production output changed.

The initial full repository test run also exposed existing failures in unrelated route inventories, old UI assertions and tests relying on folders outside the Git worktree. These are not represented as passing. The focused preparation suite and required build checks are tracked separately in the handoff report.

## Live rollout, 9 September 2026

PRs [75](https://github.com/Jules-how/compass-web/pull/75) and [76](https://github.com/Jules-how/compass-web/pull/76) were merged and deployed to production. Both migrations were applied to the production database. Live catalog checks verified forced RLS, no authenticated table writes, no anonymous reads, authenticated-only approval execution, and no API-role execution of trigger functions. The live worker exposed a JSON omission/hash mismatch and inherited function grants that are now covered by regression tests.

The Sydney Hvac cell (`campaign-5fd67add-23d4-403b-b09b-78cf9d37cd53`) has its current installation-booking sequence, visible opt-out links, full sender identity, existing sender pool and weekday Sydney settings configured. Both emails were inspected through the hosted Prepare tab. Human approval and the first real paused import remain pending; deployment is not a claim of completed import reconciliation.

All 340 existing Sydney source records are retained in Compass and private source storage, including 67 without an email. Their source batches contain 200 and 140 rows; both completed with every original row held for research or eligibility issues. Each original remains immutable. A separately researched, source-linked Limitless Air Solutions record passed preparation with an actual recorded email-verifier result and blank first name. This is one proof recipient, not 341 new prospects or a qualified market-size claim. Its enquiry volume, follow-up gap, capacity and economics remain unknown.

Earlier matching against 899 HVAC ledger records found 177 exact source-inbox matches (147 in Instantly, 14 suppressed, one negative reply, one replied and 14 uncontacted). That was a vertical-scoped inventory check, not a whole-ledger clearance. The live preparation checks company and inbox identity across the ledger; it also found archived/prior-outreach records outside the HVAC category. No historical contact or suppression was reset to make a batch pass.

Actual production checks confirmed 340 retained decisions, 67 no-email rows, retrying a completed worker as an idempotent no-op, and worker approval rejection. Premature import actions remain blocked. Missing approval/reservation errors are explicit, and blank inboxes cannot create false overlap matches with unrelated no-email companies. A genuine company-domain match remains blocking even without an email.

Local review and receipts are in `cold-email/list-builds/jobs/2026-09-09-compass-preparation/` and the outbound-preparation handoff directory. The completed browser CSV import, recipient readback and ledger receipt are the remaining acceptance gate after the operator approves the concrete one-recipient batch. Automatic discovery, hosted workers and reply/meeting analytics remain separate backlog slices.

Sources for platform contract: [list leads](https://developer.instantly.ai/api-reference/lead/list-leads), [get campaign](https://developer.instantly.ai/api-reference/campaign/get-campaign), [step delays](https://help.instantly.ai/en/articles/7916860-time-to-wait-between-steps).
