-- Qualify-before-research fields on lead_contacts. Separate from enrich_status.

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS icp_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_count integer,
  ADD COLUMN IF NOT EXISTS hours_label text,
  ADD COLUMN IF NOT EXISTS after_hours boolean,
  ADD COLUMN IF NOT EXISTS capture_crack text,
  ADD COLUMN IF NOT EXISTS email_origin text NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN public.lead_contacts.icp_status IS
  'none|pass|thin|skip — ICP lane before research. skip never uploads.';
COMMENT ON COLUMN public.lead_contacts.review_count IS
  'Google Business Profile review count. Demand proxy.';
COMMENT ON COLUMN public.lead_contacts.hours_label IS
  'Raw GBP hours string for scan (e.g. 24/7, Sat 8-12).';
COMMENT ON COLUMN public.lead_contacts.after_hours IS
  'True if they advertise after-hours, 24/7, or Saturday emergency.';
COMMENT ON COLUMN public.lead_contacts.capture_crack IS
  'One observed leak used in the opener (voicemail, no callback, form-only).';
COMMENT ON COLUMN public.lead_contacts.email_origin IS
  'unknown|published|guessed — published work inbox vs guessed person mailbox.';

CREATE INDEX IF NOT EXISTS lead_contacts_icp_status_idx
  ON public.lead_contacts (icp_status)
  WHERE icp_status <> 'none';

CREATE INDEX IF NOT EXISTS lead_contacts_after_hours_idx
  ON public.lead_contacts (after_hours)
  WHERE after_hours IS TRUE;
