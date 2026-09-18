# Compass — Outbound Write / Copy Control

## Complete product specification and implementation contract

**Specification version:** 1.0  
**Design source:** Julian’s Compass walkthrough and discussion, 17 September 2026  
**Primary location:** Outbound → Write → Copy Control  
**Code baseline:** `Jules-how/compass-web`, main `9f533a3fc8e0f259fb1763fea0a413b61c886019`  
**Release branch:** `feat/write-copy-control-studio`  
**Status:** Release specification. Build, deployment and environment verification are recorded separately in `COPY_CONTROL_RELEASE.md`.

This document is the source of truth for the product described in the walkthrough. It separates requirements Julian explicitly confirmed, implementation defaults selected to make the product work, existing Compass facilities being reused, and capabilities that still depend on connected providers or later development. A requirement appearing here does not, by itself, mean a live provider has been configured or a production campaign has been tested.

The specification is written for a nontechnical owner first. Technical contracts follow the product behaviour rather than replacing it.

---

## 1. Product purpose

Compass should turn structured, evidenced lead research into controlled, human-sounding outbound copy, without making the owner operate a prompt-engineering dashboard.

The user controls the words, the signal types that may enter those words, the alternatives worth testing and the final recipient draft. An agent can execute the same workflow through authenticated tools. Neither the interface nor an agent is allowed to treat unsupported assumptions as researched facts.

The central product loop is:

**Choose a list → understand its research → write component variants → match supported facts → inspect real examples → save exact drafts → export or prepare a campaign → attribute actual outcomes → improve the next version.**

The learning goal is primarily to understand which **signal types and combinations** are useful, not simply to crown a named template as a winner. The system must therefore preserve the connection between research, selected signals, actual copy and actual campaign events.

### What this is not

This is not a public campaign builder, a replacement for Compass’s business operating system, a contact scraper masquerading as a copy editor, or an automatic sending agent. Creating a template, generating text, saving a draft and preparing a campaign are distinct actions. None means that an email has been sent.

---

## 2. Confirmed decisions and implementation defaults

### Confirmed by Julian

- Focus this design primarily on **Write**; list planning comes later. Still preserve the complete upstream pipeline context.
- Reduce the large navigation/header area and redundant whitespace. Put the real work first. Do not solve this by shrinking all text or creating a dense dashboard.
- Use a clean, restrained, Notion-like writing experience. The earlier multicolour, three-panel prompt studio was overwhelming and is not the visual target.
- Retain the name **Copy Control**.
- Let the user select each email element independently and maintain a vertical collection of named, editable variants.
- Support both deterministic human-written templates and optional AI-generated writing.
- Support multiple signals in a single subject/opener, including three or four where appropriate. Do not impose a one-signal writing rule.
- Let the user specify allowed signals and also offer automatic selection.
- Allow stable bodies, personalised bodies, reusable CTAs and custom elements such as risk reversals, additional lines and a PS.
- Provide lead previews that show how signals fill the copy. Allow testing against different examples.
- Record list/campaign identity and learn from signal combinations, subjects, openers, modes and other controlled differences.
- Support selected-column CSV export, saved workflows and operation through MCP.

### Defaults chosen for this implementation

These are deliberate product choices, not statements that Julian explicitly prescribed every detail:

1. Copy Control lives inside Outbound → Write, rather than introducing another global navigation destination.
2. Advanced matching, experiments, follow-ups, batch application and results are collapsed until needed.
3. Templates save as immutable versions. Local typing has tab-scoped recovery, not an implicit server publish.
4. Deterministic matching uses the first eligible variant by default. Optional auto-pick prefers greater supported signal coverage and then stronger evidence; it is not a learned reply-rate model.
5. A missing required input holds the affected variant. Fallback wording must be explicitly authored.
6. A first experiment compares two variants of one component, with deterministic approximately 50/50 assignment among companies eligible for both.
7. AI generation is explicit, bounded and separate from preview. It creates an unapproved draft.
8. Test leads are synthetic, tab-local examples; they cannot become real recipient drafts or enter results.
9. Batch application protects manual edits by default.
10. Results begin with explicit, attributable event imports. Existing campaign aggregates are not silently redistributed over individual variants.

---

## 3. Whole-pipeline context

The pipeline remains **List → Research → Contacts → Verify → Write → Export / preparation**. Each stage is a filter and an enrichment step. Its job is to remove or hold poor matches before further money or effort is spent, while retaining enough history to explain the decision.

### 3.1 List

Lists may be built through Compass or by a connected agent. Optional selections include location, city, suburb, lead count, ICP, offer and other inventory filters. No single location field is mandatory for every workflow.

Membership is explicit and persistent. A company can belong to multiple lists without duplicating its identity. A list identifies its saved workflow and offer context. Changing the active list must not silently reuse another list’s template buffer, recipient selection or research snapshot.

The latest main-branch market cards, geographic/service navigation and saved ICP filtering are retained. A new visual AI list-planning collaborator is outside the current Write release; it is not invented as an already available feature.

### 3.2 Research and ICP filtering

The intended human categories are anti-ICP, non-fit, likely fit and sure fit. An explicit unknown/unassessed state is also necessary: absence of evidence is not proof that a company fails an ICP criterion.

Every assessment must expose a readable reason and supporting evidence, or explicitly say what evidence is missing. The owner and agent can revise research criteria and requested signals. Revisions create new saved context rather than retroactively rewriting old campaign evidence.

