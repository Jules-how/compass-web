-- Practised-wave fields on pipeline campaigns (cap, opener review, copy match).

ALTER TABLE public.compass_pipeline_campaigns
  ADD COLUMN IF NOT EXISTS wave_cap integer,
  ADD COLUMN IF NOT EXISTS opener_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS copy_confirmed_at timestamptz;

COMMENT ON COLUMN public.compass_pipeline_campaigns.wave_cap IS
  'Max leads in the current practised wave. Null = cap not set yet.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.opener_reviewed_at IS
  'When Jules confirmed every opener in this wave was read.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.copy_confirmed_at IS
  'When Jules confirmed Compass sequence_draft matches the bound Instantly body. Cleared when copy changes.';
