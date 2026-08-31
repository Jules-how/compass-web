-- Wave 1b: commercial deal terms + QBO customer link on operator clients.
-- Compass is not a ledger. Amounts here are commercial facts; invoices live in QBO.

ALTER TABLE public.compass_clients
  ADD COLUMN IF NOT EXISTS deal_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qbo_customer_id text;

COMMENT ON COLUMN public.compass_clients.deal_terms IS
  'Commercial terms for the missed-call booking offer. Keys: offer, tier (vans_3|vans_4_8), install_aud (default 1997), monthly_aud (1497|1997), gst_mode (exclusive), start_date, term_days (default 90), billing_email, status (draft|contracted|retainer_active|paused|ended), amount_override (nullable). Not invoice truth.';
COMMENT ON COLUMN public.compass_clients.qbo_customer_id IS
  'QuickBooks Online Customer.Id. Compass never stores invoice balances as source of truth.';
