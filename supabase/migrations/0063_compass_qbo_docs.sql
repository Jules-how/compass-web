-- Cached QBO invoice / credit memo headers. Source of truth remains QuickBooks.

CREATE TABLE IF NOT EXISTS public.compass_qbo_docs (
  id text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.compass_clients(id) ON DELETE CASCADE,
  qbo_invoice_id text NOT NULL,
  qbo_credit_memo_id text,
  doc_number text,
  doc_type text NOT NULL DEFAULT 'invoice',
  email_status text,
  balance numeric,
  total_amt numeric,
  due_date date,
  txn_date date,
  sync_token text,
  cached_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_qbo_docs IS
  'Cached QBO Invoice and CreditMemo fields. Refresh from Intuit; do not treat as a Compass ledger.';
COMMENT ON COLUMN public.compass_qbo_docs.doc_type IS 'invoice|credit_memo';

CREATE INDEX IF NOT EXISTS compass_qbo_docs_client_idx
  ON public.compass_qbo_docs (client_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS compass_qbo_docs_invoice_idx
  ON public.compass_qbo_docs (qbo_invoice_id);

ALTER TABLE public.compass_qbo_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_qbo_docs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_qbo_docs_operator_all ON public.compass_qbo_docs;
CREATE POLICY compass_qbo_docs_operator_all ON public.compass_qbo_docs
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_qbo_docs TO authenticated;
GRANT ALL ON public.compass_qbo_docs TO service_role;
