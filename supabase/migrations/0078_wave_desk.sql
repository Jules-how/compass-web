-- Offer Waves desk: explicit lanes, recommendation copy, timeline actions, morning briefs.

ALTER TABLE public.compass_pipeline_campaigns
  ADD COLUMN IF NOT EXISTS wave_lane text,
  ADD COLUMN IF NOT EXISTS wave_rationale text,
  ADD COLUMN IF NOT EXISTS wave_list_size integer,
  ADD COLUMN IF NOT EXISTS wave_copy_strategy text,
  ADD COLUMN IF NOT EXISTS wave_approach text,
  ADD COLUMN IF NOT EXISTS testing_variable text;

COMMENT ON COLUMN public.compass_pipeline_campaigns.wave_lane IS
  'recommended | next | live. Null = derive from Instantly/status.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.wave_rationale IS
  'Why this list is the next send. Agent writes this on recommended cards.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.wave_list_size IS
  'Target sendable rows for this wave (usually 150).';
COMMENT ON COLUMN public.compass_pipeline_campaigns.wave_copy_strategy IS
  'How the sequence will argue (Fill and Capture variant, CTA, length).';
COMMENT ON COLUMN public.compass_pipeline_campaigns.wave_approach IS
  'Operating plan: scrape, filter, openers, load, or pause and rewrite.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.testing_variable IS
  'One-factor test label for Next campaigns (cta, body, offer, icp, …).';

CREATE TABLE IF NOT EXISTS public.compass_wave_actions (
  id text PRIMARY KEY,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  detail text,
  source text NOT NULL DEFAULT 'agent',
  status text NOT NULL DEFAULT 'queued',
  week_start date,
  campaign_id text REFERENCES public.compass_pipeline_campaigns(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_wave_actions IS
  'Past / present / future outbound moves on the Waves outlook.';

CREATE INDEX IF NOT EXISTS compass_wave_actions_week_idx
  ON public.compass_wave_actions (week_start, created_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_wave_briefs (
  id text PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  recommendation text,
  scan jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_wave_briefs IS
  'Morning Instantly + Compass scan notes. One row per Sydney date (YYYY-MM-DD).';

ALTER TABLE public.compass_wave_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_wave_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_wave_actions_operator_all ON public.compass_wave_actions;
CREATE POLICY compass_wave_actions_operator_all ON public.compass_wave_actions
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_wave_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_wave_briefs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_wave_briefs_operator_all ON public.compass_wave_briefs;
CREATE POLICY compass_wave_briefs_operator_all ON public.compass_wave_briefs
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());
