-- Wave 1c: tokenised client onboarding forms (public access via server routes only).

CREATE TABLE IF NOT EXISTS public.compass_onboarding_forms (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  offer_key text NOT NULL DEFAULT 'missed_call_booking',
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  submitted_at timestamptz,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compass_onboarding_forms_status_check
    CHECK (status IN ('sent', 'opened', 'submitted', 'expired'))
);

COMMENT ON TABLE public.compass_onboarding_forms IS
  'Tokenised onboarding forms sent to clients after a signed deal. Public access is server-route only (service role after token check).';
COMMENT ON COLUMN public.compass_onboarding_forms.token IS
  'Unguessable URL token. Never expose table to anon; validate in API then use service role.';
COMMENT ON COLUMN public.compass_onboarding_forms.answers IS
  'Autosaved field answers keyed by pack field id.';

CREATE INDEX IF NOT EXISTS compass_onboarding_forms_client_idx
  ON public.compass_onboarding_forms (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compass_onboarding_forms_token_idx
  ON public.compass_onboarding_forms (token);

ALTER TABLE public.compass_onboarding_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_onboarding_forms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_onboarding_forms_operator_all ON public.compass_onboarding_forms;
CREATE POLICY compass_onboarding_forms_operator_all ON public.compass_onboarding_forms
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_onboarding_forms TO authenticated;
GRANT ALL ON public.compass_onboarding_forms TO service_role;
