-- SQL aggregates for agent inventory + UI facets. Replaces the 50k-row in-memory load.

CREATE OR REPLACE FUNCTION public.lead_inventory_aggregate(p_vertical text DEFAULT NULL)
RETURNS TABLE (
  vertical text,
  outbound_status text,
  state text,
  email_usable boolean,
  n bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(TRIM(lc.vertical), ''), '(blank)') AS vertical,
    COALESCE(lc.outbound_status, '') AS outbound_status,
    COALESCE(NULLIF(TRIM(lc.state), ''), '(blank)') AS state,
    (
      lc.email IS NOT NULL
      AND POSITION('@' IN lc.email) > 0
      AND POSITION('.' IN lc.email) > 0
      AND POSITION(' ' IN lc.email) = 0
    ) AS email_usable,
    COUNT(*)::bigint AS n
  FROM public.lead_contacts lc
  WHERE
    p_vertical IS NULL
    OR TRIM(p_vertical) = ''
    OR lower(COALESCE(lc.vertical, '')) = lower(p_vertical)
    OR lc.vertical ILIKE '%' || p_vertical || '%'
    OR p_vertical ILIKE '%' || COALESCE(lc.vertical, '') || '%'
  GROUP BY 1, 2, 3, 4;
$$;

REVOKE ALL ON FUNCTION public.lead_inventory_aggregate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_inventory_aggregate(text) TO service_role;

CREATE OR REPLACE FUNCTION public.lead_list_facets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'verticals', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('value', v.vertical, 'count', v.n) ORDER BY v.n DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT vertical, COUNT(*)::int AS n
        FROM public.lead_contacts
        WHERE vertical IS NOT NULL AND vertical <> ''
        GROUP BY vertical
      ) v
    ),
    'cities', (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('value', c.city, 'count', c.n) ORDER BY c.n DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT city, COUNT(*)::int AS n
        FROM public.lead_contacts
        WHERE city IS NOT NULL AND city <> ''
        GROUP BY city
        ORDER BY n DESC
        LIMIT 80
      ) c
    )
  );
$$;

REVOKE ALL ON FUNCTION public.lead_list_facets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lead_list_facets() TO service_role;
