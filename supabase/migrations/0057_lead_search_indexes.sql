-- Filter grammar + keyset paging for lead_contacts (Wave 1a).
-- Nothing destructive.

CREATE INDEX IF NOT EXISTS lead_contacts_email_id_idx
  ON public.lead_contacts (email, id);

CREATE INDEX IF NOT EXISTS lead_contacts_vertical_state_idx
  ON public.lead_contacts (vertical, state);

CREATE INDEX IF NOT EXISTS lead_contacts_outbound_status_idx
  ON public.lead_contacts (outbound_status);

CREATE INDEX IF NOT EXISTS lead_contacts_source_idx
  ON public.lead_contacts (source);

CREATE INDEX IF NOT EXISTS lead_contacts_pipeline_unattached_idx
  ON public.lead_contacts (id)
  WHERE pipeline_campaign_id IS NULL;