Examples include ducted installation, multi-split work, a named manufacturer such as Daikin, service area, premises/street, specialisation, founding date, expansion, founders and other specific relevant facts. Research should distinguish a service offered from a job demonstrably completed. Copy must not turn one into the other.

Research completion, quality, missing information and fit outcomes remain inspectable and filterable. A completed research attempt is not the same as a positive ICP match.

### 3.3 Research tools and economics

The broader system supports a workflow concept with primary tools, fallback conditions, attempt limits, caches and budgets. Requested tool families include HTTP2Text, Firecrawl, Parallel, web fetch and web search. Tool availability depends on actual executors and credentials.

The full product direction is to retain, per lead and attempt: tool/provider, workflow version, requested fields, outcome, error category, elapsed time, reported cost/currency, cache use, evidence yield and research quality. Cross-campaign comparisons should distinguish tool failure from a genuinely absent fact and should not invent a zero cost when cost is unknown.

This release retains the existing workflow/executor contracts. It does not add credentials, implement every provider adapter, or claim a completed research-stack economics dashboard. These remain explicit integration/product work rather than being hidden behind working-looking buttons.

### 3.4 Contacts

Prefer a named owner/director/senior person with a usable work email. A generic business mailbox is less targeted but remains useful. A phone-only business remains useful for calling and should not disappear because it is unsuitable for email.

Capture names, roles, work email, mobile, direct/work phone, general business phone and social profiles where supported by research. Record unsuccessful attempts as outcomes, not empty cells that are indistinguishable from work that never ran.

Prioritisation is not a reason to guess a person’s role or convert a business telephone into a personal mobile. Contact identity and company identity remain separate records.

### 3.5 Verification

Store verification provider/outcome, checked time, address identity and the workflow’s freshness/reuse policy. Only the configured accepted states can proceed through the relevant email readiness gate. Suppression, invalid addresses, wrong-person uncertainty and missing verification are not bypassed by a good opener.

Phone-only outreach remains outside the email Write readiness path. Previewing or drafting text is not permission to send it.

### 3.6 Write and preparation

Write consumes saved research and saved template versions. It produces inspectable recipient drafts with source links and provenance. Existing stage-run approval, verification, suppression, campaign preparation and delivery-readback checks remain authoritative downstream.

The new editor does not mark work approved, activate Instantly campaigns or send messages automatically.

---

## 4. Screen map and navigation

| Location | Main job | Visible by default | Available on demand |
|---|---|---|---|
| Outbound → List | Select and organise companies | Existing market/table controls | Workflow planning and detailed filters |
| Outbound → Research | Assess fit and collect evidence | Existing criteria/signal cards | Tool rules, evidence and version history |
| Outbound → Contacts | Inspect contact routes | Existing contact outcomes | Candidate details and evidence |
| Outbound → Verify | Check mailbox readiness | Existing verification guidance/status | Provider/run details |
| Outbound → Write | Configure and review copy | Compact context, component tabs, variant rail, editor | Matching, preview, offer, experiments, history, batch and results |
| Write → Recipients & queue | Select recipients/run work | Existing recipient table | Filters, verification scope, export/preparation |

The application shell, stage navigation and editing controls must not compete as three large dashboards stacked above the text. In Write, retain a compact working-list/template selection row and compact stage navigation. List/research configuration is collapsed by default. The recipient-table entry point stays visible.

The exact pixel height is responsive, not a universal 100-pixel promise. The requirement is to eliminate unnecessary stacked setup panels while preserving readable controls and clear context.

---

## 5. Visual and interaction design

Use Compass’s restrained neutral palette and existing orange primary action. Prefer typography, spacing, subtle dividers and a clear selected state over coloured cards for every setting.

The desktop editor has two persistent work areas: a narrow variant rail and a wide writing canvas. Preview is an on-demand section, not a permanent third column. A contextual inspector opens only when the owner wants to change matching details.

Conceptual structure:

```text
Working list / writing template                       Runs / Refresh
List   Research   Contacts   Verify   Write
List & research settings ▸                         Recipients & queue

Copy Control                              Preview & review   Save version
Template name                          Saved / unsaved state   Undo / Redo
Subject | Opener | Body | CTA | Unsubscribe | + Extra

Named variants             Selected variant name
  Service + location       My template / AI writing      Preview this variant
  A direct question
  Founder + service        The actual writing canvas
  + New variant            Insert: location  service  founder
  Matching order ▸         Variables and matching ▸

A/B test ▸    Follow-ups ▸    Apply to lists ▸    Results ▸
```

This is a functional hierarchy, not a request to show every collapsed section’s contents at once.

On narrow screens, the variant rail becomes a compact wrapped collection above the editor. Element navigation may scroll horizontally inside its own region; the entire document should not acquire horizontal overflow. Tables scroll inside their own container. Keyboard focus is visible, buttons have names, native form controls remain operable, and reduced-motion preferences are respected.

Errors and pending states are expressed with text, not colour alone. A preview must not imply that missing information has been successfully filled.

---

## 6. Primary operator journey

