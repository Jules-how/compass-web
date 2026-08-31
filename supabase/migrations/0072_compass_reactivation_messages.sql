-- Wave 5a: reactivation message log (outbound + inbound).

CREATE TABLE IF NOT EXISTS public.compass_reactivation_messages (
  id text PRIMARY KEY,
  contact_id text NOT NULL REFERENCES public.compass_reactivation_contacts(id) ON DELETE CASCADE,
  direction text NOT NULL,
  channel text NOT NULL,
  body text NOT NULL,
  template_id text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  twilio_sid text,
  status text NOT NULL DEFAULT 'sent'
);

COMMENT ON TABLE public.compass_reactivation_messages IS
  'SMS/email touch log for reactivation contacts. direction: outbound|inbound';
COMMENT ON COLUMN public.compass_reactivation_messages.status IS
  'sent|delivered|failed|received';

CREATE INDEX IF NOT EXISTS compass_reactivation_messages_contact_idx
  ON public.compass_reactivation_messages (contact_id, sent_at DESC);

ALTER TABLE public.compass_reactivation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_reactivation_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compass_reactivation_messages_operator_all ON public.compass_reactivation_messages;
CREATE POLICY compass_reactivation_messages_operator_all ON public.compass_reactivation_messages
  FOR ALL TO authenticated
  USING (portal_is_operator())
  WITH CHECK (portal_is_operator());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compass_reactivation_messages TO authenticated;
GRANT ALL ON public.compass_reactivation_messages TO service_role;
