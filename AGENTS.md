# Compass-Web agent notes

## Agent ↔ Compass bridge

Local and cloud agents connect to Compass over `/api/agent/*` (secret auth). Daily cron: `/api/cron/daily-sync`.

- Skill: [`.agents/skills/compass-agent/SKILL.md`](.agents/skills/compass-agent/SKILL.md)
- Docs: [`docs/AGENT_BRIDGE.md`](docs/AGENT_BRIDGE.md)
- Goals/actions and rich notebooks: [`docs/GOALS_ACTIONS.md`](docs/GOALS_ACTIONS.md). Explicit user goal edits or task completion from local Codex use the source-bound signed adapter; ordinary agent writes remain proposals. Read current revisions and retain the same receipt for uncertain retries. Do not infer user confirmation from activity or agent text. ChatGPT/Work require their own trusted adapter and are not connected by the shared secret alone.
- List refill (query Compass, do not re-scrape): [`docs/LEAD_REFILL.md`](docs/LEAD_REFILL.md)
- Prefer `GET /api/agent/brief` before dumping data — keep prompts token-lean. Brief includes `currentWave` (campaign, trade, cluster, remaining). Outbound doctrine is `cold-email/AGENTS.md`, not this app.
- Instantly replied/interested/meeting/not-interested/OOO/wrong-person leads sync into `lead_contacts` so Inbox Instantly stays aligned.
- Compass can create a paused Instantly campaign, push sequence copy, and push cohort leads with merge vars (`POST /api/campaigns/:id/instantly/*` and `/api/agent/instantly/*`). Activate stays in Instantly.
- Instantly lead write: Instantly keeps `first_name`, `last_name`, `company_name`, `phone`, `website`, `personalization`, and `custom_variables.*`. Extra top-level keys (`opener`, `teamOrFirstName`, a nested `payload`) are dropped with no error. Put the first line in both `personalization` and `custom_variables.opener`. Sequence tokens: `{{firstName}}` plus `{{opener}}` (or `{{personalization}}`). Never guess a person name; `first_name` is a published person or blank, never `team`. Mapper: `src/lib/instantly-push.ts` `leadContactToInstantlyLead`. After a push, check one lead has `first_name` and `payload.opener` before calling it done.
- Outbound craft UI persists campaigns + library to Supabase (same store as `/api/agent/outbound/*`). Unbound editor drafts stay browser-local until “save as campaign.”
- Sequence body of record = Compass campaign copy (`sequence_draft`, `cold_expression`, …). Outbound doctrine = `cold-email/AGENTS.md`. Current offer terms = the named contract in `../switchflow-offer/`, checked against Compass when relevant.

- CRM lists segment the existing lead ledger; campaigns may attach lists. Use the agent list endpoints for membership changes.

## UI work

For UI changes or reviews, use [Compass UI guidance](.cursor/rules/compass-ui-lock.mdc). It owns design identity, source pointers, and the distinction between incidental code changes and requested improvements. For a mockup, see [preview formats](.cursor/rules/ui-mockups-coded-preview.mdc).

## Local work and context

For Switchflow business planning or execution, first read the current Compass decision note `planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0` and latest `Switchflow — day plan — YYYY-MM-DD` working note through the agent planning API. After material work, append checked results, evidence and the next action to the existing dated handover; preserve other writers' changes and use the current revision. Keep tasks open for Jules to confirm, and propose changes to accepted priorities or schedules. The workflow and source gaps are defined in `docs/CLOUD_MORNING_OPERATING_PLAN.md`; do not infer all-chat access or new execution authority from shared context.

Do not start `next dev` / `npm run dev` unless Jules asks. Hosted Compass: https://compass-web-eosin.vercel.app. Choose a preview format appropriate to the request; static HTML is available without starting a compiler.

When opened as a standalone repository, also consult `../AGENTS.md` if this is the Switchflow workspace. It contains business constraints that do not automatically cross the Git root. Use independent judgement; historical methods and preferences are context, and the current request determines the scope.

Compass-Web is a Next.js App Router + React app using hosted Supabase. Check `package.json` for current versions and scripts. The following environment mapping describes the existing Cursor cloud setup; verify the selected host before applying it.