1. Select an existing working list with its saved research workflow and offer context.
2. Select a writing template or create one. Opening a legacy template does not modify it.
3. Start with Subject or Opener. Choose a named variant or create a new one.
4. Write fixed copy and insert variables. Configure the researched signals each variable may use.
5. Add any eligibility conditions. Leave matching settings alone when the default order is sufficient.
6. Open Preview. Select a real recipient, inspect the matched facts and read the complete email.
7. Use “Preview this variant” to test a particular variant even when automatic routing would normally choose a different one.
8. Test missing/alternative facts with a labelled synthetic lead. These examples never write to the CRM.
9. Save a template version. For AI components, explicitly generate against a saved real context and inspect the result.
10. Save the recipient draft, or use the connected executor/batch facilities for a larger saved scope.
11. Review existing readiness and approval requirements, export the chosen columns or prepare the campaign through existing Compass facilities.
12. Import attributable outcomes and inspect signal combinations. Adjust a new template version rather than changing historical copy.

---

## 7. Template and variant lifecycle

A template is a named, versioned collection of components. A component is a named email element such as Opener. A variant is one candidate way to produce that element.

### Template operations

Create, rename, edit, save a new version, inspect an old version, recover unsaved tab-local work and revert to the saved version. Undo/redo is bounded editor-local history. Saving does not update all existing recipient drafts. Applying a version to drafts is a separate explicit action.

The editor marks local changes as unsaved. It must not display “saved” merely because browser recovery storage succeeded. A network failure preserves the editing buffer and makes an uncertain command visible. An uncertain command is checked or retried with the same request identity before another write.

### Variant operations

Each component has one or more variants. The owner can name, select, create, duplicate, reorder and enable/disable them. Duplicates receive a new identity. Renaming does not change the identity of an existing variant. Disabling preserves history but excludes the variant from automatic selection.

This release uses disabling rather than destructive deletion for variants. Custom elements can also be disabled. That is intentional: a previously sent draft must remain attributable after its source variant stops being used.

### Legacy conversion

The existing template shape remains readable. Opening an old template produces an editable component interpretation in memory. Only saving creates a new component-based template version. The original legacy version is retained, including its old variation configuration for reference.

Legacy full-message variations are imported in order; their conditions are retained. The old default is kept as a fallback candidate. Existing legacy rendering remains on its old code path unless `copy_control` is present.

---

## 8. Components and composition

Built-in elements are Subject, Opener, Body, Call to action and Unsubscribe. Subject and unsubscribe remain mandatory for a usable initial-email result. Opener, body or CTA may be disabled where the chosen composition makes that appropriate.

Custom elements cover PS lines, risk reversals and other additional copy. Each has its own name, variants, mode and signal rules. Its insertion position is after the opener, after the body or after the CTA. Component order controls the order of extras within a position.

A stable body remains ordinary text. It can also contain variables. The body may embed another enabled opener/CTA/custom element using a component token such as `[[part:opener]]`. The embedded component is consumed once; it must not also appear as a duplicate standalone paragraph.

Unknown component references, self/cyclic references and unsupported embeddings hold the result. A signal value that resembles a component directive is not executed as a command. Copy is plain text, not executable markup.

Follow-ups retain the existing subject/body/delay model. The current UI allows up to ten follow-ups with at least two days between configured steps. Shared follow-up variables can be copied explicitly from a configured component slot; subsequent component edits do not silently rewrite those shared slots. Initial-message experiment results must not automatically absorb follow-up performance.

---

## 9. Structured signals and variables

A **signal definition** says what research should find. A **signal observation** records an actual supported finding. A **variable** is the place where that finding may enter copy. These are different things.

For example, a variable called `location` may allow `suburb` first and `city` second. A variable called `job` may allow `ducted_installation` before `multi_split`. A single template can contain both.

Recommended categories include location, street/premises, service, specialisation, manufacturer, company event, founder/person and founding date. Categories are explicit editable metadata, not inferred from a variable’s spelling. Existing uncategorised definitions remain usable and are labelled `uncategorised:<signal-id>` rather than all being misleadingly collapsed into one known category.

An eligible signal input retains its definition ID, category, textual value, evidence IDs, source IDs, strength, usefulness and observation time. Arrays of supported scalar values have a stable readable representation. Complex objects are not silently printed into an email.

### Evidence rules

Only writing-eligible definitions can feed the renderer. Inputs must be from the correct company and workflow, have usable nonzero strength/usefulness and retained evidence/source context. Superseded observations are excluded within the correct scope. Conflicting current values are excluded and reported; the renderer does not randomly choose the latest-looking contradiction.

A blank value, unsupported object, missing fact and conflicting fact are not synonyms for a supported empty string. Required copy must hold when these leave no usable input.

Observation time remains visible in the trace. This release does not claim to understand that every old expansion event has become too stale for the word “recently”; that requires an explicit research/workflow rule or operator review. Avoid placing unsupported temporal claims in fixed wording.

---

## 10. Variable configuration and matching rules

Every variable defines:

- An ordered list of allowed signal IDs.
- Selection by the owner’s order, or by strongest available evidence.
- Whether missing information holds the variant or uses explicit fallback text.
- Optional per-recipient override, limited to the same allowed available inputs.

There is no arbitrary one-signal cap. Separate variables can represent service, location, an event and a co-founder. Technical request limits exist to prevent unbounded payloads, not to force one-fact writing.

Required and fallback behaviour must be unambiguous. A required slot cannot simultaneously assert that missing data should be replaced by a generic fallback. The owner selects one behaviour. An unused slot in a deterministic variant does not block unrelated text; an AI variant’s configured inputs are supplied deliberately and therefore participate in its requirements.

An unknown `[[variable]]`, malformed bracket expression or missing required value cannot leave a raw placeholder in an exportable email. The result reports why it is held.

