-- A newly approved preparation may supersede reservations from the same campaign.
-- Old approvals, loads and receipt history remain intact; other campaigns stay blocked.
CREATE OR REPLACE FUNCTION public.outbound_reserve_load(p_id text,p_campaign_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b jsonb; k text; owner text; bound text; canonical_campaign text; old_campaign text; old_provider text; old_stamp timestamptz; new_stamp timestamptz;
BEGIN
  b := outbound_check_preparation(p_id,true);
  IF NOT EXISTS(SELECT 1 FROM compass_outbound_approvals WHERE preparation_id=p_id AND hash=b->>'hash') THEN RAISE EXCEPTION 'human_approval_required'; END IF;
  canonical_campaign := b->'context'->>'campaign_id';
  SELECT instantly_campaign_id INTO bound FROM compass_pipeline_campaigns WHERE id=canonical_campaign FOR UPDATE;
  IF bound IS DISTINCT FROM p_campaign_id THEN RAISE EXCEPTION 'campaign_binding_mismatch'; END IF;
  SELECT created_at INTO new_stamp FROM compass_outbound_preparations WHERE id=p_id;
  IF EXISTS(SELECT 1 FROM compass_outbound_loads WHERE preparation_id=p_id AND instantly_campaign_id<>p_campaign_id) THEN RAISE EXCEPTION 'load_binding_conflict'; END IF;
  FOR k IN SELECT DISTINCT key FROM jsonb_array_elements(b->'records') rec
    CROSS JOIN LATERAL unnest(ARRAY['company:'||(rec->'candidate'->>'company_id'),'email:'||lower(rec->'candidate'->>'email')]) key
    WHERE rec->>'status'='pass' ORDER BY key LOOP
      INSERT INTO compass_outbound_reservations(identity_key,preparation_id) VALUES(k,p_id) ON CONFLICT DO NOTHING;
      SELECT preparation_id INTO owner FROM compass_outbound_reservations WHERE identity_key=k FOR UPDATE;
      IF owner<>p_id THEN
        SELECT r.campaign_id,ld.instantly_campaign_id,p.created_at INTO old_campaign,old_provider,old_stamp
          FROM compass_outbound_preparations p JOIN compass_outbound_runs r ON r.id=p.run_id
          JOIN compass_outbound_loads ld ON ld.preparation_id=p.id WHERE p.id=owner;
        IF old_campaign IS DISTINCT FROM canonical_campaign OR old_provider IS DISTINCT FROM p_campaign_id
          OR (old_stamp,owner)>=(new_stamp,p_id) THEN RAISE EXCEPTION 'outreach_reserved_elsewhere'; END IF;
        INSERT INTO compass_outbound_receipt_history(preparation_id,receipt_hash,receipt)
          VALUES(p_id,md5('reservation_supersession:'||owner||':'||k),jsonb_build_object('event','reservation_supersession','identity_key',k,'previous_preparation_id',owner,'campaign_id',canonical_campaign,'instantly_campaign_id',p_campaign_id)) ON CONFLICT DO NOTHING;
        UPDATE compass_outbound_reservations SET preparation_id=p_id WHERE identity_key=k AND preparation_id=owner;
      END IF;
  END LOOP;
  INSERT INTO compass_outbound_loads(preparation_id,instantly_campaign_id) VALUES(p_id,p_campaign_id) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.outbound_reserve_load(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_reserve_load(text,text) TO service_role;
