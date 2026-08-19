-- Archive unused outbound offers. Keep ai-receptionist-system live and rewrite copy.

UPDATE public.compass_outbound_offers
SET
  archived = true,
  updated_at = now()
WHERE offer_key IN ('growth-system', 'ai-enablement', 'agency-ai-reporting')
  AND archived IS DISTINCT FROM true;

UPDATE public.compass_outbound_offers
SET
  name = 'After-hours booking',
  pack_summary = 'Overflow voice + SMS so a job that already called books while they are on the tools',
  positioning_line = 'Missed-call and after-hours booking for established local trades that already get inbound',
  vertical_tags = array['tradies', 'plumber', 'hvac'],
  archived = false,
  updated_at = now()
WHERE id = 'offer-ai-receptionist-system'
   OR offer_key = 'ai-receptionist-system';

UPDATE public.compass_outbound_expressions
SET
  archived = true,
  updated_at = now()
WHERE offer_key IN ('growth-system', 'ai-enablement', 'agency-ai-reporting')
  AND archived IS DISTINCT FROM true;

UPDATE public.compass_outbound_expressions
SET
  label = '[Yours] Proof · after-hours booking',
  body = 'After-hours calls on a comparable shop still hit voicemail; [peer] now answers and offers a booking path. Swap [peer] for a named like-for-like before send. Do not promise lead volume.',
  updated_at = now()
WHERE id = 'expr-proof-receptionist';
