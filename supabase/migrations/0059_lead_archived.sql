-- Operator archive flag on lead_contacts. Additive only.

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lead_contacts.is_archived IS
  'Operator archive. Hidden from Leads and Prospects tabs.';

CREATE INDEX IF NOT EXISTS lead_contacts_archived_idx
  ON public.lead_contacts (is_archived)
  WHERE is_archived IS TRUE;
