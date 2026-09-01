-- Document vertical variants in offer lock schema.
-- Vertical variants are stored in public.compass_outbound_offers.lock -> 'verticals'.
-- Shape per item:
--   key (slug), name (label), status ('planned'|'testing'|'validated'|'killed'),
--   hypothesis (text), pain_wrapper (text), list_spec (text), notes (text).

COMMENT ON COLUMN public.compass_outbound_offers.lock IS
  'Structured product lock: icp, antiIcp, screen, machine, walk, vehicles, relevance, verticalIn, verticalOut, and verticals (vertical variants scorecard and hypothesis specs).';
