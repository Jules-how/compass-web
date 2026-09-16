-- Frozen, resumable template application and general CSV artifacts.
CREATE TABLE public.outbound_pipeline_jobs (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN('template_apply','export','membership')),
 status text NOT NULL CHECK(status IN('preview','running','completed','attention')),
 config jsonb NOT NULL,
 total_count integer NOT NULL DEFAULT 0,
 applied_count integer NOT NULL DEFAULT 0,
 conflicted_count integer NOT NULL DEFAULT 0,
 failed_count integer NOT NULL DEFAULT 0,
 revision integer NOT NULL DEFAULT 1,
 actor text NOT NULL,
 source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.outbound_pipeline_job_items (
 id text PRIMARY KEY,
 job_id text NOT NULL REFERENCES public.outbound_pipeline_jobs(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','applied','conflicted','failed')),
 payload jsonb NOT NULL,
 result jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX pipeline_job_items_page ON public.outbound_pipeline_job_items(job_id,status,id);
CREATE TABLE public.outbound_pipeline_export_chunks (
 ordinal bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id text NOT NULL REFERENCES public.outbound_pipeline_jobs(id),
 content text NOT NULL,
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['outbound_pipeline_jobs','outbound_pipeline_job_items','outbound_pipeline_export_chunks'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('CREATE POLICY pipeline_job_operator ON public.%I FOR SELECT TO authenticated USING(public.portal_is_operator())',tab);
 END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE public.outbound_pipeline_export_chunks_ordinal_seq TO service_role;
CREATE TRIGGER pipeline_export_immutable BEFORE UPDATE OR DELETE ON public.outbound_pipeline_export_chunks FOR EACH ROW EXECUTE FUNCTION public.crm_research_immutable();

-- Saved evidence must be single-valued and current. Ambiguous signals are omitted,
-- so the shared renderer follows the selected fallback or reports missing slots.
CREATE FUNCTION public.outbound_pipeline_signal_text(p_value jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(p_value) IN('string','number','boolean') THEN p_value#>>'{}'
 WHEN jsonb_typeof(p_value)='array' THEN CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_value)e WHERE jsonb_typeof(e) NOT IN('string','number','boolean')) THEN coalesce((SELECT string_agg(e#>>'{}',', ' ORDER BY n) FROM jsonb_array_elements(p_value) WITH ORDINALITY a(e,n)),'') ELSE '' END
 ELSE '' END
$$;
CREATE FUNCTION public.outbound_pipeline_render_inputs(p_company text,p_workflow text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$
 WITH current_signals AS (
  SELECT s.* FROM outbound_pipeline_signals s JOIN outbound_pipeline_workflows w ON w.id=s.workflow_version_id
  WHERE s.company_id=p_company AND s.workflow_version_id=p_workflow
  AND s.evidence_strength<>'none' AND s.usefulness<>'none'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(w.policy->'signals')d WHERE d->>'id'=s.signal_id AND (d->>'writing_eligible')::boolean)
  AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_signals n WHERE n.supersedes_id=s.id)
 ), usable AS (
  SELECT signal_id,min(outbound_pipeline_signal_text(value)) AS value,jsonb_agg(id ORDER BY id) AS refs
  FROM current_signals GROUP BY signal_id HAVING count(DISTINCT outbound_pipeline_signal_text(value))=1 AND min(outbound_pipeline_signal_text(value))<>''
 )
 SELECT jsonb_build_object('signals',coalesce(jsonb_object_agg(signal_id,value),'{}'),'input_refs',coalesce((SELECT jsonb_agg(ref) FROM usable u,jsonb_array_elements(u.refs)ref),'[]')) FROM usable
$$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_render_inputs(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_render_inputs(text,text) TO authenticated,service_role;

CREATE FUNCTION public.outbound_pipeline_job_create(p_command jsonb,p_hash text,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d jsonb:=p_command->'data';action text:=p_command->>'action';job outbound_pipeline_jobs;template outbound_pipeline_templates;lists jsonb;receipt jsonb;saved record;filters jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN
  IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';END IF;
  RETURN saved.receipt;
 END IF;
 IF p_command->>'schema_version'<>'outbound.pipeline.v1' OR length(coalesce(p_command->>'request_id',''))<8 OR coalesce(p_command->>'source','')='' OR (p_command->>'expected_revision')::integer<>0 THEN RAISE EXCEPTION 'pipeline_invalid_job_command';END IF;
 IF action='preview_apply' THEN
  SELECT * INTO template FROM outbound_pipeline_templates WHERE id=d->>'template_version_id';
  IF template.id IS NULL THEN RAISE EXCEPTION 'pipeline_template_version_required';END IF;
  IF template.policy->>'mode'<>'deterministic' THEN RAISE EXCEPTION 'pipeline_ai_executor_required';END IF;
  lists:=coalesce(d->'list_ids',jsonb_build_array(d->>'current_list_id'));
  IF jsonb_array_length(lists)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(lists)l WHERE NOT EXISTS(SELECT 1 FROM compass_lead_lists WHERE id=l)) THEN RAISE EXCEPTION 'pipeline_list_required';END IF;
  INSERT INTO outbound_pipeline_jobs(id,kind,status,config,actor,source)
  VALUES(p_command->>'job_id','template_apply','preview',jsonb_build_object('list_ids',lists,'template_version_id',template.id,'policy',template.policy),p_actor,p_command->>'source') RETURNING * INTO job;
  INSERT INTO outbound_pipeline_job_items(id,job_id,payload)
  SELECT gen_random_uuid()::text,job.id,jsonb_build_object('recipient_id',r.id,'list_id',r.list_id,'previous_id',dr.id,'previous_revision',dr.revision,'manual',dr.provenance='manual','company_input_revision',outbound_pipeline_input_revision(r.company_id),'company_id',r.company_id)||outbound_pipeline_render_inputs(r.company_id,l.workflow_version_id)
  FROM outbound_pipeline_recipients r JOIN compass_lead_lists l ON l.id=r.list_id
  JOIN outbound_pipeline_drafts dr ON dr.recipient_id=r.id AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts n WHERE n.previous_id=dr.id)
  WHERE lists?r.list_id;
  UPDATE outbound_pipeline_jobs SET config=config||jsonb_build_object('manual_count',(SELECT count(*) FROM outbound_pipeline_job_items WHERE job_id=job.id AND (payload->>'manual')::boolean)) WHERE id=job.id;
 ELSIF action='preview_membership' THEN
  IF NOT EXISTS(SELECT 1 FROM compass_lead_lists WHERE id=d->>'list_id') OR d->>'operation' NOT IN('add','remove') THEN RAISE EXCEPTION 'pipeline_invalid_membership_selection';END IF;
  INSERT INTO outbound_pipeline_jobs(id,kind,status,config,actor,source) VALUES(p_command->>'job_id','membership','preview',d,p_actor,p_command->>'source') RETURNING * INTO job;
  filters:=coalesce(d->'filters','{}');
  IF d->>'operation'='remove' THEN filters:=filters||jsonb_build_object('list_id',d->>'list_id');END IF;
  INSERT INTO outbound_pipeline_job_items(id,job_id,payload)
  SELECT gen_random_uuid()::text,job.id,jsonb_build_object('company_id',c.id,'membership_id',coalesce(m.id,gen_random_uuid()::text),'expected_revision',coalesce(m.revision,0),'origin',coalesce(m.origin,'Frozen selection'))
  FROM outbound_pipeline_companies(filters)c LEFT JOIN outbound_pipeline_memberships m ON m.company_id=c.id AND m.list_id=d->>'list_id'
  WHERE NOT d?'company_ids' OR d->'company_ids'?c.id;
 ELSIF action='create_export' THEN
  IF NOT EXISTS(SELECT 1 FROM compass_lead_lists WHERE id=d->>'list_id') OR d->>'grain' NOT IN('companies','recipients') OR jsonb_array_length(d->'columns') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'pipeline_invalid_export';END IF;
  INSERT INTO outbound_pipeline_jobs(id,kind,status,config,actor,source)
  VALUES(p_command->>'job_id','export','running',d,p_actor,p_command->>'source') RETURNING * INTO job;
  filters:=coalesce(d->'filters','{}')||jsonb_build_object('list_id',d->>'list_id');
  IF d->>'grain'='companies' THEN
   INSERT INTO outbound_pipeline_job_items(id,job_id,payload)
   SELECT gen_random_uuid()::text,job.id,jsonb_build_object('row',to_jsonb(c)) FROM outbound_pipeline_companies(filters)c
   WHERE NOT d?'company_ids' OR d->'company_ids'?c.id;
  ELSE
   INSERT INTO outbound_pipeline_job_items(id,job_id,payload)
   SELECT gen_random_uuid()::text,job.id,jsonb_build_object('row',to_jsonb(r)||coalesce(dr.copy,'{}'))
   FROM outbound_pipeline_recipients(filters) r
   LEFT JOIN outbound_pipeline_drafts dr ON dr.id=r.current_draft_id
   WHERE r.list_id=d->>'list_id' AND (NOT d?'company_ids' OR d->'company_ids'?r.company_id);
  END IF;
 ELSE RAISE EXCEPTION 'pipeline_invalid_job_action';END IF;
 UPDATE outbound_pipeline_jobs SET total_count=(SELECT count(*) FROM outbound_pipeline_job_items WHERE job_id=job.id),status=CASE WHEN EXISTS(SELECT 1 FROM outbound_pipeline_job_items WHERE job_id=job.id) THEN status ELSE 'completed' END WHERE id=job.id RETURNING * INTO job;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','job',to_jsonb(job));
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',receipt,now());
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_job_create(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_job_create(jsonb,text,text) TO service_role;
CREATE FUNCTION public.outbound_pipeline_job_commit(p_command jsonb,p_hash text,p_actor text,p_results jsonb,p_content text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE job outbound_pipeline_jobs;entry jsonb;item outbound_pipeline_job_items;head text;state text;draft_id text;receipt jsonb;saved record;child jsonb;processed integer:=0;member outbound_pipeline_memberships;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN
  IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';END IF;
  RETURN saved.receipt;
 END IF;
 SELECT * INTO job FROM outbound_pipeline_jobs WHERE id=p_command->>'job_id' FOR UPDATE;
 IF job.id IS NULL THEN RAISE EXCEPTION 'pipeline_not_found';END IF;
 IF job.revision<>(p_command->>'expected_revision')::integer THEN RAISE EXCEPTION 'pipeline_revision_conflict';END IF;
 IF job.status NOT IN('preview','running') OR jsonb_array_length(p_results) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'pipeline_invalid_job_chunk';END IF;
 IF (job.kind='export') IS DISTINCT FROM (p_command->>'action'='export_chunk') THEN RAISE EXCEPTION 'pipeline_job_kind_mismatch';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_results) LOOP
  SELECT * INTO item FROM outbound_pipeline_job_items WHERE id=entry->>'item_id' AND job_id=job.id FOR UPDATE;
  IF item.id IS NULL OR item.status<>'queued' THEN RAISE EXCEPTION 'pipeline_job_item_conflict';END IF;
  state:='applied';draft_id:=NULL;
  IF job.kind='template_apply' THEN
   SELECT id INTO head FROM outbound_pipeline_drafts d WHERE d.recipient_id=item.payload->>'recipient_id' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts n WHERE n.previous_id=d.id);
   IF head IS DISTINCT FROM item.payload->>'previous_id' OR outbound_pipeline_input_revision(item.payload->>'company_id')<>(item.payload->>'company_input_revision')::integer THEN
    state:='conflicted';
   ELSIF entry->>'status'='failed' THEN state:='failed';
   ELSE
    draft_id:=gen_random_uuid()::text;
    child:=jsonb_build_object('schema_version','outbound.pipeline.v1','request_id',job.id||':'||item.id,'source',p_command->>'source','operations',jsonb_build_array(jsonb_build_object('kind','draft','expected_revision',0,'record',jsonb_build_object('id',draft_id,'list_id',item.payload->>'list_id','recipient_id',item.payload->>'recipient_id','template_version_id',job.config->>'template_version_id','copy',entry->'copy','provenance','template','input_refs',item.payload->'input_refs','previous_id',head))));
    PERFORM outbound_pipeline_apply(child,md5(child::text),p_actor);
   END IF;
  ELSIF job.kind='membership' THEN
   SELECT * INTO member FROM outbound_pipeline_memberships WHERE list_id=job.config->>'list_id' AND company_id=item.payload->>'company_id';
   IF coalesce(member.revision,0)<>(item.payload->>'expected_revision')::integer OR (member.id IS NOT NULL AND member.id<>item.payload->>'membership_id') THEN state:='conflicted';
   ELSE
    child:=jsonb_build_object('schema_version','outbound.pipeline.v1','request_id',job.id||':'||item.id,'source',p_command->>'source','operations',jsonb_build_array(jsonb_build_object('kind','membership','expected_revision',(item.payload->>'expected_revision')::integer,'record',jsonb_build_object('id',item.payload->>'membership_id','list_id',job.config->>'list_id','company_id',item.payload->>'company_id','active',job.config->>'operation'='add','origin',item.payload->>'origin'))));
    PERFORM outbound_pipeline_apply(child,md5(child::text),p_actor);
   END IF;
  END IF;
  UPDATE outbound_pipeline_job_items SET status=state,result=jsonb_build_object('draft_id',draft_id,'reason',CASE state WHEN 'conflicted' THEN 'Record or evidence changed after preview' WHEN 'failed' THEN coalesce(entry->>'reason','Required signal unavailable') ELSE NULL END) WHERE id=item.id;
  processed:=processed+1;
 END LOOP;
 IF job.kind='export' THEN INSERT INTO outbound_pipeline_export_chunks(job_id,content,row_count) VALUES(job.id,p_content,processed);END IF;
 UPDATE outbound_pipeline_jobs SET revision=revision+1,updated_at=now(),
  applied_count=(SELECT count(*) FROM outbound_pipeline_job_items WHERE job_id=job.id AND status='applied'),
  conflicted_count=(SELECT count(*) FROM outbound_pipeline_job_items WHERE job_id=job.id AND status='conflicted'),
  failed_count=(SELECT count(*) FROM outbound_pipeline_job_items WHERE job_id=job.id AND status='failed'),
  status=CASE WHEN EXISTS(SELECT 1 FROM outbound_pipeline_job_items WHERE job_id=job.id AND status='queued') THEN 'running' WHEN EXISTS(SELECT 1 FROM outbound_pipeline_job_items WHERE job_id=job.id AND status IN('conflicted','failed')) THEN 'attention' ELSE 'completed' END
 WHERE id=job.id RETURNING * INTO job;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','job',to_jsonb(job),'processed',processed);
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',receipt,now());
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_job_commit(jsonb,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_job_commit(jsonb,text,text,jsonb,text) TO service_role;
