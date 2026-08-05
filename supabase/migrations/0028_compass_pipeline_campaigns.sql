-- Sales Campaign Planner domain (timeline plans).
-- Separate from Instantly-mirrored public.compass_campaigns.

CREATE TABLE IF NOT EXISTS public.compass_pipeline_campaigns (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  priority integer NOT NULL DEFAULT 0,
  health text NOT NULL DEFAULT 'no_updates',
  start_date date,
  end_date date,
  color text NOT NULL DEFAULT '#94a3b8',
  summary text,
  labels text[] NOT NULL DEFAULT '{}',
  owner_label text,
  instantly_campaign_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_pipeline_campaigns IS
  'Operator Campaign Planner rows (Sales → Pipeline). Not the Instantly mirror.';
COMMENT ON COLUMN public.compass_pipeline_campaigns.status IS
  'draft|planned|active|paused|completed|cancelled';
COMMENT ON COLUMN public.compass_pipeline_campaigns.priority IS
  '0=none,1=urgent,2=high,3=medium,4=low';
COMMENT ON COLUMN public.compass_pipeline_campaigns.health IS
  'no_updates|on_track|at_risk|off_track';

CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_dates_idx
  ON public.compass_pipeline_campaigns (start_date, end_date);
CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_status_idx
  ON public.compass_pipeline_campaigns (status);

CREATE TABLE IF NOT EXISTS public.compass_pipeline_milestones (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES public.compass_pipeline_campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,
  sort_order integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_pipeline_milestones_campaign_idx
  ON public.compass_pipeline_milestones (campaign_id, sort_order);

CREATE TABLE IF NOT EXISTS public.compass_pipeline_activity (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES public.compass_pipeline_campaigns(id) ON DELETE CASCADE,
  actor text NOT NULL DEFAULT 'operator',
  action text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_pipeline_activity_campaign_idx
  ON public.compass_pipeline_activity (campaign_id, created_at DESC);

ALTER TABLE public.compass_pipeline_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_pipeline_campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_pipeline_campaigns_operator_all ON public.compass_pipeline_campaigns;
CREATE POLICY compass_pipeline_campaigns_operator_all ON public.compass_pipeline_campaigns
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_pipeline_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_pipeline_milestones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_pipeline_milestones_operator_all ON public.compass_pipeline_milestones;
CREATE POLICY compass_pipeline_milestones_operator_all ON public.compass_pipeline_milestones
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_pipeline_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_pipeline_activity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_pipeline_activity_operator_all ON public.compass_pipeline_activity;
CREATE POLICY compass_pipeline_activity_operator_all ON public.compass_pipeline_activity
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_pipeline_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_pipeline_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_pipeline_activity TO authenticated;
