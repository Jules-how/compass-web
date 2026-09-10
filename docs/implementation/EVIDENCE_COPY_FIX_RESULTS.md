# Evidence and copy reliability: isolated implementation

Date: 10 September 2026. Branch: `fix/evidence-copy-reliability`.
Base: `34c517acf077d4de417d68f2ae9378603413d637`.
Worktree: `/Users/Jules/compass-evidence-copy-fix`.

## Plan and implementation

1. Select a supported paragraph from cached research before writing. Rank installation offers, replacements and relevant finance evidence; exclude headings, testimonials and irrelevant system context. Preserve the selected quote, URL, reason and alternative candidates.
2. Keep company qualification separate from writing readiness. A missing usable observation creates a writing hold, not an ICP rejection.
3. Give the writer only the selected observation and allowed claims. Remove inferred customer scope and unrelated services from its input. Keep the campaign body stable.
4. Validate both subject and opener against controlled concepts, brands, numbers, scope and locations. Retry only rejected recipients once; cache successful drafts and failures. Existing batching remains in place.
5. Export the evidence and review state into the existing Compass preparation shape. Do not invent identity approval. Held rows cannot export an approved draft.
6. Provide an optional Compass review-panel change showing the selected signal, commercial connection and linked evidence. No schema change is needed.

The selector and Compass contract review were developed concurrently; integration and tests followed sequentially. No new platform, database or research service was added.

## Confirmed findings

Better source material already existed for the main failures. Comfort Zone now selects the reverse-cycle replacement passage about retaining ducting. Coastline uses the actual split-system installation/replacement paragraph rather than the heading "Installations". Total Kooling's testimonial is excluded and its published removal/decommission inclusion is supported by the installation-page context. Exact regressions cover these examples.

The original Coastline commercial-refrigeration hallucination fails the copy checks. Subjects are checked as well as openers. The handoff retains literal evidence and verification status while keeping identity review explicit.

Some old drafts are correctly held when their customer scope is absent from the selected passage or a stronger, different signal is selected. For example, the saved Air Rush and Needham copy adds customer scope beyond the selected paragraph. This must be corrected in the draft rather than automatically inferred to improve an acceptance score.

## Verification and limits

- 66 Python tests pass across the top-level outbound worker suite, including 12 selector tests, 6 copy-grounding tests and 2 preparation-handoff tests.
- TypeScript typecheck passed with incremental output disabled. Existing dependencies were reused; no dependency installation or development server.
- All 17 existing Node preparation/import checks passed, including mixed single-split fit, evidence contradictions, rendering integrity and paused readback requirements.
- `git diff --check` passed.
- Cached research was reviewed offline. No fresh model run was performed, so no claim is made about live first-pass acceptance, throughput improvement or campaign performance.
- The copy checks are conservative guardrails, not complete semantic entailment. Human opener review remains necessary. Unusual unsupported paraphrases can evade a finite vocabulary; supported paraphrases can also be held.

## Isolation and cost

All implementation changes are in this separate worktree. No active-checkout edits, deployment, live Compass writes, Instantly changes, sourcing or verification runs were performed. New paid tool spend: $0. Research/contact artifacts are excluded from the source patch.

The worker changes and optional UI change can be integrated separately. See `EVIDENCE_COPY_COMPASS_HANDOFF.md` for the existing preparation contract. The active Mac worker remains unchanged until deliberate integration; this implementation is not deployed.

## Next proof

Once the concurrent Compass work is ready for integration, compare its latest worker and panel changes with this branch. Integrate the worker modules together, update the local execution copy deliberately, and apply the optional panel patch only after checking overlap.

Then run a small cached cohort containing the three known failures plus good finance, package and ordinary split-installation examples through the real writer. Measure selection accuracy, unsupported claims, human acceptance, retries, elapsed stage time, model cost and unchanged successful-cache reuse. Review the exact rendered copy before any paused campaign import. This live proof is outstanding; unit tests do not replace it.
