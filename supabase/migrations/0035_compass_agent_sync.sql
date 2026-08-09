-- Agent / cron sync snapshots (Instantly glance, daily brief, last sync meta).
-- Service role writes from /api/agent/* and /api/cron/*; operators may read via RLS.

CREATE TABLE IF NOT EXISTS public.compass_sync_snapshots (
  id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'live',
  synced_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_sync_snapshots IS
  'Cached operator sync payloads for Cursor agents and brief reads (instantly_cold_email, daily_brief, last_daily_sync).';

ALTER TABLE public.compass_sync_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_sync_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compass_sync_snapshots_operator_select ON public.compass_sync_snapshots;
CREATE POLICY compass_sync_snapshots_operator_select
  ON public.compass_sync_snapshots
  FOR SELECT TO authenticated
  USING (portal_is_operator());

GRANT SELECT ON public.compass_sync_snapshots TO authenticated;
GRANT ALL ON public.compass_sync_snapshots TO service_role;
