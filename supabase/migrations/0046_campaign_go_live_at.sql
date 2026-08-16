-- Go-live instant for pipeline campaigns (planner plots a point, not a span).

ALTER TABLE public.compass_pipeline_campaigns
  ADD COLUMN IF NOT EXISTS go_live_at timestamptz;

UPDATE public.compass_pipeline_campaigns
SET go_live_at = ((start_date::timestamp + interval '9 hours') AT TIME ZONE 'Australia/Sydney')
WHERE go_live_at IS NULL
  AND start_date IS NOT NULL;

UPDATE public.compass_pipeline_campaigns
SET go_live_at = now()
WHERE go_live_at IS NULL;

COMMENT ON COLUMN public.compass_pipeline_campaigns.go_live_at IS
  'When the campaign is meant to go live. Planner calendar/timeline use this instant only.';
