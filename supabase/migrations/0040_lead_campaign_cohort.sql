-- Thin campaign ↔ lead cohort link (not a Planner list warehouse).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS pipeline_campaign_id text,
  ADD COLUMN IF NOT EXISTS cohort_tag text;

COMMENT ON COLUMN public.lead_contacts.pipeline_campaign_id IS
  'Optional Compass pipeline campaign this contact is queued/uploaded for.';
COMMENT ON COLUMN public.lead_contacts.cohort_tag IS
  'Optional wave/cohort label (e.g. wave-1-nsw, eligible-2026-08-11).';

CREATE INDEX IF NOT EXISTS lead_contacts_pipeline_campaign_idx
  ON public.lead_contacts (pipeline_campaign_id)
  WHERE pipeline_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_contacts_cohort_tag_idx
  ON public.lead_contacts (cohort_tag)
  WHERE cohort_tag IS NOT NULL;
