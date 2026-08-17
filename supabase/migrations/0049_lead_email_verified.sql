-- Stamp Instantly/Apify email checks so harvest does not re-verify.
ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS email_verify_status text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

COMMENT ON COLUMN public.lead_contacts.email_verify_status IS
  'Last verifier result: valid, catch_all, invalid, unknown, risky. Null = never checked.';

COMMENT ON COLUMN public.lead_contacts.email_verified_at IS
  'When the address was last treated as checked. Set for valid and catch_all so harvest skips re-verify.';

CREATE INDEX IF NOT EXISTS lead_contacts_email_unverified_idx
  ON public.lead_contacts (email)
  WHERE email IS NOT NULL AND email_verified_at IS NULL;
