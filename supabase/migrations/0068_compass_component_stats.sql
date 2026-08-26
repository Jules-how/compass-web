-- Wave 4: component-level outbound stats (campaign + lead grains).

CREATE TABLE IF NOT EXISTS public.compass_component_stats (
  id text PRIMARY KEY,
  grain text NOT NULL,
  key text NOT NULL,
  "window" text NOT NULL CHECK ("window" IN ('7d', '30d', 'all')),
  campaign_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent integer NOT NULL DEFAULT 0,
  delivered integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  positive integer NOT NULL DEFAULT 0,
  meetings integer NOT NULL DEFAULT 0,
  positive_rate numeric NOT NULL DEFAULT 0,
  meetings_per_100 numeric NOT NULL DEFAULT 0,
  n_campaigns integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grain, key, "window")
);

COMMENT ON TABLE public.compass_component_stats IS
  'Precomputed outbound component rollups for Sales slice board (7d/30d/all windows).';

CREATE INDEX IF NOT EXISTS compass_component_stats_grain_window_idx
  ON public.compass_component_stats (grain, "window");

ALTER TABLE public.compass_component_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_component_stats FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_component_stats_operator_all ON public.compass_component_stats;
CREATE POLICY compass_component_stats_operator_all ON public.compass_component_stats
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_component_stats TO authenticated;
GRANT ALL ON public.compass_component_stats TO service_role;
