-- Canonical company site on the lead ledger (planner Website column).
ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS company_domain text;

COMMENT ON COLUMN public.lead_contacts.website IS
  'Canonical company site URL (https). Not an engager fact.';

COMMENT ON COLUMN public.lead_contacts.company_domain IS
  'Registrable host for the company site, no www.';

CREATE INDEX IF NOT EXISTS lead_contacts_company_domain_idx
  ON public.lead_contacts (company_domain);