### Environment / secrets
- The app reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  but the injected Cloud secrets are named `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  and `SUPABASE_SERVICE_ROLE_KEY`. The startup update script bridges this by
  generating a gitignored `.env.local` that maps the injected secrets to the
  `NEXT_PUBLIC_*` names. If Supabase features error with "Missing
  NEXT_PUBLIC_SUPABASE_URL...", `.env.local` is missing/stale — re-run the update
  script (or regenerate it from the `SUPABASE_*` env vars).
- `.env.local` is gitignored on purpose; never commit real credentials.
- Hosted Compass requires private operator sign-in. Open-operator auto-login is disabled in hosted builds; local development requires an explicit flag and configured credentials. Public signing links expose only their individual agreement. Account security cutovers invalidate earlier sessions through the operator session cutoff.
- The customer delivery portal (`/delivery/**`) is gated behind
  `COMPASS_PORTAL_V1=1` and is left disabled (`0`) by default; the operator
  console works without it.

### Running / dev
- Dev server: `npm run dev` serves on port **3100** (not 3000). Production
  `npm run start` uses Next's default 3000.
- Verify a running server quickly: `curl -s -o /dev/null -w '%{http_code}' \
  http://localhost:3100/tasks` (a protected route may require sign-in; do not bypass authentication to make this check pass).

### Tests / lint / build
- `npm run lint`, `npm run typecheck`, and `npm run build` should pass.
- Before pushing `main`: run `npm run verify` (deploy guards + typecheck). Guards catch the two Vercel footguns that kept red-deploying: illegal `route.ts` helper exports, and `@/` imports that only resolve to **untracked** local files (local build can pass; Vercel cannot see them).
- Production uses one shared alias. Fetch current `origin/main` before release, preserve other merged work, and push the integrated source before publishing. A successful deployment from an older checkout can remove another task's routes. Verify the public alias and required APIs after the final release, not only an immutable deployment URL.
- GitHub Action `.github/workflows/deploy-guards.yml` runs verify + production build on push/PR.
- Prefer operator-console / project-management tests in `test/` for this repo mirror.

## Learned User Preferences

- Keep the Compass ↔ vault ↔ Instantly cold-email loop simple; do not encode elaborate multi-gate ceremony spines.
- Treat `offer-library.md` as a loose baseline guide; campaign-specific offer variants live in Compass.
- Prefer creator/source outbound examples as the labeled library baseline; keep Jules variations labeled separately — do not treat fused Switchflow campaign copy as creator source of truth.
- On this Mac, follow the workspace instantly-load skill: finished verified CSV in Chrome, campaign duplicate check on, workspace check off unless requested, import verification off. Reconcile uploaded inboxes before marking those Compass IDs. Upload does not activate.
- Home priorities should deep-link to the relevant tool (Gmail for replies, Instantly, Prospeo, etc.) and be completable in place.
- Project/campaign progress percentages must reflect real completion data, not decorative placeholders.
- Outbound craft Components should stay roomy for comparing styles (wide gallery / type tabs); click opens full view + edit (slide-over), while drag/Use still inserts into the draft.

## Learned Workspace Facts

- Home morning is the wave loop: Instantly sending campaigns, two next slots, accept/dismiss the daily brief before live land. Remaining under 50 is the land cue. Copy confirm and opener review ticks live on the Home row. Inbox count is Instantly replies only. Pathway config (tools, opener templates, run logs) is Outbound → Pathways. Local agents run list-builds; Compass does not scrape. Activate stays Instantly.
- Offer test cells on `/sales/offers` are `offer_key` × first `vertical_tags` × first `location_tags`. One Instantly campaign per cell. City is `location_tags`, not the campaign name. `POST /api/offers/cells` (and `/api/agent/offers/cells`) creates the missing grid and tags a no-city campaign for that vertical instead of duplicating it.
- Vault outbound `.md` files hold process and per-lead work, not a parallel offer/template warehouse.
- Per-lead first line is stamped from `cold-email/AGENTS.md` into Instantly `personalization` and `custom_variables.opener`.
- Outbound library rows carry provenance (`source` | `yours`) plus `source_creator` / `source_file`; source inventory seeds from vault playbooks (Nick Saraev Cold Email / ACC / Nick / Platten / Connor), and newly added UI rows default to yours.
- Outbound library warm path skips full re-seed when the catalogue is already present (count/sentinel + session cache); craft UI loads kinds via a single `/api/outbound/library` bundle rather than per-kind fetches.
