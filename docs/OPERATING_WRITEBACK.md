# Shared operating writeback

Read `GET /api/agent/operating` before selecting work. It returns the current
queue, alternatives, accepted order, campaigns/provider evidence, preparation,
projects/goals, captured notes, and source coverage. Query `?day=YYYY-MM-DD` for
another Sydney day. Normal Compass agent authentication applies.
The queue returns preparation metadata and exact recipient IDs without repeating
every draft. Read `GET /api/agent/operating?record=preparation:...` for one full
review record when its messages are needed.

`POST /api/agent/operating` accepts the strict command schema in
`src/lib/operating-core.ts`. The local CLI is `node scripts/operating.mjs` for a
read or `node scripts/operating.mjs /absolute/path/command.json` for a write.
Never put credentials in command files or task context.

## Contextual task

```json
{
  "action": "task",
  "request_id": "a-unique-stable-report-id",
  "key": "stable-work-identity",
  "task": {"title": "Concrete next action", "status": "not-started"},
  "context": {
    "domain": "business",
    "reason": "Why the work is required",
    "next_action": "The next executable step",
    "done_when": "An observable completion condition",
    "source": "Exact instruction or originating source reference",
    "source_kind": "explicit",
    "state": "ready",
    "owner": "Jules",
    "goal_id": "",
    "campaign_id": "",
    "links": [],
    "depends_on": [],
    "evidence": []
  }
}
```

Use `id` and `expected_updated_at` from the current record when updating. Preserve
its full context, notes and relations. Existing key matches require a current
revision; never create a new key to evade a conflict. Retry an uncertain write
with the identical request ID and payload. A changed retry is rejected. The
receipt and canonical mutation commit together. Look for matching work by task,
project, campaign/contact and purpose before adding anything.

Only explicit commitments/authorised work become ready automatically. Inferred
work uses `state: proposed`. Activity is evidence, not an instruction. Agent
completion reports use `state: awaiting_confirmation` and evidence with `detail`,
`source`, `at`; retain the actual open task status. Operator confirmation closes
the original task. Agent writes cannot accept a day or silently change a task's
existing date. Context `available_on` can state a prerequisite/earliest date but
must not override a promise. Unknown dates stay unset.

Projects use `action: project`, the same key/revision/context contract and
`project: {name, summary}`. Link tasks through their existing `project_id`. Goals
remain existing planning records, with their original target and commitment status.

## Source and preparation records

When a campaign was created directly in Instantly, first reconcile its identity
with `POST /api/agent/campaigns`: `provider_id`, `offer_key`, `vertical_tags`,
`location_tags`, and the exact `source` authorising/identifying that campaign.
The endpoint reads Instantly, reuses an existing binding or creates one stable
Compass record. It never changes provider copy, sends or activates. An offer or
binding conflict is held for review. Then refresh operating facts and attach the
exact loaded/prepared receipt to the returned Compass campaign ID. Lead flags or
a prose handover alone do not register a campaign in the operating view.

Use `action: record`, `request_id`, `id`, `kind`, current `revision` (zero only for
new records), and `data`. IDs start with their kind followed by a colon.

- Source: `source:agents`, `source:activity`, `source:documents`, `source:calendar`.
  Data includes name, status (`current`, `partial`, `unknown`, `error`, `stale`),
  coverage, checked_at, consumed watermark/source revisions and a failure reason
  when relevant. Current means checked coverage, not universal access. Check the
  timestamp and preserve the prior successful watermark on failure.
- Capture: exact body, source, source_kind, observed_at, domain and resolved false.
  Raw notes/screen evidence do not silently create accepted work. Resolve after
  preserving any resulting decision/task links in the same capture record.
- Preparation: campaign_id, exact distinct lead_ids (max 200, validated against
  Compass), source, title, status (`prepared`, `loaded`, `archived`), review URL,
  observed_at and messages when appropriate. Prepared and loaded batches remain
  separate. Use existing frozen preparation/load receipts as authority. This is
  a visibility receipt, not a new approval or upload mechanism.

## Operating loop

Read current decisions and operating work. Inspect only changed relevant sources.
Update facts and known commitments, prepare authorised work, attach checked outputs,
and save consumed source watermarks. Preserve accepted order. Publish suggested
changes for review, using the existing day handover for concise reasoning. Keep
blocked and incomplete source coverage visible. Do not manufacture capacity,
contact outcomes, numerical goals or external authority. Remain quiet when nothing
material changes; surface a real interruption, failed source or ready decision.

Append handover narrative to the note's `body`, not its `links` field. The latter
is a short link field and long prose is truncated. Re-read after saving and check
the complete appended text. Keep bodies below 20,000 characters and rotate dated
working notes when needed, preserving a link to the previous note.

Hosted daily sync prepares the next daily projection and reconciles provider state.
Home refreshes stale Instantly evidence while open. Desktop source review is a
separate local wake-up: it cannot observe desktop activity while the Mac is off.
