-- One canonical preparation identity owns every artifact chunk and reservation.
CREATE TABLE public.outbound_pipeline_delivery_manifests (
 id text PRIMARY KEY,list_id text NOT NULL REFERENCES public.compass_lead_lists(id),campaign_id text NOT NULL REFERENCES public.compass_pipeline_campaigns(id),
 workflow_version_id text NOT NULL REFERENCES public.outbound_pipeline_workflows(id),template_version_id text NOT NULL REFERENCES public.outbound_pipeline_templates(id),verification_run_id text REFERENCES public.outbound_pipeline_runs(id),
 context jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'building' CHECK(status IN('building','review','reserved','checking','complete','attention')),
 total_count integer NOT NULL DEFAULT 0,pass_count integer NOT NULL DEFAULT 0,hold_count integer NOT NULL DEFAULT 0,hash text,actor text NOT NULL,source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.outbound_pipeline_delivery_items (
 id text PRIMARY KEY,manifest_id text NOT NULL REFERENCES public.outbound_pipeline_delivery_manifests(id),recipient_id text NOT NULL REFERENCES public.outbound_pipeline_recipients(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','pass','hold')),snapshot jsonb NOT NULL,record jsonb,UNIQUE(manifest_id,recipient_id)
);
CREATE INDEX pipeline_delivery_items_page ON public.outbound_pipeline_delivery_items(manifest_id,status,id);
DO $$ DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['outbound_pipeline_delivery_manifests','outbound_pipeline_delivery_items'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('CREATE POLICY pipeline_delivery_operator ON public.%I FOR SELECT TO authenticated USING(public.portal_is_operator())',tab);
 END LOOP;
END $$;
CREATE FUNCTION public.outbound_pipeline_delivery_create(p_command jsonb,p_hash text,p_actor text,p_context jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d jsonb:=p_command->'data';m outbound_pipeline_delivery_manifests;saved record;receipt jsonb;policy jsonb;filters jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';END IF;RETURN saved.receipt;END IF;
 IF (p_command->>'expected_revision')::integer<>0 THEN RAISE EXCEPTION 'pipeline_revision_conflict';END IF;
 SELECT w.policy INTO policy FROM outbound_pipeline_workflows w JOIN compass_lead_lists l ON l.workflow_version_id=w.id WHERE l.id=d->>'list_id' AND w.id=d->>'workflow_version_id';
 IF policy IS NULL OR NOT EXISTS(SELECT 1 FROM compass_pipeline_campaigns WHERE id=d->>'campaign_id' AND offer_revision_id=policy->>'offer_version_id' AND status NOT IN('cancelled','completed','archived')) THEN RAISE EXCEPTION 'pipeline_campaign_offer_mismatch';END IF;
 IF NOT EXISTS(SELECT 1 FROM compass_outbound_configs cfg JOIN compass_pipeline_campaigns c ON c.id=cfg.campaign_id WHERE c.id=d->>'campaign_id' AND cfg.settings=p_context->'settings' AND cfg.recipe=p_context->'recipe' AND c.sequence_draft=coalesce(p_context#>'{pipeline,source_sequence}',p_context->'sequence')) THEN RAISE EXCEPTION 'pipeline_campaign_context_changed';END IF;
 INSERT INTO outbound_pipeline_delivery_manifests(id,list_id,campaign_id,workflow_version_id,template_version_id,verification_run_id,context,actor,source)
 VALUES(p_command->>'manifest_id',d->>'list_id',d->>'campaign_id',d->>'workflow_version_id',d->>'template_version_id',d->>'verification_run_id',p_context,p_actor,p_command->>'source') RETURNING * INTO m;
 filters:=coalesce(d->'filters','{}')||jsonb_build_object('list_id',m.list_id);
 INSERT INTO outbound_pipeline_delivery_items(id,manifest_id,recipient_id,snapshot)
 SELECT gen_random_uuid()::text,m.id,r.id,jsonb_build_object('recipient',to_jsonb(r),'company',to_jsonb(c),'draft',to_jsonb(dr),'verification',to_jsonb(v),'input_revision',c.input_revision,
 'lead',CASE WHEN lc.id IS NULL THEN NULL ELSE jsonb_build_object('id',lc.id,'email',lc.email,'company',lc.company,'outbound_status',lc.outbound_status,'suppression_reason',lc.suppression_reason,'updated_at',lc.updated_at) END,
 'reasons',to_jsonb(array_remove(ARRAY[
 CASE WHEN c.fit NOT IN('likely_fit','sure_fit') AND NOT c.eligibility_override THEN 'company_fit_required' END,
 CASE WHEN NOT r.suitable OR NOT outbound_pipeline_candidate_suitable(r.candidate_id,m.workflow_version_id) THEN 'suitable_attributed_contact_required' END,
 CASE WHEN r.suppressed THEN 'suppressed' END,
 CASE WHEN dr.id IS NULL OR dr.template_version_id<>m.template_version_id THEN 'selected_template_draft_required' END,
 CASE WHEN v.id IS NULL OR v.attempt_state<>'completed' OR v.mailbox_result IS DISTINCT FROM 'valid' THEN 'current_valid_verification_required' END,
 CASE WHEN (policy#>>'{verification,reuse_days}')::integer>0 AND v.checked_at<now()-make_interval(days=>(policy#>>'{verification,reuse_days}')::integer) THEN 'verification_stale' END,
 CASE WHEN (policy#>>'{verification,reuse_days}')::integer=0 AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_runs vr JOIN outbound_pipeline_items vi ON vi.run_id=vr.id WHERE vr.id=m.verification_run_id AND vr.list_id=m.list_id AND vr.workflow_version_id=m.workflow_version_id AND vr.status='completed' AND vr.stage='verify' AND vi.recipient_id=r.id AND vi.status='completed' AND vi.result->'verification_ids'?v.id) THEN 'verification_run_required' END,
 CASE WHEN lc.id IS NULL THEN 'outreach_history_unresolved' WHEN lc.outbound_status IS DISTINCT FROM 'uncontacted' THEN 'actual_outreach_history_review_required' END,
 CASE WHEN lc.is_archived OR lc.recontact_ok=0 OR coalesce(lc.suppression_reason,'')<>'' THEN 'legacy_suppression' END
 ],NULL)))
 FROM outbound_pipeline_recipients(filters) r JOIN outbound_pipeline_companies(filters-'q')c ON c.id=r.company_id
 LEFT JOIN outbound_pipeline_drafts dr ON dr.id=r.current_draft_id
 LEFT JOIN LATERAL(SELECT v.* FROM crm_verification_events v WHERE v.method_id=r.method_id ORDER BY v.checked_at DESC NULLS LAST,v.created_at DESC,v.id DESC LIMIT 1)v ON true
 LEFT JOIN LATERAL(SELECT lc.* FROM lead_contacts lc JOIN crm_lead_links link ON link.lead_id=lc.id AND link.match_state='confirmed' WHERE link.company_id=r.company_id AND lower(trim(lc.email))=r.mailbox ORDER BY lc.id LIMIT 1)lc ON true
 WHERE r.list_id=m.list_id AND (NOT d?'recipient_ids' OR d->'recipient_ids'?r.id);
 UPDATE outbound_pipeline_delivery_manifests SET total_count=(SELECT count(*) FROM outbound_pipeline_delivery_items WHERE manifest_id=m.id) WHERE id=m.id RETURNING * INTO m;
 IF m.total_count=0 THEN RAISE EXCEPTION 'pipeline_empty_preparation_scope';END IF;
 IF EXISTS(SELECT 1 FROM outbound_pipeline_runs prior JOIN outbound_pipeline_items i ON i.run_id=prior.id JOIN outbound_pipeline_delivery_items chosen ON chosen.manifest_id=m.id AND chosen.snapshot#>>'{recipient,company_id}'=i.company_id WHERE prior.list_id=m.list_id AND prior.workflow_version_id=m.workflow_version_id AND prior.status='checkpoint') THEN RAISE EXCEPTION 'pipeline_upstream_checkpoint_required';END IF;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','manifest',to_jsonb(m));
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',receipt,now());RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_delivery_create(jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_delivery_create(jsonb,text,text,jsonb) TO service_role;
CREATE FUNCTION public.outbound_pipeline_delivery_commit(p_command jsonb,p_hash text,p_actor text,p_records jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE m outbound_pipeline_delivery_manifests;item outbound_pipeline_delivery_items;entry jsonb;saved record;receipt jsonb;fingerprint text;bundle jsonb;runid text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';END IF;RETURN saved.receipt;END IF;
 SELECT * INTO m FROM outbound_pipeline_delivery_manifests WHERE id=p_command->>'manifest_id' FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'pipeline_not_found';END IF;
 IF m.revision<>(p_command->>'expected_revision')::integer THEN RAISE EXCEPTION 'pipeline_revision_conflict';END IF;
 IF m.status<>'building' OR jsonb_array_length(p_records) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'pipeline_invalid_delivery_chunk';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_records) LOOP
  SELECT * INTO item FROM outbound_pipeline_delivery_items WHERE id=entry->>'item_id' AND manifest_id=m.id FOR UPDATE;
  IF item.id IS NULL OR item.status<>'queued' OR entry#>>'{record,status}' NOT IN('pass','hold') OR entry#>>'{record,candidate,id}'<>item.recipient_id OR entry#>>'{record,candidate,company_id}' IS DISTINCT FROM item.snapshot#>>'{recipient,company_id}' OR entry#>>'{record,candidate,email}' IS DISTINCT FROM item.snapshot#>>'{recipient,mailbox}' THEN RAISE EXCEPTION 'pipeline_delivery_item_conflict';END IF;
  IF entry#>>'{record,status}'='pass' AND jsonb_array_length(item.snapshot->'reasons')>0 THEN RAISE EXCEPTION 'pipeline_delivery_gate_bypass';END IF;
  UPDATE outbound_pipeline_delivery_items SET status=entry#>>'{record,status}',record=entry->'record' WHERE id=item.id;
 END LOOP;
 UPDATE outbound_pipeline_delivery_manifests SET revision=revision+1,updated_at=now(),pass_count=(SELECT count(*) FROM outbound_pipeline_delivery_items WHERE manifest_id=m.id AND status='pass'),hold_count=(SELECT count(*) FROM outbound_pipeline_delivery_items WHERE manifest_id=m.id AND status='hold') WHERE id=m.id RETURNING * INTO m;
 IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_delivery_items WHERE manifest_id=m.id AND status='queued') THEN
  SELECT encode(sha256(convert_to(string_agg(snapshot::text||record::text,'|' ORDER BY id),'UTF8')),'hex') INTO fingerprint FROM outbound_pipeline_delivery_items WHERE manifest_id=m.id;
  bundle:=jsonb_build_object('schema_version','outbound.preparation.v1','context',m.context,'input_hash',fingerprint,'records','[]'::jsonb,'counts',jsonb_build_object('total',m.total_count,'pass',m.pass_count,'hold',m.hold_count,'exclude',0));
  fingerprint:=encode(sha256(convert_to(bundle::text,'UTF8')),'hex');bundle:=bundle||jsonb_build_object('hash',fingerprint);runid:='pipeline-run:'||m.id;
  INSERT INTO compass_outbound_runs(id,campaign_id,source_hash,artifact_path,source_rows,candidates,candidates_hash,context,context_hash,status) VALUES(runid,m.campaign_id,fingerprint,'pipeline-manifest:'||m.id,'[]','[]',bundle->>'input_hash',m.context,encode(sha256(convert_to(m.context::text,'UTF8')),'hex'),'ready');
  INSERT INTO compass_outbound_preparations(id,run_id,hash,input_hash,context_hash,bundle) VALUES(m.id,runid,fingerprint,bundle->>'input_hash',encode(sha256(convert_to(m.context::text,'UTF8')),'hex'),bundle);
  UPDATE outbound_pipeline_delivery_manifests SET hash=fingerprint,status=CASE WHEN pass_count>0 THEN 'review' ELSE 'attention' END WHERE id=m.id RETURNING * INTO m;
 END IF;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','manifest',to_jsonb(m));
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',receipt,now());RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_delivery_commit(jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_delivery_commit(jsonb,text,text,jsonb) TO service_role;

-- Preserve every legacy check; only canonical manifests enter the new branch.
ALTER FUNCTION public.outbound_check_preparation(text,boolean) RENAME TO outbound_check_legacy_preparation;
CREATE FUNCTION public.outbound_check_preparation(p_id text,p_allow_loaded boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m outbound_pipeline_delivery_manifests;p compass_outbound_preparations;c compass_pipeline_campaigns;cfg compass_outbound_configs;item outbound_pipeline_delivery_items;r outbound_pipeline_recipients;v crm_verification_events;lead lead_contacts;
BEGIN
 SELECT * INTO m FROM outbound_pipeline_delivery_manifests WHERE id=p_id;
 IF NOT FOUND THEN RETURN outbound_check_legacy_preparation(p_id,p_allow_loaded);END IF;
 SELECT * INTO p FROM compass_outbound_preparations WHERE id=p_id;
 IF p.id IS NULL OR m.hash IS DISTINCT FROM p.hash OR m.pass_count<1 THEN RAISE EXCEPTION 'pipeline_preparation_not_ready';END IF;
 SELECT * INTO c FROM compass_pipeline_campaigns WHERE id=m.campaign_id FOR UPDATE;
 SELECT * INTO cfg FROM compass_outbound_configs WHERE campaign_id=m.campaign_id FOR SHARE;
 IF c.status IN('cancelled','completed','archived') OR c.sequence_draft IS DISTINCT FROM coalesce(m.context#>'{pipeline,source_sequence}',m.context->'sequence') OR cfg.settings IS DISTINCT FROM m.context->'settings' OR cfg.recipe IS DISTINCT FROM m.context->'recipe' OR c.offer_revision_id IS DISTINCT FROM m.context->>'offer_revision_id' THEN RAISE EXCEPTION 'preparation_stale';END IF;
 IF NOT EXISTS(SELECT 1 FROM compass_lead_lists WHERE id=m.list_id AND workflow_version_id=m.workflow_version_id) THEN RAISE EXCEPTION 'pipeline_workflow_changed';END IF;
 FOR item IN SELECT * FROM outbound_pipeline_delivery_items WHERE manifest_id=m.id AND status='pass' ORDER BY recipient_id LOOP
  SELECT * INTO r FROM outbound_pipeline_recipients WHERE id=item.recipient_id;
  IF r.mailbox IS DISTINCT FROM item.snapshot#>>'{recipient,mailbox}' OR NOT r.suitable OR NOT outbound_pipeline_candidate_suitable(r.candidate_id,m.workflow_version_id) OR outbound_pipeline_company_suppressed(r.company_id) OR outbound_pipeline_input_revision(r.company_id)<>(item.snapshot->>'input_revision')::integer THEN RAISE EXCEPTION 'pipeline_recipient_inputs_changed';END IF;
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts d WHERE d.id=item.snapshot#>>'{draft,id}' AND d.recipient_id=r.id AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts n WHERE n.previous_id=d.id)) THEN RAISE EXCEPTION 'pipeline_draft_changed';END IF;
  SELECT * INTO v FROM crm_verification_events WHERE method_id=r.method_id ORDER BY checked_at DESC NULLS LAST,created_at DESC,id DESC LIMIT 1;
  IF v.id IS DISTINCT FROM item.snapshot#>>'{verification,id}' OR v.attempt_state<>'completed' OR v.mailbox_result IS DISTINCT FROM 'valid' THEN RAISE EXCEPTION 'pipeline_verification_changed';END IF;
  SELECT * INTO lead FROM lead_contacts WHERE id=item.snapshot#>>'{lead,id}' FOR UPDATE;
  IF lead.id IS NULL OR lower(trim(lead.email)) IS DISTINCT FROM r.mailbox OR lead.is_archived OR lead.recontact_ok=0 OR coalesce(lead.suppression_reason,'')<>'' THEN RAISE EXCEPTION 'lead_eligibility_changed';END IF;
  IF lead.outbound_status IS DISTINCT FROM 'uncontacted' AND NOT(p_allow_loaded AND lead.outbound_status='in_instantly' AND EXISTS(SELECT 1 FROM compass_outbound_loads ld WHERE ld.preparation_id=m.id AND ld.instantly_campaign_id=lead.instantly_campaign_id)) THEN RAISE EXCEPTION 'outreach_state_changed';END IF;
 END LOOP;
 RETURN p.bundle;
END $$;
REVOKE ALL ON FUNCTION public.outbound_check_preparation(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_check_preparation(text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.outbound_approve_preparation(p_id text,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.portal_is_operator() THEN RAISE EXCEPTION 'operator_required';END IF;
 b:=outbound_check_preparation(p_id);
 IF b->>'hash'<>p_hash THEN RAISE EXCEPTION 'version_conflict';END IF;
 INSERT INTO compass_outbound_approvals(preparation_id,hash,actor_id) VALUES(p_id,p_hash,auth.uid()) ON CONFLICT(preparation_id) DO NOTHING;
END $$;
ALTER FUNCTION public.outbound_reserve_load(text,text) RENAME TO outbound_reserve_legacy_load;
CREATE FUNCTION public.outbound_reserve_load(p_id text,p_campaign_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m outbound_pipeline_delivery_manifests;b jsonb;key text;owner text;old_campaign text;old_stamp timestamptz;new_stamp timestamptz;
BEGIN
 SELECT * INTO m FROM outbound_pipeline_delivery_manifests WHERE id=p_id;
 IF NOT FOUND THEN PERFORM outbound_reserve_legacy_load(p_id,p_campaign_id);RETURN;END IF;
 b:=outbound_check_preparation(p_id,true);
 IF NOT EXISTS(SELECT 1 FROM compass_outbound_approvals WHERE preparation_id=p_id AND hash=b->>'hash') THEN RAISE EXCEPTION 'human_approval_required';END IF;
 IF NOT EXISTS(SELECT 1 FROM compass_pipeline_campaigns WHERE id=m.campaign_id AND instantly_campaign_id=p_campaign_id) THEN RAISE EXCEPTION 'campaign_binding_mismatch';END IF;
 SELECT created_at INTO new_stamp FROM compass_outbound_preparations WHERE id=p_id;
 FOR key IN SELECT DISTINCT k FROM outbound_pipeline_delivery_items i CROSS JOIN LATERAL unnest(ARRAY['company:'||(i.record#>>'{candidate,company_id}'),'email:'||lower(i.record#>>'{candidate,email}')])k WHERE i.manifest_id=p_id AND i.status='pass' ORDER BY k LOOP
  INSERT INTO compass_outbound_reservations(identity_key,preparation_id) VALUES(key,p_id) ON CONFLICT DO NOTHING;
  SELECT preparation_id INTO owner FROM compass_outbound_reservations WHERE identity_key=key FOR UPDATE;
  IF owner<>p_id THEN
   SELECT r.campaign_id,p.created_at INTO old_campaign,old_stamp FROM compass_outbound_preparations p JOIN compass_outbound_runs r ON r.id=p.run_id JOIN compass_outbound_loads ld ON ld.preparation_id=p.id WHERE p.id=owner AND ld.instantly_campaign_id=p_campaign_id;
   IF old_campaign IS DISTINCT FROM m.campaign_id OR (old_stamp,owner)>=(new_stamp,p_id) THEN RAISE EXCEPTION 'outreach_reserved_elsewhere';END IF;
   INSERT INTO compass_outbound_receipt_history(preparation_id,receipt_hash,receipt) VALUES(p_id,md5('reservation_supersession:'||owner||':'||key),jsonb_build_object('event','reservation_supersession','identity_key',key,'previous_preparation_id',owner,'campaign_id',m.campaign_id,'instantly_campaign_id',p_campaign_id)) ON CONFLICT DO NOTHING;
   UPDATE compass_outbound_reservations SET preparation_id=p_id WHERE identity_key=key AND preparation_id=owner;
  END IF;
 END LOOP;
 INSERT INTO compass_outbound_loads(preparation_id,instantly_campaign_id) VALUES(p_id,p_campaign_id) ON CONFLICT(preparation_id) DO NOTHING;
 IF EXISTS(SELECT 1 FROM compass_outbound_loads WHERE preparation_id=p_id AND instantly_campaign_id<>p_campaign_id) THEN RAISE EXCEPTION 'load_binding_conflict';END IF;
 UPDATE outbound_pipeline_delivery_manifests SET status='reserved',updated_at=now() WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.outbound_reserve_load(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_reserve_load(text,text) TO service_role;
CREATE FUNCTION public.outbound_pipeline_delivery_action_receipt(p_command jsonb,p_hash text,p_actor text,p_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE saved record;m outbound_pipeline_delivery_manifests;receipt jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';END IF;RETURN saved.receipt;END IF;
 SELECT * INTO m FROM outbound_pipeline_delivery_manifests WHERE id=p_command->>'manifest_id';
 IF m.id IS NULL OR p_command->>'action' NOT IN('approve','reserve','configure_sequence','approve_preview') THEN RAISE EXCEPTION 'pipeline_invalid_delivery_action';END IF;
 IF p_command->>'action' IN('approve','configure_sequence','approve_preview') AND (p_actor NOT LIKE 'operator:%' OR NOT EXISTS(SELECT 1 FROM compass_outbound_approvals WHERE preparation_id=m.id AND hash=m.hash)) THEN RAISE EXCEPTION 'pipeline_operator_required';END IF;
 IF p_command->>'action'='reserve' AND NOT EXISTS(SELECT 1 FROM compass_outbound_loads WHERE preparation_id=m.id) THEN RAISE EXCEPTION 'pipeline_reservation_required';END IF;
 IF p_command->>'action'='approve_preview' THEN
  IF length(coalesce(p_command#>>'{data,evidence}',''))<10 THEN RAISE EXCEPTION 'pipeline_preview_evidence_required';END IF;
 END IF;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','manifest',to_jsonb(m),'result',p_result);
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',receipt,now());RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_delivery_action_receipt(jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_delivery_action_receipt(jsonb,text,text,jsonb) TO service_role;
