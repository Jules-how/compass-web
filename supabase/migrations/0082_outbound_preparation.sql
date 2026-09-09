-- First outbound slice: immutable input/output, human approval and atomic reservations.
CREATE TABLE public.compass_outbound_companies (
  id text PRIMARY KEY, identity_key text NOT NULL UNIQUE, name text NOT NULL,
  website text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compass_outbound_configs (
  campaign_id text PRIMARY KEY REFERENCES public.compass_pipeline_campaigns(id),
  recipe jsonb NOT NULL, settings jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compass_outbound_runs (
  id text PRIMARY KEY, campaign_id text NOT NULL REFERENCES public.compass_pipeline_campaigns(id),
  source_hash text NOT NULL, artifact_path text NOT NULL, source_rows jsonb NOT NULL,
  candidates jsonb NOT NULL, candidates_hash text NOT NULL, context jsonb NOT NULL, context_hash text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','stale')),
  lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, source_hash, context_hash)
);
CREATE TABLE public.compass_outbound_preparations (
  id text PRIMARY KEY, run_id text NOT NULL REFERENCES public.compass_outbound_runs(id),
  hash text NOT NULL, input_hash text NOT NULL, context_hash text NOT NULL,
  bundle jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(run_id, hash)
);
CREATE TABLE public.compass_outbound_approvals (
  preparation_id text PRIMARY KEY REFERENCES public.compass_outbound_preparations(id),
  hash text NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compass_outbound_loads (
  preparation_id text PRIMARY KEY REFERENCES public.compass_outbound_preparations(id),
  instantly_campaign_id text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','partial','complete','conflict')),
  receipts jsonb NOT NULL DEFAULT '[]', snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compass_outbound_reservations (
  identity_key text PRIMARY KEY,
  preparation_id text NOT NULL REFERENCES public.compass_outbound_preparations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compass_outbound_receipt_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  preparation_id text NOT NULL REFERENCES public.compass_outbound_preparations(id),
  receipt_hash text NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(preparation_id, receipt_hash)
);
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['compass_outbound_companies','compass_outbound_configs','compass_outbound_runs','compass_outbound_preparations','compass_outbound_approvals','compass_outbound_loads','compass_outbound_reservations','compass_outbound_receipt_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tab);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated', tab);
    EXECUTE format('CREATE POLICY operator_read ON public.%I FOR SELECT TO authenticated USING (public.portal_is_operator())', tab);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tab);
  END LOOP;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('outbound-artifacts','outbound-artifacts',false,8388608,ARRAY['application/json','text/csv'])
ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.outbound_claim_run(p_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r compass_outbound_runs;
BEGIN
  SELECT * INTO r FROM compass_outbound_runs WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF r.status='stale' THEN RAISE EXCEPTION 'run_stale'; END IF;
  IF r.status='ready' THEN RETURN jsonb_build_object('status','ready'); END IF;
  IF r.lease_until > now() THEN RAISE EXCEPTION 'run_leased'; END IF;
  UPDATE compass_outbound_runs SET status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,error=null,updated_at=now() WHERE id=p_id RETURNING * INTO r;
  RETURN to_jsonb(r)-'source_rows';
END $$;
CREATE FUNCTION public.outbound_complete_run(p_id text,p_token uuid,p_preparation jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r compass_outbound_runs; pid text := p_preparation->>'id';
BEGIN
  SELECT * INTO r FROM compass_outbound_runs WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF EXISTS(SELECT 1 FROM compass_outbound_preparations WHERE id=pid AND run_id=p_id AND hash=p_preparation->>'hash') THEN RETURN pid; END IF;
  IF r.status<>'running' OR r.lease_token IS DISTINCT FROM p_token OR r.lease_until<=now() THEN RAISE EXCEPTION 'stale_attempt'; END IF;
  IF r.candidates_hash<>p_preparation->>'input_hash' OR r.context_hash<>p_preparation->>'context_hash' THEN RAISE EXCEPTION 'input_changed'; END IF;
  INSERT INTO compass_outbound_preparations(id,run_id,hash,input_hash,context_hash,bundle)
  VALUES(pid,p_id,p_preparation->>'hash',r.candidates_hash,r.context_hash,p_preparation->'bundle');
  UPDATE compass_outbound_runs SET status='ready',lease_until=null,updated_at=now() WHERE id=p_id;
  RETURN pid;
END $$;
CREATE FUNCTION public.outbound_check_preparation(p_id text,p_allow_loaded boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p compass_outbound_preparations; r compass_outbound_runs; rec jsonb; l public.lead_contacts; c compass_pipeline_campaigns; o compass_outbound_offers; cfg compass_outbound_configs;
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
  FOR rec IN SELECT value FROM jsonb_array_elements(p.bundle->'records') WHERE value->>'status'='pass' ORDER BY value->'candidate'->>'lead_id' LOOP
    SELECT * INTO l FROM lead_contacts WHERE id=rec->'candidate'->>'lead_id' FOR UPDATE;
    IF NOT FOUND OR lower(l.email) IS DISTINCT FROM lower(rec->'candidate'->>'email') OR lower(l.company) IS DISTINCT FROM lower(rec->'candidate'->>'company') OR l.is_archived OR l.recontact_ok=0 OR coalesce(l.suppression_reason,'')<>'' OR l.icp_status='skip' THEN RAISE EXCEPTION 'lead_eligibility_changed'; END IF;
    IF l.outbound_status IS DISTINCT FROM 'uncontacted' AND NOT (p_allow_loaded AND l.outbound_status='in_instantly' AND EXISTS(SELECT 1 FROM compass_outbound_loads ld WHERE ld.preparation_id=p_id AND ld.instantly_campaign_id=l.instantly_campaign_id)) THEN RAISE EXCEPTION 'outreach_state_changed'; END IF;
    IF l.pipeline_campaign_id IS NOT NULL AND l.pipeline_campaign_id<>r.campaign_id THEN RAISE EXCEPTION 'cohort_changed'; END IF;
    IF EXISTS(SELECT 1 FROM lead_contacts other WHERE other.id<>l.id AND (lower(other.email)=lower(l.email) OR (coalesce(l.company_domain,'')<>'' AND lower(other.company_domain)=lower(l.company_domain)))) THEN RAISE EXCEPTION 'company_overlap_requires_review'; END IF;
  END LOOP;
  RETURN p.bundle;
END $$;
CREATE FUNCTION public.outbound_approve_preparation(p_id text,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.portal_is_operator() THEN RAISE EXCEPTION 'operator_required'; END IF;
  b := outbound_check_preparation(p_id);
  IF b->>'hash'<>p_hash THEN RAISE EXCEPTION 'version_conflict'; END IF;
  INSERT INTO compass_outbound_approvals(preparation_id,hash,actor_id) VALUES(p_id,p_hash,auth.uid()) ON CONFLICT(preparation_id) DO NOTHING;
END $$;
CREATE FUNCTION public.outbound_reserve_load(p_id text,p_campaign_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b jsonb; k text; owner text; bound text;
BEGIN
  b := outbound_check_preparation(p_id,true);
  IF NOT EXISTS(SELECT 1 FROM compass_outbound_approvals WHERE preparation_id=p_id AND hash=b->>'hash') THEN RAISE EXCEPTION 'human_approval_required'; END IF;
  SELECT instantly_campaign_id INTO bound FROM compass_pipeline_campaigns WHERE id=b->'context'->>'campaign_id';
  IF bound IS DISTINCT FROM p_campaign_id THEN RAISE EXCEPTION 'campaign_binding_mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM compass_outbound_loads WHERE preparation_id=p_id AND instantly_campaign_id<>p_campaign_id) THEN RAISE EXCEPTION 'load_binding_conflict'; END IF;
  FOR k IN SELECT DISTINCT key FROM jsonb_array_elements(b->'records') rec
    CROSS JOIN LATERAL unnest(ARRAY['company:'||(rec->'candidate'->>'company_id'),'email:'||lower(rec->'candidate'->>'email')]) key
    WHERE rec->>'status'='pass' ORDER BY key LOOP
      INSERT INTO compass_outbound_reservations(identity_key,preparation_id) VALUES(k,p_id) ON CONFLICT DO NOTHING;
      SELECT preparation_id INTO owner FROM compass_outbound_reservations WHERE identity_key=k;
      IF owner<>p_id THEN RAISE EXCEPTION 'outreach_reserved_elsewhere'; END IF;
  END LOOP;
  INSERT INTO compass_outbound_loads(preparation_id,instantly_campaign_id) VALUES(p_id,p_campaign_id) ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION public.outbound_record_receipt(p_id text,p_hash text,p_receipt jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ld compass_outbound_loads; rec jsonb; b jsonb;
BEGIN
  b := outbound_check_preparation(p_id,true);
  SELECT * INTO ld FROM compass_outbound_loads WHERE preparation_id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'load_not_reserved'; END IF;
  IF EXISTS(SELECT 1 FROM compass_outbound_receipt_history WHERE preparation_id=p_id AND receipt_hash=p_hash) THEN RETURN; END IF;
  INSERT INTO compass_outbound_receipt_history(preparation_id,receipt_hash,receipt) VALUES(p_id,p_hash,p_receipt);
  FOR rec IN SELECT value FROM jsonb_array_elements(p_receipt->'receipts') WHERE value->>'status'='confirmed' LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(b->'records') x WHERE x->>'status'='pass' AND x->'candidate'->>'lead_id'=rec->>'lead_id' AND lower(x->'candidate'->>'email')=lower(rec->>'email')) THEN RAISE EXCEPTION 'recipient_not_approved'; END IF;
    IF coalesce(rec->>'provider_id','')='' THEN RAISE EXCEPTION 'provider_id_required'; END IF;
    UPDATE lead_contacts SET instantly_campaign_id=ld.instantly_campaign_id,instantly_lead_id=rec->>'provider_id',outbound_status='in_instantly',enrich_status='uploaded',updated_at=now()
    WHERE id=rec->>'lead_id' AND outbound_status IN ('uncontacted','in_instantly');
  END LOOP;
  UPDATE compass_outbound_loads SET status=CASE WHEN (p_receipt->>'complete')::boolean
    AND jsonb_array_length(coalesce(p_receipt->'extras','[]'))=0
    AND (SELECT count(DISTINCT x->>'lead_id') FROM jsonb_array_elements(p_receipt->'receipts') x WHERE x->>'status'='confirmed')=(b->'counts'->>'pass')::int
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_receipt->'receipts') x WHERE x->>'status' IS DISTINCT FROM 'confirmed')
    THEN 'complete' ELSE 'partial' END,receipts=p_receipt->'receipts',snapshot=p_receipt,updated_at=now() WHERE preparation_id=p_id;
END $$;
CREATE FUNCTION public.outbound_invalidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='compass_pipeline_campaigns' THEN
    IF (NEW.offer_key,NEW.sequence_draft,NEW.vertical_tags,NEW.location_tags,NEW.status) IS DISTINCT FROM (OLD.offer_key,OLD.sequence_draft,OLD.vertical_tags,OLD.location_tags,OLD.status) THEN
      UPDATE compass_outbound_runs SET status='stale',lease_until=null WHERE campaign_id=NEW.id AND status<>'stale';
    END IF;
  ELSIF TG_TABLE_NAME='compass_outbound_configs' THEN
    UPDATE compass_outbound_runs SET status='stale',lease_until=null WHERE campaign_id=NEW.campaign_id AND status<>'stale';
  ELSE
    UPDATE compass_outbound_runs SET status='stale',lease_until=null WHERE campaign_id IN (SELECT id FROM compass_pipeline_campaigns WHERE offer_key=NEW.offer_key) AND status<>'stale';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER outbound_campaign_changed AFTER UPDATE ON compass_pipeline_campaigns FOR EACH ROW EXECUTE FUNCTION outbound_invalidate();
CREATE TRIGGER outbound_config_changed AFTER UPDATE ON compass_outbound_configs FOR EACH ROW EXECUTE FUNCTION outbound_invalidate();
CREATE TRIGGER outbound_offer_changed AFTER UPDATE OF lock,gtm_status,archived ON compass_outbound_offers FOR EACH ROW EXECUTE FUNCTION outbound_invalidate();
REVOKE ALL ON FUNCTION outbound_claim_run(text),outbound_complete_run(text,uuid,jsonb),outbound_check_preparation(text,boolean),outbound_approve_preparation(text,text),outbound_reserve_load(text,text),outbound_record_receipt(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION outbound_claim_run(text),outbound_complete_run(text,uuid,jsonb),outbound_check_preparation(text,boolean),outbound_reserve_load(text,text),outbound_record_receipt(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION outbound_approve_preparation(text,text) TO authenticated;

CREATE FUNCTION public.outbound_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME='compass_outbound_runs' AND TG_OP='UPDATE' THEN
    IF (NEW.campaign_id,NEW.source_hash,NEW.artifact_path,NEW.source_rows,NEW.candidates,NEW.candidates_hash,NEW.context,NEW.context_hash)
      IS NOT DISTINCT FROM (OLD.campaign_id,OLD.source_hash,OLD.artifact_path,OLD.source_rows,OLD.candidates,OLD.candidates_hash,OLD.context,OLD.context_hash) THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'immutable_outbound_record';
END $$;
CREATE TRIGGER outbound_source_immutable BEFORE UPDATE OR DELETE ON compass_outbound_runs FOR EACH ROW EXECUTE FUNCTION outbound_immutable();
CREATE TRIGGER outbound_output_immutable BEFORE UPDATE OR DELETE ON compass_outbound_preparations FOR EACH ROW EXECUTE FUNCTION outbound_immutable();
CREATE TRIGGER outbound_approval_immutable BEFORE UPDATE OR DELETE ON compass_outbound_approvals FOR EACH ROW EXECUTE FUNCTION outbound_immutable();
CREATE TRIGGER outbound_receipt_immutable BEFORE UPDATE OR DELETE ON compass_outbound_receipt_history FOR EACH ROW EXECUTE FUNCTION outbound_immutable();
