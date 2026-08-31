-- Wave 5a: database reactivation lists + contacts.

CREATE TABLE IF NOT EXISTS public.compass_reactivation_lists (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  pack_id text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'uploaded',
  counts jsonb NOT NULL DEFAULT '{"imported":0,"rejected":0,"no_consent":0,"eligible":0}'::jsonb,
  compliance jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_reactivation_lists IS
  'Imported reactivation cohort per client. Sequences stay paused until operator activates.';
COMMENT ON COLUMN public.compass_reactivation_lists.status IS
  'uploaded|cleaned|review|active|paused|done';
COMMENT ON COLUMN public.compass_reactivation_lists.counts IS
  'Hygiene counters: imported, rejected, no_consent, eligible, suppressed, replied, booked, showed';
COMMENT ON COLUMN public.compass_reactivation_lists.compliance IS
  'licensee_signoff, signed_off_at, signed_off_by for broker packs';

CREATE INDEX IF NOT EXISTS compass_reactivation_lists_client_idx
  ON public.compass_reactivation_lists (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compass_reactivation_lists_status_idx
  ON public.compass_reactivation_lists (status)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.compass_reactivation_contacts (
  id text PRIMARY KEY,
  list_id text NOT NULL REFERENCES public.compass_reactivation_lists(id) ON DELETE CASCADE,
  name text,
  mobile text NOT NULL,
  email text,
  last_touch_date date,
  segment text,
  consent_basis text,
  consent_proof jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending',
  touch_index integer NOT NULL DEFAULT 0,
  next_touch_at timestamptz,
  last_event_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_reactivation_contacts IS
  'Individual contacts in a reactivation list. state: pending|enrolled|suppressed|replied|booked|showed|opted_out|done';
COMMENT ON COLUMN public.compass_reactivation_contacts.consent_proof IS
  'Spam Act proof: source, date, capture_method';

CREATE INDEX IF NOT EXISTS compass_reactivation_contacts_list_state_idx
  ON public.compass_reactivation_contacts (list_id, state);
CREATE INDEX IF NOT EXISTS compass_reactivation_contacts_next_touch_idx
  ON public.compass_reactivation_contacts (next_touch_at)
  WHERE state = 'enrolled';
CREATE UNIQUE INDEX IF NOT EXISTS compass_reactivation_contacts_list_mobile_idx
  ON public.compass_reactivation_contacts (list_id, mobile);

ALTER TABLE public.compass_reactivation_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_reactivation_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_reactivation_lists_operator_all ON public.compass_reactivation_lists;
CREATE POLICY compass_reactivation_lists_operator_all ON public.compass_reactivation_lists
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_reactivation_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_reactivation_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_reactivation_contacts_operator_all ON public.compass_reactivation_contacts;
CREATE POLICY compass_reactivation_contacts_operator_all ON public.compass_reactivation_contacts
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_reactivation_lists TO authenticated;
GRANT ALL ON public.compass_reactivation_lists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_reactivation_contacts TO authenticated;
GRANT ALL ON public.compass_reactivation_contacts TO service_role;