### Matching order

For each enabled component:

1. Evaluate enabled variants against their present/equality/contains conditions, using all/any semantics as configured.
2. Resolve the variables needed by each candidate.
3. Exclude candidates with unsatisfied required inputs or invalid references.
4. Honour an explicit pin. A pinned but ineligible variant holds; it does not silently choose another.
5. Apply an enabled A/B assignment only within its common-eligible population.
6. Otherwise choose the first eligible variant in manual order, or use the configured auto-pick ranking.
7. Record the actual chosen variant, facts, fallbacks and selection method.
8. Assemble the email without duplicate blocks and validate its final structure.

Auto-pick ranks by supported signal coverage, then evidence strength, then a stable identity tie-break. It is deterministic and inspectable. It does not claim that more facts always produce better copy.

### Example: location + job

A subject variant named “Location + job” contains `[[location]] · [[job]]`. `location` allows suburb then city; `job` allows ducted installation then multi-split. A recipient with city and multi-split, but no suburb or ducted signal, receives the supported lower-priority values. A recipient without either kind of job signal is held unless another eligible subject variant exists.

### Example: four-fact opener

A template might reference `[[event]]`, `[[location]]`, `[[service]]` and `[[cofounder]]`. The system can fill all four only when each has the required evidence. It must not infer a co-founder from a generic staff name or an expansion from an additional service-area page.

Controlled verbs such as “saw”, “noticed” and “spotted” can be authored as named variants. The release deliberately does not introduce invisible random spintax that would undermine attribution.

---

## 11. AI writing

AI is a per-variant mode, not a global replacement for the owner’s writing. The same template can contain a deterministic subject, AI opener, stable body and deterministic CTA.

An AI variant has optional scaffold text, writing instructions and controlled signal slots. The agent/model receives the selected facts plus the list’s saved offer and audience context. It does not receive unrestricted permission to use every research note or invent missing personalisation.

### Explicit generation contract

Preview never invokes a model. Switching a variant to AI does not invoke a model. Saving the template does not invoke a model. The owner explicitly requests generation for one selected real recipient, or authorises an agent operation.

Generation requires a saved Copy Control template, current input fingerprint, linked offer snapshot, eligible selected components, explicit spending confirmation and a configured AI gateway. A response includes generated component text, request identity, model/usage metadata and a review-required flag.

The server accepts no more than eight AI components in one request, bounds context and output, disables automatic provider retries and uses a timeout. These controls limit exposure; they are not an exact Australian-dollar quote. The owner’s provider configuration and pricing determine actual charges.

### Uncertain requests

Before a provider call, reserve an immutable request identity. An exact retry checks the existing result and must not make a second provider call. A payload change under the same identity is a conflict. A timeout or failed result remains uncertain/failed; starting a genuinely new paid attempt requires an explicit new identity and user action.

### Output checks and honest limits

Generated output must include exactly the requested component IDs, contain nonempty bounded text and survive placeholder/composition validation. The model is instructed not to invent names, relationships, dates, proof, outcomes or promises, and to treat source material as data rather than instructions.

These checks do not prove semantic truth or perfect human writing. Human review remains required. For AI components, the trace identifies **facts selected and supplied to generation**; it does not prove that every supplied fact appeared in the final sentence. The generated text is retained for inspection. A future semantic fact-usage audit would be a separate feature.

The release does not fabricate testimonials or AC performance proof. A saved offer can contain only claims the owner is entitled to make.

---

## 12. Preview and review states

### Real-lead preview

Select a recipient from the working list. The server reads the complete scoped evidence history, not a truncated first page, and returns the usable inputs, conflicts, offer context and a fingerprint. A load failure is shown as a failure, never as “no signals found”. A large scope that exceeds the safety bound is explicitly rejected.

The preview shows the assembled email, missing-input reasons and an expandable “Why this copy?” trace. The trace exposes component/variant, mode, resolved variables, selected values, evidence strength, selection method and source links. Per-slot overrides can choose only allowed available signals.

### Selected-variant test

“Preview this variant” temporarily pins that one variant for inspection. It is visibly labelled as a test, and does not change the saved routing rules. Generation/save controls cannot turn that forced test into a production recipient draft. “Return to automatic matching” restores the real routing view.

This avoids the confusing situation where editing variant B still displays variant A because A is first eligible.

### Synthetic leads

The owner can create, rename and edit several test leads in the current browser tab. Set signal values directly to test complete, partial and missing-information cases. They are labelled synthetic, do not count as evidence and cannot be saved as recipient copy, exported as production drafts or included in results.

Synthetic leads are not newly researched businesses and are not persisted as CRM records. Cross-device shared fixture libraries are not included in this release.

### Offer and audience

An expandable document view displays the offer snapshot linked to this list and the relevant audience criteria. Missing offer context is visible and holds AI generation. Do not silently substitute an unrelated offer from another campaign or mutable document.

---

## 13. Saving drafts, editing and history

Saving a real preview requires a saved template version, complete rendered copy and a matching current context fingerprint. It also includes the previous recipient-draft ID. A newer draft head produces a conflict rather than overwriting another edit.

The server renders the saved policy against the actual context again; it does not blindly trust a browser-supplied finished email. Operator AI saves must refer to the exact generated receipt. Authenticated executors may provide component outputs through the same validation boundary.

Each saved draft retains template version, list, recipient, company, workflow, available/selected signals, source/evidence references, actual component text, modes, fallbacks and experiment assignment where applicable.

