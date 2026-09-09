# Local component verification fixture

This page renders the actual changed SequenceEditor, CampaignCalendar, KanbanBoard, ModalFrame, OperatorConsoleLayout, ConsoleHomeInboxKeepAlive, ConsoleNav and InboxPanel. All records are synthetic. The other shell destinations are explicitly labelled placeholder panels; authentication and Next routing are fixture adapters. API requests are handled in memory and CSP blocks all network connections. No production state is read or written.

From `compass-web`, rebuild after source changes:

```sh
node design-plans/2026-09-08-compass-audit/fixture/build.cjs
node node_modules/tailwindcss/lib/cli.js -i src/app/globals.css -o design-plans/2026-09-08-compass-audit/fixture/styles.css --content './src/**/*.{ts,tsx},./design-plans/2026-09-08-compass-audit/fixture/*.tsx' --minify
python3 -m http.server 8765 --bind 127.0.0.1 --directory design-plans/2026-09-08-compass-audit/fixture
```

Open `http://127.0.0.1:8765/index.html?view=editor` (or `calendar`, `board`, `modals`, `inbox`). The Inbox fixture changes history to app-like paths; return to index.html to reload with a basic static server. The build uses installed Next webpack and TypeScript, not a development server or dependency installation. Fonts are the installed Geist variable sans and mono files.

- Editor: campaign view tabs, mobile Compose/Library/Levers/QA, variable expansion, preview widths and autosave status. The sample library is empty. Its state is fixture-local.
- Calendar: three identical start times, two partial overlaps and a later independent start; day/week views, selection and drag only alter the fixture.
- Board: title activation, keyboard/touch move control, zero Replies and Remaining metrics.
- Modals: nested dialogs, Tab/Shift+Tab trapping, Escape, focus return and background scroll containment.
- Inbox: mobile menu, tabs, history changes, leaving a mounted Inbox, and subscribed cached badge updates. Floating yellow controls label the synthetic fixture without consuming shell viewport height.

This fixture validates presentation and local interactions. It does not prove hosted routing integration, API persistence, authentication, campaign sends or live data correctness.

Additional views: `?view=home` uses actual HomeDashboard and MorningWavePanel with a small synthetic morning brief and sample counts, including the Brain dump dialog. Home reached through the Inbox shell also uses this actual component. `?view=login` uses actual PasswordLoginForm with selectable mock 401, 503 or connection failure; enter fixture-only values. Neither view reads live data or invokes real authentication.
