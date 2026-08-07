-- Client communications: manually linked threads (email/sms/call) with
-- ingested messages and AI/heuristic context summaries.

ALTER TABLE public.compass_clients
  ADD COLUMN IF NOT EXISTS comms_summary text,
  ADD COLUMN IF NOT EXISTS comms_summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS comms_summary_source text;

COMMENT ON COLUMN public.compass_clients.comms_summary IS
  'Rolling AI/heuristic summary of recent linked communications';
COMMENT ON COLUMN public.compass_clients.comms_summary_source IS
  'ai|heuristic|manual';

CREATE TABLE IF NOT EXISTS public.compass_client_comm_threads (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  subject text NOT NULL,
  participants text[] NOT NULL DEFAULT '{}',
  external_id text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  summary text,
  summary_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_client_comm_threads IS
  'Operator-linked communication threads for a client (email, SMS, call, other).';
COMMENT ON COLUMN public.compass_client_comm_threads.channel IS
  'email|sms|call|other';
COMMENT ON COLUMN public.compass_client_comm_threads.status IS
  'active|archived';
COMMENT ON COLUMN public.compass_client_comm_threads.external_id IS
  'Provider thread id (e.g. Gmail thread) used by ingest to route new messages.';

CREATE UNIQUE INDEX IF NOT EXISTS compass_client_comm_threads_external_uidx
  ON public.compass_client_comm_threads (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS compass_client_comm_threads_client_idx
  ON public.compass_client_comm_threads (client_id, status, last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.compass_client_comm_messages (
  id text PRIMARY KEY,
  thread_id text NOT NULL REFERENCES public.compass_client_comm_threads(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT 'inbound',
  sender text,
  body text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_client_comm_messages IS
  'Messages belonging to a linked client communication thread.';
COMMENT ON COLUMN public.compass_client_comm_messages.direction IS
  'inbound|outbound';

CREATE UNIQUE INDEX IF NOT EXISTS compass_client_comm_messages_external_uidx
  ON public.compass_client_comm_messages (thread_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS compass_client_comm_messages_thread_idx
  ON public.compass_client_comm_messages (thread_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS compass_client_comm_messages_client_idx
  ON public.compass_client_comm_messages (client_id, occurred_at DESC);

ALTER TABLE public.compass_client_comm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_comm_threads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_comm_threads_operator_all ON public.compass_client_comm_threads;
CREATE POLICY compass_client_comm_threads_operator_all ON public.compass_client_comm_threads
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_comm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_comm_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_comm_messages_operator_all ON public.compass_client_comm_messages;
CREATE POLICY compass_client_comm_messages_operator_all ON public.compass_client_comm_messages
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_comm_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_comm_messages TO authenticated;
