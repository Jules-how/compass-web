---
name: compass-ui-lock
description: Preserve the locked Compass operator UI aesthetic (depth, rounded corners, separation, sidebar animations). Use when editing TSX/CSS UI, sidebar/nav, adding pages or cards, or anytime styling or motion might change.
---

# Compass UI lock

Before changing any operator UI chrome or sidebar motion, read `.cursor/rules/compass-ui-lock.mdc`.

## Checklist

- [ ] Using `Card` / `compass-panel` (or equivalent `rounded-2xl` + `shadow-soft` + soft border)?
- [ ] Controls use `compass-input` / `compass-btn-*` (`rounded-xl`), not sharp `rounded-md` boxes?
- [ ] Keeping generous gaps between sections (not densifying)?
- [ ] Leaving `--compass-*` tokens, `shadow-soft`/`lift`, and Geist Sans typography alone?
- [ ] Accent orange only for emphasis/CTAs/active nav?
- [ ] Sidebar still uses hover expand 72→248, soft active pill + orange rail, and existing framer-motion timings?
- [ ] Nav changes reuse `SidebarLink` / `SidebarLabel` rather than a new pattern?
- [ ] No theme/dark-mode/flattening/sidebar-redesign unless the user asked?

If any checkbox would fail because of a redesign impulse, keep the existing look and motion.
