-- CS dept: client health snapshots + Monday review artifacts on the evidence spine.

CREATE TABLE IF NOT EXISTS public.compass_cs_snapshots (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now(),
  period_end date NOT NULL,
  score integer NOT NULL,
  band text NOT NULL,
  at_risk boolean NOT NULL DEFAULT false,
  prior_score integer,
  drop_points integer NOT NULL DEFAULT 0,
  factors jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_cs_snapshots IS
  'Weekly client health score. Factors: call volume, booked/showed, owner engagement, payment, support.';

CREATE INDEX IF NOT EXISTS compass_cs_snapshots_client_idx
  ON public.compass_cs_snapshots (client_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS compass_cs_snapshots_period_idx
  ON public.compass_cs_snapshots (period_end DESC, at_risk DESC);

CREATE TABLE IF NOT EXISTS public.compass_cs_artifacts (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  client_name text NOT NULL,
  kind text NOT NULL,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_cs_artifacts IS
  'CS drafts: weekly_summary, monday_sms, monday_email, save_play, guarantee, qbr. Operator reviews; weekly_summary feeds the ROI view.';
COMMENT ON COLUMN public.compass_cs_artifacts.kind IS
  'weekly_summary|monday_sms|monday_email|save_play|guarantee|qbr';
COMMENT ON COLUMN public.compass_cs_artifacts.status IS
  'draft|approved|skipped|sent';

CREATE INDEX IF NOT EXISTS compass_cs_artifacts_client_idx
  ON public.compass_cs_artifacts (client_id, period_end DESC);
CREATE INDEX IF NOT EXISTS compass_cs_artifacts_kind_status_idx
  ON public.compass_cs_artifacts (kind, status, period_end DESC);

ALTER TABLE public.compass_cs_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_cs_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_cs_snapshots_operator_all ON public.compass_cs_snapshots;
CREATE POLICY compass_cs_snapshots_operator_all ON public.compass_cs_snapshots
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_cs_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_cs_artifacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_cs_artifacts_operator_all ON public.compass_cs_artifacts;
CREATE POLICY compass_cs_artifacts_operator_all ON public.compass_cs_artifacts
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_cs_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_cs_artifacts TO authenticated;
GRANT ALL ON public.compass_cs_snapshots TO service_role;
GRANT ALL ON public.compass_cs_artifacts TO service_role;

-- Demo clients so every CS view is inspectable before a live install.
INSERT INTO public.compass_clients (
  id, name, industry, website, main_contact_name, main_contact_role,
  engagement_type, retainer_status, status, priority, health, summary, tags, notes,
  portal_client_slug, last_touch_at, pipeline_stage, deal_terms,
  created_at, updated_at, mirrored_at
)
VALUES
  (
    'cs-demo-harbour',
    'Harbour Plumbing',
    'plumbing',
    'https://harbourplumbing.example',
    'Mick',
    'Owner',
    'missed_call_booking',
    'month_2',
    'active',
    3,
    'on_track',
    'Healthy Sydney plumber. Demo seed for CS Monday review.',
    ARRAY['cs-demo']::text[],
    'Demo. Do not invoice.',
    'harbour-plumbing',
    now() - interval '2 days',
    'Live',
    '{"offer":"missed_call_booking","tier":"vans_3","install_aud":1997,"monthly_aud":1497,"gst_mode":"exclusive","start_date":"2026-07-17","term_days":90,"billing_email":"mick@harbourplumbing.example","status":"retainer_active","amount_override":null,"job_contribution_aud":420}'::jsonb,
    now(), now(), now()
  ),
  (
    'cs-demo-northside',
    'Northside HVAC',
    'hvac',
    'https://northsidehvac.example',
    'Priya',
    'Owner',
    'missed_call_booking',
    'month_2',
    'active',
    1,
    'off_track',
    'Volume drop. Demo save play.',
    ARRAY['cs-demo']::text[],
    'Demo. Do not invoice.',
    'northside-hvac',
    now() - interval '18 days',
    'Live',
    '{"offer":"missed_call_booking","tier":"vans_3","install_aud":1997,"monthly_aud":1497,"gst_mode":"exclusive","start_date":"2026-07-02","term_days":90,"billing_email":"priya@northsidehvac.example","status":"retainer_active","amount_override":null,"job_contribution_aud":480}'::jsonb,
    now(), now(), now()
  ),
  (
    'cs-demo-volt',
    'Volt and Co Electrical',
    'electrical',
    'https://voltandco.example',
    'Tom',
    'Owner',
    'missed_call_booking',
    'first_30',
    'active',
    2,
    'on_track',
    'Day 25. Made fees back. Demo checkpoint.',
    ARRAY['cs-demo']::text[],
    'Demo. Do not invoice.',
    'volt-and-co',
    now() - interval '5 days',
    'Live',
    '{"offer":"missed_call_booking","tier":"vans_3","install_aud":1997,"monthly_aud":1497,"gst_mode":"exclusive","start_date":"2026-08-01","term_days":90,"billing_email":"tom@voltandco.example","status":"contracted","amount_override":null,"job_contribution_aud":380}'::jsonb,
    now(), now(), now()
  ),
  (
    'cs-demo-ridge',
    'Ridge Line Roofing',
    'roofing',
    'https://ridgelineroofing.example',
    'Sam',
    'Owner',
    'missed_call_booking',
    'first_30',
    'active',
    1,
    'at_risk',
    'Day 25. Did not make fees back. Demo checkpoint.',
    ARRAY['cs-demo']::text[],
    'Demo. Do not invoice.',
    'ridge-line-roofing',
    now() - interval '9 days',
    'Live',
    '{"offer":"missed_call_booking","tier":"vans_4_8","install_aud":1997,"monthly_aud":1997,"gst_mode":"exclusive","start_date":"2026-08-01","term_days":90,"billing_email":"sam@ridgelineroofing.example","status":"contracted","amount_override":null,"job_contribution_aud":650}'::jsonb,
    now(), now(), now()
  ),
  (
    'cs-demo-coastal',
    'Coastal Gas',
    'gas',
    'https://coastalgas.example',
    'Dana',
    'Owner',
    'missed_call_booking',
    'overdue',
    'active',
    1,
    'off_track',
    'Overdue plus blocked support. Demo at risk.',
    ARRAY['cs-demo']::text[],
    'Demo. Do not invoice.',
    'coastal-gas',
    now() - interval '24 days',
    'Live',
    '{"offer":"missed_call_booking","tier":"vans_3","install_aud":1997,"monthly_aud":1497,"gst_mode":"exclusive","start_date":"2026-06-17","term_days":90,"billing_email":"dana@coastalgas.example","status":"retainer_active","amount_override":null,"job_contribution_aud":420}'::jsonb,
    now(), now(), now()
  )
ON CONFLICT (id) DO UPDATE SET
  summary = EXCLUDED.summary,
  tags = EXCLUDED.tags,
  deal_terms = EXCLUDED.deal_terms,
  updated_at = now();

-- Optional FK once demo rows exist. Live clients already live in compass_clients.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compass_cs_snapshots_client_fk'
  ) THEN
    ALTER TABLE public.compass_cs_snapshots
      ADD CONSTRAINT compass_cs_snapshots_client_fk
      FOREIGN KEY (client_id) REFERENCES public.compass_clients(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'compass_cs_artifacts_client_fk'
  ) THEN
    ALTER TABLE public.compass_cs_artifacts
      ADD CONSTRAINT compass_cs_artifacts_client_fk
      FOREIGN KEY (client_id) REFERENCES public.compass_clients(id) ON DELETE CASCADE;
  END IF;
END
$fk$;

-- System map row for Functions.
INSERT INTO public.compass_business_functions (id, name, slug, sort_order, system_map, created_at, updated_at, mirrored_at)
VALUES (
  'bf-cs',
  'Retention',
  'cs',
  45,
  '{"why":"Monday client health review. Score from call volume, booked/showed, owner engagement, payment, and support. Drafts only.","inputs":["compass_evidence_events","compass_voice_calls","compass_qbo_docs","compass_client_issues"],"outputs":["compass_cs_snapshots","compass_cs_artifacts","ROI weekly results"],"influences":[{"name":"Monday review","route":"/operations/cs","table":"compass_cs_artifacts"},{"name":"ROI results","route":"/operations/cs","table":"compass_cs_artifacts"},{"name":"Evidence spine","route":"/functions","table":"compass_evidence_events"}]}'::jsonb,
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  sort_order = EXCLUDED.sort_order,
  system_map = EXCLUDED.system_map,
  updated_at = now();
