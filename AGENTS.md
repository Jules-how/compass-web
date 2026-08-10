# Compass-Web agent notes

## Agent ↔ Compass bridge

Local and cloud Cursor agents connect to Compass over `/api/agent/*` (secret auth). Daily cron: `/api/cron/daily-sync`.

- Skill: [`.cursor/skills/compass-agent/SKILL.md`](.cursor/skills/compass-agent/SKILL.md)
- Docs: [`docs/AGENT_BRIDGE.md`](docs/AGENT_BRIDGE.md)
- Prefer `GET /api/agent/brief` before dumping data — keep prompts token-lean.
- Instantly replied/interested/meeting leads sync into `lead_contacts` so Inbox Instantly stays aligned.

## UI aesthetic is locked

The operator UI depth effect, rounded corners, card separation, and **sidebar (sidecar) animations/UI** are **approved and locked**.

- Always-on rule: [`.cursor/rules/compass-ui-lock.mdc`](.cursor/rules/compass-ui-lock.mdc)
- Tokens: `src/app/globals.css`, `tailwind.config.ts` (`shadow-soft`, compass colors)
- Primitives: `src/components/ui/card.tsx`
- Sidebar motion & chrome: `src/components/ui/sidebar.tsx` (72↔248 hover expand, active pill + orange rail, mobile slide-in)

Do **not** restyle shadows, radii, spacing, wash background, Geist Sans typography, accent treatment, or sidebar expand/collapse motion unless the user explicitly requests a visual change. New UI should match Sales / Home / current shell patterns.

## UI mockups

Mockups / “what it would look like” → **coded local preview** (Next `/…/mock` page or static HTML + `npm run dev`), never Miro/Canva/Figma unless the user names that tool. Rule: [`.cursor/rules/ui-mockups-coded-preview.mdc`](.cursor/rules/ui-mockups-coded-preview.mdc).