Manual recipient editing creates a new revision, not an in-place mutation. It sets a human-edited trace flag so copied template metadata cannot masquerade as a clean experimental observation. Restoring old copy also creates a new revision and retains its original attribution/provenance. A restore never deletes intervening history.

Manual copy is excluded from automatic signal-performance comparisons by default in this release. Its real business outcomes can still exist; exclusion prevents unsupported attribution to the original generated strategy.

Saving is not approval. Existing operator approval rules remain in place.

---

## 14. Batch application and long-running work

Batch application is a separate, deliberate step after saving a template. Select affected lists, create a frozen preview and inspect its scope before processing chunks.

The existing job system freezes recipient IDs, previous draft heads, company input revisions, signal values and evidence references. The new renderer additionally records the exact workflow definitions used by those lists. The application step reads those frozen references, not whatever fresh research happens to exist later.

The current batch facility revises recipients that already have drafts. Initial drafts can be created through real-recipient Preview/Save or the existing connected Write executor. Do not present this release’s batch button as a new one-click initial-draft generator for every undrafted recipient.

### Preservation and conflict rules

Manual edits and restored drafts carrying the human-edited flag are protected by default. Replacement requires an explicit overwrite choice and confirmation. The existing database job enum does not have a separate “protected” status, so protected items appear under attention/failed with a clear “Protected manual edit: unchanged” reason. Their copy is not damaged.

Changed heads or company-input revisions remain conflicts. Missing frozen evidence holds/fails the item. Other successfully applicable items can still complete. Resume uses saved job and request identities; it does not recreate the entire batch.

### AI in batches

Bulk application itself does not launch an unbounded series of paid model calls. A connected executor supplies generated text keyed by job item and component. Unsupplied AI-only items remain queued instead of being marked as successfully rendered. An operator cannot forge the agent-only bulk generation payload through the UI.

The old job layer may still label a mixed-mode batch draft’s broad provenance as `template`; the new per-component trace is the authoritative source for AI-versus-deterministic analysis. Do not infer mode only from that legacy field.

---

## 15. Experiments

The first supported experiment is two variants of one component. The rest of the message remains governed by its saved configuration. Experiments are off by default.

The experiment stores an ID, descriptive name, component ID, two distinct enabled variant IDs and a stable salt. A pinned tested component is incompatible with random assignment and is rejected.

Assignment uses a stable hash of experiment identity/salt and company within list. Two contacts at the same company/list do not get silently rerolled because the preview recipient changed. Approximately half the eligible companies go to each arm; a small sample is not guaranteed to split exactly equally.

### Common eligibility

Only companies that can render both arms belong in the A/B comparison. A service+location opener and a founder opener are not directly comparable when the former group lacks founder evidence. A company eligible for only one can use ordinary matching, but its trace marks it outside the experiment population.

Manual signal-override review and subsequent human edits must not be mistaken for a clean randomised treatment. Human-edited drafts are excluded from automatic results. The owner should avoid selectively overriding an experimental arm after seeing its output and then claiming an unbiased result.

### Interpretation

Results are descriptive counts and rates with their denominators, not an automatic causal verdict. Different cities, list quality, offers, seasons, lead roles, follow-up exposure and deliverability can influence outcomes. A higher raw reply rate is not proof that one signal caused the difference.

Experiment grouping includes campaign, list, experiment identity, template version and arm. New versions do not silently pool with old treatments. There is no automatic winner promotion, significance badge or optimisation loop in this release.

---

## 16. Outcomes and learning

Supported explicit event types are `sent`, `delivered`, `bounced`, `reply`, `positive_reply` and `booking`. Events require provider, source-event ID, provider-message ID, campaign ID, exact saved draft ID and occurrence time. Automated replies can be marked as automatic.

An export is not a send. A send is not a delivery. A reply does not create an invented delivery record. The UI must distinguish no data from zero measured outcomes.

### Deduplication and attribution

One provider/campaign/message identity maps to one immutable saved draft. Conflicting attempts to attribute it to another draft are rejected, including racing imports. A provider source-event identity is idempotent: an exact repeated payload is already imported; a changed payload under the same identity is a conflict.

Events before draft creation or implausibly in the future are rejected. Synthetic and unattributable drafts cannot enter results. The imported trace is copied from the stored draft, not trusted from an uploaded file.

A malformed event batch is rejected at validation. Within a well-shaped batch, per-event acceptance/rejection receipts make partial retry safe. The owner can correct rejected rows without duplicating accepted ones.

### Measures

Count unique applicable message outcomes, not repeated webhook deliveries. Exclude automated replies/bookings and synthetic/human-edited traces from automatic strategy comparisons. Bounced messages do not remain in the delivered denominator. When required delivery evidence is absent or does not cover the reply population, display rates as unknown rather than dividing unrelated totals.

The default signal-combination grouping reflects the selected categories across the initial email’s traced components. Variant and mode views expose alternative groupings. This first release does not provide a separate arbitrary component/date/ICP slice for every chart; additional analytic slicing must not be implied by the presence of raw trace data.

### Integration boundary

The implementation accepts explicit JSON imports in the UI and equivalent authenticated MCP/API imports. It does not yet automatically reconcile every Instantly event to a draft. Existing flat campaign aggregate statistics cannot safely reconstruct message-level treatment assignments.

