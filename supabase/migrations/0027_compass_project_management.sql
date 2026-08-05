-- Linear-style project management fields for Compass Web
ALTER TABLE public.compass_projects
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'no_updates',
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS summary text;

COMMENT ON COLUMN public.compass_projects.priority IS '0=none,1=urgent,2=high,3=medium,4=low';
COMMENT ON COLUMN public.compass_projects.health IS 'no_updates|on_track|at_risk|off_track';

CREATE TABLE IF NOT EXISTS public.compass_project_milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.compass_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,
  sort_order integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  mirrored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_project_milestones_project_idx
  ON public.compass_project_milestones (project_id, sort_order);

CREATE TABLE IF NOT EXISTS public.compass_project_dependencies (
  project_id text NOT NULL REFERENCES public.compass_projects(id) ON DELETE CASCADE,
  depends_on_project_id text NOT NULL REFERENCES public.compass_projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, depends_on_project_id),
  CHECK (project_id <> depends_on_project_id)
);

CREATE TABLE IF NOT EXISTS public.compass_project_updates (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.compass_projects(id) ON DELETE CASCADE,
  health text NOT NULL DEFAULT 'no_updates',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  mirrored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_project_updates_project_idx
  ON public.compass_project_updates (project_id, created_at DESC);

ALTER TABLE public.compass_project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_project_milestones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_project_milestones_operator_all ON public.compass_project_milestones;
CREATE POLICY compass_project_milestones_operator_all ON public.compass_project_milestones
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_project_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_project_dependencies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_project_dependencies_operator_all ON public.compass_project_dependencies;
CREATE POLICY compass_project_dependencies_operator_all ON public.compass_project_dependencies
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_project_updates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_project_updates_operator_all ON public.compass_project_updates;
CREATE POLICY compass_project_updates_operator_all ON public.compass_project_updates
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());
