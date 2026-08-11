-- Outbound experiment lab: hypothesis + one-factor A/B on pipeline campaigns.

ALTER TABLE public.compass_pipeline_campaigns
  ADD COLUMN IF NOT EXISTS hypothesis text,
  ADD COLUMN IF NOT EXISTS experiment_factor text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS experiment_role text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS parent_campaign_id text,
  ADD COLUMN IF NOT EXISTS experiment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sample_size_target integer,
  ADD COLUMN IF NOT EXISTS experiment_decision text,
  ADD COLUMN IF NOT EXISTS expression_key text,
  ADD COLUMN IF NOT EXISTS cta_type text;

COMMENT ON COLUMN public.compass_pipeline_campaigns.hypothesis IS
  'One-sentence experiment hypothesis. Required when experiment_status != none.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.experiment_factor IS
  'none|cta|expression|structure|offer|audience — the single factor under test.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.experiment_role IS
  'none|control|challenger|solo';
COMMENT ON COLUMN public.compass_pipeline_campaigns.parent_campaign_id IS
  'Challenger → control campaign id (soft link).';
COMMENT ON COLUMN public.compass_pipeline_campaigns.experiment_status IS
  'none|queued|running|ready_to_call|won|lost|killed|inconclusive';
COMMENT ON COLUMN public.compass_pipeline_campaigns.sample_size_target IS
  'Target Instantly sends before calling a winner (per arm).';
COMMENT ON COLUMN public.compass_pipeline_campaigns.experiment_decision IS
  'Winner call / notes after ready_to_call.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.expression_key IS
  'Stable expression id/slug for factor rollup; fallback is cold_expression snippet.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.cta_type IS
  'permission|timed_call|interest_check|give_first|other — prefer over guessed CTA type.';

CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_experiment_status_idx
  ON public.compass_pipeline_campaigns (experiment_status);
CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_parent_campaign_idx
  ON public.compass_pipeline_campaigns (parent_campaign_id)
  WHERE parent_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_experiment_factor_idx
  ON public.compass_pipeline_campaigns (experiment_factor)
  WHERE experiment_factor <> 'none';
