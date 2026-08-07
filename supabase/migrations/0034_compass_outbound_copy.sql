-- Outbound / Copy libraries + campaign copy binding (operator-only).
-- Seed is carefully scoped (see plan 2026-08-07). Idempotent upserts by natural keys.

-- ─── Library tables ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.compass_outbound_offers (
  id text PRIMARY KEY,
  offer_key text NOT NULL UNIQUE,
  name text NOT NULL,
  pack_summary text NOT NULL,
  positioning_line text,
  vertical_tags text[] NOT NULL DEFAULT '{}',
  location_tags text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compass_outbound_expressions (
  id text PRIMARY KEY,
  offer_key text NOT NULL,
  label text NOT NULL,
  body text NOT NULL,
  vertical_tags text[] NOT NULL DEFAULT '{}',
  location_tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft',
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS compass_outbound_expressions_offer_idx
  ON public.compass_outbound_expressions (offer_key);

CREATE TABLE IF NOT EXISTS public.compass_outbound_structures (
  id text PRIMARY KEY,
  structure_id text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  slots jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default_candidate boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compass_outbound_ctas (
  id text PRIMARY KEY,
  label text NOT NULL,
  body text NOT NULL,
  cta_type text NOT NULL DEFAULT 'permission',
  vertical_tags text[] NOT NULL DEFAULT '{}',
  location_tags text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compass_outbound_subjects (
  id text PRIMARY KEY,
  label text NOT NULL,
  pattern text NOT NULL,
  notes text,
  vertical_tags text[] NOT NULL DEFAULT '{}',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compass_outbound_openers (
  id text PRIMARY KEY,
  label text NOT NULL,
  opener_mode text NOT NULL DEFAULT 'nick-tier',
  body text NOT NULL DEFAULT '',
  notes text,
  vertical_tags text[] NOT NULL DEFAULT '{}',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compass_outbound_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  offer_key text,
  structure_id text NOT NULL,
  vertical_tags text[] NOT NULL DEFAULT '{}',
  location_tags text[] NOT NULL DEFAULT '{}',
  sequence jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.compass_outbound_offers IS
  'Global outbound pack offers (operator Copy libraries).';
COMMENT ON TABLE public.compass_outbound_expressions IS
  'Cold expression catalogue; campaign cold_expression is the locked shipping line.';
COMMENT ON TABLE public.compass_outbound_structures IS
  'Slot-order skeletons only (nick-4step, nick-3step, platten-aida, connor-3para).';
COMMENT ON TABLE public.compass_outbound_templates IS
  'Sequence templates forked into campaign sequence_draft (copy-on-attach).';

-- ─── Campaign copy columns ──────────────────────────────────────────────────

ALTER TABLE public.compass_pipeline_campaigns
  ADD COLUMN IF NOT EXISTS offer_key text,
  ADD COLUMN IF NOT EXISTS structure_id text,
  ADD COLUMN IF NOT EXISTS opener_mode text DEFAULT 'nick-tier',
  ADD COLUMN IF NOT EXISTS vertical_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS location_tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cold_expression text,
  ADD COLUMN IF NOT EXISTS sequence_draft jsonb,
  ADD COLUMN IF NOT EXISTS copy_status text NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.compass_pipeline_campaigns.copy_status IS
  'none|draft|ready|live';
COMMENT ON COLUMN public.compass_pipeline_campaigns.sequence_draft IS
  'Campaign-owned forked sequence JSON (editor SoT). Never live-binds library rows.';

CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_offer_idx
  ON public.compass_pipeline_campaigns (offer_key);
CREATE INDEX IF NOT EXISTS compass_pipeline_campaigns_copy_status_idx
  ON public.compass_pipeline_campaigns (copy_status);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.compass_outbound_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_offers_operator_all ON public.compass_outbound_offers;
CREATE POLICY compass_outbound_offers_operator_all ON public.compass_outbound_offers
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_outbound_expressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_expressions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_expressions_operator_all ON public.compass_outbound_expressions;
CREATE POLICY compass_outbound_expressions_operator_all ON public.compass_outbound_expressions
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_outbound_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_structures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_structures_operator_all ON public.compass_outbound_structures;
CREATE POLICY compass_outbound_structures_operator_all ON public.compass_outbound_structures
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_outbound_ctas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_ctas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_ctas_operator_all ON public.compass_outbound_ctas;
CREATE POLICY compass_outbound_ctas_operator_all ON public.compass_outbound_ctas
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_outbound_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_subjects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_subjects_operator_all ON public.compass_outbound_subjects;
CREATE POLICY compass_outbound_subjects_operator_all ON public.compass_outbound_subjects
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_outbound_openers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_openers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_openers_operator_all ON public.compass_outbound_openers;
CREATE POLICY compass_outbound_openers_operator_all ON public.compass_outbound_openers
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

ALTER TABLE public.compass_outbound_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_outbound_templates_operator_all ON public.compass_outbound_templates;
CREATE POLICY compass_outbound_templates_operator_all ON public.compass_outbound_templates
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_expressions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_structures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_ctas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_openers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_outbound_templates TO authenticated;

-- ─── Scoped seed (idempotent) ───────────────────────────────────────────────

INSERT INTO public.compass_outbound_offers
  (id, offer_key, name, pack_summary, positioning_line, vertical_tags, location_tags, sort_order, archived, created_at, updated_at)
VALUES
  ('offer-growth-system', 'growth-system', 'Switchflow Growth System',
   'Qualified booked appointments from paid ads — hybrid signup + retainer + performance',
   NULL, ARRAY['mortgage-brokers'], ARRAY['au-national'], 10, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('offer-ai-enablement', 'ai-enablement', 'AI Enablement',
   'Install marketing, quote follow-up, and review tools in-house; install fee refund path',
   NULL, ARRAY['tradies','electricians'], ARRAY['nsw','qld','au-national'], 20, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('offer-ai-receptionist-system', 'ai-receptionist-system', 'AI Receptionist System',
   'Answer → qualify → book/SMS on their number 24/7',
   NULL, ARRAY['tradies'], ARRAY['au-national'], 30, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('offer-agency-ai-reporting', 'agency-ai-reporting', 'Agency AI Reporting System',
   'Client reporting automation for marketing agencies',
   NULL, ARRAY['agencies'], ARRAY['au-national'], 40, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (offer_key) DO NOTHING;

INSERT INTO public.compass_outbound_expressions
  (id, offer_key, label, body, vertical_tags, location_tags, status, notes, archived, created_at, updated_at)
VALUES
  ('expr-ai-enablement-tradies', 'ai-enablement', 'AI Enablement · AU tradies',
   'Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back.',
   ARRAY['tradies','electricians'], ARRAY['au-national','nsw'], 'approved', NULL, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('expr-growth-mortgage', 'growth-system', 'Growth System · AU mortgage brokers',
   'I''ll get you {{bookedN}} booked borrower chats in the first 30 days after access and budget are live, or I refund the setup fee in full.',
   ARRAY['mortgage-brokers'], ARRAY['au-national'], 'campaign_gated',
   'No standing volume guarantee; N locked per campaign.', false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.compass_outbound_structures
  (id, structure_id, name, description, slots, is_default_candidate, archived, created_at, updated_at)
VALUES
  ('struct-nick-4step', 'nick-4step', 'Nick 4-step',
   'Default when you have proof. Opener → proof → cold expression → CTA. Prefer for campaigns with standing proof.',
   '[{"key":"opener","label":"Opener","required":true,"body":""},{"key":"proof_block","label":"Proof","required":true,"body":""},{"key":"cold_expression","label":"Cold expression","required":true,"body":""},{"key":"cta","label":"CTA","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]'::jsonb,
   true, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('struct-nick-3step', 'nick-3step', 'Nick 3-step',
   'Thin-proof default. Opener → cold expression → CTA. Use when proof is light or still campaign-gated.',
   '[{"key":"opener","label":"Opener","required":true,"body":""},{"key":"cold_expression","label":"Cold expression","required":true,"body":""},{"key":"cta","label":"CTA","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]'::jsonb,
   true, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('struct-platten-aida', 'platten-aida', 'Platten AIDA',
   'AIDA-shaped: opener → interest mechanism → proof → expression → CTA.',
   '[{"key":"opener","label":"Opener / Attention","required":true,"body":""},{"key":"interest_mechanism","label":"Interest","required":true,"body":""},{"key":"proof_block","label":"Proof / Desire","required":true,"body":""},{"key":"cold_expression","label":"Cold expression","required":true,"body":""},{"key":"cta","label":"CTA","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]'::jsonb,
   false, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('struct-connor-3para', 'connor-3para', 'Connor 3-paragraph',
   'Who → why/priorities → optional expression → availability ask. Assumptive CTA only valid here.',
   '[{"key":"who_line","label":"Who line","required":true,"body":""},{"key":"why_priorities_and_outcomes","label":"Why / priorities & outcomes","required":true,"body":""},{"key":"cold_expression","label":"Cold expression (optional)","body":""},{"key":"availability_ask","label":"Availability ask","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]'::jsonb,
   false, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (structure_id) DO NOTHING;

INSERT INTO public.compass_outbound_ctas
  (id, label, body, cta_type, vertical_tags, location_tags, is_default, archived, created_at, updated_at)
VALUES
  ('cta-permission-default', 'Permission default', 'Mind if I send over {{asset}}?', 'permission', '{}', '{}', true, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('cta-timed-call', 'Timed call', 'Would you be open to 15 minutes? If so, I can ring at {{t1}} or {{t2}}.', 'timed_call', '{}', '{}', false, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('cta-enablement-dream', 'Enablement dream ask',
   'If I trained you up so you could use AI for ads, the website, invoices, follow-ups, and a chunk of the office work, would that actually help {{companyName}}?',
   'give_first', ARRAY['tradies'], '{}', false, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('cta-outline-permission', 'Outline permission',
   'Mind if I send a short outline of how I''d run it for you?',
   'permission', '{}', '{}', false, false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.compass_outbound_subjects
  (id, label, pattern, notes, vertical_tags, archived, created_at, updated_at)
VALUES
  ('subj-colleague-register', 'Colleague register', '{{companyName}} / {{firstName}}',
   'Plausible deniability — looks like an internal forward subject.', '{}', false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('subj-outcome-stem', 'Outcome stem', '{{outcome}} for {{companyName}}',
   'Outcome-led without “quick” stems.', '{}', false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('subj-passthrough', 'Instantly per-lead passthrough', '{{subject}}',
   'Use when Instantly supplies per-lead subjects.', '{}', false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.compass_outbound_openers
  (id, label, opener_mode, body, notes, vertical_tags, archived, created_at, updated_at)
VALUES
  ('opener-nick-tier', 'Nick tier (research fact)', 'nick-tier', '{{opener}}',
   'Research-backed fact; often filled per lead via Instantly vars.', '{}', false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('opener-platten-hook', 'Platten hook', 'platten-hook', '{{hook}}',
   'Optional hook-style opener.', '{}', false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('opener-none', 'None (greeting + geo)', 'none', '',
   'Empty opener when personalisation is greeting + geo only (e.g. enablement NSW electricians).',
   ARRAY['electricians','tradies'], false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (id) DO NOTHING;

-- Templates: minimal scaffolds (sequence JSON). ON CONFLICT DO NOTHING by id.
INSERT INTO public.compass_outbound_templates
  (id, name, offer_key, structure_id, vertical_tags, location_tags, sequence, archived, created_at, updated_at)
VALUES
  ('tmpl-thin-proof-nick-3', 'Thin proof · nick-3step', NULL, 'nick-3step', '{}', '{}',
   '{"structure_id":"nick-3step","offer_key":null,"steps":[{"id":"step-seed-thin-1","kind":"email","label":"Email 1","subject":"","slots":[{"key":"opener","label":"Opener","required":true,"body":""},{"key":"cold_expression","label":"Cold expression","required":true,"body":"{{cold_expression}}"},{"key":"cta","label":"CTA","required":true,"body":"Mind if I send over {{asset}}?"},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]},{"id":"step-seed-thin-fu","kind":"followup","label":"Follow-up 1","delay_days":3,"subject":"","slots":[{"key":"opener","label":"Bump","body":""},{"key":"cta","label":"CTA","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]}]}'::jsonb,
   false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('tmpl-with-proof-nick-4', 'With proof · nick-4step', NULL, 'nick-4step', '{}', '{}',
   '{"structure_id":"nick-4step","offer_key":null,"steps":[{"id":"step-seed-proof-1","kind":"email","label":"Email 1","subject":"","slots":[{"key":"opener","label":"Opener","required":true,"body":""},{"key":"proof_block","label":"Proof","required":true,"body":"{{proof}}"},{"key":"cold_expression","label":"Cold expression","required":true,"body":"{{cold_expression}}"},{"key":"cta","label":"CTA","required":true,"body":"Mind if I send over {{asset}}?"},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]},{"id":"step-seed-proof-fu","kind":"followup","label":"Follow-up 1","delay_days":3,"subject":"","slots":[{"key":"opener","label":"Bump","body":""},{"key":"cta","label":"CTA","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]}]}'::jsonb,
   false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'),
  ('tmpl-ai-enablement-tradies', 'AI Enablement tradies · nick-3step', 'ai-enablement', 'nick-3step',
   ARRAY['tradies','electricians'], ARRAY['nsw','au-national'],
   '{"structure_id":"nick-3step","offer_key":"ai-enablement","steps":[{"id":"step-seed-en-1","kind":"email","label":"Email 1","subject":"","slots":[{"key":"opener","label":"Opener","required":true,"body":""},{"key":"cold_expression","label":"Cold expression","required":true,"body":"Within 30 days of access, your marketing, quote follow-up, and review tools are set up and someone on your side can run them, or you get the install fee back."},{"key":"cta","label":"CTA","required":true,"body":"If I trained you up so you could use AI for ads, the website, invoices, follow-ups, and a chunk of the office work, would that actually help {{companyName}}?"},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]},{"id":"step-seed-en-fu","kind":"followup","label":"Follow-up 1","delay_days":3,"subject":"","slots":[{"key":"opener","label":"Bump","body":""},{"key":"cta","label":"CTA","required":true,"body":""},{"key":"accountSignature","label":"Account signature","required":true,"body":"{{accountSignature}}"},{"key":"spam_act_opt_out","label":"Spam Act opt-out","required":true,"body":"{{spam_act_opt_out}}"}]}]}'::jsonb,
   false, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
