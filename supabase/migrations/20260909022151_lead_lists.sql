-- CRM lists: named segments of lead_contacts, attachable to pipeline campaigns.

CREATE TABLE IF NOT EXISTS public.compass_lead_lists (
  id text PRIMARY KEY,
  name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Production already has the mirrored list catalogue; preserve its extra columns.
ALTER TABLE public.compass_lead_lists ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON TABLE public.compass_lead_lists IS
  'Operator CRM lists (named lead segments). Not Instantly lead lists.';

CREATE TABLE IF NOT EXISTS public.compass_lead_list_members (
  list_id text NOT NULL REFERENCES public.compass_lead_lists(id) ON DELETE CASCADE,
  lead_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, lead_id)
);

CREATE INDEX IF NOT EXISTS compass_lead_list_members_lead_idx
  ON public.compass_lead_list_members (lead_id);

COMMENT ON TABLE public.compass_lead_list_members IS
  'Many-to-many membership: a contact can sit on several CRM lists.';

CREATE TABLE IF NOT EXISTS public.compass_campaign_lists (
  campaign_id text NOT NULL REFERENCES public.compass_pipeline_campaigns(id) ON DELETE CASCADE,
  list_id text NOT NULL REFERENCES public.compass_lead_lists(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, list_id)
);

CREATE INDEX IF NOT EXISTS compass_campaign_lists_list_idx
  ON public.compass_campaign_lists (list_id);

COMMENT ON TABLE public.compass_campaign_lists IS
  'Pipeline campaign consumes one or more CRM lists as its cohort.';

ALTER TABLE public.compass_lead_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_lead_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_lead_lists_operator_all ON public.compass_lead_lists;
CREATE POLICY compass_lead_lists_operator_all ON public.compass_lead_lists
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_lead_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_lead_list_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_lead_list_members_operator_all ON public.compass_lead_list_members;
CREATE POLICY compass_lead_list_members_operator_all ON public.compass_lead_list_members
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_campaign_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_campaign_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_campaign_lists_operator_all ON public.compass_campaign_lists;
CREATE POLICY compass_campaign_lists_operator_all ON public.compass_campaign_lists
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());
