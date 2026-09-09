-- Supabase default privileges grant roles directly, independently of PUBLIC.
-- Remove inherited table writes (including TRUNCATE, which bypasses RLS) and
-- anonymous RPC execution; preserve the existing operator/service boundaries.
REVOKE ALL ON TABLE public.compass_pathfinder_links,
  public.compass_pathfinder_observations, public.compass_pathfinder_issues,
  public.compass_pathfinder_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.compass_pathfinder_links,
  public.compass_pathfinder_observations, public.compass_pathfinder_issues,
  public.compass_pathfinder_activity TO authenticated;

REVOKE ALL ON FUNCTION public.pathfinder_create_issue_task(uuid,text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pathfinder_apply_task(text,jsonb,timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pathfinder_audit_change()
  FROM PUBLIC, anon, authenticated;
