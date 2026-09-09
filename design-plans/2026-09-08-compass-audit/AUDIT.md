# Compass UI and UX audit — 8 September 2026

Baseline: `b546299c08b46871455dddf4fbe6729a707a2b71`. Hosted operator application inspected in authenticated Chrome. Source started clean. This report distinguishes observed defects from design opportunities and from unavailable evidence. Screenshots and DOM snapshots are in `evidence/`.

## Design language

Compass uses Geist Sans, a warm stone background, orange actions, rounded panels, soft shadows, and a persistent sidebar. Owners: `src/app/globals.css`, `OperatorShell.tsx`, `ui/sidebar.tsx`, and surface components. The current request authorises improving this baseline. No new theme or business terms are needed.

## Coverage

All 17 primary navigation destinations were inspected on desktop: Home, Inbox, Goals & notes, My Tasks, Projects, Functions, Clients, Sales Overview, Offer & economics, Email tests, Offers, Outbound, CRM, Finances, Installs, Retention, Settings. Outbound Waves, Calendar, Timeline and the current Sydney HVAC sequence editor were inspected. Representative Brain dump and Client detail overlays were opened. Mobile evidence covers Home, Settings, navigation, Inbox, sequence editor at 390×844; Inbox was also inspected at 768×1024. Desktop baseline is 1710×896 (browser size varied slightly across captures).

This is a comprehensive primary-surface audit, not a claim that every possible data state was tested. Protected signing/onboarding links, disabled customer delivery portal, all individual records, all mutations, forced network failures and every browser/device remain untested. No campaigns were activated, messages sent, edit/save actions taken, or credentials copied into the report. Selecting Inbox rows can mark them read, so those actions were not used. Ordinary view changes and cached GET requests were allowed. Installs' populated state could not be inspected because its endpoint failed.

## Findings and opportunities

P1 blocks or materially impairs a task; P2 recurring usability problem; P3 polish. “Repair” means included in the implementation plan. “Investigate” means the underlying cause or product intent needs further evidence, not that a fix has been proven.

