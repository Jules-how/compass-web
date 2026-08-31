-- Meta attach lines: paused campaign push from Compass (activation stays in Ads Manager).

CREATE TABLE IF NOT EXISTS public.compass_meta_attach (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'briefed', 'created_paused', 'live', 'archived')),
  offer_cell text NOT NULL,
  destination_url text,
  copy jsonb NOT NULL DEFAULT '{"primary_texts":[],"headlines":[],"descriptions":[]}'::jsonb,
  creative_brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  canva_design_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  review jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_meta_attach IS
  'Meta lead-gen attach line per client. API creates PAUSED objects only; Jules activates in Ads Manager.';
COMMENT ON COLUMN public.compass_meta_attach.offer_cell IS
  'Pack offer cell key, e.g. emergency_call, quote, seasonal_tuneup.';
COMMENT ON COLUMN public.compass_meta_attach.copy IS
  'primary_texts[], headlines[], descriptions[] — merged from pack + client facts before push.';
COMMENT ON COLUMN public.compass_meta_attach.meta_ids IS
  'campaign_id, adset_id, creative_ids[], ad_ids[] after paused push.';

CREATE INDEX IF NOT EXISTS compass_meta_attach_client_idx
  ON public.compass_meta_attach (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS compass_meta_attach_status_idx
  ON public.compass_meta_attach (client_id, status);

ALTER TABLE public.compass_meta_attach ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_meta_attach FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_meta_attach_operator_all ON public.compass_meta_attach;
CREATE POLICY compass_meta_attach_operator_all ON public.compass_meta_attach
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_meta_attach TO authenticated;
GRANT ALL ON public.compass_meta_attach TO service_role;
