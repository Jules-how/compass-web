# Compass-Web agent notes

## Agent ↔ Compass bridge

Local and cloud Cursor agents connect to Compass over `/api/agent/*` (secret auth). Daily cron: `/api/cron/daily-sync`.

- Skill: [`.cursor/skills/compass-agent/SKILL.md`](.cursor/skills/compass-agent/SKILL.md)
- Docs: [`docs/AGENT_BRIDGE.md`](docs/AGENT_BRIDGE.md)
- Prefer `GET /api/agent/brief` before dumping data — keep prompts token-lean.
- Instantly replied/interested/meeting/not-interested/OOO/wrong-person leads sync into `lead_contacts` so Inbox Instantly stays aligned.
- Outbound craft UI persists campaigns + library to Supabase (same store as `/api/agent/outbound/*`). Unbound editor drafts stay browser-local until “save as campaign.”
- Campaign brief of record = Compass campaign copy (`sequence_draft`, `cold_expression`, …), not vault `brief.md`.

## UI aesthetic is locked

The operator UI depth effect, rounded corners, card separation, and **sidebar (sidecar) animations/UI** are **approved and locked**.

- Always-on rule: [`.cursor/rules/compass-ui-lock.mdc`](.cursor/rules/compass-ui-lock.mdc)
- Tokens: `src/app/globals.css`, `tailwind.config.ts` (`shadow-soft`, compass colors)
- Primitives: `src/components/ui/card.tsx`
- Sidebar motion & chrome: `src/components/ui/sidebar.tsx` (72↔248 hover expand, active pill + orange rail, mobile slide-in)

Do **not** restyle shadows, radii, spacing, wash background, Geist Sans typography, accent treatment, or sidebar expand/collapse motion unless the user explicitly requests a visual change. New UI should match Sales / Home / current shell patterns.

## UI mockups

Mockups / “what it would look like” → **coded local preview** (Next `/…/mock` page or static HTML + `npm run dev`), never Miro/Canva/Figma unless the user names that tool. Rule: [`.cursor/rules/ui-mockups-coded-preview.mdc`](.cursor/rules/ui-mockups-coded-preview.mdc).


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
  screen. Set `COMPASS_OPEN_OPERATOR=0` to restore the normal password login screen.
- The customer delivery portal (`/delivery/**`) is gated behind
  `COMPASS_PORTAL_V1=1` and is left disabled (`0`) by default; the operator
  console works without it.

### Running / dev
- Dev server: `npm run dev` serves on port **3100** (not 3000). Production
  `npm run start` uses Next's default 3000.
- Verify a running server quickly: `curl -s -o /dev/null -w '%{http_code}' \
  http://localhost:3100/tasks` (expect `200` after auto-login).

### Tests / lint / build
- `npm run lint`, `npm run typecheck`, and `npm run build` should pass.
- Prefer operator-console / project-management tests in `test/` for this repo mirror.

## Learned User Preferences

- Keep the Compass ↔ vault ↔ Instantly cold-email loop simple; do not encode elaborate multi-gate ceremony spines.
- Treat `offer-library.md` as a loose baseline guide; campaign-specific offer variants live in Compass.
- Cheap lead habits only: Instantly-screen before upload, mark Compass the same turn after upload, and never treat upload as activate (activate only after Jules sign-off).

## Learned Workspace Facts

- Cold-email operating model: Compass = workshop (orient + craft sequences from library components/templates + leads); vault agent = runner (research/openers/personalizations + Instantly screen/upload + mark Compass); Instantly = mail truck (activate after Jules sign-off).
- Vault outbound `.md` files hold process and per-lead work, not a parallel offer/template warehouse.
- Compass stores reusable opener formats/examples; per-lead openers stay vault enrich → Instantly merge vars.
