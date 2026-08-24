-- No standing default structure or CTA. Picker only.

UPDATE public.compass_outbound_structures
SET is_default_candidate = false,
    updated_at = now()
WHERE is_default_candidate = true;

UPDATE public.compass_outbound_ctas
SET is_default = false,
    updated_at = now()
WHERE is_default = true;

UPDATE public.compass_outbound_ctas
SET archived = true,
    updated_at = now()
WHERE id = 'cta-timed-call'
  AND archived = false;
