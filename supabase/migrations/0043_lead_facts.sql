-- Raw researched facts on the contact (separate from opener copy).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS lead_facts jsonb;

COMMENT ON COLUMN public.lead_contacts.lead_facts IS
  'Raw researched facts for this contact (atomic claims + sources). Not opener copy.';
