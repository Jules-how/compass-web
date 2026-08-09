-- Lead outreach touch log: campaign + copy history for 90-day recontact tracking.
-- contact_id references lead_contacts.id (created in 0005_lead_cloud_mirror; no FK here
-- so this migration stays portable if mirror tables land out of order).

CREATE TABLE IF NOT EXISTS public.lead_outreach_touches (
  id text PRIMARY KEY,
  contact_id text NOT NULL,
  contacted_at timestamptz NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  campaign_id text,
  campaign_name text,
  instantly_campaign_id text,
  copy_snapshot jsonb,
  source text NOT NULL DEFAULT 'instantly_sync',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_outreach_touches_contact_idx
  ON public.lead_outreach_touches (contact_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS lead_outreach_touches_campaign_idx
  ON public.lead_outreach_touches (instantly_campaign_id)
  WHERE instantly_campaign_id IS NOT NULL;

COMMENT ON TABLE public.lead_outreach_touches IS
  'Outbound contact events (email/campaign) used for 90-day recontact cooldown + history UI.';

ALTER TABLE public.lead_outreach_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_outreach_touches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_outreach_touches_operator_all ON public.lead_outreach_touches;
CREATE POLICY lead_outreach_touches_operator_all
  ON public.lead_outreach_touches
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_outreach_touches TO authenticated;
GRANT ALL ON public.lead_outreach_touches TO service_role;
