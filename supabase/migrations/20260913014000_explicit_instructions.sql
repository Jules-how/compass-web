-- Only the server which verifies the local adapter signature can enter this owner.
-- A dedicated principal is recorded; this does not impersonate an operator session.
CREATE TABLE public.compass_instruction_receipts (
 request_id uuid PRIMARY KEY, digest text NOT NULL, instruction jsonb NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compass_instruction_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compass_instruction_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.compass_instruction_receipts TO service_role;
CREATE FUNCTION public.compass_complete_task_instruction(p jsonb,p_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE receipt compass_instruction_receipts; t compass_tasks; e compass_sync_v2_entities; tenant uuid; tenants uuid[];
 actor uuid:='3d72aa42-9a36-518c-826b-95b486416a8c'; -- local Codex delegated-instruction principal
 stamp timestamptz:=clock_timestamp(); version bigint; operation_id text:='explicit-task:'||(p->>'request_id'); result jsonb;
 fields jsonb; versions jsonb; actors jsonb; operations jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service_required'; END IF;
 IF p->>'intent' IS DISTINCT FROM 'explicit' OR p->'source'->>'role' IS DISTINCT FROM 'user' OR p->'command'->>'action' IS DISTINCT FROM 'complete_task' THEN RAISE EXCEPTION 'explicit_instruction_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(operation_id,0));
 SELECT * INTO receipt FROM compass_instruction_receipts WHERE request_id=(p->>'request_id')::uuid;
 IF FOUND THEN
  IF receipt.digest<>p_digest OR receipt.instruction IS DISTINCT FROM p THEN RAISE EXCEPTION 'request_id_reused'; END IF;
  RETURN receipt.result||jsonb_build_object('replayed',true);
 END IF;
 IF (p->>'expires_at')::timestamptz<stamp THEN RAISE EXCEPTION 'instruction_expired'; END IF;
 SELECT * INTO t FROM compass_tasks WHERE id=p->'command'->>'task_id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
 IF t.updated_at IS DISTINCT FROM (p->'command'->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF t.status='cancelled' THEN RAISE EXCEPTION 'cancelled_task_requires_review'; END IF;
 SELECT array_agg(DISTINCT tenant_id) INTO tenants FROM compass_sync_v2_entities WHERE domain='internal-planning' AND entity_id=t.id;
 IF coalesce(array_length(tenants,1),0)=0 THEN SELECT array_agg(DISTINCT tenant_id) INTO tenants FROM compass_sync_v2_entities WHERE domain='internal-planning'; END IF;
 IF coalesce(array_length(tenants,1),0)<>1 THEN RAISE EXCEPTION 'task_tenant_requires_review'; END IF;
 tenant:=tenants[1];
 SELECT * INTO e FROM compass_sync_v2_entities WHERE tenant_id=tenant AND domain='internal-planning' AND entity_id=t.id FOR UPDATE;
 IF e.tombstone IS NOT NULL THEN RAISE EXCEPTION 'task_is_tombstoned'; END IF;
 fields:=coalesce(e.fields,jsonb_build_object('title',t.title,'status',t.status,'priority',t.priority,'due',t.due,'source',t.source,'projectId',t.project_id,'parentTaskId',t.parent_task_id,'businessFunctionId',t.business_function_id,'taskType',t.task_type,'complexity',t.complexity,'notes',t.notes,'executionLevel',coalesce(t.execution_level,1),'executionMode',t.execution_mode,'executionContract',t.execution_contract,'contractRevision',coalesce(t.contract_revision,0)));
 version:=coalesce(e.entity_version,0)+1;
 fields:=fields||jsonb_build_object('status','done','updatedAt',stamp);
 versions:=coalesce(e.field_versions,'{}')||jsonb_build_object('status',version,'updatedAt',version);
 actors:=coalesce(e.field_actors,'{}')||jsonb_build_object('status',actor::text,'updatedAt',actor::text);
 operations:=coalesce(e.field_operation_ids,'{}')||jsonb_build_object('status',operation_id,'updatedAt',operation_id);
 UPDATE compass_tasks SET status='completed',updated_at=stamp,mirrored_at=stamp WHERE id=t.id RETURNING * INTO t;
 INSERT INTO compass_sync_v2_entities(tenant_id,domain,entity_id,authority,entity_version,fields,field_versions,field_actors,field_operation_ids,updated_at)
 VALUES(tenant,'internal-planning',t.id,'local',version,fields,versions,actors,operations,stamp)
 ON CONFLICT(tenant_id,domain,entity_id) DO UPDATE SET entity_version=excluded.entity_version,fields=excluded.fields,field_versions=excluded.field_versions,field_actors=excluded.field_actors,field_operation_ids=excluded.field_operation_ids,updated_at=excluded.updated_at;
 result:=jsonb_build_object('task',to_jsonb(t),'actor','delegated_user','source',p->'source','operationId',operation_id);
 INSERT INTO compass_sync_v2_receipts(tenant_id,operation_id,actor_id,payload_digest,outcome,result,received_at) VALUES(tenant,operation_id,actor,p_digest,'applied',jsonb_build_object('status','applied','source','codex-explicit-instruction'),stamp);
 INSERT INTO compass_sync_v2_changes(tenant_id,operation_id,domain,entity_id,authority,change_kind,snapshot,created_at) VALUES(tenant,operation_id,'internal-planning',t.id,'local','entity',jsonb_build_object('entityVersion',version,'fields',fields,'fieldVersions',versions,'fieldActors',actors,'fieldOperationIds',operations),stamp);
 INSERT INTO compass_instruction_receipts(request_id,digest,instruction,result) VALUES((p->>'request_id')::uuid,p_digest,p,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.compass_complete_task_instruction(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_complete_task_instruction(jsonb,text) TO service_role;
