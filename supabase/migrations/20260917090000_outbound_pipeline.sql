-- Additive foundation. Existing lists and CRM companies remain canonical.
ALTER TABLE public.compass_lead_lists ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE public.compass_lead_lists ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.compass_lead_lists ADD COLUMN workflow_version_id text;
ALTER TABLE public.compass_lead_lists ADD COLUMN offer_version_id text;
ALTER TABLE public.compass_lead_lists ADD COLUMN icp_version_id text;
CREATE TABLE public.outbound_pipeline_workflows(id text PRIMARY KEY,name text NOT NULL,parent_id text REFERENCES public.outbound_pipeline_workflows(id),
  policy jsonb NOT NULL);
CREATE TABLE public.outbound_pipeline_templates(id text PRIMARY KEY,name text NOT NULL,parent_id text REFERENCES public.outbound_pipeline_templates(id),
  policy jsonb NOT NULL);
ALTER TABLE public.compass_lead_lists ADD FOREIGN KEY(workflow_version_id) REFERENCES public.outbound_pipeline_workflows(id);
CREATE TABLE public.outbound_pipeline_memberships(id text PRIMARY KEY,list_id text NOT NULL REFERENCES public.compass_lead_lists(id),
  company_id text NOT NULL REFERENCES public.crm_companies(id),active boolean NOT NULL DEFAULT true,origin text NOT NULL,
  UNIQUE(list_id,company_id));
CREATE TABLE public.outbound_pipeline_assessments(id text PRIMARY KEY,company_id text NOT NULL REFERENCES public.crm_companies(id),
  workflow_version_id text NOT NULL REFERENCES public.outbound_pipeline_workflows(id),input_revision integer NOT NULL,
  criteria jsonb NOT NULL,fit text NOT NULL CHECK(fit IN('unknown','anti_icp','non_fit','likely_fit',
  'sure_fit')),reason text NOT NULL,override_reason text);
CREATE TABLE public.outbound_pipeline_recipients(id text PRIMARY KEY,list_id text NOT NULL REFERENCES public.compass_lead_lists(id),
  company_id text NOT NULL REFERENCES public.crm_companies(id),candidate_id text NOT NULL REFERENCES public.crm_contact_candidates(id),
  method_id text NOT NULL REFERENCES public.crm_contact_methods(id),mailbox text NOT NULL,suitable boolean NOT NULL,
  reason text NOT NULL,lead_id text REFERENCES public.lead_contacts(id),UNIQUE(list_id,mailbox));
CREATE TABLE public.outbound_pipeline_stages(id text PRIMARY KEY,list_id text NOT NULL REFERENCES public.compass_lead_lists(id),
  company_id text NOT NULL REFERENCES public.crm_companies(id),recipient_id text REFERENCES public.outbound_pipeline_recipients(id),
  workflow_version_id text NOT NULL REFERENCES public.outbound_pipeline_workflows(id),stage text NOT NULL CHECK(stage IN('list',
  'research','contacts','verify','write')),status text NOT NULL CHECK(status IN('ready','held','completed',
  'failed','stale')),reason text NOT NULL,input_hash text NOT NULL,output_refs jsonb NOT NULL DEFAULT '[]',
  supersedes_id text REFERENCES public.outbound_pipeline_stages(id));
CREATE TABLE public.outbound_pipeline_drafts(id text PRIMARY KEY,list_id text NOT NULL REFERENCES public.compass_lead_lists(id),
  recipient_id text NOT NULL REFERENCES public.outbound_pipeline_recipients(id),template_version_id text NOT NULL REFERENCES public.outbound_pipeline_templates(id),
  copy jsonb NOT NULL,provenance text NOT NULL CHECK(provenance IN('template','manual','ai','restore')),
  input_refs jsonb NOT NULL DEFAULT '[]',previous_id text REFERENCES public.outbound_pipeline_drafts(id),
  approved boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX outbound_pipeline_draft_successor ON public.outbound_pipeline_drafts(previous_id) WHERE previous_id IS NOT NULL;
CREATE UNIQUE INDEX outbound_pipeline_draft_root ON public.outbound_pipeline_drafts(recipient_id) WHERE previous_id IS NULL;
-- Arbitrary signal observations extend company evidence without weakening CRM's legacy vocabulary.
CREATE TABLE public.outbound_pipeline_signals(id text PRIMARY KEY,company_id text NOT NULL REFERENCES public.crm_companies(id),
  workflow_version_id text NOT NULL REFERENCES public.outbound_pipeline_workflows(id),signal_id text NOT NULL,
  value jsonb NOT NULL,source_id text NOT NULL REFERENCES public.crm_research_sources(id),observed_at timestamptz NOT NULL,
  quote text NOT NULL CHECK(length(quote)>0),evidence_strength text NOT NULL CHECK(evidence_strength IN('none',
  'low','medium','high')),usefulness text NOT NULL CHECK(usefulness IN('none','low','medium','high')),
  supersedes_id text REFERENCES public.outbound_pipeline_signals(id));
CREATE TABLE public.outbound_pipeline_runs(id text PRIMARY KEY,list_id text NOT NULL REFERENCES public.compass_lead_lists(id),
  workflow_version_id text NOT NULL REFERENCES public.outbound_pipeline_workflows(id),stage text NOT NULL CHECK(stage IN('list',
  'research','contacts','verify','write')),status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued',
  'running','checkpoint','blocked','completed','cancelled','failed')),scope_count integer NOT NULL DEFAULT 0,
  scope jsonb NOT NULL DEFAULT '{}',checkpoint_reason text);
CREATE TABLE public.outbound_pipeline_items(id text PRIMARY KEY,run_id text NOT NULL REFERENCES public.outbound_pipeline_runs(id),
  company_id text NOT NULL REFERENCES public.crm_companies(id),recipient_id text REFERENCES public.outbound_pipeline_recipients(id),
  input_revision integer NOT NULL,status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running',
  'completed','held','failed')),lease_token text,lease_until timestamptz,result jsonb NOT NULL DEFAULT '{}',
  UNIQUE(run_id,company_id,recipient_id));
CREATE TABLE public.outbound_pipeline_attempts(id text PRIMARY KEY,item_id text NOT NULL REFERENCES public.outbound_pipeline_items(id),
  tool_id text NOT NULL,provider_request_id text NOT NULL UNIQUE,status text NOT NULL CHECK(status IN('reserved',
  'completed','uncertain','failed')),estimated_cost numeric NOT NULL CHECK(estimated_cost>=0),actual_cost numeric CHECK(actual_cost>=0),
  currency text NOT NULL,outcome text CHECK(outcome IN('empty','insufficient','retryable','success')),
  source_ids jsonb NOT NULL DEFAULT '[]',duration_ms integer CHECK(duration_ms>=0));
