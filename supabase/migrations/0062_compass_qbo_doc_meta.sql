-- Kind/period stamps for cron matching, plus a daily spend snapshot so Finances
-- does not re-query every Purchase on each page load.

ALTER TABLE public.compass_qbo_docs
  ADD COLUMN IF NOT EXISTS invoice_kind text,
  ADD COLUMN IF NOT EXISTS billing_period text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.compass_qbo_docs.invoice_kind IS
  'install_first_month|monthly. Stamped by Compass; also mirrored in QBO PrivateNote.';
COMMENT ON COLUMN public.compass_qbo_docs.billing_period IS
  'YYYY-MM of the commercial period this doc covers.';

CREATE TABLE IF NOT EXISTS public.compass_qbo_spend_days (
  spend_date date PRIMARY KEY,
  groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amt numeric NOT NULL DEFAULT 0,
  cached_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_qbo_spend_days IS
  'Daily QBO Purchase totals grouped by expense account name. Cache only.';

ALTER TABLE public.compass_qbo_spend_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_qbo_spend_days FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_qbo_spend_days_operator_all ON public.compass_qbo_spend_days;
CREATE POLICY compass_qbo_spend_days_operator_all ON public.compass_qbo_spend_days
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_qbo_spend_days TO authenticated;
GRANT ALL ON public.compass_qbo_spend_days TO service_role;
