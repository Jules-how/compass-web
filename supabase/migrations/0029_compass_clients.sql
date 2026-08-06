-- Operator Clients CRM (directory + mini workspace).
-- Compat: legacy desktop sync already created public.compass_clients with a
-- different shape (vertical/onboarding_*/commercial_scope). CREATE TABLE IF
-- NOT EXISTS would silently skip and leave the CRM columns missing, which
-- breaks /api/clients and (via projects.client_id) /api/projects + /api/tasks.
-- Always ALTER-add CRM columns onto the existing table.

ALTER TABLE public.compass_clients
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS main_contact_name text,
  ADD COLUMN IF NOT EXISTS main_contact_role text,
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS retainer_status text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'no_updates',
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS vault_dossier_id text,
  ADD COLUMN IF NOT EXISTS portal_client_slug text,
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;

-- Fresh environments without the legacy table still need the base relation.
CREATE TABLE IF NOT EXISTS public.compass_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  industry text,
  website text,
  main_contact_name text,
  main_contact_role text,
  engagement_type text,
  retainer_status text,
  status text NOT NULL DEFAULT 'onboarding',
  priority integer NOT NULL DEFAULT 0,
  health text NOT NULL DEFAULT 'no_updates',
  summary text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  archived_at timestamptz,
  vault_dossier_id text,
  portal_client_slug text,
  last_touch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  mirrored_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_clients IS
  'Operator client accounts (Clients tab). Soft-archive via archived_at. Legacy desktop columns may also be present.';
COMMENT ON COLUMN public.compass_clients.status IS
  'onboarding|active|paused (legacy values like prospect map to onboarding in the web UI)';
COMMENT ON COLUMN public.compass_clients.priority IS
  '0=none,1=urgent,2=high,3=medium,4=low';
COMMENT ON COLUMN public.compass_clients.health IS
  'no_updates|on_track|at_risk|off_track';

-- Seed CRM industry from legacy vertical when blank.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compass_clients'
      AND column_name = 'vertical'
  ) THEN
    UPDATE public.compass_clients
    SET industry = vertical
    WHERE industry IS NULL AND vertical IS NOT NULL;
  END IF;
END $$;

UPDATE public.compass_clients
SET last_touch_at = COALESCE(last_touch_at, updated_at, created_at)
WHERE last_touch_at IS NULL;

CREATE INDEX IF NOT EXISTS compass_clients_archived_idx
  ON public.compass_clients (archived_at NULLS FIRST, name);
CREATE INDEX IF NOT EXISTS compass_clients_status_idx
  ON public.compass_clients (status);
CREATE INDEX IF NOT EXISTS compass_clients_updated_idx
  ON public.compass_clients (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_client_updates (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  health text NOT NULL DEFAULT 'no_updates',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  mirrored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_client_updates_client_idx
  ON public.compass_client_updates (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_client_activity (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  actor text NOT NULL DEFAULT 'operator',
  action text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_client_activity_client_idx
  ON public.compass_client_activity (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_client_issues (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'not-started',
  priority integer NOT NULL DEFAULT 0,
  due date,
  notes text,
  project_id text REFERENCES public.compass_projects(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  mirrored_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.compass_client_issues.status IS
  'not-started|in-progress|completed|blocked|cancelled';
COMMENT ON COLUMN public.compass_client_issues.priority IS
  '0=none,1=urgent,2=high,3=medium,4=low';

CREATE INDEX IF NOT EXISTS compass_client_issues_client_idx
  ON public.compass_client_issues (client_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS compass_client_issues_open_idx
  ON public.compass_client_issues (client_id, updated_at DESC)
  WHERE status NOT IN ('completed', 'cancelled');

CREATE TABLE IF NOT EXISTS public.compass_client_offers (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'meta',
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  amount numeric,
  currency text NOT NULL DEFAULT 'AUD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.compass_client_offers.channel IS 'meta|google|other';
COMMENT ON COLUMN public.compass_client_offers.status IS
  'draft|active|paused|won|lost|archived';

CREATE INDEX IF NOT EXISTS compass_client_offers_client_idx
  ON public.compass_client_offers (client_id, channel, created_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_client_ad_spend (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  channel text NOT NULL,
  spend_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'AUD',
  campaign_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.compass_client_ad_spend.channel IS 'meta|google';

CREATE INDEX IF NOT EXISTS compass_client_ad_spend_client_idx
  ON public.compass_client_ad_spend (client_id, channel, spend_date DESC);

CREATE TABLE IF NOT EXISTS public.compass_client_channel_notes (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  channel text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.compass_client_channel_notes.channel IS 'meta|google|other';

CREATE INDEX IF NOT EXISTS compass_client_channel_notes_client_idx
  ON public.compass_client_channel_notes (client_id, channel, created_at DESC);

-- Scope projects to a client (also still appear in global Projects).
ALTER TABLE public.compass_projects
  ADD COLUMN IF NOT EXISTS client_id text REFERENCES public.compass_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS compass_projects_client_idx
  ON public.compass_projects (client_id)
  WHERE client_id IS NOT NULL;

-- RLS (operator-only), matching 0027/0028 patterns.
ALTER TABLE public.compass_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_clients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_clients_operator_all ON public.compass_clients;
CREATE POLICY compass_clients_operator_all ON public.compass_clients
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_updates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_updates_operator_all ON public.compass_client_updates;
CREATE POLICY compass_client_updates_operator_all ON public.compass_client_updates
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_activity FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_activity_operator_all ON public.compass_client_activity;
CREATE POLICY compass_client_activity_operator_all ON public.compass_client_activity
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_issues_operator_all ON public.compass_client_issues;
CREATE POLICY compass_client_issues_operator_all ON public.compass_client_issues
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_offers_operator_all ON public.compass_client_offers;
CREATE POLICY compass_client_offers_operator_all ON public.compass_client_offers
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_ad_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_ad_spend FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_ad_spend_operator_all ON public.compass_client_ad_spend;
CREATE POLICY compass_client_ad_spend_operator_all ON public.compass_client_ad_spend
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_client_channel_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_client_channel_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_client_channel_notes_operator_all ON public.compass_client_channel_notes;
CREATE POLICY compass_client_channel_notes_operator_all ON public.compass_client_channel_notes
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_clients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_ad_spend TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_client_channel_notes TO authenticated;
