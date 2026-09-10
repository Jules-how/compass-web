-- Operating context extends canonical work; records contain source receipts and plans, never duplicate tasks.
ALTER TABLE public.compass_tasks ADD COLUMN IF NOT EXISTS operating_context jsonb NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS operating_key text;
ALTER TABLE public.compass_projects ADD COLUMN IF NOT EXISTS operating_context jsonb NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS operating_key text;
CREATE UNIQUE INDEX IF NOT EXISTS task_operating_key ON public.compass_tasks(operating_key) WHERE operating_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS project_operating_key ON public.compass_projects(operating_key) WHERE operating_key IS NOT NULL;
CREATE TABLE public.compass_operating_records (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('source','campaign','preparation','capture','day','preferences','receipt')),
 data jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compass_operating_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, record_id text NOT NULL,
 revision integer NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compass_operating_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_operating_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compass_operating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_operating_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.compass_operating_records,public.compass_operating_history FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.compass_operating_records,public.compass_operating_history TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.compass_operating_history_id_seq TO service_role;

CREATE FUNCTION public.compass_operating_save(p jsonb, p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r compass_operating_records; old compass_operating_records; t compass_tasks; pr compass_projects;
 result jsonb; payload jsonb; stamp timestamptz:=clock_timestamp();
 rid text:='receipt:'||(p->>'request_id'); key text:=p->>'key'; entity_id text;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND NOT coalesce(public.portal_is_operator(),false) THEN RAISE EXCEPTION 'operator_required'; END IF;
 IF (coalesce(auth.role(),'')='service_role' AND p_actor<>'agent') OR (coalesce(auth.role(),'')<>'service_role' AND p_actor<>'operator') THEN RAISE EXCEPTION 'actor_mismatch'; END IF;
 IF p_actor NOT IN ('operator','agent') THEN RAISE EXCEPTION 'actor_required'; END IF;
 IF length(coalesce(p->>'request_id',''))<8 THEN RAISE EXCEPTION 'request_id_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid,0));
 SELECT * INTO r FROM compass_operating_records WHERE id=rid;
 IF FOUND THEN
  IF r.data->'request' IS DISTINCT FROM p OR r.data->>'actor' IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'request_id_reused'; END IF;
  RETURN (r.data->'result')||jsonb_build_object('replayed',true);
 END IF;
 IF p->>'action' IN ('task','project') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(p->>'id',key),0));
  IF p->>'action'='task' THEN
   IF p ? 'id' THEN SELECT * INTO t FROM compass_tasks WHERE id=p->>'id' FOR UPDATE;
   ELSE SELECT * INTO t FROM compass_tasks WHERE operating_key=key FOR UPDATE; END IF;
   IF p ? 'id' AND t.id IS NULL THEN RAISE EXCEPTION 'task_not_found'; END IF;
   IF t.id IS NOT NULL AND t.updated_at IS DISTINCT FROM (p->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'revision_conflict'; END IF;
   IF p_actor='agent' AND p->'task'->>'status' IN ('completed','cancelled') THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
   IF p_actor='agent' AND t.id IS NOT NULL AND p->'task' ? 'due' AND t.due IS DISTINCT FROM p->'task'->>'due' THEN RAISE EXCEPTION 'propose_schedule_change'; END IF;
   payload:=p->'task';
   IF t.id IS NULL THEN
    payload:=payload||jsonb_build_object('id','task-'||gen_random_uuid()::text);
    IF p_actor='operator' THEN result:=portal_operator_create_task_mutation(payload);
    ELSE
     INSERT INTO compass_tasks(id,title,status,priority,due,source,project_id,task_type,notes) VALUES(payload->>'id',payload->>'title',coalesce(payload->>'status','not-started'),coalesce((payload->>'priority')::int,0),payload->>'due',payload->>'source',payload->>'project_id',payload->>'task_type',payload->>'notes') RETURNING * INTO t;
     result:=jsonb_build_object('task',to_jsonb(t));
    END IF;
   ELSE
    IF p_actor='operator' THEN result:=portal_operator_apply_task_mutation(t.id,payload,NULL);
    ELSE
     UPDATE compass_tasks SET title=payload->>'title',status=coalesce(payload->>'status',status),priority=coalesce((payload->>'priority')::int,priority),notes=CASE WHEN payload ? 'notes' THEN payload->>'notes' ELSE notes END,project_id=CASE WHEN payload ? 'project_id' THEN payload->>'project_id' ELSE project_id END,task_type=coalesce(payload->>'task_type',task_type),updated_at=stamp WHERE id=t.id RETURNING * INTO t;
     result:=jsonb_build_object('task',to_jsonb(t));
    END IF;
   END IF;
   IF result->>'status'='conflict' OR result->'task' IS NULL THEN RAISE EXCEPTION 'task_mutation_failed'; END IF;
   entity_id:=result->'task'->>'id';
   UPDATE compass_tasks SET operating_context=p->'context',operating_key=coalesce(operating_key,key),updated_at=stamp WHERE id=entity_id RETURNING * INTO t;
   result:=jsonb_build_object('task',to_jsonb(t));
  ELSE
   IF p ? 'id' THEN SELECT * INTO pr FROM compass_projects WHERE id=p->>'id' FOR UPDATE;
   ELSE SELECT * INTO pr FROM compass_projects WHERE operating_key=key FOR UPDATE; END IF;
   IF p ? 'id' AND pr.id IS NULL THEN RAISE EXCEPTION 'project_not_found'; END IF;
   IF pr.id IS NOT NULL AND pr.updated_at IS DISTINCT FROM (p->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'revision_conflict'; END IF;
   IF pr.id IS NULL THEN
    INSERT INTO compass_projects(id,name,status,priority,health,summary,source,operating_key,operating_context,created_at,updated_at,mirrored_at)
    VALUES('project-'||gen_random_uuid()::text,p->'project'->>'name','planned',0,'no_updates',p->'project'->>'summary','operating-service',key,p->'context',stamp,stamp,stamp) RETURNING * INTO pr;
   ELSE
    UPDATE compass_projects SET name=p->'project'->>'name',summary=p->'project'->>'summary',operating_context=p->'context',updated_at=stamp WHERE id=pr.id RETURNING * INTO pr;
   END IF;
   result:=jsonb_build_object('project',to_jsonb(pr));
  END IF;
 ELSE
  PERFORM pg_advisory_xact_lock(hashtextextended(p->>'id',0));
  SELECT * INTO old FROM compass_operating_records WHERE id=p->>'id' FOR UPDATE;
  IF coalesce(old.revision,0) IS DISTINCT FROM (p->>'revision')::int THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  IF p_actor='agent' AND p->>'kind'='day' AND p->'data'->>'status'='accepted' THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
  IF old.kind IN ('source','campaign') AND coalesce(old.data->>'observed_at',old.data->>'checked_at','') > coalesce(p->'data'->>'observed_at',p->'data'->>'checked_at','') THEN RAISE EXCEPTION 'older_observation'; END IF;
  IF old.id IS NOT NULL THEN INSERT INTO compass_operating_history(record_id,revision,data) VALUES(old.id,old.revision,old.data); END IF;
  INSERT INTO compass_operating_records(id,kind,data,revision,updated_at) VALUES(p->>'id',p->>'kind',p->'data',coalesce(old.revision,0)+1,stamp)
  ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at RETURNING * INTO r;
  result:=jsonb_build_object('record',to_jsonb(r));
 END IF;
 INSERT INTO compass_operating_records(id,kind,data) VALUES(rid,'receipt',jsonb_build_object('request',p,'actor',p_actor,'result',result));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.compass_operating_save(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_operating_save(jsonb,text) TO service_role,authenticated;
