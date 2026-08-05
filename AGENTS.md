# AGENTS.md

## Cursor Cloud specific instructions

Compass-Web is a single Next.js 15 (App Router) + React 19 app backed by a hosted
Supabase project (Auth + Postgres RLS/RPCs + Storage). There is no local database
to run — the app points at a hosted Supabase project. Standard scripts live in
`package.json`; setup/run details live in `README.md`. Notes below are the
non-obvious bits for working in the Cursor Cloud environment.

### Environment / secrets
- The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  but the injected Cloud secrets are named `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  and `SUPABASE_SERVICE_ROLE_KEY`. The startup update script bridges this by
  generating a gitignored `.env.local` that maps the injected secrets to the
  `NEXT_PUBLIC_*` names. If Supabase features error with "Missing
  NEXT_PUBLIC_SUPABASE_URL...", `.env.local` is missing/stale — re-run the update
  script (or regenerate it from the `SUPABASE_*` env vars).
- `.env.local` is gitignored on purpose; never commit real credentials.
- Auth uses the "open operator" auto-login (`COMPASS_OPEN_OPERATOR=1`, default on).
  Middleware auto-signs-in the default operator account defined in
  `src/lib/open-operator.ts`, so hitting `/` redirects to `/tasks` with no login
  screen. This requires the hosted Supabase project to contain that operator user
  with an active internal-tenant membership (it already does). Set
  `COMPASS_OPEN_OPERATOR=0` to restore the normal password login screen.
- The customer delivery portal (`/delivery/**`) is gated behind
  `COMPASS_PORTAL_V1=1` and is left disabled (`0`) by default; the operator
  console works without it.

### Running / dev
- Dev server: `npm run dev` serves on port **3100** (not 3000). Production
  `npm run start` uses Next's default 3000.
- Verify a running server quickly: `curl -s -o /dev/null -w '%{http_code}' \
  http://localhost:3100/tasks` (expect `200` after auto-login).

### Tests / lint / build
- `npm run lint`, `npm run typecheck`, and `npm run build` all pass cleanly.
- `npm test` (`node --test test/*.test.mjs`): 13 tests pass. **7 tests fail by
  design** in this deployment mirror and are NOT environment problems — they
  reference files that only exist in the parent `switchflow-os` monorepo:
  `test/portal-contracts.test.mjs` and `test/portal-sql.test.mjs` import
  `/packages/compass-core/...` and read migrations `0019`–`0026` (this mirror
  only ships `supabase/migrations/0027_*`), and `test/portal-redirect.test.mjs`
  imports a `.ts` file directly (unsupported by the Node test runner). Treat the
  operator-console / project-management tests as the meaningful suite here.
