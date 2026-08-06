-- Operator ad-account connections + cached creative metrics for Home glances.

CREATE TABLE IF NOT EXISTS public.compass_ad_accounts (
  id text PRIMARY KEY,
  platform text NOT NULL CHECK (platform IN ('meta', 'google', 'linkedin')),
  external_account_id text NOT NULL,
  account_name text,
  currency text,
  status text NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'error', 'disconnected')),
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_account_id)
);

COMMENT ON TABLE public.compass_ad_accounts IS
  'Connected Meta / Google / LinkedIn ad accounts for operator Home metrics.';
COMMENT ON COLUMN public.compass_ad_accounts.access_token_enc IS
  'AES-GCM ciphertext (base64) of the platform access token.';
COMMENT ON COLUMN public.compass_ad_accounts.meta IS
  'Platform extras: developer_token, login_customer_id, lead_value, etc.';

CREATE INDEX IF NOT EXISTS compass_ad_accounts_platform_idx
  ON public.compass_ad_accounts (platform, status);

CREATE TABLE IF NOT EXISTS public.compass_ad_creatives (
  id text PRIMARY KEY,
  account_row_id text NOT NULL REFERENCES public.compass_ad_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('Meta', 'Google', 'LinkedIn')),
  status text NOT NULL DEFAULT 'learning'
    CHECK (status IN ('winning', 'learning', 'fatigued', 'needs-review')),
  spend numeric NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpa numeric,
  roas numeric NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  period_start date,
  period_end date,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_row_id, external_id)
);

CREATE INDEX IF NOT EXISTS compass_ad_creatives_account_idx
  ON public.compass_ad_creatives (account_row_id, spend DESC);

CREATE TABLE IF NOT EXISTS public.compass_ad_glance (
  id text PRIMARY KEY DEFAULT 'home',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'demo' CHECK (source IN ('live', 'demo')),
  synced_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.compass_ad_glance (id, payload, source)
VALUES ('home', '{}'::jsonb, 'demo')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.compass_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_ad_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_ad_accounts_operator_all ON public.compass_ad_accounts;
CREATE POLICY compass_ad_accounts_operator_all ON public.compass_ad_accounts
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_ad_creatives FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_ad_creatives_operator_all ON public.compass_ad_creatives;
CREATE POLICY compass_ad_creatives_operator_all ON public.compass_ad_creatives
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_ad_glance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_ad_glance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_ad_glance_operator_all ON public.compass_ad_glance;
CREATE POLICY compass_ad_glance_operator_all ON public.compass_ad_glance
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());
