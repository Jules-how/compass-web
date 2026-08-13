-- Instantly icebreaker copy on the contact (park/re-upload without losing personalisation).

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS opener text;

COMMENT ON COLUMN public.lead_contacts.opener IS
  'Instantly/email icebreaker copy for this contact. Not a sequence body.';