A future provider sync should use the same validated import boundary, exact outbound message mapping, stable event IDs, backfill cursors, retry receipts and explicit automatic-reply classifications. It must never distribute aggregate replies proportionally across templates to create apparent evidence.

---

## 17. Export, preparation and handoff

The owner chooses the columns to export at the company or recipient grain through the existing frozen export facility. Newly selectable recipient metadata includes `list_id`, `current_draft_id` and `copy_control`, alongside the existing email components and contact fields.

Retain the exact draft ID and list/campaign mapping in downstream tooling to support outcome attribution. A generic provider CSV may not accept a nested JSON trace as an email variable; that trace is primarily an audit/handoff column. Do not send it as visible email copy.

CSV serialization preserves quoting, commas, line breaks and Unicode and retains the repository’s spreadsheet-formula neutralisation. A partial export job is not downloadable as a falsely complete result. Exports are private, scoped and resumable through existing artifact routes.

Preparation and readback checks remain separate from CSV download. Neither the user nor agent should assume a verified local draft is already installed in the intended remote campaign. Existing campaign activation/sending stays outside the new Copy Control actions.

---

## 18. Saved workflows and MCP

Compass’s interface and authenticated agent share the same underlying records and matching functions. The MCP tool is `outbound.copy_control`. Existing list/research/contact/verification/run/job tools remain in use rather than creating a second parallel database.

A reliable agent journey is:

1. Read capabilities and the exact list/workflow/template versions.
2. Read complete copy context for the chosen recipient or frozen batch.
3. Preview without writing or spending.
4. Resolve held inputs by researching, selecting an allowed fallback or changing the template explicitly; do not invent data.
5. Generate AI only under the user’s authorised scope and explicit spending contract, preserving request identities.
6. Save exact drafts using matching fingerprints and previous-head identities.
7. Use existing approval/export/preparation tools and stop at the required operator boundary.
8. Import actual attributable events when available.

Saved workflow execution must preserve the chosen version, budget limits, checkpoints and tool strategy. A remote run must produce receipts and held/error reasons so the owner can inspect it later. A tool call returning successfully is not enough to infer business-level success.

The MCP tool description points agents to this Copy Control contract and its limitations. Existing agent skill instructions remain unchanged. This specification is not authorisation to autonomously run live campaigns.

---

## 19. Data model and compatibility

No new production database migration is required for this implementation. It uses existing pipeline versioned JSON and the existing evidence-event table. That avoids creating a frontend that depends on a migration which the release tooling cannot apply.

| Existing storage | New or reused responsibility |
|---|---|
| `compass_lead_lists` | List identity, membership context, linked saved workflow |
| `outbound_pipeline_workflows.policy` | Existing criteria/tool/verification policy plus optional explicit signal category |
| `outbound_pipeline_templates.policy.copy_control` | Version-1 component/variant/slot/experiment configuration |
| `outbound_pipeline_signals` | Immutable observations and supersession/evidence history |
| `outbound_pipeline_drafts.copy.copy_control` | Exact render trace, synthetic flag, mode, assignment and optional human-edit marker |
| `outbound_pipeline_jobs.config.copy_control_scopes` | Frozen workflow definition snapshots for batch rendering |
| `outbound_pipeline_receipts` | Existing idempotent write/run/job results |
| `compass_offer_revisions` | Immutable offer snapshot supplied to generation/review |
| `compass_evidence_events` | Copy-generation reservations/results, save markers, message mappings and imported outcomes |

`copy_control` is additive. Legacy top-level component strings and follow-up slots remain present. The new component configuration is authoritative when present. Old templates and old drafts without traces remain readable, but unattributed old copy does not receive invented signal statistics.

The event layer is append-only by this feature’s code contract. Existing database-wide permissions are not rewritten or represented as a newly installed immutability trigger. Private operator/agent boundaries remain mandatory.

---

## 20. API contract

Operator root: `/api/operator/outbound/pipeline/copy-control`  
Agent root: `/api/agent/outbound/pipeline/copy-control`

The operator route requires an authenticated operator; POST also checks same-origin. The agent route requires the existing agent secret before any data access. Both call the same implementation.

### Read context

`GET ?list_id=<id>&recipient_id=<id>` returns list, workflow, offer, recipient, usable inputs, conflicts, evidence count, rendering context and a context fingerprint called `preview_hash` in this response.

The server drains scoped evidence pages. It does not return the whole raw observation history in the HTTP response. Source IDs remain available for evidence inspection through existing routes.

### Read results

`GET ?view=metrics&group=signals&campaign_id=<optional-id>` supports `signals`, `variant`, `mode` and `experiment`. Responses identify explicit-import provenance, event counts and whether the requested scope was complete. Oversized scopes fail with an instruction to choose a campaign.

### Preview a saved version

```json
{
  "action": "preview",
  "list_id": "list-id",
  "recipient_id": "recipient-id",
  "template_version_id": "template-id",
  "overrides": {}
}
```

This is read-only. It returns selected components, held reasons, pending AI work, trace, offer context, `context_hash` and a template/override-bound `preview_hash`. These two fingerprints have different roles; do not interchange them.

### Explicit generation

```json
{
  "action": "generate",
  "request_id": "unique-generation-request",
  "list_id": "list-id",
  "recipient_id": "recipient-id",
  "template_version_id": "template-id",
  "input_hash": "64-character-context-fingerprint",
  "confirm_spend": true,
  "overrides": {}
}
```

Use the actual context fingerprint, not the illustrative string above. Return the exact same request after an uncertain response. A changed request requires a new identity and renewed intentional scope.

