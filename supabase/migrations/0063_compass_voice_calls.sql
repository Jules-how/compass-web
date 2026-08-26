-- Voice call artefacts + SMS suppression list (Wave 2).

CREATE TABLE IF NOT EXISTS public.compass_voice_calls (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  retell_call_id text NOT NULL UNIQUE,
  from_number text,
  to_number text,
  started_at timestamptz,
  ended_at timestamptz,
  outcome text,
  job_type text,
  suburb text,
  urgency text,
  slot_start timestamptz,
  calendar_event_id text,
  recording_url text,
  transcript text,
  recording_refused boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_voice_calls IS
  'Retell inbound/outbound call records for missed-call booking delivery.';
COMMENT ON COLUMN public.compass_voice_calls.outcome IS
  'booked|callback_captured|emergency_escalated|transferred|recording_refused|no_action|failed';

CREATE INDEX IF NOT EXISTS compass_voice_calls_client_idx
  ON public.compass_voice_calls (client_id, started_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS compass_voice_calls_retell_idx
  ON public.compass_voice_calls (retell_call_id);

CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  phone text NOT NULL,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'stop',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (phone, client_id)
);

COMMENT ON TABLE public.sms_suppressions IS
  'Per-client SMS opt-outs (Reply STOP). Honour before any outbound SMS.';

CREATE INDEX IF NOT EXISTS sms_suppressions_client_idx
  ON public.sms_suppressions (client_id, created_at DESC);

ALTER TABLE public.compass_voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_voice_calls FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_voice_calls_operator_all ON public.compass_voice_calls;
CREATE POLICY compass_voice_calls_operator_all ON public.compass_voice_calls
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_suppressions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_suppressions_operator_all ON public.sms_suppressions;
CREATE POLICY sms_suppressions_operator_all ON public.sms_suppressions
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_voice_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sms_suppressions TO authenticated;
GRANT ALL ON public.compass_voice_calls TO service_role;
GRANT ALL ON public.sms_suppressions TO service_role;
