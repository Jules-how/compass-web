-- Wave 3: pipeline spine stages + system map on business functions.

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS pipeline_stage text;

ALTER TABLE public.compass_clients
  ADD COLUMN IF NOT EXISTS pipeline_stage text;

COMMENT ON COLUMN public.lead_contacts.pipeline_stage IS
  'Lead spine: Lead|Contacted|Replied|Call booked|Proposal sent|Signed. Off-spine reasons stay on outbound_status.';
COMMENT ON COLUMN public.compass_clients.pipeline_stage IS
  'Client spine: Onboarding|Delivery build|Live|Scaling.';

CREATE INDEX IF NOT EXISTS lead_contacts_pipeline_stage_idx
  ON public.lead_contacts (pipeline_stage)
  WHERE pipeline_stage IS NOT NULL;
CREATE INDEX IF NOT EXISTS compass_clients_pipeline_stage_idx
  ON public.compass_clients (pipeline_stage)
  WHERE pipeline_stage IS NOT NULL;

-- Backfill lead stages from outbound_status (Instantly lane untouched).
UPDATE public.lead_contacts
SET pipeline_stage = CASE
  WHEN outbound_status IS NULL OR outbound_status IN ('uncontacted', 'not_uploaded') THEN 'Lead'
  WHEN outbound_status IN ('contacted', 'in_instantly') THEN 'Contacted'
  WHEN outbound_status IN ('replied', 'interested', 'out_of_office') THEN 'Replied'
  WHEN outbound_status IN ('meeting_booked', 'booked') THEN 'Call booked'
  WHEN outbound_status = 'converted' THEN 'Signed'
  ELSE pipeline_stage
END
WHERE pipeline_stage IS NULL;

UPDATE public.compass_clients
SET pipeline_stage = CASE
  WHEN status IN ('onboarding', 'prospect') OR status IS NULL THEN 'Onboarding'
  WHEN status = 'paused' THEN 'Scaling'
  WHEN status = 'active' THEN 'Delivery build'
  ELSE 'Onboarding'
END
WHERE pipeline_stage IS NULL;

ALTER TABLE public.compass_business_functions
  ADD COLUMN IF NOT EXISTS system_map jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.compass_business_functions.system_map IS
  'System map metadata: why, inputs, outputs, influences (routes + tables).';

-- Seed core function map rows (insert if missing, always refresh system_map).
DO $seed$
DECLARE
  row record;
BEGIN
  FOR row IN
    SELECT *
    FROM (
      VALUES
        ('outbound', 'Outbound', 10, '{"why":"Cold email campaigns and sequence craft before Instantly sends.","inputs":["compass_pipeline_campaigns","compass_outbound_copy"],"outputs":["instantly campaigns","lead_contacts.outbound_status"],"influences":[{"name":"Instantly","route":"/sales/outbound","table":"lead_contacts"},{"name":"Campaign planner","route":"/sales/pipeline","table":"compass_pipeline_campaigns"}]}'::jsonb),
        ('inbox', 'Inbox', 20, '{"why":"Triage Gmail and Instantly replies in one operator queue.","inputs":["lead_contacts","compass_client_comms"],"outputs":["lead_contacts.outbound_status","inbox triage labels"],"influences":[{"name":"Instantly tab","route":"/inbox?tab=instantly","table":"lead_contacts"},{"name":"Gmail threads","route":"/inbox","table":"compass_client_comms"}]}'::jsonb),
        ('leads', 'Leads', 30, '{"why":"Searchable lead inventory for cohort selection and agent commit.","inputs":["CSV imports","agent /api/agent/leads"],"outputs":["lead_contacts","compass_evidence_events"],"influences":[{"name":"Lead table","route":"/leads","table":"lead_contacts"},{"name":"Inventory RPC","route":"/api/agent/leads","table":"lead_contacts"}]}'::jsonb),
        ('clients', 'Clients', 40, '{"why":"Signed accounts, deal terms, and operator CRM workspace.","inputs":["lead conversion","deal_terms"],"outputs":["compass_clients","compass_projects"],"influences":[{"name":"Client directory","route":"/clients","table":"compass_clients"},{"name":"Deal terms","route":"/clients","table":"compass_clients.deal_terms"}]}'::jsonb),
        ('delivery', 'Delivery', 50, '{"why":"Missed-call voice agent, SMS, and calendar booking for live clients.","inputs":["compass_onboarding_forms","Retell webhooks"],"outputs":["compass_voice_calls","calendar events"],"influences":[{"name":"Voice calls","route":"/clients","table":"compass_voice_calls"},{"name":"Delivery portal","route":"/delivery","table":"compass_delivery_items"}]}'::jsonb),
        ('onboarding', 'Onboarding', 60, '{"why":"Tokenised client intake after a signed deal.","inputs":["compass_onboarding_forms"],"outputs":["compass_clients","delivery projects"],"influences":[{"name":"Onboarding forms","route":"/clients","table":"compass_onboarding_forms"},{"name":"Public form","route":"/onboard","table":"compass_onboarding_forms"}]}'::jsonb),
        ('finances', 'Finances', 70, '{"why":"QuickBooks invoice cache and install/monthly billing signals.","inputs":["QBO sync"],"outputs":["compass_qbo_docs","deal_terms.status"],"influences":[{"name":"QBO docs","route":"/clients","table":"compass_qbo_docs"},{"name":"Finances glance","route":"/settings","table":"compass_qbo_docs"}]}'::jsonb),
        ('data', 'Data', 80, '{"why":"Append-only evidence log powering digest auto-complete and spine analytics.","inputs":["webhooks","pollers","lead commits"],"outputs":["compass_evidence_events","daily_decision_digest"],"influences":[{"name":"Event store","route":"/functions/data","table":"compass_evidence_events"},{"name":"Digest","route":"/api/digest","table":"compass_sync_snapshots"}]}'::jsonb)
    ) AS v(slug, name, sort_order, system_map)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.compass_business_functions f WHERE f.slug = row.slug
    ) THEN
      INSERT INTO public.compass_business_functions (id, name, slug, sort_order, system_map, created_at, updated_at, mirrored_at)
      VALUES (
        'bf-' || row.slug,
        row.name,
        row.slug,
        row.sort_order,
        row.system_map,
        now(),
        now(),
        now()
      );
    ELSE
      UPDATE public.compass_business_functions
      SET
        name = row.name,
        sort_order = row.sort_order,
        system_map = row.system_map,
        updated_at = now()
      WHERE slug = row.slug;
    END IF;
  END LOOP;
END
$seed$;
