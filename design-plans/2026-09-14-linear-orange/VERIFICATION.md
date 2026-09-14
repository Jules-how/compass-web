# Linear visual match — 14 September 2026

Jules: “I want compass to look and feel exactly like linear but with a very slight orange accent.” He then opened his Linear workspace and instructed: “Make sure you get it right.” The light theme was observed directly in that workspace.

## Reference and changes

Read-only inspection of the live Linear issue board and Projects timeline established Inter Variable, 13px/500 navigation labels, 244px sidebar, 28px navigation rows, 14px icons, a 44px location bar, 12px main-canvas corners, near-white canvas and white cards. Exact measured colours are in `docs/design/WORKSPACE.md`.

Updated shared typography, palette, navigation, controls and dense table/board styling. Orange is used as a small accent. Removed the duplicated Tasks heading and full-width status footer from each task card. The status icon beside the title still contains the original labelled native select and original move callback, including focus restoration. All existing routes, source data, save semantics, auth and keep-alive behavior remain in place. Existing settings, writing measures and status meaning are preserved.

This is a visual adaptation to Compass's workflows, not implementation of every Linear feature. No Linear data was modified.

## Checks

- `npm run verify`: passed deploy guards and TypeScript.
- 29 existing focused checks passed: navigation/cache, task board, project timeline interaction, responsive project creation, reports and planning.
- CSS diff whitespace check passed. Inter WOFF2 and SIL Open Font License are stored locally under `public/fonts/inter`.
- Local browser harness renders the actual production `FolioSidebar`, `FolioTopbar`, `ModalFrame` and `KanbanBoard` components. Its toolbar and move persistence are isolated fixtures. Existing Compass tasks were snapshotted locally for realistic content; preview interactions do not write to Compass.
- Desktop 1440×1000: actual computed sidebar 244px, rows 28px, header 44px, Inter Variable and 324px card width. No document horizontal overflow. Matched against Linear at the same viewport size.
- Tablet 768×1024 and phone 390×844: document width equals viewport width; board overflow stays in its horizontal scroll region. Mobile navigation is available.
- A status change moved the selected card between preview columns and restored focus to its native select; the visible parent focus outline is orange, 2px. Sidebar collapse expanded the workspace, and reopening restored it.
- Mobile dialog: focus entered the dialog, Escape dismissed it, and focus returned to the navigation trigger.

Screenshots and interactive local artifact:
`/Users/Jules/.codex/visualizations/2026/09/14/01a09eb2-172c-7782-b67c-41b0f4fa9c0b/linear-review/`

The local harness verifies presentation and the shared component interactions above. It does not verify live API persistence or every page and modal in the full app. The final full Next production build passed remotely (compilation, lint/type checks, page generation and server tracing), and the preview deployment completed. Lint reported warnings in untouched components. Preview: https://compass-52e4z01fa-jules-4233s-projects.vercel.app/tasks . The preview is protected by Vercel sign-in; an unauthenticated check reached the expected Vercel login. The full hosted interface has not been visually accepted. Production promotion and Jules' visual acceptance remain separate states.

## Resource and cleanup record

Started with normal memory pressure, 263.44 MiB swap and 7 Codex renderers. Renderer count subsequently reached 8, so no in-app browser tab was opened. Used Jules' Chrome Linear tab and one temporary Compass tab. Memory pressure rose to warning during the static harness build; local compilers were stopped/finished and the full Next build moved to Vercel. Swap subsequently varied from 239 to 360 MiB; this does not establish a leak.

The temporary Compass tab was closed. The temporary preview HTTP server on 127.0.0.1:8772 was stopped after verification. The original Linear tab was restored to its issue board and temporary viewport overrides were reset. No Codex or unidentified process was terminated.

## Sign-in-free review delivery

After Jules rejected the additional Vercel sign-in, packaged the already verified component harness as a self-contained local HTML file: `/Users/Jules/.codex/visualizations/2026/09/14/01a09eb2-172c-7782-b67c-41b0f4fa9c0b/linear-review/Compass Design Preview.html`. It embeds its CSS, JavaScript and Inter font, and requires no server or authentication. It is a task-board design preview with local interactions, not the full hosted application. No deployment protection or application access controls changed.

## Commit and push preparation

Jules requested commit and push. Fast-forwarded to current `origin/main` (`f6d6f12`), preserving the newer outbound reservation migration and test. Final staged whitespace and deployment guards passed. A fresh typecheck rerun with a 384 MiB Node heap cap exited with heap exhaustion under sustained Mac memory pressure; no TypeScript diagnostic was emitted. The earlier unrestricted verify and remote production build passed for the same TypeScript changes. GitHub checks will verify the integrated source remotely.
