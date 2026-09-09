# Compass branch consolidation — 9 September 2026

Jules requested all outstanding Compass branches be merged so the hosted application includes the current work. Integration branch: `codex/compass-consolidation-20260909`.

## Included work

- Client delivery engine and the delivery workspace aligned to the existing Compass shell.
- Pathfinder and its live permission fixes, preserving the newer implementation over older overlapping planning files.
- Operator and installation commercial workflows.
- Outbound preparation, approval grants and production hash/receipt fixes through main `6795c1b` (PR 76), plus the latest missing-inbox overlap and import gate correction `8e021e8`.
- CRM lists, memberships and campaign attachments, adapted to current lead search, ICP filters and complete pagination. List attachment replacement is atomic; overlapping lists return each canonical lead once.
- Folio Home design reference package, retained as documentation and assets without changing the live design.

The older delivery, outbound and commercial branch histories are preserved through merges. Other tasks' uncommitted workspace edits are excluded.

## Database compatibility

The production URL resolves to Supabase project `prllawgzxzrjitnjxgkn`. Read-only preflight found the existing mirrored list catalogue, but no membership or campaign-list tables and no delivery engine. The list migration adds the missing `notes` column without replacing the existing catalogue or its extra fields. Explicit grants remove inherited browser mutation/TRUNCATE permissions from delivery tables. Existing Pathfinder and outbound preparation migrations are already applied.

Applied successfully to production on 9 September 2026 (UTC 02:21–02:22); filenames match the recorded migration versions: `20260909022139_compass_delivery_engine.sql`, `20260909022151_lead_lists.sql`, and `20260909022207_compass_list_integration.sql`.

## Validation

Baseline main `6795c1b` produced 433 passing and 26 failing tests in an isolated worktree. The consolidated branch produced 461 passing and 24 failing tests in the same environment; all remaining failures also occur on baseline main. They include external workspace fixtures unavailable to a standalone checkout, stale source-text assertions and a timezone-sensitive planner expectation. The integration adds actual Postgres migration, API authorization and cohort pagination coverage. Route/import deployment guards, TypeScript checks and the production build pass. The latest outbound correction also passed all 38 outbound preparation tests. The new delivery/CRM and access checks are also included in CI.

## Delivery activation

This release does not enable live messaging, schedule workers, activate campaigns or contact leads. Delivery accounts start paused; real transport also requires `COMPASS_DELIVERY_LIVE=1`. The built-in demo uses fictional records and simulated providers.

Production catalogue checks confirm the new tables and both CRM functions exist, `notes` is present on the original catalogue, and browser roles have no delivery INSERT, delivery RPC or delivery/list TRUNCATE access. The Vercel production environment has no enabled live-delivery flag.
