# Compass-Web agent notes

## Agent ↔ Compass bridge

Local and cloud Cursor agents connect to Compass over `/api/agent/*` (secret auth). Daily cron: `/api/cron/daily-sync`.

- Skill: [`.cursor/skills/compass-agent/SKILL.md`](.cursor/skills/compass-agent/SKILL.md)
- Docs: [`docs/AGENT_BRIDGE.md`](docs/AGENT_BRIDGE.md)
- Prefer `GET /api/agent/brief` before dumping data — keep prompts token-lean.
- Instantly replied/interested/meeting/not-interested/OOO/wrong-person leads sync into `lead_contacts` so Inbox Instantly stays aligned.
- Compass can create a paused Instantly campaign, push sequence copy, and push cohort leads with merge vars (`POST /api/campaigns/:id/instantly/*` and `/api/agent/instantly/*`). Activate stays in Instantly.
- Outbound craft UI persists campaigns + library to Supabase (same store as `/api/agent/outbound/*`). Unbound editor drafts stay browser-local until “save as campaign.”
- Campaign brief of record = Compass campaign copy (`sequence_draft`, `cold_expression`, …), not vault `brief.md`.

## UI aesthetic is locked

The operator UI depth effect, rounded corners, card separation, and **sidebar (sidecar) animations/UI** are **approved and locked**.

- Always-on rule: [`.cursor/rules/compass-ui-lock.mdc`](.cursor/rules/compass-ui-lock.mdc)
- Skill: [`.cursor/skills/compass-ui-lock/SKILL.md`](.cursor/skills/compass-ui-lock/SKILL.md)
- Tokens: `src/app/globals.css`, `tailwind.config.ts` (`shadow-soft`, compass colors)
- Primitives: `src/components/ui/card.tsx`
- Sidebar motion & chrome: `src/components/ui/sidebar.tsx` (72↔248 hover expand, active pill + orange rail, mobile slide-in)

Do **not** restyle shadows, radii, spacing, wash background, Geist Sans typography, accent treatment, or sidebar expand/collapse motion unless the user explicitly requests a visual change. New UI should match Sales / Home / current shell patterns.

### How to style new operator UI

Reuse existing helpers. Do not invent sharp `rounded-md` forms or a second card language.

| Piece | Use |
| --- | --- |
| Page cards / panels | `Card` or `.compass-panel` (`rounded-2xl`, soft stone border, `shadow-soft`) |
| Nested blocks inside a panel | `rounded-xl`, light stone border, airy `p-4` / `p-5` |
| Inputs, selects, textareas | `.compass-input` |
| Buttons | `.compass-btn-primary` / `.compass-btn-secondary` / `.compass-btn-ghost` |
| Section captions | `.compass-section-label` |
| Page titles | `.compass-page-title` / `.compass-page-subtitle` |

Controls are **rounded-xl**. Primary surfaces are **rounded-2xl**. If a screen looks boxy next to the nav pill, it is missing these classes.

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
- Before pushing `main`: run `npm run verify` (deploy guards + typecheck). Guards catch the two Vercel footguns that kept red-deploying: illegal `route.ts` helper exports, and `@/` imports that only resolve to **untracked** local files (local build can pass; Vercel cannot see them).
- GitHub Action `.github/workflows/deploy-guards.yml` runs verify + production build on push/PR.
- Prefer operator-console / project-management tests in `test/` for this repo mirror.

## Learned User Preferences

- Keep the Compass ↔ vault ↔ Instantly cold-email loop simple; do not encode elaborate multi-gate ceremony spines.
- Treat `offer-library.md` as a loose baseline guide; campaign-specific offer variants live in Compass.
- Prefer creator/source outbound examples as the labeled library baseline; keep Jules variations labeled separately — do not treat fused Switchflow campaign copy as creator source of truth.
- Cheap lead habits only: Instantly-screen (skip-if-in-workspace / verify on import) before push, mark Compass the same turn after push, and never treat push as activate (activate only after Jules sign-off).
- Home priorities should deep-link to the relevant tool (Gmail for replies, Instantly, Prospeo, etc.) and be completable in place.
- Project/campaign progress percentages must reflect real completion data, not decorative placeholders.
- Outbound craft Components should stay roomy for comparing styles (wide gallery / type tabs); click opens full view + edit (slide-over), while drag/Use still inserts into the draft.

## Learned Workspace Facts

- Cold-email operating model: Compass = workshop (orient + craft sequences from library components/templates + leads); Compass or the vault agent pushes leads and copy into Instantly via API; Instantly = mail truck (activate after Jules sign-off). No CSV hop for Instantly.
- Vault outbound `.md` files hold process and per-lead work, not a parallel offer/template warehouse.
- Compass stores reusable opener formats/examples; per-lead openers stay vault enrich → Instantly merge vars.
- Outbound library rows carry provenance (`source` | `yours`) plus `source_creator` / `source_file`; source inventory seeds from vault playbooks (Nick Saraev Cold Email / ACC / Nick / Platten / Connor), and newly added UI rows default to yours.
- Outbound library warm path skips full re-seed when the catalogue is already present (count/sentinel + session cache); craft UI loads kinds via a single `/api/outbound/library` bundle rather than per-kind fetches.
