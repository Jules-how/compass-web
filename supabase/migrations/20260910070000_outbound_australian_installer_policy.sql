-- Versioned current ICP. Legacy frozen preparations retain their rules.
CREATE OR REPLACE FUNCTION public.outbound_check_preparation(p_id text,p_allow_loaded boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p compass_outbound_preparations; r compass_outbound_runs; rec jsonb; l public.lead_contacts; c compass_pipeline_campaigns; o compass_outbound_offers; cfg compass_outbound_configs; current_policy boolean; reviewed_uncontacted boolean;
BEGIN
  SELECT * INTO p FROM compass_outbound_preparations WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'preparation_not_found'; END IF;
  -- Lock the inputs before the run, consistently with input updates and invalidation.
  SELECT * INTO c FROM compass_pipeline_campaigns WHERE id=p.bundle->'context'->>'campaign_id' FOR UPDATE;
  SELECT * INTO o FROM compass_outbound_offers WHERE offer_key=c.offer_key FOR SHARE;
  SELECT * INTO cfg FROM compass_outbound_configs WHERE campaign_id=c.id FOR SHARE;
  IF c.sequence_draft IS DISTINCT FROM p.bundle->'context'->'sequence'
    OR to_jsonb(c.vertical_tags) IS DISTINCT FROM jsonb_build_array(p.bundle->'context'->>'vertical')
    OR to_jsonb(c.location_tags) IS DISTINCT FROM jsonb_build_array(p.bundle->'context'->>'city')
    OR cfg.recipe IS DISTINCT FROM p.bundle->'context'->'recipe'
    OR cfg.settings IS DISTINCT FROM p.bundle->'context'->'settings'
    OR jsonb_build_object('offer_key',o.offer_key,'lock',o.lock,'gtm_status',o.gtm_status,'archived',o.archived) IS DISTINCT FROM p.bundle->'context'->'offer'
    OR c.status IN ('cancelled','completed','archived') THEN RAISE EXCEPTION 'preparation_stale'; END IF;
  SELECT * INTO r FROM compass_outbound_runs WHERE id=p.run_id FOR UPDATE;
  IF r.status<>'ready' OR r.candidates_hash<>p.input_hash OR r.context_hash<>p.context_hash THEN RAISE EXCEPTION 'preparation_stale'; END IF;
  IF EXISTS(SELECT 1 FROM compass_outbound_loads ld WHERE ld.preparation_id=p_id AND ld.instantly_campaign_id IS DISTINCT FROM c.instantly_campaign_id) THEN RAISE EXCEPTION 'load_binding_conflict'; END IF;
  IF (p.bundle->'counts'->>'pass')::int<1 THEN RAISE EXCEPTION 'no_eligible_recipients'; END IF;
  current_policy := coalesce(p.bundle->'context'->'recipe'->>'mode','template')='evidence_draft';
  FOR rec IN SELECT value FROM jsonb_array_elements(p.bundle->'records') WHERE value->>'status'='pass' ORDER BY value->'candidate'->>'lead_id' LOOP
    SELECT * INTO l FROM lead_contacts WHERE id=rec->'candidate'->>'lead_id' FOR UPDATE;
    IF NOT FOUND OR lower(l.email) IS DISTINCT FROM lower(rec->'candidate'->>'email') OR lower(l.company) IS DISTINCT FROM lower(rec->'candidate'->>'company') OR l.is_archived OR l.recontact_ok=0 OR coalesce(l.suppression_reason,'')<>'' OR l.icp_status='skip' THEN RAISE EXCEPTION 'lead_eligibility_changed'; END IF;
    reviewed_uncontacted := current_policy AND rec->'candidate'->'outreach_review'->>'status'='uncontacted'
      AND length(coalesce(rec->'candidate'->'outreach_review'->>'source',''))>0
      AND (rec->'candidate'->'outreach_review'->>'checked_at')::timestamptz BETWEEN now()-interval '1 day' AND now()+interval '1 minute';
    IF l.outbound_status IS DISTINCT FROM 'uncontacted' AND NOT (coalesce(reviewed_uncontacted,false) AND l.outbound_status IN ('in_instantly','ready','none')) AND NOT (p_allow_loaded AND l.outbound_status='in_instantly' AND EXISTS(SELECT 1 FROM compass_outbound_loads ld WHERE ld.preparation_id=p_id AND ld.instantly_campaign_id=l.instantly_campaign_id)) THEN RAISE EXCEPTION 'outreach_state_changed'; END IF;
    IF NOT coalesce(reviewed_uncontacted,false) AND l.pipeline_campaign_id IS NOT NULL AND l.pipeline_campaign_id<>r.campaign_id THEN RAISE EXCEPTION 'cohort_changed'; END IF;
    IF EXISTS(SELECT 1 FROM lead_contacts other WHERE other.id<>l.id AND (lower(other.email)=lower(l.email) OR (NOT current_policy AND coalesce(l.company_domain,'')<>'' AND lower(other.company_domain)=lower(l.company_domain)))) THEN RAISE EXCEPTION 'company_overlap_requires_review'; END IF;
  END LOOP;
  RETURN p.bundle;
END $$;
