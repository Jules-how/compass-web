---
name: compass-ui-lock
description: Preserve the locked Compass operator UI aesthetic (depth, rounded corners, separation). Use when editing TSX/CSS UI, adding pages or cards, or anytime styling might change.
---

# Compass UI lock

Before changing any operator UI chrome, read `.cursor/rules/compass-ui-lock.mdc`.

## Checklist

- [ ] Using `Card` / `compass-panel` (or equivalent `rounded-2xl` + `shadow-soft` + soft border)?
- [ ] Keeping generous gaps between sections (not densifying)?
- [ ] Leaving `--compass-*` tokens, `shadow-soft`/`lift`, and Fraunces display titles alone?
- [ ] Accent orange only for emphasis/CTAs?
- [ ] No theme/dark-mode/flattening/redesign unless the user asked?

If any checkbox would fail because of a redesign impulse, keep the existing look.
