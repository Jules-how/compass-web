-- Per-client voice delivery configuration (Twilio + Retell + calendar).

ALTER TABLE public.compass_clients
  ADD COLUMN IF NOT EXISTS voice jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.compass_clients.voice IS
  'Voice delivery: twilio_number, retell_agent_id, trade_pack_id, calendar_id, forwarding_confirmed_at, after_hours_mode, transfer_enabled, owner_alert_mode, live_at, calendar_grant_broken, probe_at, probe_ok';

CREATE INDEX IF NOT EXISTS compass_clients_voice_twilio_idx
  ON public.compass_clients ((voice->>'twilio_number'))
  WHERE voice->>'twilio_number' IS NOT NULL;
