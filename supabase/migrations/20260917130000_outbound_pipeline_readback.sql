-- Resumable actual-provider traversal; one manifest remains the reservation owner.
CREATE TABLE public.outbound_pipeline_readbacks (
 id text PRIMARY KEY,manifest_id text NOT NULL REFERENCES public.outbound_pipeline_delivery_manifests(id),phase text NOT NULL CHECK(phase IN('baseline','reconcile')),
 baseline_id text REFERENCES public.outbound_pipeline_readbacks(id),status text NOT NULL DEFAULT 'scanning' CHECK(status IN('scanning','comparing','complete','attention')),
 revision integer NOT NULL DEFAULT 1,cursor text,lease_token text,lease_until timestamptz,page_count integer NOT NULL DEFAULT 0,scanned_count integer NOT NULL DEFAULT 0,
 compare_after text,approved boolean NOT NULL DEFAULT false,summary jsonb NOT NULL DEFAULT '{}',actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE TABLE public.outbound_pipeline_readback_pages (
 readback_id text NOT NULL REFERENCES public.outbound_pipeline_readbacks(id),page_no integer NOT NULL,cursor text NOT NULL,next_cursor text,PRIMARY KEY(readback_id,page_no),UNIQUE(readback_id,cursor)
);
CREATE TABLE public.outbound_pipeline_readback_rows (
 id text PRIMARY KEY,readback_id text NOT NULL REFERENCES public.outbound_pipeline_readbacks(id),provider_id text NOT NULL,email text NOT NULL,raw jsonb NOT NULL
);
CREATE INDEX pipeline_readback_email ON public.outbound_pipeline_readback_rows(readback_id,email,id);
CREATE INDEX pipeline_readback_provider ON public.outbound_pipeline_readback_rows(readback_id,provider_id);
CREATE TABLE public.outbound_pipeline_readback_results (
 readback_id text NOT NULL REFERENCES public.outbound_pipeline_readbacks(id),item_id text NOT NULL REFERENCES public.outbound_pipeline_delivery_items(id),recipient_id text NOT NULL,email text NOT NULL,
 status text NOT NULL CHECK(status IN('confirmed','missing','variables_mismatch','conflict')),provider_id text,PRIMARY KEY(readback_id,item_id)
);
DO $$ DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['outbound_pipeline_readbacks','outbound_pipeline_readback_pages','outbound_pipeline_readback_rows','outbound_pipeline_readback_results'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('CREATE POLICY pipeline_readback_operator ON public.%I FOR SELECT TO authenticated USING(public.portal_is_operator())',tab);
 END LOOP;
END $$;
CREATE FUNCTION public.outbound_pipeline_readback_command(p_command jsonb,p_hash text,p_actor text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE action text:=p_command->>'action';r outbound_pipeline_readbacks;m outbound_pipeline_delivery_manifests;entry jsonb;saved record;receipt jsonb;baseline text;duplicates integer;extras integer;missing integer;confirmed integer;mismatch integer;baseline_missing integer;baseline_changed integer;done boolean;summary_payload jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';END IF;RETURN saved.receipt;END IF;
 SELECT * INTO m FROM outbound_pipeline_delivery_manifests WHERE id=p_command->>'manifest_id';
 IF m.id IS NULL THEN RAISE EXCEPTION 'pipeline_not_found';END IF;
 SELECT * INTO r FROM outbound_pipeline_readbacks WHERE id=p_command->>'readback_id' FOR UPDATE;
 IF coalesce(r.revision,0)<>(p_command->>'expected_revision')::integer THEN RAISE EXCEPTION 'pipeline_revision_conflict';END IF;
 IF action IN('start_baseline','start_reconcile') THEN
  IF action='start_baseline' AND EXISTS(SELECT 1 FROM outbound_pipeline_readbacks WHERE manifest_id=m.id AND (approved OR phase='reconcile')) THEN RAISE EXCEPTION 'pipeline_original_baseline_frozen';END IF;
  IF r.id IS NOT NULL THEN RAISE EXCEPTION 'pipeline_readback_exists';END IF;
  IF NOT EXISTS(SELECT 1 FROM compass_outbound_approvals a JOIN compass_outbound_loads l ON l.preparation_id=a.preparation_id WHERE a.preparation_id=m.id AND a.hash=m.hash) THEN RAISE EXCEPTION 'pipeline_approved_reservation_required';END IF;
  IF action='start_reconcile' THEN
   SELECT id INTO baseline FROM outbound_pipeline_readbacks WHERE manifest_id=m.id AND phase='baseline' AND status='complete' AND approved ORDER BY created_at DESC,id DESC LIMIT 1;
   IF baseline IS NULL THEN RAISE EXCEPTION 'pipeline_approved_baseline_required';END IF;
  END IF;
  INSERT INTO outbound_pipeline_readbacks(id,manifest_id,phase,baseline_id,actor) VALUES(p_command->>'readback_id',m.id,CASE action WHEN 'start_baseline' THEN 'baseline' ELSE 'reconcile' END,baseline,p_actor) RETURNING * INTO r;
 ELSE
  IF r.id IS NULL OR r.manifest_id<>m.id THEN RAISE EXCEPTION 'pipeline_readback_scope_mismatch';END IF;
  IF action='page' THEN
   IF r.status<>'scanning' OR r.lease_token IS DISTINCT FROM p_payload->>'lease_token' OR r.cursor IS DISTINCT FROM p_payload->>'cursor' THEN RAISE EXCEPTION 'pipeline_readback_lease_conflict';END IF;
   IF jsonb_array_length(p_payload->'rows')>100 THEN RAISE EXCEPTION 'pipeline_readback_page_too_large';END IF;
   INSERT INTO outbound_pipeline_readback_pages VALUES(r.id,r.page_count,coalesce(r.cursor,''),p_payload->>'next_cursor');
   FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
    IF coalesce(entry->>'id','')='' OR coalesce(entry->>'email','')='' THEN RAISE EXCEPTION 'pipeline_invalid_provider_recipient';END IF;
    INSERT INTO outbound_pipeline_readback_rows VALUES(gen_random_uuid()::text,r.id,entry->>'id',lower(trim(entry->>'email')),entry);
   END LOOP;
   UPDATE outbound_pipeline_readbacks SET revision=revision+1,page_count=page_count+1,scanned_count=scanned_count+jsonb_array_length(p_payload->'rows'),lease_token=NULL,lease_until=NULL,
    status=CASE WHEN p_payload->>'next_cursor' IS NULL THEN 'comparing' WHEN EXISTS(SELECT 1 FROM outbound_pipeline_readback_pages WHERE readback_id=r.id AND cursor=p_payload->>'next_cursor') OR jsonb_array_length(p_payload->'rows')=0 THEN 'attention' ELSE 'scanning' END,
    summary=CASE WHEN p_payload->>'next_cursor' IS NOT NULL AND (EXISTS(SELECT 1 FROM outbound_pipeline_readback_pages WHERE readback_id=r.id AND cursor=p_payload->>'next_cursor') OR jsonb_array_length(p_payload->'rows')=0) THEN '{"error":"incomplete_provider_pagination"}'::jsonb ELSE summary END,
    cursor=p_payload->>'next_cursor' WHERE id=r.id RETURNING * INTO r;
  ELSIF action='compare_chunk' THEN
   IF r.status<>'comparing' OR jsonb_array_length(p_payload->'results') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'pipeline_invalid_compare_chunk';END IF;
   FOR entry IN SELECT value FROM jsonb_array_elements(p_payload->'results') LOOP
    IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_delivery_items i WHERE i.id=entry->>'item_id' AND i.manifest_id=m.id AND i.status='pass' AND i.recipient_id=entry->>'recipient_id' AND i.record#>>'{candidate,email}'=entry->>'email') THEN RAISE EXCEPTION 'pipeline_comparison_scope_mismatch';END IF;
    INSERT INTO outbound_pipeline_readback_results VALUES(r.id,entry->>'item_id',entry->>'recipient_id',entry->>'email',entry->>'status',entry->>'provider_id');
   END LOOP;
   UPDATE outbound_pipeline_readbacks SET revision=revision+1,summary=jsonb_build_object('compared',(SELECT count(*) FROM outbound_pipeline_readback_results WHERE readback_id=r.id)),compare_after=p_payload->>'last_item_id' WHERE id=r.id RETURNING * INTO r;
  ELSIF action='approve_baseline' THEN
   IF p_actor NOT LIKE 'operator:%' THEN RAISE EXCEPTION 'pipeline_operator_required';END IF;
   IF r.phase<>'baseline' OR r.status<>'complete' THEN RAISE EXCEPTION 'pipeline_baseline_not_complete';END IF;
   UPDATE outbound_pipeline_readbacks SET revision=revision+1,approved=true WHERE id=r.id RETURNING * INTO r;
  ELSIF action='finish' THEN
   IF r.phase='reconcile' AND m.context#>>'{pipeline,copy_mode}'='recipient_variables' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_receipts pr WHERE pr.actor LIKE 'operator:%' AND pr.receipt#>>'{result,provider_preview,manifest_hash}'=m.hash) THEN RAISE EXCEPTION 'pipeline_provider_preview_review_required';END IF;
   IF r.status<>'comparing' OR (SELECT count(*) FROM outbound_pipeline_readback_results WHERE readback_id=r.id)<>m.pass_count THEN RAISE EXCEPTION 'pipeline_readback_incomplete';END IF;
   SELECT count(*)-count(DISTINCT email)+count(*)-count(DISTINCT provider_id) INTO duplicates FROM outbound_pipeline_readback_rows WHERE readback_id=r.id;
   SELECT count(*) FILTER(WHERE status='confirmed'),count(*) FILTER(WHERE status='missing'),count(*) FILTER(WHERE status IN('variables_mismatch','conflict')) INTO confirmed,missing,mismatch FROM outbound_pipeline_readback_results WHERE readback_id=r.id;
   extras:=0;baseline_missing:=0;baseline_changed:=0;
   IF r.phase='reconcile' THEN
    SELECT count(*) INTO extras FROM outbound_pipeline_readback_rows actual WHERE actual.readback_id=r.id AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_delivery_items i WHERE i.manifest_id=m.id AND i.status='pass' AND i.record#>>'{candidate,email}'=actual.email) AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_readback_rows b WHERE b.readback_id=r.baseline_id AND b.email=actual.email);
    SELECT count(*) INTO baseline_missing FROM outbound_pipeline_readback_rows b WHERE b.readback_id=r.baseline_id AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_readback_rows actual WHERE actual.readback_id=r.id AND actual.email=b.email);
    SELECT count(*) INTO baseline_changed FROM outbound_pipeline_readback_rows b JOIN outbound_pipeline_readback_rows actual ON actual.email=b.email AND actual.readback_id=r.id WHERE b.readback_id=r.baseline_id AND b.raw IS DISTINCT FROM actual.raw;
   END IF;
   done:=duplicates=0 AND mismatch=0 AND (r.phase='baseline' OR (missing=0 AND extras=0 AND baseline_missing=0 AND baseline_changed=0));
   summary_payload:=jsonb_build_object('intended',m.pass_count,'observed',r.scanned_count,'confirmed',confirmed,'missing',missing,'copy_conflicts',mismatch,'unexpected',extras,'duplicates',duplicates,'baseline_missing',baseline_missing,'baseline_changed',baseline_changed,'complete',done,'observed_at',now(),'campaign',p_payload->'campaign');
   UPDATE outbound_pipeline_readbacks SET revision=revision+1,status=CASE WHEN done THEN 'complete' ELSE 'attention' END,approved=(phase='baseline' AND scanned_count=0 AND done),summary=summary_payload,finished_at=now() WHERE id=r.id RETURNING * INTO r;
   IF r.phase='reconcile' THEN
    UPDATE lead_contacts lc SET instantly_campaign_id=ld.instantly_campaign_id,instantly_lead_id=result.provider_id,outbound_status='in_instantly',enrich_status='uploaded',updated_at=now()
    FROM outbound_pipeline_readback_results result JOIN outbound_pipeline_delivery_items i ON i.id=result.item_id JOIN compass_outbound_loads ld ON ld.preparation_id=i.manifest_id
    WHERE result.readback_id=r.id AND result.status='confirmed' AND lc.id=i.record#>>'{candidate,lead_id}' AND lower(trim(lc.email))=result.email AND lc.outbound_status IN('uncontacted','in_instantly');
    UPDATE compass_outbound_loads SET status=CASE WHEN done THEN 'complete' ELSE 'partial' END,snapshot=summary_payload,updated_at=now() WHERE preparation_id=m.id;
    UPDATE outbound_pipeline_delivery_manifests SET status=CASE WHEN done THEN 'complete' ELSE 'attention' END,updated_at=now() WHERE id=m.id;
    INSERT INTO compass_outbound_receipt_history(preparation_id,receipt_hash,receipt) VALUES(m.id,encode(sha256(convert_to(summary_payload::text,'UTF8')),'hex'),summary_payload);
   END IF;
  ELSE RAISE EXCEPTION 'pipeline_invalid_readback_action';END IF;
 END IF;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','readback',to_jsonb(r));
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',receipt,now());RETURN receipt;
END $$;
CREATE FUNCTION public.outbound_pipeline_readback_claim(p_id text,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r outbound_pipeline_readbacks;
BEGIN
 SELECT * INTO r FROM outbound_pipeline_readbacks WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR r.revision<>p_revision OR r.status<>'scanning' OR r.lease_until>now() THEN RAISE EXCEPTION 'pipeline_readback_lease_conflict';END IF;
 UPDATE outbound_pipeline_readbacks SET lease_token=gen_random_uuid()::text,lease_until=now()+interval '2 minutes' WHERE id=r.id RETURNING * INTO r;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_readback_command(jsonb,text,text,jsonb),public.outbound_pipeline_readback_claim(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_readback_command(jsonb,text,text,jsonb),public.outbound_pipeline_readback_claim(text,integer) TO service_role;

CREATE FUNCTION public.outbound_pipeline_delivery_delta(p_manifest_id text,p_after text DEFAULT '',p_limit integer DEFAULT 100) RETURNS SETOF public.outbound_pipeline_delivery_items LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE baseline text; latest text;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'pipeline_invalid_limit';END IF;
 SELECT id INTO baseline FROM outbound_pipeline_readbacks WHERE manifest_id=p_manifest_id AND phase='baseline' AND status='complete' AND approved ORDER BY created_at DESC,id DESC LIMIT 1;
 IF baseline IS NULL THEN RAISE EXCEPTION 'pipeline_approved_baseline_required';END IF;
 SELECT id INTO latest FROM outbound_pipeline_readbacks WHERE manifest_id=p_manifest_id AND phase='reconcile' AND finished_at IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1;
 RETURN QUERY SELECT i.* FROM outbound_pipeline_delivery_items i
 WHERE i.manifest_id=p_manifest_id AND i.status='pass' AND i.id>p_after
 AND EXISTS(SELECT 1 FROM outbound_pipeline_readback_results b WHERE b.readback_id=coalesce(latest,baseline) AND b.item_id=i.id AND b.status='missing')
 ORDER BY i.id LIMIT p_limit;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_delivery_delta(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_delivery_delta(text,text,integer) TO authenticated,service_role;
