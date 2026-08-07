# Compass-Web agent notes

## UI aesthetic is locked

The operator UI depth effect, rounded corners, and card separation are **approved and locked**.

- Always-on rule: [`.cursor/rules/compass-ui-lock.mdc`](.cursor/rules/compass-ui-lock.mdc)
- Tokens: `src/app/globals.css`, `tailwind.config.ts` (`shadow-soft`, compass colors)
- Primitives: `src/components/ui/card.tsx`

Do **not** restyle shadows, radii, spacing, wash background, display typography, or accent treatment unless the user explicitly requests a visual change. New UI should match Sales / Home card patterns.
