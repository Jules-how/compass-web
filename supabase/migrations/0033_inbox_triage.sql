-- Inbox triage state + inbound lead lifecycle for operator work-queue semantics.
-- Badge/counts should reflect actionable work, not raw volume.

ALTER TABLE public.portal_inbound_leads
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz;

COMMENT ON COLUMN public.portal_inbound_leads.lifecycle_status IS
  'new|contacted|qualified|discarded';
COMMENT ON COLUMN public.portal_inbound_leads.lifecycle_updated_at IS
  'When lifecycle_status last changed';

CREATE INDEX IF NOT EXISTS portal_inbound_leads_lifecycle_idx
  ON public.portal_inbound_leads (lifecycle_status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS portal_inbound_leads_email_idx
  ON public.portal_inbound_leads (lower(email))
  WHERE email IS NOT NULL AND email <> '';

-- Cross-channel triage (unread/read/done/snoozed) keyed by inbox channel + source row id.
CREATE TABLE IF NOT EXISTS public.portal_inbox_triage (
  id text PRIMARY KEY,
  channel text NOT NULL,
  source_id text NOT NULL,
  triage text NOT NULL DEFAULT 'unread',
  snoozed_until timestamptz,
  identity_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_inbox_triage_channel_check
    CHECK (channel IN ('agents', 'instantly', 'leads')),
  CONSTRAINT portal_inbox_triage_state_check
    CHECK (triage IN ('unread', 'read', 'done', 'snoozed')),
  CONSTRAINT portal_inbox_triage_channel_source_uidx UNIQUE (channel, source_id)
);

COMMENT ON TABLE public.portal_inbox_triage IS
  'Operator triage state for Inbox items across Agents, Instantly, and Leads.';
COMMENT ON COLUMN public.portal_inbox_triage.channel IS
  'agents|instantly|leads';
COMMENT ON COLUMN public.portal_inbox_triage.triage IS
  'unread|read|done|snoozed';
COMMENT ON COLUMN public.portal_inbox_triage.identity_key IS
  'Normalized contact identity (usually lowercased email) for cross-channel linking.';

CREATE INDEX IF NOT EXISTS portal_inbox_triage_actionable_idx
  ON public.portal_inbox_triage (channel, triage, snoozed_until);

CREATE INDEX IF NOT EXISTS portal_inbox_triage_identity_idx
  ON public.portal_inbox_triage (identity_key)
  WHERE identity_key IS NOT NULL AND identity_key <> '';

ALTER TABLE public.portal_inbox_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_inbox_triage FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_inbox_triage_operator_all ON public.portal_inbox_triage;
CREATE POLICY portal_inbox_triage_operator_all ON public.portal_inbox_triage
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_inbox_triage TO authenticated;

-- Operators need to update inbound lead lifecycle from Inbox actions.
DROP POLICY IF EXISTS portal_inbound_leads_operator_update ON public.portal_inbound_leads;
CREATE POLICY portal_inbound_leads_operator_update ON public.portal_inbound_leads
  FOR UPDATE TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT UPDATE ON TABLE public.portal_inbound_leads TO authenticated;
