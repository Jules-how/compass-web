-- Wave 5d: Google Ads attach line (paused Search campaigns in client-owned accounts).

CREATE TABLE IF NOT EXISTS public.compass_google_attach (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'created_paused', 'live', 'archived')),
  customer_id text,
  link_status text,
  destination_url text,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  google_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_google_attach IS
  'Google Ads Search attach plans pushed PAUSED to client-owned accounts under Switchflow MCC. Activation stays in Google Ads UI.';
COMMENT ON COLUMN public.compass_google_attach.status IS 'draft|created_paused|live|archived';
COMMENT ON COLUMN public.compass_google_attach.plan IS
  'Generated attach plan: ad_groups, negatives, assets, conversion_action.';
COMMENT ON COLUMN public.compass_google_attach.google_ids IS
  'Idempotent Google resource names from last successful mutate batch.';

CREATE INDEX IF NOT EXISTS compass_google_attach_client_idx
  ON public.compass_google_attach (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS compass_google_attach_status_idx
  ON public.compass_google_attach (client_id, status);

ALTER TABLE public.compass_google_attach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_google_attach FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_google_attach_operator_all ON public.compass_google_attach;
CREATE POLICY compass_google_attach_operator_all ON public.compass_google_attach
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_google_attach TO authenticated;
GRANT ALL ON public.compass_google_attach TO service_role;
