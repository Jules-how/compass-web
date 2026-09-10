# Subjects and openers

Use the current [offer and signal contract](../../switchflow-offer/installation-booking.md). Jules' 10 September requirement is an individually drafted personalised subject and commercially relevant opener, with the remaining reviewed email stable. The previous instruction to fill rigid slots and never freewrite is superseded.

## Writing operation

Use the compact cached evidence packet from list building. Do not independently research every row again. Select the strongest supported signal and an appropriate acquisition connection, then draft subject and opener together. Run requests concurrently within the list-build limits. Missing optional signals do not disqualify a prospect.

Each result retains source row/Compass ID, signal type/strength, supporting quote/URL, offer connection, subject, opener, body variant and draft status. Save one accepted version. Retry an unsupported/broken field once; hold a remaining error rather than regenerate the cohort.

- Subject: short, natural and specific to the evidenced service, offer or business. No fake Re:/Fwd:, urgency, unsupported saving or invented name. Personalisation does not require a different sentence structure for every recipient.
- Opener: normally 1–2 short sentences. State the observation and connect it to a plausible installation-acquisition angle. Phrase the connection as our proposition, not a claim about their demand, capacity or advertising performance.
- Signal order is a preference, not first-keyword-wins: specific installation/replacement offer or project; relevant brand/service positioning; applicable finance/rebate/explicit expansion; installation relevance fallback. Choose based on evidence and commercial usefulness.
- Brand logos do not establish specialist status. A live page alone does not prove a time-limited promotion is current. Do not copy unsupported “pushing”, “most of your work” or “recently expanded” claims.
- For NONE/basic relevance, write honestly from the installation service/area evidence. Do not manufacture praise, novelty or a pain point.
- A published real contact name may be used only when appropriate to the selected inbox. Otherwise omit the greeting/name. No inferred first names, “there”, brand names as people or mandatory “Saw” phrasing.
- Ordinary split-system, commercial and mixed-trade businesses are in scope. Do not apply residential homeowner language to a commercial-only business.
- Keep body, CTA, signature and follow-up fixed within the named variant. The opener should not repeat the entire fixed body. Freeze the chosen variable and compare outcomes within comparable service/signal groups.

## Compass and validation

Compass owns leads, reviewed copy and the sequence. Use the existing outbound_worker.py/generate_openers.py integration as the implementation starting point; do not create a city-specific writing script. Current deployed preparation supports evidence-constrained drafts; a generated CSV alone is not a reviewed Compass preparation.

Validate every row for eligible valid email, factual claims traceable to evidence, correct company/name/area, compatible customer type, complete subject/opener, no unfilled tokens and unchanged fixed body. Do not rely only on a sample for these mechanical checks. Read a representative sample plus flagged exceptions for naturalness; Jules reviews the exact recipients/openers and count before upload.

The review CSV should show company, email, fit/system priority, signal, evidence link, personalised subject/opener and rendered first email/follow-up. The sending export is minimal: email, first_name when known, company_name, subject, personalization, and only additional variables the approved sequence uses. Map personalization to the exact reviewed opener; avoid duplicate opener/Opener aliases unless an existing frozen recipe actually requires them.

Only valid/provider-ok addresses enter the normal email review. Catch-all, unknown, invalid, error or missing verification stay out of the sending export. Preserve their source rows and call/unresolved route. Do not treat an unsent campaign assignment as a previous send.

[Jules' reviewed upload](../../.agents/skills/instantly-load/SKILL.md) consumes this frozen artifact. Copy edits invalidate only the affected review/output; they do not justify fresh scraping or verification of unchanged addresses.
