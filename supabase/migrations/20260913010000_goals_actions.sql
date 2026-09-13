-- Durable notebook operations and calling sessions reuse canonical planning/work.
CREATE TABLE public.compass_planning_receipts (
 request_id text PRIMARY KEY, digest text NOT NULL, record_id text NOT NULL,
 value text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compass_planning_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compass_planning_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.compass_planning_receipts TO service_role;
CREATE FUNCTION public.compass_save_planning_operation(p_id text,p_expected_value text,p_value text,p_at timestamptz,p_request_id text,p_digest text,p_receipt_value text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt compass_planning_receipts; previous text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service_required'; END IF;
 IF p_id !~ '^planning\.(goal|note|time|run|preparation)\.[a-f0-9-]{36}$' OR length(p_request_id)<8 THEN RAISE EXCEPTION 'invalid_operation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('planning-operation:'||p_request_id,0));
 SELECT * INTO receipt FROM compass_planning_receipts WHERE request_id=p_request_id;
 IF FOUND THEN
  IF receipt.digest<>p_digest OR receipt.record_id<>p_id THEN RAISE EXCEPTION 'request_id_reused'; END IF;
  RETURN receipt.value;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id,0));
 SELECT value INTO previous FROM compass_settings WHERE id=p_id FOR UPDATE;
 IF previous IS DISTINCT FROM p_expected_value THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 INSERT INTO compass_settings(id,value,scope,is_secret,updated_at,mirrored_at) VALUES(p_id,p_value,'planning',1,p_at,p_at)
 ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,mirrored_at=excluded.mirrored_at;
 INSERT INTO compass_planning_receipts(request_id,digest,record_id,value) VALUES(p_request_id,p_digest,p_id,p_receipt_value);
 RETURN p_receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.compass_save_planning_operation(text,text,text,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_save_planning_operation(text,text,text,timestamptz,text,text,text) TO service_role;

CREATE FUNCTION public.compass_goal_session_save(p jsonb,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous compass_operating_records; receipt compass_operating_records; result jsonb; task_result jsonb; session_data jsonb;
 sid text:='capture:call-session:'||(p->>'id'); rid text:='receipt:call-session:'||(p->>'request_id'); stamp timestamptz:=clock_timestamp();
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND NOT coalesce(portal_is_operator(),false) THEN RAISE EXCEPTION 'operator_required'; END IF;
 IF (auth.role()='service_role' AND p_actor<>'agent') OR (auth.role()<>'service_role' AND p_actor<>'operator') THEN RAISE EXCEPTION 'actor_mismatch'; END IF;
 IF p_actor NOT IN ('operator','agent') OR p->>'id' !~ '^[a-f0-9-]{36}$' OR p->>'request_id' !~ '^[a-f0-9-]{36}$' THEN RAISE EXCEPTION 'invalid_operation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid,0));
 SELECT * INTO receipt FROM compass_operating_records WHERE id=rid;
 IF FOUND THEN
  IF receipt.data->'request' IS DISTINCT FROM p OR receipt.data->>'actor' IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'request_id_reused'; END IF;
  RETURN receipt.data->'result'||jsonb_build_object('replayed',true);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(sid,0));
 SELECT * INTO previous FROM compass_operating_records WHERE id=sid FOR UPDATE;
 IF coalesce(previous.revision,0) IS DISTINCT FROM (p->>'revision')::int THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF NOT EXISTS(SELECT 1 FROM compass_settings WHERE id=p->>'goal_id') THEN RAISE EXCEPTION 'goal_not_found'; END IF;
 IF jsonb_typeof(p->'lead_ids')<>'array' OR jsonb_array_length(p->'lead_ids')>500 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'lead_ids') i WHERE NOT EXISTS(SELECT 1 FROM lead_contacts WHERE id=i)) THEN RAISE EXCEPTION 'invalid_prospects'; END IF;
 IF previous.id IS NOT NULL AND (previous.data->>'goal_id' IS DISTINCT FROM p->>'goal_id' OR previous.data->>'city' IS DISTINCT FROM p->>'city' OR previous.data->'due' IS DISTINCT FROM p->'due') THEN RAISE EXCEPTION 'session_scope_changed_create_another'; END IF;
 IF p_actor='agent' AND previous.id IS NOT NULL AND previous.data->>'actor'='operator' THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
 session_data:=(p-'request_id'-'revision'-'context')||jsonb_build_object('actor',p_actor,'handled_ids',coalesce(previous.data->'handled_ids','[]'::jsonb));
 IF previous.id IS NULL THEN
  task_result:=compass_operating_save(jsonb_build_object('action','task','request_id','session-task:'||(p->>'request_id'),'key','call-session:'||(p->>'id'),
    'task',jsonb_build_object('title','Call '||(p->>'city')||' prospects','status','not-started','priority',0,'task_type','SELL','due',CASE WHEN p_actor='operator' THEN p->'due' ELSE 'null'::jsonb END,'source','goals-actions','notes','Open this calling session in Planning → Goals & actions.'),'context',p->'context'),p_actor);
  session_data:=session_data||jsonb_build_object('task_id',task_result->'task'->>'id');
 ELSE
  session_data:=session_data||jsonb_build_object('task_id',previous.data->>'task_id');
  INSERT INTO compass_operating_history(record_id,revision,data) VALUES(sid,previous.revision,previous.data);
 END IF;
 INSERT INTO compass_operating_records(id,kind,data,revision,updated_at) VALUES(sid,'capture',session_data,coalesce(previous.revision,0)+1,stamp)
 ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at;
 SELECT jsonb_build_object('session',to_jsonb(r)) INTO result FROM compass_operating_records r WHERE id=sid;
 INSERT INTO compass_operating_records(id,kind,data) VALUES(rid,'receipt',jsonb_build_object('request',p,'actor',p_actor,'result',result));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.compass_goal_session_save(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compass_goal_session_save(jsonb,text) TO authenticated,service_role;

-- The existing outreach owner retains restrictions, task revision checks and receipts.
CREATE FUNCTION public.compass_goal_touch_save(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s compass_operating_records; result jsonb; actor text:=CASE WHEN auth.role()='service_role' THEN 'agent' ELSE 'operator' END; tid text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND NOT coalesce(portal_is_operator(),false) THEN RAISE EXCEPTION 'operator_required'; END IF;
 IF p->>'operation'<>'capture' OR nullif(p->>'goal_id','') IS NULL THEN RAISE EXCEPTION 'invalid_goal_capture'; END IF;
 IF NOT EXISTS(SELECT 1 FROM compass_settings WHERE id=p->>'goal_id') THEN RAISE EXCEPTION 'goal_not_found'; END IF;
 IF p ? 'session_id' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('capture:call-session:'||(p->>'session_id'),0));
  SELECT * INTO s FROM compass_operating_records WHERE id='capture:call-session:'||(p->>'session_id') FOR UPDATE;
  IF s.id IS NULL OR s.data->>'goal_id'<>p->>'goal_id' OR NOT s.data->'lead_ids' ? (p->>'lead_id') THEN RAISE EXCEPTION 'session_prospect_mismatch'; END IF;
 END IF;
 result:=compass_outbound_rhythm_save(p);
 IF coalesce((result->>'replayed')::boolean,false) THEN RETURN result; END IF;
 tid:=result->>'task_id';
 IF tid IS NOT NULL THEN
  INSERT INTO compass_pathfinder_links(goal_id,work_type,work_id,relation,state,rationale,actor)
  VALUES(p->>'goal_id','task',tid,'contributes',CASE WHEN actor='operator' THEN 'active' ELSE 'proposed' END,'Follow-up recorded with this goal.',actor)
  ON CONFLICT(goal_id,work_type,work_id,relation) DO NOTHING;
 END IF;
 IF s.id IS NOT NULL THEN
  INSERT INTO compass_operating_history(record_id,revision,data) VALUES(s.id,s.revision,s.data);
  UPDATE compass_operating_records SET data=jsonb_set(jsonb_set(s.data,'{handled_ids}',CASE WHEN s.data->'handled_ids' ? (p->>'lead_id') THEN s.data->'handled_ids' ELSE coalesce(s.data->'handled_ids','[]'::jsonb)||jsonb_build_array(p->>'lead_id') END),'{last_touch_id}',to_jsonb(result->>'touch_id')),revision=s.revision+1,updated_at=clock_timestamp() WHERE id=s.id;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.compass_goal_touch_save(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.compass_goal_touch_save(jsonb) TO authenticated,service_role;
ALTER TABLE public.compass_pathfinder_observations ADD COLUMN metric_id text NOT NULL DEFAULT 'primary' CHECK(metric_id IN ('primary','payment'));
ALTER TABLE public.compass_pathfinder_observations ADD COLUMN receipt jsonb;
ALTER TABLE public.compass_pathfinder_observations ADD CONSTRAINT payment_receipt_required CHECK ((metric_id='payment')=(receipt IS NOT NULL));
CREATE UNIQUE INDEX compass_payment_receipt_once ON public.compass_pathfinder_observations((receipt->>'receipt_id')) WHERE receipt IS NOT NULL;
CREATE UNIQUE INDEX compass_payment_once ON public.compass_pathfinder_observations((receipt->>'payment_id')) WHERE receipt->>'kind'='payment';