### Save rendered recipient copy

```json
{
  "action": "save",
  "request_id": "unique-save-request",
  "list_id": "list-id",
  "recipient_id": "recipient-id",
  "template_version_id": "template-id",
  "preview_hash": "64-character-template-bound-preview-fingerprint",
  "previous_id": null,
  "overrides": {}
}
```

`previous_id` is null only for no existing draft; otherwise it is the actual current head. AI saves additionally include `generated` keyed by component ID and, for the operator path, the matching `generation_request_id`. Actual schemas reject the illustrative non-hash strings above.

### Import actual outcomes

```json
{
  "action": "import_outcomes",
  "events": [{
    "provider": "provider-name",
    "source_event_id": "provider-event-id",
    "message_id": "provider-message-id",
    "campaign_id": "campaign-id",
    "draft_id": "exact-saved-draft-id",
    "type": "delivered",
    "occurred_at": "2026-09-17T12:00:00Z",
    "automatic": false
  }]
}
```

These are shape examples, not events to import. Use true provider timestamps and mappings. Partial row outcomes are explicit receipts, not a silent all-or-nothing success message.

For templates, manual draft revisions, runs and jobs, keep using the existing versioned pipeline command envelope. MCP callers should read schema/skill documentation rather than guess extra fields.

---

## 21. Safety, concurrency and failure behaviour

### Access

Do not remove login, open private routes, weaken operator checks, disclose provider keys or put secrets in the client. Customer delivery users cannot access private Copy Control data. Authenticated agents cannot grant their own operator approval.

### Input and source trust

Signal content is untrusted text. It cannot execute directives, HTML or code. Research quotes do not become model instructions. Server validation uses strict bounded schemas; unknown authority fields are rejected.

### Concurrency

Saved versions are immutable. Recipient drafts use previous-head checks and existing atomic database write contracts. Batch application uses frozen scope and existing revision checks. A stale preview is refreshed before saving rather than silently used.

Context fingerprint checking is optimistic at the application boundary, not a new serializable transaction across every research table. Exact retained evidence references and downstream readiness checks remain necessary. Do not claim that a UI refresh lock alone freezes every external fact forever.

### Partial failure

A failed preview leaves saved state untouched. A failed template write preserves local edits. An uncertain save exposes same-request retry. A failed generation may have incurred provider usage; it is not automatically repeated. A batch can show completed, conflicted, protected and failed items without pretending the entire list succeeded. An event import returns each row’s result.

### Missing dependencies

When the pipeline schema/feature flags are unavailable, use the existing unavailable/read-only state. When an AI gateway or offer is absent, deterministic writing still works but AI generation is held. When no outcome mapping exists, results stay empty/unknown rather than fabricating analytics.

---

## 22. Operational limits

These are current implementation bounds, not pricing guarantees:

| Boundary | Limit / behaviour |
|---|---|
| Components | 5 built-in minimum, up to 30 total |
| Variants | Up to 100 per component |
| Variables / allowed inputs | Up to 100 variables and bounded signal arrays |
| Configuration/copy fields | Bounded text; schema is authoritative |
| Follow-ups | Up to 10, delay at least 2 days |
| Subject output | Single line; renderer caps at 500 characters |
| Evidence read | Pages of 100; reject an incomplete scope at the 10,000-history safety bound |
| AI generation | At most 8 components, bounded context, 3,000 output-token ceiling, 40-second provider timeout, no automatic provider retry |
| Copy Control POST | 256 KiB body bound |
| Outcome import | At most 100 events; UI file selection limited to 200 KiB |
| Metrics | Pages of 500; at the 20,000-event guard, require a narrower campaign scope rather than return a partial aggregate |
| Batch work | Existing chunks of at most 100 items |
| Local undo | Bounded approximately 60 prior editor states |

Large arbitrary campaigns are not launched from a single unbounded browser request. Limits may change in later versions only with explicit testing and clear error behaviour.

---

## 23. Acceptance criteria

