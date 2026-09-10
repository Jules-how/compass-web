---
name: instantly-load
description: >-
  Load a finished Switchflow cold email list into a paused Instantly campaign,
  configure the reviewed settings and reconcile actual recipients and copy.
  Use for campaign setup or upload, not list building or opener drafting.
---

# Instantly load

Local Mac route: finished CSV upload through Chrome on the campaign Leads tab. Do not use Instantly MCP/REST add-leads, Compass land or push-leads from this Mac; prior local requests returned Cloudflare 1010. This does not prohibit authorised hosted delivery. Do not retry blocked transports during a load.

Fetch the current tool schema and read the intended campaign/account settings before setup. MCP/API can configure supported campaign fields; use Chrome for settings absent from the callable schema and for CSV upload. Never infer a setting was saved.

## Input and authority

Use the exact recipient/copy artifact Jules reviewed in Compass, wherever its run folder lives. Each email row needs a source-backed published business inbox, current valid/provider-ok verification, fit and current outreach eligibility. Catch-all, unknown, invalid, error and missing results stay out of the normal export.

An unsent campaign assignment alone is not previous outreach. Resolve a known competing reservation separately. Check actual sends, suppression and repeated addresses before loading; do not perform a new company-identity audit. Preserve all source rows and skip reasons.

One city/area and one named offer/copy variant per campaign. An existing active campaign must not be repurposed or paused simply because new targeting docs changed. Create/configure a paused campaign only for an authorised upload. Loading does not authorise activation; launch requires Jules.

## Short handoff

1. Freeze the approved recipient set, subject/opener values, body/follow-up, sender selection and schedule in one preparation/transport artifact.
2. Create/configure a paused campaign using the reviewed recipe. Read settings and preview rendered messages before reserving/uploading.
3. Upload the CSV once through Chrome. Map email → Email, first_name → First Name, company_name → Company Name, personalization → Personalization, subject → Custom Variable. Map additional fields only when the frozen sequence references them.
4. Read back the entire recipient set and every used merge field, plus sequence/settings. Compare exact addresses and values with the artifact, accounting for known harmless HTML/text serialization only.
5. Reconcile through Compass and mark only confirmed uploads. Report skipped/failed addresses. If interrupted, inspect actual uploaded state before retrying; resume only the missing portion.
6. Give Jules the campaign URL, imported count and reviewable settings. Activate only after his instruction.

Use the campaign Leads tab: https://app.instantly.ai/app/campaign/{id}/leads . Do not also upload into a separate lead list. A retained CSV absolute path is preferable to repeatedly rebuilt scratch files.

Turn off paid Instantly verification at import; Million Verifier already did that work. Do not enable risky sending. Workspace/list/campaign duplicate checkboxes are membership filters, not proof of previous outreach. For a batch already checked against actual history and competing reservations, keep those broad membership skips off so harmless unsent assignments do not silently remove leads. Same-campaign repeated addresses remain an import/reconciliation check.

## Settings for new reviewed campaigns

Confirmed by Jules on 10 September 2026:

- Text-only for every step: text_only=true (HTML styling off); first-email-only optimisation is insufficient.
- Attach the selected existing eligible sender inboxes. Re-read limits/status; do not copy a stale pool or add every newly connected inbox.
- Provider matching on. Current readback field match_lead_esp=true; configure through UI if the callable tool omits it.
- Gap: email_gap=8 minutes plus random_wait_max=5. Read back both.
- Use existing per-inbox daily limits. Set the campaign's TOTAL daily cap to the capacity allocated from those accounts, accounting for shared campaigns and applicable ramp limits. Do not interpret the campaign cap as a per-account number. Do not increase account limits or disable ramp-up merely to reach a target.

Recommended stable defaults, included in the reviewed recipe:

- City-local weekdays. Use the chosen window; 09:00–18:30 local is the current Sydney reference, not a compulsory national schedule.
- Stop on reply on. Stop on auto-reply on with out-of-office cases surfaced for a later decision; do not add an untested automatic follow-up branch.
- Open/link tracking off. Unsubscribe header and a visible unsubscribe option in every email. No promotional links beyond the reviewed copy.
- Risky-email sending off; retain BounceProtect. Do not pay for another verifier at upload.
- Follow-ups retain priority; do not starve them with unlimited prioritised new leads. No automatic A/Z winner optimisation during the controlled test.
- Proposed new-campaign default: first email, then one follow-up after four calendar days, sent within the weekday window. Keep the two-day minimum. Save the actual delay; do not label this four business days. The reviewed recipe can choose a different compliant interval.

Actual send volume also depends on account availability, other campaigns, provider matching, follow-ups, eligible recipients and time left in the window. Configured capacity is not delivered volume. Do not disable matching to force a throughput number.

Instantly's UI can expose equivalent city timezone names (e.g. Melbourne for Sydney). Check local calendar/DST behaviour across the scheduled dates; neither blindly reject a label alias nor accept any same-current-offset zone. The old raw-string equality failure needs correcting in the implementation, not another settings loop.

## Copy and serialization

Email 1 uses {{subject}} and starts with {{personalization}}, followed by the fixed approved body. Do not add a second campaign greeting when the reviewed opener already contains one. A name is a published relevant person or blank. No invented placeholder person.

The follow-up uses the fixed reviewed copy and a blank subject when threading is intended. A new campaign must not inherit historical fill/capture or missed-call guarantees. Follow-up delay is stored on the email preceding the Wait box: first step delay ≥2, last step delay 0. Inspect the resulting schedule after setup.

Plain-text SEND mode and sequence storage format are different. This workspace previously lost plain text placed before an unsubscribe anchor when Instantly sanitised it. Preserve complete paragraphs using escaped text in minimal div/br markup if the API/editor requires HTML storage, while text_only stays on. Preview the exact rendered first email and follow-up to prove the text survives; do not introduce styling/images or blindly strip transport markup.

Set insert_unsubscribe_header=true through a supported setting and verify it; the create schema may omit it. The reviewed body retains its visible opt-out: a working unsubscribe link or Jules' approved reply “no thanks” instruction. Do not replace reviewed copy just to satisfy an older link-only checker. Do not add an extra signature if one already exists in the body/account.

## Completion and implementation boundary

The current Compass preparation machinery still contains old eligibility, template and timezone assumptions. It must accept the new frozen draft/settings contract before calling a broader batch reconciled. Do not repeatedly regenerate valid copy to satisfy obsolete requirements, grant human approval with worker credentials, or manually claim a failed preparation succeeded.

For supported installation-booking preparations, reserve after the paused campaign passes pre-upload readback, then consume the generated CSV and reconcile after upload. Existing check_campaign.py may help, but its old policy must be checked before treating it as authoritative. A checker passing proves only what it checks; actual recipient/merge readback is always required.

Done for a load means: paused campaign; reviewed sender pool, schedule, 8+5 timing and provider matching; correct total cap; all-step text-only; reply stopping and unsubscribe; ≥2-day follow-up; exact sequence and merge values; complete recipient reconciliation; matching Compass receipt. Loaded, activated and actually sent remain separate states.

## Current settings references

Verified 10 September 2026: [Campaign options](https://help.instantly.ai/en/articles/6222396-campaign-options), [account and campaign limits](https://help.instantly.ai/en/articles/6248612-account-and-campaign-limits), [provider matching](https://help.instantly.ai/en/articles/7044069-email-service-providers-matching). Recheck capabilities at execution; tool-schema labels have previously misstated the campaign cap and delay placement.
