# Inbox schema verification before deployment

The 10 September usability release exposed an existing production schema gap: migration `0033_inbox_triage.sql` was tracked locally but `portal_inbox_triage` and inbound lifecycle columns were absent in the connected database. TypeScript and projection unit tests cannot establish that a migration was applied remotely. A successful build is not this verification.

Before promoting a deployment which reads Inbox, run these read-only checks against the exact database used by that deployment. Each statement must succeed; do not infer deployment state from local migration files or a different project.

```sql
SELECT id, channel, source_id, triage, snoozed_until, identity_key, updated_at, created_at
FROM public.portal_inbox_triage LIMIT 0;

SELECT lifecycle_status, lifecycle_updated_at
FROM public.portal_inbound_leads LIMIT 0;

SELECT contact_id, contacted_at, note, outcome
FROM public.lead_outreach_touches LIMIT 0;
```

If the first or second check fails, review and apply the existing additive migration `supabase/migrations/0033_inbox_triage.sql` through the authorised migration workflow, then rerun the checks. Do not substitute an empty triage result: this would turn previously handled items into unread work. If the touch check fails, identify the missing tracked outbound migration before proceeding.

After the schema checks, use an authenticated operator request to the actual preview/production `/api/inbox`. Require HTTP 200, `channels`, and numeric `badgeTotal`; inspect `partial` before describing counts as complete. Verify the rendered Inbox loads. This application check also covers operator privileges and API schema cache availability that a privileged SQL query alone does not prove. No business record mutation is required.

Focused local regression: `node --test test/inbox-schema-prerequisite.test.mjs` exercises the production GET handler with missing-table and missing-column responses, requiring a clear failure without fabricated counts. It intentionally does not claim to verify the hosted database.