| ID | Acceptance condition |
|---|---|
| UX-01 | Write does not permanently show research configuration, model prompts, previews and analytics side by side. |
| UX-02 | The active list, template and stage are identifiable; the owner can return to recipients without losing the local template buffer. |
| UX-03 | One element and named variant can be selected, renamed, duplicated, reordered and edited directly. |
| UX-04 | Desktop and narrow-screen editing do not create document-wide horizontal overflow; focus and errors remain visible. |
| SIG-01 | A subject and opener can resolve several explicitly allowed signals in deterministic priority order. |
| SIG-02 | Strongest selection and manual override are limited to supported allowed inputs. |
| SIG-03 | Missing required, conflicting, malformed and foreign-scope data do not become plausible invented copy. |
| SIG-04 | Explicit fallback is inspectable and recorded. Unsupported optional complexity cannot erase required safety gates. |
| CMP-01 | Custom blocks insert at the intended position without duplicate opener/CTA text. |
| CMP-02 | Unknown/cyclic/component-injection tokens hold rather than execute. |
| AI-01 | Reading, previewing, switching modes and saving configuration make no model calls. |
| AI-02 | Generation requires explicit confirmation, offer, current inputs and configuration. |
| AI-03 | Same-request retries make no second provider call, including after an uncertain failure. |
| AI-04 | Generated component IDs and final copy are validated; AI remains unapproved review material. |
| PRE-01 | Real previews show the actual evidence-backed values and selected strategy. |
| PRE-02 | Forced-variant tests are labelled and cannot be saved as real drafts. |
| PRE-03 | Synthetic leads can be edited but cannot enter CRM drafts or metrics. |
| VER-01 | Saving creates a new version; legacy versions and old recipient drafts are not silently changed. |
| VER-02 | Stale context/head writes fail; uncertain saves preserve exact request identities. |
| VER-03 | Manual edits/restores preserve history and mark human changes appropriately. |
| JOB-01 | Batch application uses frozen workflow/evidence values and preserves manual edits unless explicitly authorised. |
| JOB-02 | Missing AI item output stays queued; the batch tool does not imply provider generation or sending. |
| EXP-01 | One two-arm component experiment assigns stably within company/list and compares common-eligible companies. |
| EXP-02 | Campaign/list/version/arm stay separable; the UI produces no unsupported winner verdict. |
| MET-01 | Only real mapped outcome events count; repeats deduplicate and conflicting message assignments fail. |
| MET-02 | Exports are not sends, replies do not invent delivery, missing denominators yield unknown rates. |
| MET-03 | Automatic responses, synthetic fixtures and human-edited treatment traces do not contaminate automatic strategy counts. |
| API-01 | Operator/agent access is checked before data; same-origin writes and approval boundaries remain intact. |
| API-02 | MCP calls the same rendering/import service with strict payload validation and stable request IDs. |
| CSV-01 | Selected columns include attribution identifiers, and existing CSV escaping/formula safeguards remain intact. |
| REL-01 | Feature tests, relevant regressions, deploy guards, typecheck and production build pass before merge. |
| REL-02 | The deployment being checked corresponds to the merged SHA, not an older successful preview. |

Acceptance evidence and any environment-specific limits belong in the release record. A passing unit test is not substituted for an unperformed authenticated production interaction.

---

## 24. Implementation map

Core rendering and attribution: `src/lib/copy-control.ts`  
Strict configuration, trace and event schemas: `src/lib/copy-control-schema.ts`  
Shared context, preview, generation, save and results service: `src/lib/copy-control-server.ts`  
Frozen job integration: `src/lib/copy-control-jobs.ts` and existing pipeline job modules  
Operator/agent boundaries: the two `outbound/pipeline/copy-control/route.ts` files  
Focused editing/review: `WriteEditor.tsx`, `CopyControlStudio.tsx`, `CopyControlResults.tsx` and `copy-control.css`  
Stage integration: `WorkflowWorkspace.tsx`, `PipelineJobsPanel.tsx`, `ResearchCards.tsx`  
Agent exposure: `mcp/lib.mjs`, with contracts documented in this specification  
Tests: `test/copy-control*.test.mjs`, existing pipeline/database/regression suites and explicit service-role route inventory.

---

## 25. Deployment and rollback

Preserve the latest main before making changes. Develop on a separate feature branch. Build without production secrets using repository placeholders. Do not run destructive migrations, alter real lead memberships, generate paid customer copy or activate campaigns as a side effect of release verification.

Before merging, inspect the PR diff and passing checks for the exact candidate head. Confirm the Vercel preview’s source SHA and ready state. After merging, confirm the production deployment’s source SHA and actual alias. Check unauthenticated boundaries without disabling protection to make a screenshot work.

Authenticated data-saving verification requires a genuine authorised session or an appropriate connected integration. A login redirect is evidence that the boundary remains, not proof that every live database action was exercised. Offline browser fixtures are labelled separately.

Rollback should redeploy/revert the release commit rather than delete user data. New versions/drafts are additive. Old application code may not understand new component policies, so do not continue applying newly authored component templates through an older renderer after rollback. Preserve the new records and use an old compatible template until the fix is redeployed.

---

## 26. Remaining integration and product work

The following are explicitly not disguised as complete by this release:

- Automatic provider event-to-draft synchronization/backfill; the current importer and mapping contract are implemented.
- Live configuration and paid-output verification of the AI gateway/model in this particular Vercel environment.
- A new visual AI collaborator for planning List builds; current lists and agent pipeline facilities remain.
- New adapters/credentials for every requested research and contact provider.
- A complete cross-provider research cost/speed/quality analytics dashboard.
- Cross-device persistent synthetic test-lead libraries.
- Semantic proof that every AI-generated factual claim uses exactly the supplied evidence.
- Arbitrary multivariate optimisation, automatic winners or automatic campaign activation.

These items do not prevent deterministic component editing, evidence-backed matching, saved versions/drafts, bounded AI execution where configured, batch integration, event import or trace-based results from working. They do prevent claiming that every future end-to-end workflow is already unattended and verified.

---

## 27. Decision log and review guidance

The first screenshot’s complaint belongs specifically to **Outbound → Write**: oversized navigation and setup displaced the real editor. The second screenshot was a concept from another chat, not an approved UI to reproduce. Julian liked its Copy Control name, but rejected its density and colour overload.

The discussion then established a component/variant system with structured multi-signal matching, both deterministic and AI modes, manual signal control with automatic assistance, and signal-combination learning as the primary analytic interest. This specification preserves those choices and supplies the failure behaviour and data contracts needed to implement them.

When reviewing the product, start with one real list and a deterministic subject/opener. Verify that its facts are correct, its sentence reads naturally and an unsupported case holds. Then test a second variant, one controlled experiment and one genuinely mapped outcome import. More switches are not a substitute for those basic workflows working reliably.
