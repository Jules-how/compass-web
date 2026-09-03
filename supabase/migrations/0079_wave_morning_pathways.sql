-- Morning wave accept/dismiss + pathway recipes (tools, opener templates, run logs).

ALTER TABLE public.compass_wave_briefs
  ADD COLUMN IF NOT EXISTS next_campaign_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS next_status text NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

COMMENT ON COLUMN public.compass_wave_briefs.next_campaign_ids IS
  'Two Home next slots proposed by the agent brief. Applied only after Jules accepts.';
COMMENT ON COLUMN public.compass_wave_briefs.next_status IS
  'proposed | accepted | dismissed. Live land is locked while proposed or missing.';

CREATE TABLE IF NOT EXISTS public.compass_pathway_recipes (
  id text PRIMARY KEY,
  trade text NOT NULL,
  kind text NOT NULL DEFAULT 'default',
  campaign_id text REFERENCES public.compass_pipeline_campaigns(id) ON DELETE CASCADE,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compass_pathway_recipes_kind_check CHECK (kind IN ('default', 'overlay')),
  CONSTRAINT compass_pathway_recipes_overlay_campaign CHECK (
    (kind = 'default' AND campaign_id IS NULL) OR (kind = 'overlay' AND campaign_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS compass_pathway_recipes_default_trade_idx
  ON public.compass_pathway_recipes (trade) WHERE kind = 'default';
CREATE UNIQUE INDEX IF NOT EXISTS compass_pathway_recipes_overlay_campaign_idx
  ON public.compass_pathway_recipes (campaign_id) WHERE kind = 'overlay';

COMMENT ON TABLE public.compass_pathway_recipes IS
  'Trade default list-build stages/tools, plus per-campaign overlay.';

CREATE TABLE IF NOT EXISTS public.compass_opener_templates (
  id text PRIMARY KEY,
  recipe_id text NOT NULL REFERENCES public.compass_pathway_recipes(id) ON DELETE CASCADE,
  label text NOT NULL,
  signal_when jsonb NOT NULL DEFAULT '{}'::jsonb,
  structure text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  style text,
  sort_order integer NOT NULL DEFAULT 0,
  pending_structure text,
  pending_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_opener_templates_recipe_idx
  ON public.compass_opener_templates (recipe_id, sort_order);

COMMENT ON TABLE public.compass_opener_templates IS
  'Opener templates for a pathway. Siblings = leads in a batch on the same template.';

CREATE TABLE IF NOT EXISTS public.compass_pathway_runs (
  id text PRIMARY KEY,
  campaign_id text REFERENCES public.compass_pipeline_campaigns(id) ON DELETE SET NULL,
  recipe_id text REFERENCES public.compass_pathway_recipes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued',
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_cents integer,
  duration_ms integer,
  sendable_count integer,
  opener_coverage integer,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compass_pathway_runs_status_check CHECK (
    status IN ('queued', 'building', 'ready', 'reviewed', 'landed', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS compass_pathway_runs_campaign_idx
  ON public.compass_pathway_runs (campaign_id, created_at DESC);

ALTER TABLE public.lead_contacts
  ADD COLUMN IF NOT EXISTS opener_template_id text REFERENCES public.compass_opener_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opener_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lead_contacts.opener_template_id IS
  'Sibling class for this lead''s opener. Waterfall accept regenerates non-override rows.';
COMMENT ON COLUMN public.lead_contacts.opener_override IS
  'Jules cherry-picked this lead onto a template. Class regenerate must not yank it back.';

ALTER TABLE public.compass_pathway_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_pathway_recipes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_pathway_recipes_operator_all ON public.compass_pathway_recipes;
CREATE POLICY compass_pathway_recipes_operator_all ON public.compass_pathway_recipes
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_opener_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_opener_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_opener_templates_operator_all ON public.compass_opener_templates;
CREATE POLICY compass_opener_templates_operator_all ON public.compass_opener_templates
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_pathway_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_pathway_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_pathway_runs_operator_all ON public.compass_pathway_runs;
CREATE POLICY compass_pathway_runs_operator_all ON public.compass_pathway_runs
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());
