# Ads + booking

Status: testing. Jules confirmed this as the single current offer on 9 September 2026.
Targeting revised by Jules on 10 September 2026: Australia-wide established air-conditioning installers; ordinary single split-system installers also qualify.
Compass offer key: `installation-booking` (stable identity; do not create a competing offer).

## Ownership

This is the single current offer and targeting contract. Compass `/sales/offers` holds the matching operational offer, campaign copy and results. The daily decision note links here; research and historical campaigns are evidence, not alternative active offers. The previous existing-enquiry-only version is archived in `archives/offer-transition-2026-09-09/`.

## Buyer and outcome

Established air-conditioning installation and replacement businesses around Australia. Prioritise ducted reverse-cycle, then multi-split/multi-head and multiple split-system packages; ordinary single split-system installers also qualify. Residential, commercial, and mixed work are eligible. HVAC/electrical and plumbing businesses qualify when they install these air-conditioning systems. Independent-ownership wording is not required.

Help them acquire suitable installation enquiries through focused Google Search and move those enquiries through qualification to booked quote/assessment appointments, with follow-up, reminders and outcome visibility. Use homeowner language only where residential work is evidenced; a commercial installer needs commercially appropriate language. Market fit does not establish acquisition economics or readiness to buy.

Existing enquiries or a proven booking leak are not mandatory. Qualify demand opportunity, service area, estimating/installation capacity, contribution per installation, a complete client-funded test budget, authority and office cooperation. Published service pages establish relevance, not pain, budget, spare capacity or demand.

## Service

One agreed air-conditioning installation/replacement offer, customer type, service area and Google Search campaign, with an appropriate enquiry page/capture path, consented response and qualification, booking into the agreed calendar/office process, reminders, human handoff, exceptions and outcome reconciliation. Track enquiry source through attended quote appointments and later quoted/won outcomes where supplied.

No broad website rebuild, SEO, Meta expansion, engineering/sizing advice, unlimited integrations or guaranteed jobs by default. Voice is an implementation option, not proof of a finished service. Client media is paid directly by the client; Switchflow does not advance it.

## Commercial direction

Supplier: Julian Howard trading as Switchflow, ABN 70 833 262 837. Jules confirmed he is not GST registered; no GST is charged.

Commercial proposals still need explicit acceptance: A$2,500 for standard setup plus 30 live campaign days, potentially A$1,250 kickoff/A$1,250 acceptance; around A$3,000 client-paid media and up to A$100 usage; A$2,500 renewal only by agreement. These are planning proposals, not approved prices or commitments. Final scope, acceptance, media/usage budget, billing, cancellation and renewal must be reviewed in the client agreement. Do not inherit old guarantees, billing clocks or recurring terms. No numerical outcome or refund guarantee is approved. Leave unresolved terms out of cold copy.

## Research and targeting contract

- Geography: Australia, processed one named city/metro or regional area at a time. Record the area boundary and local timezone. A local operating address or an explicit service-area statement supports local relevance unless contradicted; the literal city name is not required. Service-area businesses need not publish a street address.
- Include: published installation or replacement of ducted reverse-cycle, multi-split/multi-head, multiple split-system packages, or ordinary single split systems. Installation can be residential, commercial or both. Mixed electrical/HVAC/plumbing categories and franchise/group membership are not exclusions by themselves.
- Priority: ducted reverse-cycle first; multi-split/multi-head next; multiple split-system packages next; ordinary single splits also eligible. A company offering several belongs at its highest evidenced priority. Priority affects ordering, not eligibility.
- Exclude only with supporting evidence: closed businesses; outside the selected area; directories or lead brokers; supply-only/manufacturing-only; repair/maintenance/refrigeration/duct-cleaning-only; gas-ducted or evaporative-only without an eligible AC installation service. Commercial or tender work alone is not a disqualifier. A tender-only acquisition model can be lower priority for the offer and needs sales qualification.
- Working interpretation of established, pending Jules' remaining clarification: evidence of a real operating installation business, such as a coherent live business website/listing and current service/contact route. No invented minimum age, employee count or reviews. Missing ownership wording, owner name, reviews or street address is not an exclusion. Unclear operating status is an evidence gap.
- Keep company fit, contact quality and outreach eligibility separate. Missing optional signals never disqualify. Missing service/area evidence is an unresolved row, not a factual anti-ICP result.
- Before email: supported installation/area fit; a published relevant work inbox and source; contact basis; actual verification result with provider and check time; suppression and actual outreach checks. No discovery-time deduplication or parent-company research project. Check repeated email addresses in the outbound batch once and prevent repeat sending. A campaign assignment by itself is not previous outreach. Resolve a known competing reservation without resetting history.
- High-fit companies without a valid email and with a published phone go to a cold-call-fit CSV, with their verification/source status retained. No phone means unresolved contact, not a callable lead. No calls, texts or social outreach are authorised by list preparation.
- A completed verification is not always a valid inbox. Keep confirmed-valid separate from catch-all, unknown and error. Missing results are pending. Recheck stale or changed addresses before launch; never promote an address merely because a CSV column is named verified_email.

