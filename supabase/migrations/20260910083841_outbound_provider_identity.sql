-- Keep provider identity and campaign bindings within the same ordered write.
CREATE OR REPLACE FUNCTION public.compass_outbound_provider_event(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l lead_contacts; at timestamptz:=(p->>'at')::timestamptz; s text:=p->>'status'; latest boolean; old_rank int; new_rank int;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service_required'; END IF;
 SELECT * INTO l FROM lead_contacts WHERE id=p->>'lead_id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
 IF EXISTS(SELECT 1 FROM lead_outreach_touches WHERE id=p->>'id') THEN RETURN jsonb_build_object('replayed',true,'status',l.outbound_status); END IF;
 INSERT INTO lead_outreach_touches(id,contact_id,contacted_at,channel,direction,outcome,note,source,external_event_id,instantly_campaign_id)
 VALUES(p->>'id',l.id,at,'email',CASE WHEN p->>'event'='email_sent' THEN 'outbound' ELSE 'inbound' END,p->>'event',p->>'note','instantly_webhook',p->>'id',p->>'campaign_id');
 IF p->>'event'='email_sent' THEN UPDATE lead_contacts SET last_outbound_at=greatest(last_outbound_at,at) WHERE id=l.id; END IF;
 latest := l.instantly_event_at IS NULL OR at>=l.instantly_event_at;
 old_rank := CASE l.outbound_status WHEN 'converted' THEN 6 WHEN 'meeting_booked' THEN 5 WHEN 'interested' THEN 4 WHEN 'replied' THEN 3 WHEN 'out_of_office' THEN 2 ELSE 0 END;
 new_rank := CASE s WHEN 'converted' THEN 6 WHEN 'meeting_booked' THEN 5 WHEN 'interested' THEN 4 WHEN 'replied' THEN 3 WHEN 'out_of_office' THEN 2 ELSE 0 END;
 IF latest THEN
  UPDATE lead_contacts SET instantly_event_at=at,instantly_synced_at=now(),updated_at=now(),
    instantly_lead_id=coalesce(nullif(p->>'provider_lead_id',''),instantly_lead_id),
    instantly_campaign_id=coalesce(nullif(p->>'campaign_id',''),instantly_campaign_id),
    instantly_campaign=coalesce(nullif(p->>'campaign_name',''),instantly_campaign),
    instantly_campaign_name=coalesce(nullif(p->>'campaign_name',''),instantly_campaign_name),
    lead_status_source='instantly_webhook',
    last_outbound_at=CASE WHEN p->>'event'='email_sent' THEN greatest(last_outbound_at,at) ELSE last_outbound_at END,
    outbound_status=CASE WHEN l.outbound_status IN ('suppressed','unsubscribed','dead') THEN l.outbound_status WHEN s='suppressed' OR new_rank>=old_rank OR s IN ('not_interested','wrong_person') THEN s ELSE l.outbound_status END,
    interest_label=CASE WHEN new_rank>=old_rank THEN coalesce(p->>'interest_label',interest_label) ELSE interest_label END,
    suppression_reason=CASE WHEN s='suppressed' THEN p->>'suppression_reason' ELSE suppression_reason END,
    recontact_ok=CASE WHEN s='suppressed' THEN 0 ELSE recontact_ok END,
    pipeline_stage=CASE WHEN new_rank>=old_rank THEN coalesce(p->>'pipeline_stage',pipeline_stage) ELSE pipeline_stage END
  WHERE id=l.id;
 END IF;
 -- A late unsubscribe must still be honoured even when an older send arrived first.
 IF p->>'event'='lead_unsubscribed' THEN UPDATE lead_contacts SET outbound_status='suppressed',recontact_ok=0,suppression_reason='instantly_unsubscribed' WHERE id=l.id; END IF;
 SELECT * INTO l FROM lead_contacts WHERE id=l.id;
 RETURN jsonb_build_object('replayed',false,'stale',NOT latest,'status',l.outbound_status);
END $$;
REVOKE ALL ON FUNCTION public.compass_outbound_provider_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_outbound_provider_event(jsonb) TO service_role;
