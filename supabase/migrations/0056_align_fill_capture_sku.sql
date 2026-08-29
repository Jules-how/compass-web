-- Align SKU desk with the current offer lock: fill and capture is testing.
-- Missed-call-only is killed.

UPDATE public.compass_outbound_offers
SET
  gtm_status = 'retired',
  archived = true,
  updated_at = now()
WHERE offer_key = 'ai-receptionist-system'
  AND gtm_status IS DISTINCT FROM 'retired';

UPDATE public.compass_outbound_offers
SET
  name = 'Fill and capture',
  pack_summary = 'Paid demand into their number, then answer and book in minutes so jobs they paid for actually show',
  positioning_line = 'Fill and capture for established local trades: ads into a number that answers',
  one_sentence = 'We fill and capture jobs for established trade shops: paid demand into their number, then answer and book in minutes, so the diary fills and the jobs they paid for actually show.',
  gtm_status = 'testing',
  archived = false,
  updated_at = now()
WHERE offer_key = 'booked-jobs-system';
