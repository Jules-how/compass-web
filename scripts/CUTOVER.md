# Compass Web cutover (SQLite → Supabase SoT)

One-time push of desktop Compass data into Supabase for the management console domains, then freeze desktop as non-authoritative for those domains.

## Domains

- Tasks, projects, business functions → `compass_tasks`, `compass_projects`, `compass_business_functions`
- Outbound leads → `lead_contacts` (+ related lead mirror tables)

Inbox (`portal_inbound_leads`) is already cloud-authoritative; no desktop cutover.

## Steps

1. Ensure vault `.env` has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (desktop sync uses service role).
2. From Mac, with Compass userData live:

```bash
cd /Users/Jules/switchflow-os/apps/compass
npm run cli -- --task-cloud-sync
npm run cli -- --lead-cloud-sync
```

3. Confirm JSON lines print success (`TASK_CLOUD_SYNC`, `LEAD_CLOUD_SYNC`) without `error`.
4. Open Compass-Web operator routes and verify lists match:
   - `/tasks`, `/projects`, `/functions`, `/leads`, `/inbox`
5. Create a test task/project on web; refresh; confirm it persists.
6. **Freeze desktop for these domains:** stop using Electron Tasks / Projects / Functions / Leads as the live editor. Prefer web writes only. Desktop may remain installed for other Mac-only tools, but do not treat local SQLite as source of truth for the cutover domains.

## Optional safety net

```bash
npm run cli -- --db-backup-upload
```

Keeps a gzipped SQLite snapshot in Supabase Storage before you abandon local authority.

## Rollback

If web data is wrong before freeze: restore cloud → local with Settings restore / `restoreAllCloud`, fix locally, re-run `--task-cloud-sync` / `--lead-cloud-sync`. After freeze, treat Supabase as canonical and fix via web or SQL.
