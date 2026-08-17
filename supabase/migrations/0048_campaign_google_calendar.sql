ALTER TABLE public.compass_pipeline_campaigns
  ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

COMMENT ON COLUMN public.compass_pipeline_campaigns.google_calendar_event_id IS
  'Google Calendar all-day go-live event id on the operator calendar.';