CREATE TABLE public.outbound_pipeline_receipts(request_id text PRIMARY KEY,payload_hash text NOT NULL,
  actor text NOT NULL,source text NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.outbound_pipeline_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,record_id text NOT NULL,
  kind text NOT NULL,revision integer NOT NULL,actor text NOT NULL,source text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.outbound_pipeline_input_revisions(company_id text PRIMARY KEY REFERENCES public.crm_companies(id),
  evidence_revision integer NOT NULL DEFAULT 0);
ALTER TABLE public.outbound_pipeline_input_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pipeline_input_read ON public.outbound_pipeline_input_revisions FOR SELECT TO authenticated USING(public.portal_is_operator());
GRANT SELECT ON public.outbound_pipeline_input_revisions TO authenticated;
GRANT ALL ON public.outbound_pipeline_input_revisions TO service_role;
CREATE FUNCTION public.outbound_pipeline_input_revision(p_company text) RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER AS $$ SELECT c.revision+coalesce(r.evidence_revision,
  0) FROM public.crm_companies c LEFT JOIN public.outbound_pipeline_input_revisions r ON r.company_id=c.id WHERE c.id=p_company $$;
-- International location vocabulary is additive and never guesses a timezone.
ALTER TABLE public.crm_company_locations ADD COLUMN country_code text;
ALTER TABLE public.crm_company_locations ADD COLUMN administrative_region text;
ALTER TABLE public.crm_company_locations ADD COLUMN suburb text;
ALTER TABLE public.crm_company_locations ADD COLUMN postcode text;
ALTER TABLE public.crm_company_locations ADD COLUMN timezone text;
DO $$ DECLARE tab text;
   BEGIN
FOREACH tab IN ARRAY ARRAY['workflows','templates','memberships','assessments','recipients','stages',
  'drafts','signals','runs','items','attempts'] LOOP
 EXECUTE format('ALTER TABLE public.outbound_pipeline_%I ADD COLUMN revision integer NOT NULL DEFAULT 1, ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN actor text NOT NULL',
  tab);
END LOOP;
FOREACH tab IN ARRAY ARRAY['workflows','templates','memberships','assessments','recipients','stages',
  'drafts','signals','runs','items','attempts','receipts','events'] LOOP
 EXECUTE format('ALTER TABLE public.outbound_pipeline_%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE public.outbound_pipeline_%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON public.outbound_pipeline_%I FROM PUBLIC,anon,authenticated',tab);
 EXECUTE format('GRANT SELECT ON public.outbound_pipeline_%I TO authenticated',tab);
 EXECUTE format('GRANT ALL ON public.outbound_pipeline_%I TO service_role',tab);
 EXECUTE format('CREATE POLICY pipeline_operator ON public.outbound_pipeline_%I FOR SELECT TO authenticated USING(public.portal_is_operator())',
  tab);
END LOOP;
FOREACH tab IN ARRAY ARRAY['workflows','templates','assessments','stages','drafts','signals','receipts',
  'events'] LOOP
 EXECUTE format('CREATE TRIGGER pipeline_immutable BEFORE UPDATE OR DELETE ON public.outbound_pipeline_%I FOR EACH ROW EXECUTE FUNCTION public.crm_research_immutable()',
  tab);
END LOOP;
END $$;
GRANT USAGE,SELECT ON SEQUENCE public.outbound_pipeline_events_id_seq TO service_role;
CREATE INDEX pipeline_membership_list ON public.outbound_pipeline_memberships(list_id,active,company_id);
CREATE INDEX pipeline_assessment_scope ON public.outbound_pipeline_assessments(company_id,workflow_version_id,
  created_at DESC,id DESC);
CREATE INDEX pipeline_stage_scope ON public.outbound_pipeline_stages(list_id,company_id,stage,created_at DESC,
  id DESC);
CREATE INDEX pipeline_recipient_list ON public.outbound_pipeline_recipients(list_id,id);
CREATE INDEX pipeline_draft_recipient ON public.outbound_pipeline_drafts(recipient_id,created_at DESC,
  id DESC);
CREATE INDEX pipeline_signal_company ON public.outbound_pipeline_signals(company_id,workflow_version_id,
  id);
CREATE INDEX pipeline_item_claim ON public.outbound_pipeline_items(run_id,status,lease_until,id);
CREATE INDEX pipeline_attempt_item ON public.outbound_pipeline_attempts(item_id,created_at,id);
CREATE INDEX pipeline_location_filter ON public.crm_company_locations(country_code,city,suburb,company_id);
CREATE FUNCTION public.outbound_pipeline_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER AS $$ SELECT jsonb_build_object('schema_ready',
  true,'schema_version','outbound.pipeline.v1') $$;
CREATE FUNCTION public.outbound_pipeline_fit(p_criteria jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $$
SELECT CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_criteria)c WHERE (c->>'exclusion')::boolean AND c->>'outcome'='supported') THEN 'anti_icp'
WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_criteria)c WHERE (c->>'required')::boolean AND NOT (c->>'exclusion')::boolean AND c->>'outcome'='failed') THEN 'non_fit'
WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_criteria)c WHERE (c->>'required')::boolean AND NOT (c->>'exclusion')::boolean) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_criteria)c WHERE (c->>'required')::boolean AND NOT (c->>'exclusion')::boolean AND c->>'outcome'<>'supported') THEN 'sure_fit'
WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p_criteria)c WHERE NOT (c->>'exclusion')::boolean AND c->>'outcome'='supported') THEN 'likely_fit' ELSE 'unknown' END $$;
CREATE FUNCTION public.outbound_pipeline_apply(p_command jsonb,p_hash text,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE op jsonb;
   r jsonb;
   k text;
   tab text;
   old jsonb;
   current_rev integer;
   expected integer;
   cols text;
   vals text;
   sets text;
   receipt jsonb;
   results jsonb:='[]';
   saved record;
   policy jsonb;
   candidate record;
BEGIN
 IF p_command->>'schema_version'<>'outbound.pipeline.v1' OR length(coalesce(p_command->>'request_id',
  ''))<8 OR length(coalesce(p_command->>'source',''))=0 OR jsonb_array_length(p_command->'operations') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'pipeline_invalid_command';
   END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';
   END IF;
   RETURN saved.receipt;
   END IF;
 FOR op IN SELECT value FROM jsonb_array_elements(p_command->'operations') LOOP
 k:=op->>'kind';
  r:=op->'record';
  expected:=(op->>'expected_revision')::integer;
 tab:=CASE k WHEN 'location' THEN 'crm_company_locations' WHEN 'list' THEN 'compass_lead_lists' WHEN 'membership' THEN 'outbound_pipeline_memberships' WHEN 'workflow' THEN 'outbound_pipeline_workflows' WHEN 'template' THEN 'outbound_pipeline_templates' WHEN 'assessment' THEN 'outbound_pipeline_assessments' WHEN 'stage' THEN 'outbound_pipeline_stages' WHEN 'recipient' THEN 'outbound_pipeline_recipients' WHEN 'draft' THEN 'outbound_pipeline_drafts' WHEN 'signal' THEN 'outbound_pipeline_signals' END;
 IF tab IS NULL OR expected IS NULL OR expected<0 OR coalesce(r->>'id','')='' THEN RAISE EXCEPTION 'pipeline_invalid_operation';
  END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tab||(r->>'id'),0));
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tab) INTO old USING r->>'id';
 current_rev:=coalesce((old->>'revision')::integer,0);
 IF current_rev<>expected THEN RAISE EXCEPTION 'pipeline_revision_conflict';
  END IF;
 IF current_rev>0 AND k NOT IN('list','membership','recipient','location') THEN RAISE EXCEPTION 'pipeline_immutable';
  END IF;
 IF r ?| ARRAY['revision','actor','created_at','updated_at','approved'] THEN RAISE EXCEPTION 'pipeline_reserved_field';
  END IF;
 IF current_rev>0 AND k IN('membership','recipient') AND (r->>'list_id' IS DISTINCT FROM old->>'list_id' OR r->>'company_id' IS DISTINCT FROM old->>'company_id') THEN RAISE EXCEPTION 'pipeline_identity_immutable';
  END IF;
 IF k='location' THEN
  IF current_rev=0 OR old->>'company_id' IS DISTINCT FROM r->>'company_id' THEN RAISE EXCEPTION 'pipeline_existing_location_required';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) key WHERE key NOT IN('id','company_id','country_code',
  'administrative_region','city','suburb','postcode','timezone')) THEN RAISE EXCEPTION 'pipeline_invalid_location_field';
  END IF;
 ELSIF k='workflow' THEN
  policy:=r->'policy';
  IF NOT EXISTS(SELECT 1 FROM compass_offer_revisions WHERE id=policy->>'offer_version_id') THEN RAISE EXCEPTION 'pipeline_offer_revision_required';
  END IF;
  IF jsonb_typeof(policy) IS DISTINCT FROM 'object' OR jsonb_typeof(policy->'criteria') IS DISTINCT FROM 'array' OR jsonb_typeof(policy->'tools') IS DISTINCT FROM 'array' OR jsonb_typeof(policy->'signals') IS DISTINCT FROM 'array' OR jsonb_typeof(policy->'checkpoints') IS DISTINCT FROM 'array' OR policy#>>'{budget,amount}' IS NULL OR policy#>>'{budget,currency}' IS NULL OR policy->>'concurrency' IS NULL OR policy#>>'{verification,reuse_days}' IS NULL THEN RAISE EXCEPTION 'pipeline_invalid_workflow';
  END IF;
  IF jsonb_array_length(policy->'criteria')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'criteria')c WHERE coalesce(c->>'id',
  '')='' OR jsonb_typeof(c->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'exclusion') IS DISTINCT FROM 'boolean') OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'tools')t WHERE coalesce(t->>'id',
  '')='' OR t->>'stage' NOT IN('list','research','contacts','verify','write') OR t->>'max_attempts' IS NULL OR (t->>'max_attempts')::integer NOT BETWEEN 1 AND 10 OR jsonb_typeof(t->'fallback_on') IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'pipeline_invalid_workflow';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'criteria')c GROUP BY c->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'tools')t GROUP BY t->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'signals')t GROUP BY t->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'pipeline_duplicate_policy_id';
  END IF;
  IF coalesce(policy->>'offer_version_id','')='' OR coalesce(policy->>'icp_version_id','')='' OR jsonb_typeof(policy->'tools')<>'array' OR jsonb_typeof(policy->'criteria')<>'array' OR (policy#>>'{budget,amount}')::numeric<0 OR (policy->>'concurrency')::integer NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'pipeline_invalid_workflow';
  END IF;
 ELSIF k='list' AND r->>'workflow_version_id' IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_workflows w WHERE w.id=r->>'workflow_version_id' AND w.policy->>'offer_version_id'=r->>'offer_version_id' AND w.policy->>'icp_version_id'=r->>'icp_version_id') THEN RAISE EXCEPTION 'pipeline_list_policy_mismatch';
  END IF;
 ELSIF k='template' THEN
  IF r#>>'{policy,mode}' NOT IN('deterministic','ai') OR coalesce(r#>>'{policy,unsubscribe}','')='' OR EXISTS(SELECT 1 FROM jsonb_array_elements(r#>'{policy,followups}') f WHERE (f->>'delay_days')::integer<2) THEN RAISE EXCEPTION 'pipeline_invalid_template';
  END IF;
 ELSIF k='assessment' THEN
  IF jsonb_typeof(r->'criteria') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(r->'criteria')c WHERE jsonb_typeof(c->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'exclusion') IS DISTINCT FROM 'boolean' OR c->>'outcome' IS NULL OR c->>'outcome' NOT IN('supported',
  'failed','unknown') OR jsonb_typeof(c->'evidence_ids') IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'pipeline_invalid_assessment';
  END IF;
  SELECT w.policy INTO policy FROM outbound_pipeline_workflows w WHERE id=r->>'workflow_version_id';
  IF (SELECT jsonb_agg(jsonb_build_object('id',c->>'id','required',c->'required','exclusion',c->'exclusion') ORDER BY c->>'id') FROM jsonb_array_elements(r->'criteria')c) IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('id',
  c->>'id','required',c->'required','exclusion',c->'exclusion') ORDER BY c->>'id') FROM jsonb_array_elements(policy->'criteria')c) THEN RAISE EXCEPTION 'pipeline_criterion_policy_mismatch';
   END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'criteria')c WHERE c->>'outcome'<>'unknown' AND jsonb_array_length(c->'evidence_ids')=0) THEN RAISE EXCEPTION 'pipeline_assessment_evidence_required';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'criteria')c,jsonb_array_elements_text(c->'evidence_ids')e WHERE NOT EXISTS(SELECT 1 FROM outbound_pipeline_signals si WHERE si.id=e AND si.company_id=r->>'company_id' AND si.workflow_version_id=r->>'workflow_version_id' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_signals n WHERE n.supersedes_id=si.id)) AND NOT EXISTS(SELECT 1 FROM crm_research_observations o WHERE o.id=e AND o.company_id=r->>'company_id' AND o.review_status='reviewed' AND NOT EXISTS(SELECT 1 FROM crm_research_observations n WHERE n.supersedes_ids ? o.id))) THEN RAISE EXCEPTION 'pipeline_foreign_or_stale_evidence';
  END IF;
  IF (r->>'input_revision')::integer<>(SELECT outbound_pipeline_input_revision(r->>'company_id')) THEN RAISE EXCEPTION 'pipeline_stale_company_revision';
  END IF;
  IF coalesce(r->>'override_reason','')<>'' AND p_actor NOT LIKE 'operator:%' THEN RAISE EXCEPTION 'pipeline_operator_required';
  END IF;
  r:=r||jsonb_build_object('fit',outbound_pipeline_fit(r->'criteria'));
 ELSIF k='recipient' THEN
  SELECT c.company_id,c.method_id,m.normalized_value,m.method_type INTO candidate FROM crm_contact_candidates c JOIN crm_contact_methods m ON m.id=c.method_id WHERE c.id=r->>'candidate_id';
  IF NOT FOUND OR candidate.company_id<>r->>'company_id' OR candidate.method_id<>r->>'method_id' OR candidate.method_type<>'email' OR candidate.normalized_value<>lower(trim(r->>'mailbox')) THEN RAISE EXCEPTION 'pipeline_recipient_identity_mismatch';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_memberships WHERE list_id=r->>'list_id' AND company_id=r->>'company_id' AND active) THEN RAISE EXCEPTION 'pipeline_membership_required';
  END IF;
  r:=r||jsonb_build_object('mailbox',candidate.normalized_value);
 ELSIF k='draft' THEN
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_recipients WHERE id=r->>'recipient_id' AND list_id=r->>'list_id') THEN RAISE EXCEPTION 'pipeline_draft_scope_mismatch';
  END IF;
  IF r->>'previous_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts d WHERE d.id=r->>'previous_id' AND d.recipient_id=r->>'recipient_id' AND d.list_id=r->>'list_id' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts n WHERE n.previous_id=d.id)) THEN RAISE EXCEPTION 'pipeline_draft_revision_conflict';
  END IF;
  r:=r||'{"approved":false}'::jsonb;
 ELSIF k='stage' THEN
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_memberships WHERE list_id=r->>'list_id' AND company_id=r->>'company_id' AND active) THEN RAISE EXCEPTION 'pipeline_membership_required';
  END IF;
  IF r->>'recipient_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_recipients WHERE id=r->>'recipient_id' AND list_id=r->>'list_id' AND company_id=r->>'company_id') THEN RAISE EXCEPTION 'pipeline_stage_scope_mismatch';
  END IF;
 ELSIF k='signal' THEN
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_workflows w,jsonb_array_elements(w.policy->'signals')s WHERE w.id=r->>'workflow_version_id' AND s->>'id'=r->>'signal_id') THEN RAISE EXCEPTION 'pipeline_unknown_signal';
  END IF;
  IF r->>'supersedes_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_signals WHERE id=r->>'supersedes_id' AND company_id=r->>'company_id' AND signal_id=r->>'signal_id') THEN RAISE EXCEPTION 'pipeline_signal_scope_mismatch';
  END IF;
 END IF;
 r:=r||jsonb_build_object('revision',current_rev+1,'actor',p_actor,'updated_at',now());
 IF current_rev=0 THEN r:=r||jsonb_build_object('created_at',now());
  END IF;
 -- Only real columns accepted; identifier quoting prevents arbitrary SQL.
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(r) key WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tab AND column_name=key)) THEN RAISE EXCEPTION 'pipeline_unknown_field';
  END IF;
 SELECT string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(NULL::%I,$1)).%I',
  tab,key),','),string_agg(format('%I=(jsonb_populate_record(NULL::%I,$1)).%I',key,tab,key),',') INTO cols,
  vals,sets FROM jsonb_object_keys(r) key;
 IF current_rev=0 THEN EXECUTE format('INSERT INTO %I(%s) SELECT %s',tab,cols,vals) USING r;
 ELSE EXECUTE format('UPDATE %I SET %s WHERE id=$2',tab,sets) USING r,r->>'id';
  END IF;
 INSERT INTO outbound_pipeline_events(record_id,kind,revision,actor,source) VALUES(r->>'id',k,current_rev+1,
  p_actor,p_command->>'source');
 results:=results||jsonb_build_array(jsonb_build_object('id',r->>'id','kind',k,'revision',current_rev+1));
 END LOOP;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','results',results);
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',
  receipt,now());
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_apply(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_apply(jsonb,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.outbound_pipeline_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_capabilities() TO authenticated,service_role;
CREATE FUNCTION public.outbound_pipeline_companies(p_filters jsonb DEFAULT '{}') RETURNS TABLE(id text,
  name text,country text,website text,revision integer,input_revision integer,list_id text,membership_id text,
  fit text,eligibility_override boolean,stage text,stage_status text,reason text,city text,suburb text,administrative_region text,
  timezone text) LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT c.id,c.name,c.country,c.website,c.revision,outbound_pipeline_input_revision(c.id),m.list_id,m.id,
  coalesce(a.fit,'unknown'),coalesce(a.override_reason,'')<>'',coalesce(s.stage,p_filters->>'stage'),coalesce(s.status,CASE WHEN p_filters->>'stage'='contacts' AND coalesce(a.fit,
  'unknown') NOT IN('likely_fit','sure_fit') AND coalesce(a.override_reason,'')='' THEN 'held' ELSE 'ready' END),coalesce(s.reason,a.reason,
  'Not started'),loc.city,loc.suburb,loc.administrative_region,loc.timezone
 FROM crm_companies c
 LEFT JOIN outbound_pipeline_memberships m ON m.company_id=c.id AND m.active AND m.list_id=p_filters->>'list_id'
 LEFT JOIN compass_lead_lists l ON l.id=m.list_id
 LEFT JOIN LATERAL(SELECT a.* FROM outbound_pipeline_assessments a WHERE a.company_id=c.id AND a.workflow_version_id=l.workflow_version_id AND a.input_revision=outbound_pipeline_input_revision(c.id) ORDER BY a.created_at DESC,
  a.id DESC LIMIT 1)a ON true
 LEFT JOIN LATERAL(SELECT s.* FROM outbound_pipeline_stages s WHERE s.company_id=c.id AND s.list_id=m.list_id AND s.workflow_version_id=l.workflow_version_id AND (NOT p_filters?'stage' OR s.stage=p_filters->>'stage') ORDER BY s.created_at DESC,
  s.id DESC LIMIT 1)s ON true
 LEFT JOIN LATERAL(SELECT cl.* FROM crm_company_locations cl WHERE cl.company_id=c.id AND (NOT p_filters?'city' OR cl.city=p_filters->>'city') AND (NOT p_filters?'suburb' OR cl.suburb=p_filters->>'suburb') ORDER BY cl.id LIMIT 1)loc ON true
 WHERE NOT c.is_archived AND (NOT p_filters?'list_id' OR m.id IS NOT NULL)
 AND (NOT p_filters?'q' OR c.name ILIKE '%'||(p_filters->>'q')||'%')
 AND (NOT p_filters?'country' OR c.country=p_filters->>'country')
 AND (NOT p_filters?'city' OR loc.city=p_filters->>'city') AND (NOT p_filters?'suburb' OR loc.suburb=p_filters->>'suburb')
 AND (NOT p_filters?'fit' OR coalesce(a.fit,'unknown')=p_filters->>'fit')
 AND (NOT p_filters?'status' OR coalesce(s.status,CASE WHEN p_filters->>'stage'='contacts' AND coalesce(a.fit,
  'unknown') NOT IN('likely_fit','sure_fit') AND coalesce(a.override_reason,'')='' THEN 'held' ELSE 'ready' END)=p_filters->>'status')
$$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_companies(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_companies(jsonb) TO authenticated,service_role;
-- Suitability is independently derived from canonical attribution and saved roles.
CREATE FUNCTION public.outbound_pipeline_candidate_suitable(p_candidate text,p_workflow text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT coalesce(bool_or(c.method_type='email' AND c.state<>'rejected' AND (
  (c.affiliation_id IS NULL AND c.purpose IN('general','department') AND c.first_origin='published_general')
  OR (c.affiliation_id IS NOT NULL AND c.attribution_status='supported' AND c.affiliation_state='current'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(w.policy->'target_roles')role WHERE length(trim(role))>0 AND position(lower(role) IN lower(c.role))>0))
 )),false)
 FROM crm_candidate_profiles c CROSS JOIN outbound_pipeline_workflows w WHERE c.id=p_candidate AND w.id=p_workflow
$$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_candidate_suitable(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_candidate_suitable(text,text) TO authenticated,service_role;
CREATE FUNCTION public.outbound_pipeline_run(p_command jsonb,p_hash text,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE action text:=p_command->>'action';
  d jsonb:=p_command->'data';
  run outbound_pipeline_runs;
  item outbound_pipeline_items;
  attempt outbound_pipeline_attempts;
  policy jsonb;
  tool jsonb;
  previous outbound_pipeline_attempts;
  receipt jsonb;
  saved record;
  token text;
  cost numeric;
  used numeric;
  target text;
  newid text;
  filter jsonb;
BEGIN
 IF p_command->>'schema_version'<>'outbound.pipeline.v1' OR length(coalesce(p_command->>'request_id',
  ''))<8 OR length(coalesce(p_command->>'source',''))=0 THEN RAISE EXCEPTION 'pipeline_invalid_command';
  END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command->>'request_id',0));
 SELECT * INTO saved FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF saved.payload_hash<>p_hash OR saved.actor<>p_actor THEN RAISE EXCEPTION 'pipeline_idempotency_conflict';
  END IF;
  RETURN saved.receipt;
  END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('run:'||(p_command->>'run_id'),0));
 SELECT * INTO run FROM outbound_pipeline_runs WHERE id=p_command->>'run_id' FOR UPDATE;
 IF coalesce(run.revision,0)<>(p_command->>'expected_revision')::integer THEN RAISE EXCEPTION 'pipeline_revision_conflict';
  END IF;
 IF action='start' THEN
  IF d->>'stage'='write' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_templates WHERE id=d->>'template_version_id') THEN RAISE EXCEPTION 'pipeline_template_version_required';END IF;
  IF run.id IS NOT NULL THEN RAISE EXCEPTION 'pipeline_run_exists';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM compass_lead_lists WHERE id=d->>'list_id' AND workflow_version_id=d->>'workflow_version_id') THEN RAISE EXCEPTION 'pipeline_workflow_scope_mismatch';
  END IF;
  INSERT INTO outbound_pipeline_runs(id,list_id,workflow_version_id,stage,scope,actor) VALUES(p_command->>'run_id',
  d->>'list_id',d->>'workflow_version_id',d->>'stage',d,p_actor) RETURNING * INTO run;
  filter:=coalesce(d->'filters','{}')||jsonb_build_object('list_id',run.list_id);
  IF run.stage IN('verify','write') THEN
   INSERT INTO outbound_pipeline_recipients(id,list_id,company_id,candidate_id,method_id,mailbox,suitable,reason,actor)
   SELECT gen_random_uuid()::text,run.list_id,selected.company_id,selected.id,selected.method_id,selected.normalized_value,true,'Eligible published business inbox or attributed target role',p_actor
   FROM (
    SELECT DISTINCT ON(cp.normalized_value) cp.*
    FROM outbound_pipeline_companies(filter-'q')c JOIN crm_candidate_profiles cp ON cp.company_id=c.id
    WHERE (c.fit IN('likely_fit','sure_fit') OR c.eligibility_override)
    AND (NOT d?'company_ids' OR d->'company_ids'?c.id)
    AND outbound_pipeline_candidate_suitable(cp.id,run.workflow_version_id)
    AND (NOT filter?'q' OR (c.name||' '||coalesce(cp.person_name,'')||' '||cp.normalized_value) ILIKE '%'||(filter->>'q')||'%')
    ORDER BY cp.normalized_value,(cp.affiliation_id IS NOT NULL) DESC,cp.id
   )selected ON CONFLICT(list_id,mailbox) DO NOTHING;
  END IF;

  IF run.stage IN('list','research','contacts') THEN
   INSERT INTO outbound_pipeline_items(id,run_id,company_id,input_revision,actor)
   SELECT gen_random_uuid()::text,run.id,c.id,c.input_revision,p_actor FROM outbound_pipeline_companies(filter)c WHERE (NOT d?'company_ids' OR d->'company_ids' ? c.id) AND (run.stage<>'contacts' OR c.fit IN('likely_fit',
  'sure_fit'));
  ELSE
   INSERT INTO outbound_pipeline_items(id,run_id,company_id,recipient_id,input_revision,actor)
   SELECT gen_random_uuid()::text,run.id,c.id,r.id,c.input_revision,p_actor FROM outbound_pipeline_companies(filter-'q')c JOIN outbound_pipeline_recipients r ON r.company_id=c.id AND r.list_id=run.list_id AND r.suitable
   WHERE r.id IN(SELECT id FROM outbound_pipeline_recipients(filter)) AND (NOT d?'recipient_ids' OR d->'recipient_ids'?r.id) AND outbound_pipeline_candidate_suitable(r.candidate_id,run.workflow_version_id) AND (c.fit IN('likely_fit','sure_fit') OR c.eligibility_override) AND (NOT d?'company_ids' OR d->'company_ids'?c.id)
   AND NOT EXISTS(SELECT 1 FROM crm_lead_links ll JOIN lead_contacts lc ON lc.id=ll.lead_id WHERE ll.company_id=c.id AND ll.match_state='confirmed' AND coalesce(lc.suppression_reason,
  '')<>'')
   AND (run.stage<>'write' OR EXISTS(SELECT 1 FROM crm_verification_events v JOIN outbound_pipeline_workflows w ON w.id=run.workflow_version_id WHERE v.method_id=r.method_id AND v.attempt_state='completed' AND v.mailbox_result='valid' AND (((w.policy#>>'{verification,reuse_days}')::integer>0 AND v.checked_at >= now()-make_interval(days=>(w.policy#>>'{verification,reuse_days}')::integer)) OR ((w.policy#>>'{verification,reuse_days}')::integer=0 AND EXISTS(SELECT 1 FROM outbound_pipeline_runs vr JOIN outbound_pipeline_items vi ON vi.run_id=vr.id WHERE vr.id=d->>'verification_run_id' AND vr.list_id=run.list_id AND vr.workflow_version_id=run.workflow_version_id AND vr.stage='verify' AND vr.status='completed' AND vi.recipient_id=r.id AND vi.status='completed' AND vi.result->'verification_ids'?v.id))) AND NOT EXISTS(SELECT 1 FROM crm_verification_events n WHERE n.method_id=v.method_id AND n.checked_at>v.checked_at)));
  END IF;
  UPDATE outbound_pipeline_runs SET scope_count=(SELECT count(*) FROM outbound_pipeline_items WHERE run_id=run.id),
  status=CASE WHEN EXISTS(SELECT 1 FROM outbound_pipeline_items WHERE run_id=run.id) THEN 'queued' ELSE 'blocked' END,
  checkpoint_reason=CASE WHEN EXISTS(SELECT 1 FROM outbound_pipeline_items WHERE run_id=run.id) THEN NULL ELSE 'No eligible records in selection' END WHERE id=run.id RETURNING * INTO run;
 ELSE
  IF run.id IS NULL THEN RAISE EXCEPTION 'pipeline_not_found';
  END IF;
  SELECT w.policy INTO policy FROM outbound_pipeline_workflows w WHERE id=run.workflow_version_id;
  IF action='cancel' THEN UPDATE outbound_pipeline_runs SET status='cancelled' WHERE id=run.id;
  ELSIF action='approve' THEN
   IF p_actor NOT LIKE 'operator:%' THEN RAISE EXCEPTION 'pipeline_operator_required';
  END IF;
   IF run.status<>'checkpoint' THEN RAISE EXCEPTION 'pipeline_invalid_transition';
  END IF;
   UPDATE outbound_pipeline_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM outbound_pipeline_items WHERE run_id=run.id AND status<>'completed') THEN 'running' ELSE 'completed' END,
  checkpoint_reason=NULL WHERE id=run.id;
  ELSIF action='checkpoint' THEN
   IF run.status NOT IN('running','queued') THEN RAISE EXCEPTION 'pipeline_invalid_transition';
  END IF;
   UPDATE outbound_pipeline_runs SET status='checkpoint',checkpoint_reason=coalesce(d->>'reason','Review requested') WHERE id=run.id;
  ELSIF action='resume' THEN
   IF run.status NOT IN('blocked','failed') THEN RAISE EXCEPTION 'pipeline_invalid_transition';
  END IF;
   IF EXISTS(SELECT 1 FROM outbound_pipeline_attempts a JOIN outbound_pipeline_items i ON i.id=a.item_id WHERE i.run_id=run.id AND a.status IN('reserved',
  'uncertain')) THEN RAISE EXCEPTION 'pipeline_uncertain_attempt_requires_reconciliation';
  END IF;
   UPDATE outbound_pipeline_items SET status='queued',lease_token=NULL,lease_until=NULL WHERE run_id=run.id AND status IN('failed',
  'held');
   UPDATE outbound_pipeline_runs SET status='queued' WHERE id=run.id;
  ELSE
   IF run.status NOT IN('running','queued') AND action<>'report_attempt' THEN RAISE EXCEPTION 'pipeline_run_not_executable';
  END IF;
   IF action='claim' THEN
    IF (SELECT count(*) FROM outbound_pipeline_items WHERE run_id=run.id AND status='running' AND lease_until>now())>=coalesce((policy->>'concurrency')::integer,
  1) THEN RAISE EXCEPTION 'pipeline_concurrency_limit';
  END IF;
    SELECT * INTO item FROM outbound_pipeline_items i WHERE i.run_id=run.id AND (i.status='queued' OR(i.status='running' AND i.lease_until<now())) AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_attempts a WHERE a.item_id=i.id AND a.status IN('reserved',
  'uncertain')) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF item.id IS NULL THEN RAISE EXCEPTION 'pipeline_no_claimable_work';
  END IF;
    token:=gen_random_uuid()::text;
    UPDATE outbound_pipeline_items SET status='running',lease_token=token,lease_until=now()+interval '5 minutes',
  revision=revision+1,updated_at=now(),actor=p_actor WHERE id=item.id RETURNING * INTO item;
    UPDATE outbound_pipeline_runs SET status='running' WHERE id=run.id;
   ELSE
    SELECT * INTO item FROM outbound_pipeline_items WHERE id=d->>'item_id' AND run_id=run.id FOR UPDATE;
    IF item.id IS NULL OR item.lease_token IS DISTINCT FROM d->>'lease_token' OR (item.lease_until<now() AND action<>'report_attempt') THEN RAISE EXCEPTION 'pipeline_lease_conflict';
  END IF;
    IF action='heartbeat' THEN UPDATE outbound_pipeline_items SET lease_until=now()+interval '5 minutes',revision=revision+1,updated_at=now() WHERE id=item.id RETURNING * INTO item;
    ELSIF action='reserve_attempt' THEN
     IF run.stage IN('verify','write') AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_recipients r WHERE r.id=item.recipient_id AND r.suitable AND outbound_pipeline_candidate_suitable(r.candidate_id,run.workflow_version_id)) THEN RAISE EXCEPTION 'pipeline_contact_no_longer_suitable';END IF;
     IF run.stage<>'research' AND item.input_revision<>outbound_pipeline_input_revision(item.company_id) THEN RAISE EXCEPTION 'pipeline_stale_run_inputs';
  END IF;
     IF EXISTS(SELECT 1 FROM outbound_pipeline_attempts WHERE item_id=item.id AND status IN('reserved',
  'uncertain')) THEN RAISE EXCEPTION 'pipeline_uncertain_attempt_requires_reconciliation';
  END IF;
     SELECT * INTO previous FROM outbound_pipeline_attempts WHERE item_id=item.id ORDER BY created_at DESC,
  id DESC LIMIT 1;
     SELECT t INTO tool FROM jsonb_array_elements(policy->'tools') WITH ORDINALITY ts(t,n) WHERE t->>'stage'=run.stage AND t->>'id'=d->>'tool_id';
     IF tool IS NULL THEN RAISE EXCEPTION 'pipeline_tool_not_allowed';
  END IF;
     IF previous.id IS NULL THEN
      SELECT t->>'id' INTO target FROM jsonb_array_elements(policy->'tools') WITH ORDINALITY ts(t,n) WHERE t->>'stage'=run.stage ORDER BY n LIMIT 1;
      IF target<>d->>'tool_id' THEN RAISE EXCEPTION 'pipeline_tool_order';
  END IF;
     ELSIF previous.tool_id<>d->>'tool_id' THEN
      SELECT t->>'id' INTO target FROM jsonb_array_elements(policy->'tools') WITH ORDINALITY ts(t,n) WHERE t->>'stage'=run.stage AND n>(SELECT n FROM jsonb_array_elements(policy->'tools') WITH ORDINALITY ps(p,
  n) WHERE p->>'id'=previous.tool_id) ORDER BY n LIMIT 1;
      IF target IS DISTINCT FROM d->>'tool_id' OR NOT(tool->'fallback_on'?previous.outcome) THEN RAISE EXCEPTION 'pipeline_fallback_not_allowed';
  END IF;
     ELSIF previous.outcome IS DISTINCT FROM 'retryable' THEN RAISE EXCEPTION 'pipeline_retry_not_allowed';
  END IF;
     IF (SELECT count(*) FROM outbound_pipeline_attempts WHERE item_id=item.id AND tool_id=d->>'tool_id') >= (tool->>'max_attempts')::integer THEN RAISE EXCEPTION 'pipeline_attempt_limit';
  END IF;
     cost:=(d->>'estimated_cost')::numeric;
     SELECT coalesce(sum(coalesce(a.actual_cost,a.estimated_cost)),0) INTO used FROM outbound_pipeline_attempts a JOIN outbound_pipeline_items i ON i.id=a.item_id WHERE i.run_id=run.id;
     IF cost IS NULL OR cost<0 OR d->>'currency' IS DISTINCT FROM policy#>>'{budget,currency}' OR used+cost>(policy#>>'{budget,amount}')::numeric THEN RAISE EXCEPTION 'pipeline_budget_exceeded';
  END IF;
     INSERT INTO outbound_pipeline_attempts(id,item_id,tool_id,provider_request_id,status,estimated_cost,
  currency,actor) VALUES(d->>'attempt_id',item.id,d->>'tool_id',d->>'provider_request_id','reserved',
  cost,d->>'currency',p_actor) RETURNING * INTO attempt;
    ELSIF action='report_attempt' THEN
     SELECT * INTO attempt FROM outbound_pipeline_attempts WHERE id=d->>'attempt_id' AND item_id=item.id FOR UPDATE;
     IF attempt.id IS NULL OR attempt.status NOT IN('reserved','uncertain') OR d->>'status' NOT IN('completed',
  'uncertain','failed') THEN RAISE EXCEPTION 'pipeline_invalid_attempt_transition';
  END IF;
     UPDATE outbound_pipeline_attempts SET status=d->>'status',outcome=d->>'outcome',actual_cost=(d->>'actual_cost')::numeric,
  source_ids=coalesce(d->'source_ids','[]'),duration_ms=(d->>'duration_ms')::integer,revision=revision+1,
  updated_at=now() WHERE id=attempt.id RETURNING * INTO attempt;
    ELSIF action='finish_item' THEN
     IF d->>'status' NOT IN('completed','held','failed') OR EXISTS(SELECT 1 FROM outbound_pipeline_attempts WHERE item_id=item.id AND status IN('reserved',
  'uncertain')) THEN RAISE EXCEPTION 'pipeline_item_not_finishable';
  END IF;
     IF d->>'status'='completed' THEN
      IF run.stage='research' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_assessments a WHERE a.company_id=item.company_id AND a.workflow_version_id=run.workflow_version_id AND a.input_revision=(SELECT outbound_pipeline_input_revision(item.company_id)) AND d#>'{result,assessment_ids}'?a.id) THEN RAISE EXCEPTION 'pipeline_stage_output_required';
  END IF;
      IF run.stage='contacts' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_recipients r WHERE r.list_id=run.list_id AND r.company_id=item.company_id AND d#>'{result,recipient_ids}'?r.id) THEN RAISE EXCEPTION 'pipeline_stage_output_required';
  END IF;
      IF run.stage='verify' AND NOT EXISTS(SELECT 1 FROM crm_verification_events v JOIN outbound_pipeline_recipients r ON r.method_id=v.method_id WHERE r.id=item.recipient_id AND v.attempt_state='completed' AND v.checked_at>=run.created_at AND d#>'{result,verification_ids}'?v.id) THEN RAISE EXCEPTION 'pipeline_stage_output_required';
  END IF;
      IF run.stage='write' AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts dr WHERE dr.recipient_id=item.recipient_id AND dr.list_id=run.list_id AND dr.template_version_id=run.scope->>'template_version_id' AND d#>'{result,draft_ids}'?dr.id) THEN RAISE EXCEPTION 'pipeline_stage_output_required';
  END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'tools')t WHERE t->>'stage'=run.stage) AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_attempts WHERE item_id=item.id AND status='completed' AND outcome='success') THEN RAISE EXCEPTION 'pipeline_successful_attempt_required';
  END IF;
     END IF;
     UPDATE outbound_pipeline_items SET status=d->>'status',result=coalesce(d->'result','{}'),lease_token=NULL,
  lease_until=NULL,revision=revision+1,updated_at=now() WHERE id=item.id RETURNING * INTO item;
     IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_items WHERE run_id=run.id AND status IN('queued','running')) THEN
      UPDATE outbound_pipeline_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM outbound_pipeline_items WHERE run_id=run.id AND status IN('held',
  'failed')) THEN 'blocked' WHEN policy->'checkpoints'?run.stage THEN 'checkpoint' ELSE 'completed' END WHERE id=run.id;
     END IF;
    ELSE RAISE EXCEPTION 'pipeline_invalid_action';
  END IF;
   END IF;
  END IF;
  UPDATE outbound_pipeline_runs SET revision=revision+1,updated_at=now(),actor=p_actor WHERE id=run.id RETURNING * INTO run;
 END IF;
 receipt:=jsonb_build_object('request_id',p_command->>'request_id','run',to_jsonb(run),'item',CASE WHEN item.id IS NULL THEN NULL ELSE to_jsonb(item) END,
  'attempt',CASE WHEN attempt.id IS NULL THEN NULL ELSE to_jsonb(attempt) END);
 INSERT INTO outbound_pipeline_receipts VALUES(p_command->>'request_id',p_hash,p_actor,p_command->>'source',
  receipt,now());
 INSERT INTO outbound_pipeline_events(record_id,kind,revision,actor,source) VALUES(run.id,'run.'||action,
  run.revision,p_actor,p_command->>'source');
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_run(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_run(jsonb,text,text) TO service_role;
-- Legacy list writers must participate in optimistic concurrency.
CREATE FUNCTION public.outbound_pipeline_list_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.revision=OLD.revision THEN NEW.revision:=OLD.revision+1;
  END IF;
  NEW.updated_at:=now();
  RETURN NEW;
  END $$;
CREATE TRIGGER outbound_pipeline_list_revision BEFORE UPDATE ON public.compass_lead_lists FOR EACH ROW EXECUTE FUNCTION public.outbound_pipeline_list_revision();
-- Evidence changes advance the canonical company's input revision, without changing facts.
CREATE FUNCTION public.outbound_pipeline_evidence_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company text;
   payload jsonb:=to_jsonb(NEW);
BEGIN
 company:=payload->>'company_id';
 IF company IS NULL AND payload->>'location_id' IS NOT NULL THEN SELECT company_id INTO company FROM public.crm_company_locations WHERE id=payload->>'location_id';
  END IF;
 IF company IS NOT NULL THEN INSERT INTO public.outbound_pipeline_input_revisions(company_id,evidence_revision) VALUES(company,
  1) ON CONFLICT(company_id) DO UPDATE SET evidence_revision=outbound_pipeline_input_revisions.evidence_revision+1;
  END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER outbound_pipeline_signal_revision AFTER INSERT ON public.outbound_pipeline_signals FOR EACH ROW EXECUTE FUNCTION public.outbound_pipeline_evidence_revision();
CREATE TRIGGER outbound_pipeline_observation_revision AFTER INSERT ON public.crm_research_observations FOR EACH ROW EXECUTE FUNCTION public.outbound_pipeline_evidence_revision();
CREATE TRIGGER outbound_pipeline_location_revision AFTER INSERT OR UPDATE ON public.crm_company_locations FOR EACH ROW EXECUTE FUNCTION public.outbound_pipeline_evidence_revision();
CREATE FUNCTION public.outbound_pipeline_company_suppressed(p_company text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT(coalesce(public.portal_is_operator(),false) OR current_setting('role',true)='service_role') THEN RETURN true;
  END IF;
 RETURN EXISTS(SELECT 1 FROM crm_lead_links ll JOIN lead_contacts lc ON lc.id=ll.lead_id WHERE ll.company_id=p_company AND ll.match_state='confirmed' AND coalesce(lc.suppression_reason,
  '')<>'');
END $$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_company_suppressed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_company_suppressed(text) TO authenticated,service_role;
CREATE VIEW public.outbound_pipeline_recipient_profiles WITH(security_invoker=true) AS
SELECT r.*,c.name AS company_name,CASE WHEN (SELECT count(DISTINCT other.person_id) FROM crm_candidate_profiles other WHERE other.company_id=r.company_id AND other.method_id=r.method_id AND other.attribution_status='supported')>1 THEN NULL ELSE cp.person_name END AS name,cp.role,cp.attribution_status,cp.mailbox_result,
  cp.verified_at AS checked_at,d.id AS current_draft_id,
 public.outbound_pipeline_company_suppressed(r.company_id) AS suppressed,
 CASE WHEN NOT r.suitable THEN 'unsuitable' WHEN cp.attribution_status IN('unresolved','disputed') THEN 'attribution_required' WHEN cp.mailbox_result IS DISTINCT FROM 'valid' THEN 'verification_required' ELSE 'review_policy' END AS eligibility
FROM outbound_pipeline_recipients r JOIN crm_companies c ON c.id=r.company_id JOIN crm_candidate_profiles cp ON cp.id=r.candidate_id
LEFT JOIN LATERAL(SELECT d.* FROM outbound_pipeline_drafts d WHERE d.recipient_id=r.id AND NOT EXISTS(SELECT 1 FROM outbound_pipeline_drafts n WHERE n.previous_id=d.id) LIMIT 1)d ON true;
GRANT SELECT ON public.outbound_pipeline_recipient_profiles TO authenticated,service_role;
CREATE FUNCTION public.outbound_pipeline_recipients(p_filters jsonb DEFAULT '{}') RETURNS SETOF public.outbound_pipeline_recipient_profiles LANGUAGE sql STABLE SECURITY INVOKER AS $$
 SELECT r.* FROM outbound_pipeline_recipient_profiles r
 JOIN outbound_pipeline_companies(p_filters-'q'-'draft_status'-'verification_status')c ON c.id=r.company_id
 WHERE (NOT p_filters?'list_id' OR r.list_id=p_filters->>'list_id')
 AND (NOT p_filters?'q' OR (coalesce(r.company_name,'')||' '||coalesce(r.name,'')||' '||r.mailbox) ILIKE '%'||(p_filters->>'q')||'%')
 AND (NOT p_filters?'draft_status' OR CASE WHEN r.current_draft_id IS NULL THEN 'undrafted' ELSE 'drafted' END=p_filters->>'draft_status')
 AND (NOT p_filters?'verification_status' OR coalesce(r.mailbox_result,'unverified')=p_filters->>'verification_status')
$$;
REVOKE ALL ON FUNCTION public.outbound_pipeline_recipients(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.outbound_pipeline_recipients(jsonb) TO authenticated,service_role;