| ID | Priority | Surface / evidence | Problem and consequence | Recommended change | Confidence / disposition |
|---|---|---|---|---|---|
| 01 | P1 | Inbox; `03`, `04`; `InboxPanel.tsx:37` | Clicking Instantly leaves Leads selected. Passing Next's internal history state bypasses its URL-state update hook. | Use the supported native history call with fresh state and verify channel and URL agree. | High / repair |
| 02 | P1 | Navigation after Inbox; `05`–`19` URL snapshots | Hidden Inbox writes `tab=leads&id=…` onto unrelated routes. It can also request suggestions while inactive. | Gate Inbox URL effects and suggestion work to the active Inbox route. | High / repair |
| 03 | P2 | Shared sidebar; `OperatorShell.tsx` | Inbox badge is sampled once, so triage cache updates do not refresh navigation count. | Subscribe to the existing query cache instead of keeping a separate count snapshot. | High source / repair |
| 04 | P1 | Mobile nav; `21` | Selecting Home leaves the full-screen menu covering Home. | Close the drawer on ordinary destination selection, including current destination. | High / repair |
| 05 | P1 | Mobile nav; `21`; sidebar source | No dialog focus containment, initial focus, return focus or Escape dismissal. Background remains reachable. | Use installed Radix dialog behaviour, with safe-area layout and 44px close/open controls. | High / repair |
| 06 | P1 | Brain dump, task, client overlays; `02`, `09` | Custom dialogs do not consistently trap or restore focus. Brain dump Tab moved focus to body; Client close returned focus to body. | Reuse a shared Radix-backed modal boundary, preserve local appearance. | High / repair |
| 07 | P1 | Tablet Inbox; `24` | At 768px sidebar plus 340px list leaves roughly 140px for message details; text and controls become unusable. | Use single-pane list/detail mode below 1024px. | High / repair |
| 08 | P2 | Mobile Inbox; `23`; shell source | Main is 100dvh in addition to mobile header, creating extra page overflow around a nested scroller. | Let mobile shell allocate the remaining viewport height; use one main scroll owner. | High / repair |
| 09 | P1 | Sequence editor mobile; `28` | Analytics, Experiment, Archive and Settings tabs are hidden below 640px without another entry. | Keep tabs accessible in a horizontally scrolling second header row. | High / repair |
| 10 | P1 | Sequence editor mobile; `28` | Library, Levers and QA rail disappears below 1024px. | Add a mobile panel switch using the existing rail content; preserve desktop resize. | High / repair |
| 11 | P2 | Sequence editor mobile; `28` | Expanded variable tray consumes about a quarter of viewport, leaving little editable content. | Collapse the variable tray by default on small screens while retaining preview controls. | High / repair |
| 12 | P2 | Sequence editor; `27`, `28` | Name has no accessible label; absolute centred tabs can collide with actions; save status has no announcement. | Label name, flow header into responsive rows, announce save state. | High / repair |
| 13 | P1 | Calendar; `25`; `CampaignCalendar.tsx` | Three Monday 9am campaigns occupy identical coordinates and cover each other. | Partition overlapping events into visible lanes; preserve their actual timestamps. | High / repair |
| 14 | P1 | Tasks; initial screenshot; `ui/kanban-board.tsx` | Task cards are clickable divs, unreachable as open actions by keyboard. Dragging is the only board move gesture. | Provide native title buttons and a labelled move selector usable by keyboard/touch. | High / repair |
| 15 | P2 | Tasks and Waves; `14`, Tasks capture | Single-line card titles truncate the task/campaign identity. | Allow two lines and full title on inspection; avoid unnecessary empty metadata spacing. | High / repair |
| 16 | P2 | Tasks; `TasksPanel.tsx:66` | Internal `daily_setup:` identifiers occupy preview text. Home already strips them. | Strip only known metadata from display previews, preserve stored notes. | High / repair |
| 17 | P2 | Outbound Waves; `14`; `OfferWavesBoard.tsx:83` | Remaining contacts are rendered as attachment counts; replies look like comments without labels. | Add explicit Replies / Remaining / List size metadata rather than misusing attachment fields. | High / repair |
| 18 | P2 | Home desktop; `01` | Grid stretches brief and metric cards to fill height, producing substantial blank card interiors. | Align rows to their content; balance two secondary metric cards. | High visual / repair |
| 19 | P2 | Brain dump; `02`; Home source | Subtitle says `Creates compass_tasks only`, an implementation detail without useful guidance. | Explain that notes become proposed tasks for review. | High / repair |
| 20 | P2 | Offers; `13`; TestCellsBoard | `h-8/h-9` selects retain 20px vertical input padding and clip their selected text. | Apply compact vertical padding explicitly and allow result filters to size independently. | High / repair |
| 21 | P2 | Offers; `13` | Disabled “Create 0 missing cells” does not explain that the selected combination already exists. City/vertical toggle state is only visual. | Explain existing combinations and announce toggle state. | High / repair |
| 22 | P2 | Finances, Planning; `05`, `16`; globals | Disabled secondary/ghost pagination buttons look enabled and retain hover styling. | Shared disabled styling across button variants. | High / repair |
| 23 | P2 | Shared typography; `01`, `14`, `19` | Important section captions and hints use very faint neutral-400 text on warm/white surfaces. | Darken shared captions and affected functional hints, retaining hierarchy. | High visual / repair |
| 24 | P2 | Clients and Functions; `07`, `08` | Search fields lack explicit accessible names; Clients calls all seven records “active” despite two Onboarding entries. | Label search fields and report “clients” unless counting Active specifically. | High / repair |
| 25 | P2 | Planning, Offer & economics, Email tests; `05`, `11`, `12` | Double wrapper padding shifts headers far from the other app pages; header action links stretch into tall blocks. | Remove redundant wrapper padding and align header actions to their content. | High visual / repair |
| 26 | P2 | Planning; `05` | “1 records”, raw ISO due dates and “Unknown / 5000 AUD MRR” make goals harder to scan; empty new-record form dominates initial view. | Repair grammar/date/number formatting now; evaluate a selected-record/empty selection layout separately. | High / partial repair |
| 27 | P1 | Installs; `17` | Populated board is unavailable; screen reports raw `load_failed`. | Investigate underlying GET failure; show a clear retryable error while retaining honest unavailable state. | High observed; server cause unverified / investigate + repair feedback |
| 28 | P2 | Inbox/Home; `01`, `03` | Home says zero waiting, Inbox badge says 87 need you. These may count different populations but the labels do not explain that. | Trace definitions and expose scope; do not force unlike counts to match. | Medium / investigate |
| 29 | P2 | Sales; `10` | Emails sent tile is 3,355 while Email volume shows 3,555; reply totals also differ. Chart filters and headline scope are unclear. | Trace source/windows and label scope at each metric. Do not substitute invented figures. | Medium / investigate |
| 30 | P2 | Sales targeting map | “100% success” location examples each have one targeted contact; interested/booked/converted are combined as “wins.” | Prefer explicit positive-outcome labels and visible denominator; assess geographic normalization separately. | High presentation / investigate |
| 31 | P2 | Clients/Retention; `08`, `09`, `18` | Demo clients look like ordinary clients in the directory; detail reveals `cs-demo`, Retention labels “Demo seed.” | Add an explicit Demo badge for established demo tags, preserving all records. | High / repair |
| 32 | P2 | Client detail; `09` | “0% complete” appears for zero scoped work, implying a measured percentage. | Say “No work scoped” when denominator is zero. | High / repair |
| 33 | P2 | Outbound; `14`, `25` | Queue has old recommendation/action text mixed with current brief; Calendar says “2 of 3–5” while Waves says “4 launched.” | Separate data freshness and planned versus launched definitions before changing workflow policy. | Medium / investigate |
| 34 | P2 | CRM; `15` | Wide name/category columns put contact/status data offscreen; duplicate/category system tags crowd cells. | Evaluate compact default columns and an always-visible column control; preserve saved user layouts. | Medium / design opportunity |
| 35 | P2 | Inbox; `03`, `23` | Needs-you rail includes waiting work and old test leads alongside current replies. | Clarify actionability and demo/history filtering using verified data semantics, without archiving records automatically. | Medium / investigate |
| 36 | P3 | Whole app | Page title sizing/width, card density, and empty-state language vary substantially between task boards, project boards, and planning. | Reuse existing tokens and shared patterns where the task is the same; avoid flattening specialist desks into one layout. | High visual / ongoing opportunity |
| 37 | P2 | Keyboard / CRM; globals | Hidden custom checkbox input has no visible focus indicator on its rendered box. | Add `:focus-visible` styling to the checkbox box and retain native checkbox semantics. | High source / repair |
| 38 | P2 | Inbox tabs | ARIA tabs have no arrow-key navigation or tabpanel relationship. | Implement roving focus and labelled panels. | High source / repair |
| 39 | P2 | Console navigation | Query-only links are discarded because navigation compares only pathnames. | Compare full hrefs for same-page query changes and keep existing instant page switching. | High source / repair |
| 40 | P2 | Login source | Network/server failures are reported as wrong credentials, prompting users to change valid input. | Keep generic credential rejection for authentication errors; report connection/service failures separately. | High source / repair |

