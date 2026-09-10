# Evidence and copy review handoff

This optional UI patch is isolated from the active Compass checkout. It does not change a schema, API, rendering contract, preparation hash, campaign, or live lead. Merge only after checking the latest background work in `CampaignPreparationPanel.tsx`; no deployment is part of this patch.

## Existing field mapping

| Worker information | Existing preparation record | Review display |
| --- | --- | --- |
| Installation, operating and location evidence | `candidate.evidence[]`, kinds `service`, `operating`, `service_area` | Existing Source evidence section |
| Selected opener passage | `candidate.evidence[]`, a separate kind such as `opener_signal` | Source evidence and draft evidence section |
| Signal classification | `candidate.draft.signal_type` | Selected signal (this patch) |
| Permitted commercial connection | `candidate.draft.offer_connection` | Text below selected signal (this patch) |
| Facts used for the draft | `candidate.draft.evidence_kinds` | Matching quotes and source links (this patch) |
| Subject and opener | `candidate.draft.subject`, `candidate.draft.opener` | Existing rendered email |
| Unresolved selection or writing failure | `candidate.hold_reason` → `record.reasons` | Existing hold reasons |
| Genuine disqualification | `candidate.exclude_reason` | Existing excluded state |
| Additional structured selection/claim audit | Original imported row in `source_rows` | Retained for audit; not exposed by this patch |

Each evidence entry already holds `kind`, `value`, `quote`, `url` and `observed_at`. Its value must be a literal substring of its quote. Use one authoritative entry per kind, or different kinds for distinct claims: multiple different values of one kind fail existing preparation validation. Draft `evidence_kinds` must include `service`; include the selected opener evidence kind as well. Do not add arbitrary properties to `draft`, because the revision API validates that object strictly.

The worker must supply the distinction between fit and selected opener evidence. This display surfaces existing data and does not independently validate a claim or assert that the worker's signal is correct. Existing all-evidence and rendered-email sections remain available, including on held records.

## Integration dependency and check

The separate worker patch must produce supported `draft` and `evidence` values before a live handoff. No live import is required to develop or test the worker. When integrating later, inspect one prepared record with a strong signal, one factual fallback, and one held draft. Confirm the linked quotes correspond to `evidence_kinds`, the rendered email is unchanged, and old template-mode records retain their existing selected-signal display.

Only `src/components/outbound/CampaignPreparationPanel.tsx` changes product code. Resolve any overlap with background UI work at merge time instead of replacing that file wholesale. There is no reason to alter `expectedValues()` or database migrations to display this information.
