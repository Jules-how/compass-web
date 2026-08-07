# Compass-Web

Compass-Web has two deliberately separate surfaces:

- a private **operator management console** (Leads, Inbox, Tasks, Projects, Functions);
- an invite-only, tenant-safe delivery portal for customers;
- a customer lead inbox (`/leads`) fed by secret ingest from client websites and Meta workflows.

Operator Leads = outbound `lead_contacts`. Operator Inbox is a multi-channel
work queue (Agents / Instantly / inbound `portal_inbound_leads`) with triage
state, lead lifecycle, ranking, and a cross-tab “Needs you” strip. Delivery
stays off the primary operator nav.

The delivery domain is cloud-authoritative. It never projects private Compass
tasks, CRM records, notes, prompts, billing, ownership, or internal status into
customer responses.

SQLite → Supabase cutover for operator domains: [scripts/CUTOVER.md](scripts/CUTOVER.md).

## Stack

- Next.js 15 App Router and React 19
- TypeScript and Tailwind CSS
- Supabase Auth, Postgres RLS/RPCs, and private Storage
- Cookie-bound `@supabase/ssr` clients for all data requests

## Required migrations

Apply the repository migrations in order. The portal slice is:

```text
0019_portal_tenancy.sql
0020_portal_delivery_domain.sql
0021_portal_delivery_commands_storage.sql
0022_compass_web_operator_boundary.sql
0026_portal_inbound_leads.sql
```

These migrations add tenants, memberships, invitations, delivery-only tables,
constrained customer commands, storage policies, audit evidence, and explicit
operator policies for the existing private Compass mirrors.

Migration `0019` automatically promotes the sole existing Supabase Auth user to
the owner membership. If the project already has multiple Auth users, it refuses
to guess. An administrator must call `portal_bootstrap_operator(email)` with
`service_role` once, naming the intended operator.

Ad account connections (Home live metrics) use:

```text
0030_compass_ad_accounts.sql
```

Client communications (linked email/SMS threads + auto summaries) use:

```text
0031_compass_client_comms.sql
```

Inbox triage (read/done/snooze + inbound lead lifecycle) uses:

```text
0033_inbox_triage.sql
```

Connect Meta / Google / LinkedIn under **Settings → Ad accounts**, then Sync.
Until accounts are connected and synced, Home keeps the demo glance.

On a client, open the **Comms** tab to manually link email/SMS/call threads
(with an optional provider `external_id`). Push new messages to
`POST /api/ingest/comms` with `x-ingest-secret` so summaries update within
minutes of arrival. Paste messages in-app when you are not using automation.

## Environment

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PORTAL_RATE_LIMIT_SALT=...
COMPASS_PORTAL_V1=1
COMPASS_LEAD_INGEST_SECRET=...
AD_TOKEN_ENCRYPTION_KEY=...
AD_DEFAULT_LEAD_VALUE=200
META_APP_ID=...
META_APP_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
```

`SUPABASE_SERVICE_ROLE_KEY` is used by narrow server routes: invitation
administration, magic-link eligibility checks, and secret-authenticated lead
ingest (`POST /api/ingest/leads`). The eligibility RPC is not executable by `anon` or `authenticated` roles.
Customer delivery routes and legacy task/lead routes never use the service role.
Leave `COMPASS_PORTAL_V1` unset to keep the customer delivery slice disabled
while retaining the private operator console.

`AD_TOKEN_ENCRYPTION_KEY` encrypts ad-platform tokens at rest. If unset, the
server derives a key from `SUPABASE_SERVICE_ROLE_KEY`. Prefer an explicit key in
production. Optional `META_APP_ID` / `META_APP_SECRET` enable Facebook OAuth on
Settings; otherwise paste a Meta system-user or long-lived token.

Never expose the service-role key to browser code or a `NEXT_PUBLIC_*` variable.

## Development

```bash
cd apps/compass-web
npm install
npm run dev
```

The development server uses port 3100. Add these Supabase Auth redirect URLs:

- `http://localhost:3100/auth/callback`
- `https://<production-host>/auth/callback`

Password login is invite/membership-only. Operators with an active internal
owner/operator membership land on `/tasks`; customers cannot open operator
surfaces.
Invitation consumption binds the authenticated user and email to the intended
tenant and rejects expiry, revocation, mismatch, and cross-user replay.

## Authorization boundary

- Customer authority is derived from `auth.uid()` plus an active
  `tenant_memberships` row.
