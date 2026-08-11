-- Enrichment readiness on contacts (Leads filter — not Planner Kanban).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS enrich_status text NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.lead_contacts.enrich_status IS
  'none|queued|enriched|thin|opener_ready|uploaded — vault enrich/opener pipeline readiness.';

CREATE INDEX IF NOT EXISTS lead_contacts_enrich_status_idx
  ON public.lead_contacts (enrich_status)
  WHERE enrich_status <> 'none';
