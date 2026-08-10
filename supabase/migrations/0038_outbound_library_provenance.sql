-- Provenance labels: source (creator doctrine) vs yours (Switchflow variations)

ALTER TABLE public.compass_outbound_offers
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.compass_outbound_expressions
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.compass_outbound_structures
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.compass_outbound_ctas
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.compass_outbound_subjects
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.compass_outbound_openers
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

ALTER TABLE public.compass_outbound_templates
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'yours',
  ADD COLUMN IF NOT EXISTS source_creator text,
  ADD COLUMN IF NOT EXISTS source_file text;

-- Source expression patterns are unscoped (visible under any offer filter)
ALTER TABLE public.compass_outbound_expressions
  ALTER COLUMN offer_key DROP NOT NULL;

COMMENT ON COLUMN public.compass_outbound_offers.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
COMMENT ON COLUMN public.compass_outbound_expressions.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
COMMENT ON COLUMN public.compass_outbound_structures.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
COMMENT ON COLUMN public.compass_outbound_ctas.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
COMMENT ON COLUMN public.compass_outbound_subjects.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
COMMENT ON COLUMN public.compass_outbound_openers.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
COMMENT ON COLUMN public.compass_outbound_templates.provenance IS
  'source = creator doctrine; yours = Switchflow variation';
