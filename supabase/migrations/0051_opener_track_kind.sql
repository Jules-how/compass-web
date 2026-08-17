-- Per-lead opener track and kind from Hook (compile + tension).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS opener_track text,
  ADD COLUMN IF NOT EXISTS opener_kind text;

COMMENT ON COLUMN public.lead_contacts.opener_track IS
  'Hook track: signal | tension | none | null (legacy).';
COMMENT ON COLUMN public.lead_contacts.opener_kind IS
  'Hook kind: review | hiring | policy | specialty | location | tension | none | null.';
