# Publishing the morning brief

Home advice has one designated publishing workflow: `compass-morning-pilot`.
This is a recorded workflow name, not a distinct security identity: callers still use
Compass agent authentication. A run ID identifies the exact attempt in request logs
and saved receipts. Do not invent an author when investigating older records.

Before publishing, read the current decision note
`planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0` and latest dated working note
through `/api/agent/planning`. Reconcile changed evidence with those decisions.
Reading the revision is necessary but does not prove the prose is correct; the
publisher must actually reconcile the source. Old brief text is historical evidence.

`GET /api/agent/outbound/waves` returns the Sydney date, publication contract,
and dated briefs including `revision`, `reviewed_at`, `publisher`, `run_id`,
`decision_revision`, `metrics`, and `metrics_updated_at`. Use today's revision,
or zero if today's row is absent. Never use yesterday's revision.

`POST /api/agent/outbound/waves` requires:

```json
{
  "day": "<current Sydney YYYY-MM-DD>",
  "publisher": "compass-morning-pilot",
  "runId": "<unique stable run ID, 8-160 letters/digits/dot/underscore/colon/hyphen>",
  "decisionRevision": 4,
  "expectedRevision": 0,
  "recommendation": "<reviewed current proposal>",
  "scan": {"homeBlurb": "<short version>", "writeup": "<full current review>", "julesLed": []},
  "next_campaign_ids": [],
  "actions": []
}
```

Numbers above are examples; read current values. Editorial fields are a complete
replacement, not a shallow merge. Preserve relevant accepted/proposed content by
reading it first. Do not resend old writeups or historical metrics in `scan`.
Supported scan fields: `homeBlurb`, `writeup`, `julesLed` (title, detail, task_type).
Explicit next campaign IDs (max two) belong to this proposal; omission clears them.
Create campaign records separately through the campaign API, then reference their
IDs here. The old `recommend` campaign-creation shortcut is rejected so it cannot
silently alter a reviewed brief. Do not create tasks merely to fill a morning.

A save is atomic: brief revision, previous snapshot, run receipt, actions and daily
setup tasks commit together. An identical retry with the same runId returns the
original receipt without additional actions or tasks. A changed retry is rejected.
On 409, re-read sources and the brief, reconcile changes and use a new runId; never
blindly increment expectedRevision. On an uncertain transport result, retry the
identical payload and runId first.

Each new publication is proposed, including edits after acceptance. Acceptance
and dismissal require the displayed revision and current decisions. Nothing in
publication or acceptance activates an Instantly campaign. Tasks stay open until
Jules confirms completion; schedules remain proposals.

Metrics sync writes only `metrics` and `metrics_updated_at`. `reviewed_at` changes
only with an editorial publication. Legacy advice has no verified review source;
Home labels it accordingly and does not offer acceptance. Older accepted advice,
when shown as context, carries its original date.

## Incident, 10 September 2026

At 07:07 Sydney, outdated 7 September guidance was saved into the 10 September
brief and queued duplicate actions. The 9 September review had already superseded
Melbourne-first preparation. Prior writes did not record a named run or source
revision. The configured Vercel sync preserves advice and does not generate this
wording. Local pilot instructions already pointed to current decisions. Exact
historical writer attribution is unresolved; do not claim that the pilot was the
culprit or that an unidentified remote scheduler was disabled.

Release checks: database publication/retry/decision tests, API validation and
source freshness checks, production build, deployed API readback, Home display,
and one subsequent scheduled run. A manual repair is not a successful scheduled
morning or one of the five pilot days.