- Customer reads use explicit delivery DTO projections and bounded cursor pages.
- Customer writes call idempotent RPC commands for comments, completion,
  decisions, and evidence registration.
- Cross-tenant guessed IDs resolve as `not_found`.
- Evidence is stored in the private `delivery-evidence` bucket, limited to 4 MiB
  and an allowlist of passive MIME types. Downloads are short-lived signed URLs
  with forced-download filenames.
- Existing task and lead routes require an owner/operator membership and use the
  session client with RLS. Operator authority is valid only on the dedicated
  active `internal` tenant, so an `operator` label on a customer tenant cannot
  grant private-console access. Historical `all authenticated` policies are
  removed.
- Every cookie-authenticated mutation route rejects cross-origin requests before
  reading a body or invoking a database command.
- Private operator-task linkage lives in `delivery_operator_task_links`, which
  customers cannot select or join.

## Main routes

| Surface | Route | Access |
|---|---|---|
| Operator leads (outbound) | `/leads` | Owner/operator only |
| Operator inbox (inbound) | `/inbox` | Owner/operator only |
| Tasks | `/tasks`, `/api/tasks/**` | Owner/operator only |
| Projects | `/projects`, `/api/projects/**` | Owner/operator only |
| Functions | `/functions`, `/api/functions/**` | Owner/operator only |
| Customer leads | `/leads` | Active customer membership |
| Delivery list | `/delivery` | Active tenant member |
| Delivery project | `/delivery/[projectId]` | Same-tenant member |
| Comment command | `POST /api/delivery/items/[itemId]/comments` | Same-tenant member |
| Complete request | `POST /api/delivery/items/[itemId]/complete` | Assigned/client-owned transition only |
| Decide item | `POST /api/delivery/items/[itemId]/decisions` | Reviewable transition only |
| Attach evidence | `POST /api/delivery/items/[itemId]/attachments` | Same-tenant member, validated file |
| Invite member | `POST /api/operator/invitations` | Owner/operator only |

## Deploy smoke (Vercel)

Vercel project root: `apps/compass-web`. Required Auth redirect:

- `https://<production-host>/auth/callback`

After deploy, Jules login should open `/tasks` (operator landing) and the five
primary nav routes must load. Static tree smoke (no credentials):

```bash
node scripts/operator-console-smoke.mjs
```

## Verification

Focused checks do not need live credentials:

```bash
node --test test/*.test.mjs
node scripts/operator-console-smoke.mjs
npm run typecheck
npm run build
```

The real RLS/RPC isolation suite requires an isolated Supabase branch and three
disposable Auth users. It never prints credentials and rolls fixture data back:

```bash
PORTAL_DATABASE_URL='...' \
PORTAL_TEST_OPERATOR_USER='uuid' \
PORTAL_TEST_TENANT_A_USER='uuid' \
PORTAL_TEST_TENANT_B_USER='uuid' \
./scripts/verify-portal-isolation.sh
```

Then run the API/storage proof with disposable access tokens and a test-only
service key. The script creates random fixtures, prints only boolean results,
and cleans up in `finally`:

```bash
PORTAL_TEST_URL='...' \
PORTAL_TEST_ANON_KEY='...' \
PORTAL_TEST_SERVICE_ROLE_KEY='...' \
PORTAL_TEST_OPERATOR_USER='uuid' \
PORTAL_TEST_TENANT_A_USER='uuid' \
PORTAL_TEST_TENANT_A_ACCESS_TOKEN='...' \
PORTAL_TEST_TENANT_B_USER='uuid' \
PORTAL_TEST_TENANT_B_ACCESS_TOKEN='...' \
node ./scripts/verify-portal-live.mjs
```

Run that suite before setting `COMPASS_PORTAL_V1=1` in production or inviting a
real customer. Local static tests are not a substitute for the live RLS proof.

## Rollout and rollback

1. Apply migrations to a disposable Supabase branch.
2. Bootstrap/verify the operator membership.
3. Run the live tenant A/B isolation suite.
4. Deploy with `COMPASS_PORTAL_V1` unset and verify operator task/lead access.
5. Set `COMPASS_PORTAL_V1=1` only after the isolation result is recorded.
6. Invite a disposable customer, then a real customer.

To roll back exposure, unset `COMPASS_PORTAL_V1` immediately. Keep the new tables
and RLS policies in place so customer identities cannot fall back into the old
all-authenticated private-data boundary. Data/schema rollback should be a forward
migration after exporting delivery records; do not restore the insecure policies.
