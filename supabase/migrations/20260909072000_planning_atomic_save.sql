-- Compare encrypted revisions in the request body, never in a URL filter.
-- Long notes/history can exceed the gateway URL limit before Postgres sees them.
CREATE OR REPLACE FUNCTION public.compass_save_planning_revision(
  p_id text, p_expected_value text, p_value text, p_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE changed integer;
BEGIN
  IF p_id !~ '^planning\.(goal|note|time|run|preparation)\.[a-f0-9-]{36}$'
     OR p_expected_value IS NULL OR p_value IS NULL OR p_at IS NULL THEN
    RAISE EXCEPTION 'Invalid planning update';
  END IF;
  UPDATE public.compass_settings
  SET value = p_value, updated_at = p_at, mirrored_at = p_at
  WHERE id = p_id AND value = p_expected_value;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.compass_save_planning_revision(text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compass_save_planning_revision(text,text,text,timestamptz) TO service_role;
