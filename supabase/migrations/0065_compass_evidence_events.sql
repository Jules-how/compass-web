-- Wave 3: append-only evidence event store.

CREATE TABLE IF NOT EXISTS public.compass_evidence_events (
  id text PRIMARY KEY,
  ts timestamptz NOT NULL,
  client_id text REFERENCES public.compass_clients(id) ON DELETE SET NULL,
  lead_id text,
  source text NOT NULL,
  type text NOT NULL,
  vertical text,
  offer text,
  product text,
  messaging_component text,
  campaign text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_evidence_events IS
  'Append-only evidence log for digest task matching and pipeline analytics.';

CREATE INDEX IF NOT EXISTS compass_evidence_events_ts_idx
  ON public.compass_evidence_events (ts DESC);
CREATE INDEX IF NOT EXISTS compass_evidence_events_source_type_ts_idx
  ON public.compass_evidence_events (source, type, ts DESC);
CREATE INDEX IF NOT EXISTS compass_evidence_events_client_ts_idx
  ON public.compass_evidence_events (client_id, ts DESC)
  WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compass_evidence_events_lead_idx
  ON public.compass_evidence_events (lead_id)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS compass_evidence_events_campaign_idx
  ON public.compass_evidence_events (campaign)
  WHERE campaign IS NOT NULL;

ALTER TABLE public.compass_evidence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_evidence_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_evidence_events_operator_all ON public.compass_evidence_events;
CREATE POLICY compass_evidence_events_operator_all ON public.compass_evidence_events
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_evidence_events TO authenticated;
GRANT ALL ON public.compass_evidence_events TO service_role;
