-- SKU desk fields on outbound offers. Copy library archived stays separate from gtm_status.

ALTER TABLE public.compass_outbound_offers
  ADD COLUMN IF NOT EXISTS gtm_status text NOT NULL DEFAULT 'testing',
  ADD COLUMN IF NOT EXISTS one_sentence text,
  ADD COLUMN IF NOT EXISTS dream_outcome text,
  ADD COLUMN IF NOT EXISTS install_aud numeric,
  ADD COLUMN IF NOT EXISTS retainer_low_aud numeric,
  ADD COLUMN IF NOT EXISTS retainer_high_aud numeric,
  ADD COLUMN IF NOT EXISTS term_days integer,
  ADD COLUMN IF NOT EXISTS guarantee text,
  ADD COLUMN IF NOT EXISTS lock jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.compass_outbound_offers
  DROP CONSTRAINT IF EXISTS compass_outbound_offers_gtm_status_check;

ALTER TABLE public.compass_outbound_offers
  ADD CONSTRAINT compass_outbound_offers_gtm_status_check
  CHECK (gtm_status IN ('live', 'testing', 'retired'));

COMMENT ON COLUMN public.compass_outbound_offers.gtm_status IS
  'SKU lifecycle: live outbound, testing, or retired. Copy library archived is separate.';
COMMENT ON COLUMN public.compass_outbound_offers.lock IS
  'Structured product lock: icp, antiIcp, screen, machine, walk.';

CREATE INDEX IF NOT EXISTS compass_outbound_offers_gtm_idx
  ON public.compass_outbound_offers (gtm_status);

UPDATE public.compass_outbound_offers
SET
  gtm_status = 'retired',
  updated_at = now()
WHERE archived IS TRUE
  AND offer_key IS DISTINCT FROM 'ai-receptionist-system';

UPDATE public.compass_outbound_offers
SET
  gtm_status = 'live',
  one_sentence = 'We install missed-call and after-hours booking for established trade shops that already get inbound, so the job books while they are on the tools.',
  dream_outcome = 'Kept jobs this month from calls they already paid to generate.',
  install_aud = 1997,
  retainer_low_aud = 1497,
  retainer_high_aud = 1997,
  term_days = 90,
  guarantee = 'If they do not make the fees they paid back in 30 days from showed jobs this system booked, refund those fees in full. They must pass the inbound screen and leave routing on. Install is always collected.',
  lock = $lock${
    "icp": "Established residential trades whose phone already rings and who lose jobs while they are on the tools.",
    "antiIcp": [
      "Solo tradie with a quiet phone",
      "Pitch is only I need more leads",
      "Commercial tender / sparkies BD",
      "New ABN / green shop",
      "Will not divert the public number"
    ],
    "screen": [
      "What happens when a call comes in while you are on a job?",
      "Last month, how many enquiries did you not call back the same day?",
      "After-hours: voicemail, divert, or nobody?",
      "Will you leave the public number pointed at this path for 90 days?"
    ],
    "machine": {
      "capture": "Voice on their number for overflow / after hours. SMS on miss or form. Book into their calendar.",
      "fill": "Consented reactivation, then Google / LSA. After 30 days of capture data if they still want volume.",
      "convert": "Landing page only if paid traffic or booking UX is the bottleneck. Never the first SKU."
    },
    "walk": [
      "Quiet phone",
      "CPL as the success metric",
      "Franchise HQ",
      "No lawful published email"
    ]
  }$lock$::jsonb,
  archived = false,
  updated_at = now()
WHERE offer_key = 'ai-receptionist-system';

INSERT INTO public.compass_outbound_offers (
  id,
  offer_key,
  name,
  pack_summary,
  positioning_line,
  vertical_tags,
  location_tags,
  sort_order,
  archived,
  provenance,
  source_creator,
  source_file,
  gtm_status,
  one_sentence,
  dream_outcome,
  lock,
  created_at,
  updated_at
) VALUES (
  'offer-booked-jobs-system',
  'booked-jobs-system',
  'Booked jobs',
  'Lead gen, speed-to-lead, and inbound booking so enquiries become showed jobs',
  'Generate the enquiry, answer it in minutes, and book the job from inbound',
  ARRAY['tradies', 'plumber', 'hvac'],
  ARRAY['au-national'],
  25,
  false,
  'yours',
  null,
  null,
  'testing',
  'We generate inbound, answer it in minutes, and book the job so established trades keep the work they paid for.',
  'Showed jobs this month, not a lead count.',
  $lock${
    "icp": "Established shops that already buy inbound or need more of it, and lose the enquiry before it becomes a showed job.",
    "antiIcp": [
      "CPL buyer who will not change answering",
      "Empty diary with no spend and no inbound",
      "Sparkies commercial BD",
      "Full-stack ads + web as the product"
    ],
    "screen": [
      "Where do enquiries come from today (Google, LSA, Hipages, phone)?",
      "How fast do you call a new lead back?",
      "What happens when a call comes in while you are on a job?",
      "Will you leave routing and the calendar pointed at this path for 90 days?"
    ],
    "machine": {
      "capture": "Inbound booking: overflow voice, miss SMS, calendar, handoff rules.",
      "fill": "Lead gen only after capture is closed, or in the same install if they already spend and leak.",
      "convert": "Speed-to-lead in minutes on new enquiries. Same conversion job as capture."
    },
    "walk": [
      "Wants 40 leads and will not talk about missed inbound or callback lag",
      "Will not give number or calendar access",
      "Success metric is cheapest CPL"
    ]
  }$lock$::jsonb,
  now(),
  now()
)
ON CONFLICT (offer_key) DO UPDATE SET
  name = EXCLUDED.name,
  pack_summary = EXCLUDED.pack_summary,
  positioning_line = EXCLUDED.positioning_line,
  vertical_tags = EXCLUDED.vertical_tags,
  location_tags = EXCLUDED.location_tags,
  sort_order = EXCLUDED.sort_order,
  one_sentence = EXCLUDED.one_sentence,
  dream_outcome = EXCLUDED.dream_outcome,
  lock = EXCLUDED.lock,
  gtm_status = CASE
    WHEN public.compass_outbound_offers.gtm_status = 'live' THEN public.compass_outbound_offers.gtm_status
    ELSE EXCLUDED.gtm_status
  END,
  archived = CASE
    WHEN public.compass_outbound_offers.gtm_status = 'live' THEN false
    ELSE EXCLUDED.archived
  END,
  updated_at = now();
