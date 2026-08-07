-- Client Meta Ads Manager planning tables (Campaign → Ad set → Ad).
-- Manual planning drafts that mirror Meta Ads Manager fields for upload prep.
-- Independent of live compass_ad_accounts sync.

CREATE TABLE IF NOT EXISTS public.compass_meta_campaigns (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL DEFAULT 'OUTCOME_LEADS',
  status text NOT NULL DEFAULT 'draft',
  buying_type text NOT NULL DEFAULT 'auction',
  special_ad_categories text[] NOT NULL DEFAULT '{}',
  budget_type text NOT NULL DEFAULT 'none',
  daily_budget numeric,
  lifetime_budget numeric,
  currency text NOT NULL DEFAULT 'AUD',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_meta_campaigns IS
  'Planned Meta campaigns for a client (Ads Manager hierarchy, not live API objects).';
COMMENT ON COLUMN public.compass_meta_campaigns.objective IS
  'OUTCOME_AWARENESS|OUTCOME_TRAFFIC|OUTCOME_ENGAGEMENT|OUTCOME_LEADS|OUTCOME_APP_PROMOTION|OUTCOME_SALES';
COMMENT ON COLUMN public.compass_meta_campaigns.status IS
  'draft|active|paused|archived';
COMMENT ON COLUMN public.compass_meta_campaigns.buying_type IS
  'auction|reserved';
COMMENT ON COLUMN public.compass_meta_campaigns.budget_type IS
  'none|daily|lifetime (campaign budget optimization when not none)';

CREATE INDEX IF NOT EXISTS compass_meta_campaigns_client_idx
  ON public.compass_meta_campaigns (client_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_meta_ad_sets (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES public.compass_meta_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  optimization_goal text NOT NULL DEFAULT 'LEAD_GENERATION',
  billing_event text NOT NULL DEFAULT 'IMPRESSIONS',
  bid_strategy text NOT NULL DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  budget_type text NOT NULL DEFAULT 'daily',
  daily_budget numeric,
  lifetime_budget numeric,
  currency text NOT NULL DEFAULT 'AUD',
  start_date date,
  end_date date,
  age_min integer NOT NULL DEFAULT 18,
  age_max integer NOT NULL DEFAULT 65,
  genders text NOT NULL DEFAULT 'all',
  locations text,
  detailed_targeting text,
  placements text NOT NULL DEFAULT 'advantage_plus',
  placement_notes text,
  destination_type text NOT NULL DEFAULT 'WEBSITE',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_meta_ad_sets IS
  'Planned Meta ad sets (targeting, budget, schedule, placements).';
COMMENT ON COLUMN public.compass_meta_ad_sets.status IS
  'draft|active|paused|archived';
COMMENT ON COLUMN public.compass_meta_ad_sets.genders IS
  'all|men|women';
COMMENT ON COLUMN public.compass_meta_ad_sets.placements IS
  'advantage_plus|manual';

CREATE INDEX IF NOT EXISTS compass_meta_ad_sets_client_idx
  ON public.compass_meta_ad_sets (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS compass_meta_ad_sets_campaign_idx
  ON public.compass_meta_ad_sets (campaign_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.compass_meta_ads (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  ad_set_id text NOT NULL REFERENCES public.compass_meta_ad_sets(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  format text NOT NULL DEFAULT 'single_image',
  primary_text text,
  headline text,
  description text,
  call_to_action text NOT NULL DEFAULT 'LEARN_MORE',
  destination_url text,
  display_link text,
  media_notes text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_meta_ads IS
  'Planned Meta ads / creative copy matching Ads Manager upload fields.';
COMMENT ON COLUMN public.compass_meta_ads.status IS
  'draft|active|paused|archived';
COMMENT ON COLUMN public.compass_meta_ads.format IS
  'single_image|carousel|video|collection';
COMMENT ON COLUMN public.compass_meta_ads.call_to_action IS
  'Meta CTA button enum, e.g. LEARN_MORE|SHOP_NOW|SIGN_UP|BOOK_TRAVEL|CONTACT_US|GET_QUOTE|APPLY_NOW|SUBSCRIBE|DOWNLOAD|WATCH_MORE';

CREATE INDEX IF NOT EXISTS compass_meta_ads_client_idx
  ON public.compass_meta_ads (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS compass_meta_ads_ad_set_idx
  ON public.compass_meta_ads (ad_set_id, updated_at DESC);

-- RLS (operator-only), matching 0029 patterns.
ALTER TABLE public.compass_meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_meta_campaigns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_meta_campaigns_operator_all ON public.compass_meta_campaigns;
CREATE POLICY compass_meta_campaigns_operator_all ON public.compass_meta_campaigns
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_meta_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_meta_ad_sets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_meta_ad_sets_operator_all ON public.compass_meta_ad_sets;
CREATE POLICY compass_meta_ad_sets_operator_all ON public.compass_meta_ad_sets
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_meta_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_meta_ads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_meta_ads_operator_all ON public.compass_meta_ads;
CREATE POLICY compass_meta_ads_operator_all ON public.compass_meta_ads
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_meta_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_meta_ad_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_meta_ads TO authenticated;