## External references

The audit uses Compass itself as the visual baseline. [Linear's board behaviour](https://linear.app/docs/board-layout) informed keyboard equivalence for board actions, not a theme replacement. [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog) supplies focus handling already available in the installed dependency. [Next.js native history guidance](https://nextjs.org/docs/app/getting-started/linking-and-navigating) and the installed `app-router.js` explain the Inbox defect.

## Highest leverage

Repair routing and responsive access first: these affect whether users can reach and operate the intended screen at all. Then repair shared card/overlay controls and presentation. Business-data cleanup, analytics semantics, and a broad information-architecture redesign remain distinct decisions backed by further evidence, not assumptions folded into a visual patch.

## Implementation investigation notes

The Installs source investigation found that Next bundles `import.meta.url` with the build-machine path. The existing fallback list omitted the actual deployed `src/lib/delivery-dept/` directory. A runtime-root fallback and explicit asset tracing now include both JSON files in the standalone output; a relocated-path regression test passes. This is a verified deployment defect consistent with the live failure, but production recovery has not been tested and another server dependency may also fail.

The same trace revealed existing `loadLiveInstalls` can save an initial install during GET. No additional live retries were made after discovering this behaviour. Its business-data persistence semantics were not changed.

During implementation checks, the CRM sorting state was also found on a button instead of its column header; the attribute was moved to the header. Keyboard focus now follows Inbox list/detail transitions and board moves. Shared portals close on route changes so a hidden keep-alive page cannot cover the destination.