## Signals and writing

Research each business once for qualification, contacts and writing evidence. Save each used fact's exact quote, source URL and observation time. Distinguish observation from a proposed acquisition angle. These are signal choices, not compulsory opener templates:

| Signal | Evidence needed | Permitted connection |
| --- | --- | --- |
| Installation/replacement offer | Explicit service/package/promotion; dates and terms when time-sensitive | Search demand for that specific installation/replacement |
| Installation project | Identifiable project and system/customer type | Similar installation enquiries and quote appointments |
| Brand positioning | Explicit specialist/dealer statement or specific installation offer; a logo alone is insufficient | Relevant brand plus installation searches |
| Finance/payment plans | Published applicable finance/payment option | An installation proposition with a payment option; no inference about buyer affordability |
| Rebate promotion | Published named program and applicable offer; check freshness before quoting terms | Enquiries about the advertised eligible installation; no invented eligibility or savings |
| New service area | Explicit recent expansion statement | Acquisition in the stated new territory; a normal suburb page is not expansion |
| Dedicated installation page | Explicit eligible installation service and audience | Service-specific acquisition and booked quotes |
| Basic installation relevance / NONE | Supported service/area but no stronger signal | Honest relevant outreach without manufactured novelty |

Maintenance-heavy positioning can lower priority when installation evidence is weak; an explicit qualifying installation service still counts. Generic central/ducted/heating words alone do not prove refrigerated reverse-cycle installation. Read context; do not confuse gas ducted heating, evaporative cooling, product sales or repairs with the targeted installation service.

Choose the strongest supported signal for the offer, not simply the first keyword. Individually draft a short personalised subject and commercially relevant opener from that evidence; save the chosen signal and connection in Compass. Keep the remaining reviewed body, CTA, signature and follow-up stable within the named test. Use one stable body that fits the included audience, or an explicitly reviewed audience variant where the buyer requires it. Do not send homeowner copy to commercial-only prospects.

No invented pain, capacity, growth ambition, advertising activity, urgency, names or emails. A promotion does not prove they need more jobs; a brand logo does not prove specialisation. A quote form does not prove lost enquiries. If no strong signal exists, use a truthful service/area opener and label its signal strength honestly. Do not force variety or regenerate acceptable copy.

## Outbound workflow

The current sequence is city selection → Vortex discovery with website contacts → cached, concurrent HTTP-to-text research → Parallel Extract only for failed/insufficient pages → fit/contact routing → Million Verifier through Apify → Compass subject/opener drafting → Jules' recipient/opener review → paused Instantly CSV import and complete readback. Implementation details and coverage limits: `cold-email/list-builds/AGENT.md`. Writing: `cold-email/openers/AGENT.md`. Loading: `.agents/skills/instantly-load/SKILL.md`.

Jules' named city starts the job. Reuse cached pages and existing valid verification where available; do not require an inventory census or pre-Vortex deduplication before discovery. Preserve previous source files and outcomes. Continue processing completed companies while other websites run. Work in small batches without rebuilding the whole cohort for an exception.

One initial email and one follow-up; keep at least two days between them. Four business days was the previous proposed follow-up and remains a proposal to resolve in the next campaign recipe, not a claim about Instantly's calendar-day delay. Review subject/opener and counts before upload; activation remains a separate Jules instruction. New list building or changed ICP does not authorise editing an existing campaign.

Describe acquiring suitable installation enquiries and taking them through to quote appointments. Use a low-friction diagnostic or permission CTA. No assumed booking leak, invented proof, prices or guaranteed incremental wins. The cold-call-fit CSV is a separate output, not an automatic multi-channel sequence.

## Outcomes

Keep unique companies researched, eligible contacts, contacted people, human/positive replies, qualified conversations, booked and held meetings, signed and paid clients separate. Record costs, attribution, reporting window and unknowns. A first exploratory cohort is not a controlled winner. Instantly activation and external messages require Jules' instruction.
