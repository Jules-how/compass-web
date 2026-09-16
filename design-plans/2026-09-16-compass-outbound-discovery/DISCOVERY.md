# Compass Outbound: discovery and interview

Status: discovery and interview complete, 17 September 2026. The [implementation plan](IMPLEMENTATION-PLAN.md) contains the approved architecture, delivery sequence and acceptance criteria. Jules subsequently authorized implementation with Astra-low workers; see [implementation status](IMPLEMENTATION-STATUS.md).

Primary source: [Compass Outbound](https://miro.com/app/board/uXjVH8K4o7g=/), read 16 September 2026 through Jules' signed-in Chrome account. The Miro connector could access a different older board but returned an access error for this board. Browser accessibility exposed all 63 top-level objects plus six nested curves. All text annotations and all 12 embedded screenshots were inspected. The board starts at issue 5 and runs through issue 15; issues 1–4 are documented separately in `../2026-09-16-miro-fixes/REVIEW.md`.

Source baseline: Compass repository commit `924fe9b` at the time of inspection. Existing untracked prototype/review files were left intact. Current hosted operating, outbound overview, decision note and latest day handover were read. The latest dated handover was 15 September, containing 16 September updates.

## Product intent

Jules wants a dependable workspace for turning existing company records into tightly selected outreach lists. A list retains its membership and the outcome of every stage. Each stage filters which records receive further work and spend. Rejected and unresolved records remain inspectable. Evidence supports qualification, contacts and personalised copy. Jules can operate the workflow through Compass or an agent connected through MCP, with equivalent durable results.

The interface should make the work understandable and easy to edit. It should not require Jules to interpret internal bookkeeping, navigate redundant progress systems, or manually perform checks the software can perform.

Confirmed in this interview: the central surface is a lead table with stage filters. Research and Write also need dedicated views designed for editing their configuration/content. Other stages should remain close to the central table model. Returning from these views should preserve the working context (recommended interaction detail, not yet a separately confirmed specification).

## Board annotation map

Each link points to the original annotation or screenshot, not the unrelated older performance mockup.

| Issue | Evidence | Required outcome |
| --- | --- | --- |
| 5 | [Contrast annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683925089188), screenshot 3458764683924986964 | Slightly stronger separation and contrast between working regions. Brighter/more defined status treatment where useful; preserve restraint. |
| 6 | [Scale annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683925230412), screenshot 3458764683925230300 | Compass feels too small at normal browser zoom. Compare actual usable UI scale with quality software and adjust shared sizing. |
| 7 | [Calling annotations](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683927131503) | Improve script headings, numbering and region separation. Make call notes behave like a clean document editor. Avoid a heavy orange mouse-focus box. Switching leads must feel quick and always show the correct lead's context and personalisation. Missing research needs a clear action to request research. |
| 8 | [Zoom annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683925404363), screenshot 3458764683925404180 | Compass-wide proportional layout and useful space usage at changed browser zoom. The screenshot proves the unwanted appearance, not its technical cause. |
| 9 | [Stable layout annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683925967929), screenshots 3458764683925687378 and 3458764683925687542 | Switching Workspace/Workflow must not shift the entire header and screen. |
| 10 | [Navigation annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683926540035) | Preserve Evidence, Notebook and Waves, but move their access under More workspaces. |
| 11 | [Whitespace annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683926946138), screenshot 3458764683926813742 | Reclaim the unused top area above the outbound test calendar. |
| 12 | [Removal annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683926946722), screenshot 3458764683926946562 | Remove the marked outbound Timeline surface and its obsolete entry points/dependencies. Screenshot has Timeline selected, although its inner heading says Calendar. Do not assume permission to delete the separate Test planner or shared calendar/project records. |
| 13 | [Editing annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683927757797), [database access](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683928722987), [unhelpful information](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683928417754) | Easily edit/save signals, research, personalisation and email copy; apply selected writing style to leads with explicit signal placement and fallbacks. Access the actual lead database and filter stage/city/suburb/ICP. Remove information without a useful operator action or decision. |
| 14 | [Reconciliation annotation](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683929219114), screenshot 3458764683929219058 | Replace confusing manual-looking load/reconcile checklists with understandable system behavior. Deduplication/reconciliation should not be vague homework for the operator. Jules confirmed paused Instantly loading and automatic checking in the first release. |
| 15 | [Main specification](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683930787241), [rejection of current pipeline](https://miro.com/app/board/uXjVH8K4o7g=/?moveToWidget=3458764683929396901) | Replace the clunky, complicated pipeline interaction with the filtering and editing model described below. Cosmetic fixes alone do not meet this request. |

## Functional requirements extracted from issue 15

### List and database

- Use real pulled/imported lead records; support list creation through the UI and MCP.
- Location/city and list size are optional list-selection controls, not compulsory eligibility rules.
- Associate an ICP and an offer with the list's leads.
- Retain identifiable list membership using stable relationships, with a visible membership indicator.
- Filter the database by stage, city, suburb and ICP match; preserve records that do not progress.

### Research and qualification

- Research establishes fit against the selected ICP, including explicit reasons for failures and unknowns.
- Provide anti-ICP, non-fit, likely-fit and sure-fit filters with readable reasoning and evidence or an explicit evidence gap. Confirmed semantics are recorded in the interview log.
- Make research editable, including signal definitions and research strategy.
- Add/remove target signals such as ducted installation, multi-split and brands.
- Retain facts/signals by type: geography, street, service, specialisation, founding date, and other relevant distinctive facts.
- Retain high/medium/low/none signal strength; distinguish research completion from its quality. Jules confirmed that strength includes both usefulness for personalisation and evidence quality.
- Configure primary research tools and fallbacks (board examples: HTTP2Text, Firecrawl, Parallel, web fetch and web search). Examples are desired options; their operational readiness is not established.
- Track each tool attempt and source outcome per company, then aggregate comparable cost, speed, quality and efficiency across lists/campaigns and research strategies.

### Contacts and verification

- Find a relevant named contact and their work email where possible.
- Preserve general business email, phone-only companies and unsuccessful searches with filterable outcomes.
- Priority stated on the board: named person plus work email, then business plus email, then no name/email but available phone.
- Capture mobile, work and business phone numbers separately and retain social profiles discovered during research.
- Verify emails only for records that pass the preceding filters; avoid spending on records already excluded.
- Records with safe/verified emails advance to Write. Define the acceptable verification results and age policy explicitly before implementation.
- Qualification, research availability, contact attribution, mailbox validity, suppression and past outreach must remain distinct facts internally, even if presented simply.

### Writing and export

- Build deterministic subject and opener templates with bracketed signal slots.
- Control which signal goes in each position, template structure and fallbacks.
- Provide a clean document-style writing view with unobtrusive subject/opener/body/CTA/unsubscribe identifiers.
- Save style/configuration and apply it to the intended selected leads. Preview actual filled copy and reasons for missing slots.
- Retain per-stage outcomes, without presenting internal identifiers as the main interface.
- Select export columns and download a CSV through UI or MCP.
- Save reusable workflows whose execution can be trusted remotely. Agent execution is the first release, hosted execution a later milestone; checkpoints are configurable per workflow.
- Include paused Instantly loading and automatic recipient/copy/settings checking in the first complete release, while keeping CSV export available.

## Current implementation: verified findings

| Area | Evidence and consequence |
| --- | --- |
| Runtime route | `src/app/(console)/sales/outbound/page.tsx` delegates to the keep-alive owner. `ConsoleHomeInboxKeepAlive.tsx` renders `OutboundDesk`, which selects the actual Workspace/Workflow surfaces. `OutboundPageClient.tsx` is not the governing main-route entry. |
| Workflow data | `workflow/model.ts` imports `example-cohort.json`; company IDs are numeric demo IDs. `WorkflowWorkspace.tsx` reads/writes its database using localStorage. It does not provide the shared operational database described on the board. |
| Workflow stages | Current model has only define/research/review batch phases. UI additionally shows Define/Research/Contacts/Write/Review/Load/Observe and Companies/Copy review/Execution/Activity views. These overlapping structures are different from per-record stage filters. |
| Hard-coded content | `model.ts` contains a fixed offer body and phrase-specific copy checks. A saved config has prose fields for research/model, but these do not execute configurable tool strategies. |
| Header shift | `OutboundDesk.tsx` conditionally hides related links, Calling, Today & follow-ups and Weekly pace when Workflow is selected. This supports the screenshot's layout-shift complaint. |
| Navigation | `OutboundDeskSwitch.tsx` exposes all seven desks at the top. `outbound-desk.ts` persists those desk IDs. Moving/removing a desk requires updating entry points and stored/deep-link handling. |
| Calling latency | `CallingWorkspace.tsx` remounts `CallingContact` with `key={selected}` and performs a no-store detail fetch per contact. It has abort protection and per-lead draft keys; improve caching/prefetch without losing those protections. Missing research is currently presented as text, without the requested research action. |
| Existing lists | `lead-lists.ts` and `/api/agent/lists` provide durable list membership and campaign-list associations over lead IDs. Live read returned HTTP 200. Reuse identity/membership ownership where compatible; do not create an unrelated list ledger. |
| Rich company research | The repository has company/location/person/affiliation/contact-method/source/observation/verification/link schemas and revision-checked research APIs. Live `/api/agent/crm/capabilities` returned HTTP 200 with `enabled:false,writable:false`. Treat this as disabled infrastructure, not an available production research system. |
| Research schema gaps | Current rich schema/filter vocabulary is mostly fixed HVAC facts, five metro region values, fixed fit states, and only email/phone/LinkedIn/contact-form methods. It does not yet express arbitrary signal definitions, all social types, the requested strength model, or selectable ICP policy. |
| Agent parity | `mcp/lib.mjs` exposes sourcing as a read-only catalogue and basic lead/operating tools. No equivalent complete workflow/stage/template/run interface was found. HTTP endpoints alone do not satisfy the requested MCP experience. |
| Execution foundations | `outbound-preparation-server.ts` already includes immutable preparation bundles, context hashes, worker claims/leases and completion receipts. The tracked Python companion is agent-operated. This is useful existing machinery, not proof of a general hosted configurable workflow runner. |
| Policy debt | `outbound-preparation.ts` still names rigid required evidence including service area/residential/independent and campaign-oriented contexts. These rules must be audited against the chosen ICP; they cannot silently override the new configurable selection model. |
| Design baseline | `docs/design/WORKSPACE.md` and `.cursor/rules/compass-ui-lock.mdc` govern the current Inter/neutral-white/orange visual system. The board supersedes the assumption that current 13px sizing is acceptable. Actual zoom/responsiveness causes still need measured reproduction. |

## Architecture recommendation

Prefer rebuilding the outbound working surface around durable shared records and stage results, reusing Compass authentication, shell, lead/company identity, list membership, evidence storage and applicable preparation machinery. Simply extending the demo model would retain the wrong persistence and stage semantics. A separate application would introduce duplicate identity/data/navigation for a task Jules explicitly wants in Compass.

The implementation should begin with a shared contract and build one complete list-to-paused-load path, including CSV export and exact provider checking. Parallel UI and backend implementation becomes useful only after those interfaces are fixed. One supervising integrator should own the end-to-end contract and acceptance, with bounded specialist work and a separate verification pass. Final ownership/phases belong in the implementation plan.

## Interview log

1. Confirmed: lead table with stage filters, plus dedicated Research/Write editing views.
2. Confirmed: connected-agent execution first; hosted runner as a later milestone. Durable workflow definitions, evidence and stage results are required from the first release.
3. Confirmed: anti-ICP means an explicit exclusion matched; non-fit means a required criterion failed; likely fit means positive evidence with gaps; sure fit means all required criteria are supported. Missing evidence is unknown, not an automatic failed criterion.
4. Jules asked for execution tradeoffs before choosing. Explained connected-agent versus hosted execution, including tool access, Mac-off operation, integration/recovery complexity and cost categories. Jules selected agent execution first and hosted execution later.
5. Confirmed: company rows through qualification and individual recipient rows for writing/export.
6. Confirmed: likely-fit and sure-fit companies progress to contact sourcing by default. Unknown, non-fit and anti-ICP records remain retained and inspectable.
7. Confirmed: signal strength includes both usefulness for personalisation and evidence quality. Recommendation: store these as separate dimensions and expose a simple summary without treating a useful but weakly supported claim as strongly evidenced.
8. Confirmed: templates may permit an AI writing option when Jules chooses it. Recommendation: deterministic substitution by default; explicit saved AI mode remains constrained by recorded evidence and fallback rules.
9. Confirmed: template changes update draft leads including manual edits, while showing the previous template. This supersedes the earlier proposed default of preserving manual edits. Recommendation: retain both the previous template and exact previous recipient drafts, provide comparison/restore and show an impact preview before applying the new version. Exported/sent snapshots retain their original content. Preview/restore details are recommendations, not separately confirmed user requirements.
10. Confirmed: checkpoints are configurable per saved workflow. Jules has not separately selected the initial default checkpoint preset; pausing after research and at finished drafts remains the proposed starting preset.
11. Confirmed 17 September: the agent follows saved tools. Preserve the selected tool order and fallback rules; unavailable tools should produce an actionable run exception rather than silent substitution. A saved spending limit is a recommended execution control; no amount is authorised by this planning conversation.
12. Confirmed 17 September: the first complete release includes paused Instantly loading and automatic checking. This supersedes the recommendation to end the first release at CSV. CSV remains an available output. Loading and actual activation remain separate; no campaign mutation is authorised during planning.
13. Confirmed 17 September: the current Australian offer covers approximately 2,500–3,500 companies; international expansion may reach 10,000–100,000+. These are the user's planning estimates, not a verified market count. Design for 100,000+ company records and resumable chunked runs without loading the whole dataset into the browser or one agent context. Typical run size is not separately specified; do not invent a user-imposed batch ceiling.
14. Confirmed 17 September: prepare all suitable contacts by default. This supersedes the proposed one-best-contact default. Deduplicate actual recipient mailboxes while retaining every discovered person and method.
15. Confirmed 17 September: choose affected lists when applying a template version, with the current list selected initially.
16. Confirmed 17 September: Outbound opens the lead table. Retain the current overview as a secondary destination.

## Instantly implementation constraint

Read `.agents/skills/instantly-load/SKILL.md` on 17 September. The current local Mac transport is finished CSV upload through Chrome, followed by provider API readback and a Compass receipt. Do not plan a local REST/MCP add-leads workaround. The first-release UI must state when it needs the connected agent/browser to complete the upload, preserve the same frozen artifact and resume after reconciling partial imports. Automatic checking means checking real recipients, used merge values, sequence and settings against that artifact; it does not mean asking Jules to tick generic reconciliation checkboxes. Hosted upload is a later execution option, not a prerequisite for the authorised first release.

The interview now establishes the product intent. The implementation plan supplies explicit recommended defaults for checkpoint presets, evidence/freshness handling, template mechanics, navigation and measurable visual/performance acceptance. These are identified as recommendations rather than additional user commitments. Tool availability, deployed schema readiness and provider rendering are technical preflights. They do not require another general interview. No spending amount or campaign activation is authorized by this planning conversation.

Final technical checks on 17 September confirmed the rich CRM capability remains disabled/read-only (`enabled:false,writable:false`). Code inspection also identified a 10,000-recipient ceiling in the current single-request reconciliation path and company reservation semantics that need adjustment for multiple suitable contacts. Both are addressed explicitly in the implementation plan.

## Verification limits and resources

No lead/company records, board objects, campaigns, provider settings or product source were changed. No paid research, builds, local dev server or product tests were run for discovery/planning. Twelve original screenshot files were downloaded and inspected. The board remains open in the existing user Chrome tab; no new browser tabs were created.

The implementation plan was checked against all settled interview decisions and its existing source-owner paths. Compass project `proj-build-compass` received the plan evidence while remaining active and awaiting confirmation. The existing day handover `planning.note.9b5fae41-5d60-5c6f-b552-f585bbeefdc6` was appended at revision 20; exact readback verified. Those operating updates record planning output, not product completion.

Mac memory pressure became warning level 2 and swap increased from approximately 1.895 GB to 2.557 GB during the session. Browser-heavy work stopped after collecting the evidence. This is a resource condition, not proof of a leak or attribution to this task. Further visual testing should wait for acceptable pressure or use an appropriate remote environment.
