# Slice 6 — End-to-end verification

This document covers the end-to-end verification of Compass-Web Lite bidirectional sync with Compass desktop via Supabase. It is the final slice before the Compass-Web Lite PR (#31) can be marked ready for review.

## Prerequisites (all must be done before running this verification)

1. **Cursor Cloud Secrets added** (user, dashboard):
   - `SUPABASE_URL` = `https://prllawgzxzrjitnjxgkn.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` (from Supabase Studio)
2. **Supabase migrations applied** (run `automation/bin/apply-supabase-migrations.sh` from PR #33):
   - Migration `0005_lead_cloud_mirror.sql` -> 6 lead tables + RLS + storage bucket
   - Migration `0006_compass_web_tasks.sql` -> 4 compass_* tables + RLS + indexes
3. **Compass-Web Lite deployed to Vercel** (user):
   - New Vercel project, repo = switchflow-os, root = `apps/compass-web`
   - Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Supabase Auth redirect URLs include `https://<vercel-domain>/auth/callback`
4. **Compass desktop configured** (user, Mac):
   - Compass Settings: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set
   - Compass desktop running (PR #32 merged + pulled on Mac)
5. **Magic-link auth completed** on Compass-Web Lite (check email for login link)

## Verification scenarios

### Scenario 1: Compass desktop -> Supabase -> Compass-Web Lite (task create)

**Mac side (Compass desktop):**
1. Open Compass, go to Task Console
2. Create a new task: title = "Slice 6 e2e test task (from desktop)"
3. Wait 2 seconds for the push-on-write sync to fire

**Cloud side (run this script):**
```bash
bash apps/compass-web/scripts/verify-e2e.sh task-created "Slice 6 e2e test task (from desktop)"
```
Expected: the task appears in `compass_tasks` table in Supabase with `mirrored_at` within the last minute.

**Web side (Compass-Web Lite):**
4. Open Compass-Web Lite, go to `/tasks`
5. Refresh the page
6. Expected: "Slice 6 e2e test task (from desktop)" appears in the task list

### Scenario 2: Compass-Web Lite -> Supabase -> Compass desktop (task create)

**Web side (Compass-Web Lite):**
1. Open Compass-Web Lite, go to `/tasks`
2. Click "New task", title = "Slice 6 e2e test task (from web)"
3. Save

**Cloud side:**
```bash
bash apps/compass-web/scripts/verify-e2e.sh task-created "Slice 6 e2e test task (from web)"
```
Expected: the task appears in `compass_tasks` with `source` = null or 'web'.

**Mac side (Compass desktop):**
4. Open Compass, go to Task Console
5. Trigger a refresh (or restart Compass if no auto-refresh)
6. Expected: "Slice 6 e2e test task (from web)" appears in the Task Console

### Scenario 3: Lead upload via Compass-Web Lite

**Web side:**
1. Open Compass-Web Lite, go to `/leads/upload`
2. Select vertical = `hvac`, source service = `prospeo`
3. Upload `apps/compass-web/scripts/hvac-fixture-5rows.csv`
4. Note the batch ID from the result panel

**Cloud side:**
```bash
bash apps/compass-web/scripts/verify-e2e.sh lead-uploaded <batch-id>
```
Expected:
- `lead_import_batches` has 1 new row with the batch ID
- `lead_source_rows` has 5 new rows
- `lead_contacts` has 5-6 new rows (depending on dedup)
- Storage bucket `lead-raw-exports` has the raw CSV at `prospeo/hvac/<date>/hvac-fixture-5rows.csv`

### Scenario 4: Lead pull via Compass-Web Lite

**Web side:**
1. Open Compass-Web Lite, go to `/leads`
2. Filter by vertical = `hvac`
3. Expected: the 5-6 HVAC leads from Scenario 3 appear
4. Click "Export CSV" -> verify the download contains the 5-6 rows

## Automated verification script

`apps/compass-web/scripts/verify-e2e.sh` checks Supabase state from the cloud pod. It requires:
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in env
- `supabase` CLI on PATH (or uses curl directly)

Usage:
```bash
SUPABASE_URL='...' SUPABASE_SERVICE_ROLE_KEY='...' \
bash apps/compass-web/scripts/verify-e2e.sh <scenario> <arg>
```

Scenarios:
- `task-created <title>` — verify a task with the given title exists in `compass_tasks`
- `lead-uploaded <batch-id>` — verify a lead import batch + its source rows + contacts exist
- `lead-count <expected-count>` — verify `lead_contacts` has at least the expected count

## Manual verification (Mac side, no automation)

The Compass desktop side of Scenarios 1 and 2 cannot be automated from the cloud pod (Compass Electron doesn't run on Linux). The user must:
- Create the task in Compass desktop and confirm it appears in Compass-Web Lite
- Create the task in Compass-Web Lite and confirm it appears in Compass desktop after refresh

These are the only remaining manual steps. Everything else is automated by `verify-e2e.sh`.

## Evidence for PR

Once all scenarios pass, attach to PR #31:
- `verify-e2e.sh` output for all 3 automated scenarios
- Screenshot of Compass-Web Lite `/tasks` showing both test tasks
- Screenshot of Compass-Web Lite `/leads` showing the 5-6 HVAC leads
- Vercel deploy URL
- Supabase table row counts (from the verification log)
