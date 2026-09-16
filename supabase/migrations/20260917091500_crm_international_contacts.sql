-- Preserve canonical CRM writes as the outbound workspace expands internationally.
ALTER TABLE public.crm_company_locations
 ADD COLUMN IF NOT EXISTS country_code text,
 ADD COLUMN IF NOT EXISTS administrative_region text,
 ADD COLUMN IF NOT EXISTS suburb text,
 ADD COLUMN IF NOT EXISTS postcode text,
 ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.crm_contact_candidates ADD COLUMN phone_kind text
 CHECK(phone_kind IS NULL OR phone_kind IN ('mobile','work','business','unknown'));
ALTER TABLE public.crm_contact_methods DROP CONSTRAINT crm_contact_methods_method_type_check;
ALTER TABLE public.crm_contact_methods ADD CONSTRAINT crm_contact_methods_method_type_check
 CHECK(method_type IN ('email','phone','linkedin','contact_form','facebook','instagram','x','youtube','tiktok','whatsapp','other_social'));
CREATE FUNCTION public.crm_extended_fields_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_TABLE_NAME='crm_company_locations' THEN
  IF NEW.country_code IS NOT NULL AND NEW.country_code !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'crm_invalid_country'; END IF;
  IF NEW.timezone IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'crm_invalid_timezone'; END IF;
 ELSIF NEW.phone_kind IS NOT NULL AND NOT EXISTS(SELECT 1 FROM crm_contact_methods WHERE id=NEW.method_id AND method_type='phone') THEN
  RAISE EXCEPTION 'crm_phone_classification_requires_phone';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_international_guard BEFORE INSERT OR UPDATE ON public.crm_company_locations FOR EACH ROW EXECUTE FUNCTION public.crm_extended_fields_guard();
CREATE TRIGGER crm_phone_guard BEFORE INSERT OR UPDATE ON public.crm_contact_candidates FOR EACH ROW EXECUTE FUNCTION public.crm_extended_fields_guard();
REVOKE ALL ON FUNCTION public.crm_extended_fields_guard() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crm_research_apply(p_command jsonb,p_hash text,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op jsonb; tab text; old jsonb; data jsonb; stored jsonb; results jsonb:='[]'; prior crm_research_receipts; rid text:=p_command->>'request_id'; k text; immutable boolean; disposition text;
BEGIN
  IF p_command->>'schema_version'<>'crm.research.v1' OR coalesce(jsonb_array_length(p_command->'operations'),0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'crm_invalid_command'; END IF;
  -- Consistent global write lock keeps small packets atomic without deadlocks on
  -- cross-company identities. No model or provider calls are made under this lock.
  PERFORM pg_advisory_xact_lock(19850915,1);
  SELECT * INTO prior FROM crm_research_receipts WHERE request_id=rid;
  IF FOUND THEN
    IF prior.payload_hash<>p_hash OR prior.actor<>p_actor THEN RAISE EXCEPTION 'crm_idempotency_conflict'; END IF;
    RETURN prior.receipt;
  END IF;
  FOR op IN SELECT value FROM jsonb_array_elements(p_command->'operations') LOOP
    k:=op->>'kind'; data:=op->'record';
    tab:=CASE k WHEN 'source' THEN 'crm_research_sources' WHEN 'company' THEN 'crm_companies' WHEN 'location' THEN 'crm_company_locations' WHEN 'person' THEN 'crm_people' WHEN 'affiliation' THEN 'crm_company_people' WHEN 'method' THEN 'crm_contact_methods' WHEN 'candidate' THEN 'crm_contact_candidates' WHEN 'observation' THEN 'crm_research_observations' WHEN 'verification' THEN 'crm_verification_events' WHEN 'lead_link' THEN 'crm_lead_links' WHEN 'legacy_company_link' THEN 'crm_legacy_company_links' END;
    IF tab IS NULL THEN RAISE EXCEPTION 'crm_unknown_record_kind'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(data) key WHERE key IN ('revision','created_at','updated_at','actor') OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tab AND column_name=key)) THEN RAISE EXCEPTION 'crm_unknown_record_field'; END IF;
    -- Old clients omit the additive fields. Preserve them unless explicitly supplied,
    -- including an explicit null to clear a field. Existing full-record semantics remain.
    IF k IN ('location','candidate') THEN
      EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tab) INTO old USING data->>'id';
      IF old IS NOT NULL THEN
        SELECT coalesce(jsonb_object_agg(key,value),'{}'::jsonb)||data INTO data
        FROM jsonb_each(old) WHERE (k='location' AND key IN ('country_code','administrative_region','suburb','postcode','timezone'))
          OR (k='candidate' AND key='phone_kind');
      END IF;
    END IF;
    EXECUTE format('SELECT to_jsonb(jsonb_populate_record(NULL::%I,$1))-''revision''-''created_at''-''updated_at''-''actor''',tab) INTO data USING data;
    EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tab) INTO old USING data->>'id';
    IF coalesce((old->>'revision')::int,0)<>(op->>'expected_revision')::int THEN RAISE EXCEPTION 'crm_revision_conflict:%',data->>'id'; END IF;
    immutable:=k IN ('source','observation','verification','method');
    IF old IS NOT NULL AND (old-'revision'-'created_at'-'updated_at'-'actor')=data THEN
      stored:=old; disposition:='unchanged';
    ELSE
      IF old IS NOT NULL AND immutable THEN RAISE EXCEPTION 'crm_immutable_record:%',data->>'id'; END IF;
      IF old IS NOT NULL AND k='candidate' AND (old->'company_id',old->'method_id',old->'affiliation_id',old->'location_id',old->'first_origin',old->'generation') IS DISTINCT FROM (data->'company_id',data->'method_id',data->'affiliation_id',data->'location_id',data->'first_origin',data->'generation') THEN RAISE EXCEPTION 'crm_candidate_identity_immutable'; END IF;
      IF old IS NOT NULL AND k='affiliation' AND (old->'company_id',old->'person_id',old->'location_id') IS DISTINCT FROM (data->'company_id',data->'person_id',data->'location_id') THEN RAISE EXCEPTION 'crm_affiliation_identity_immutable'; END IF;
      IF old IS NOT NULL AND k='location' AND old->'company_id' IS DISTINCT FROM data->'company_id' THEN RAISE EXCEPTION 'crm_location_identity_immutable'; END IF;
      IF old IS NOT NULL AND k='person' AND old->'name' IS DISTINCT FROM data->'name' AND EXISTS(SELECT 1 FROM crm_company_people a JOIN crm_contact_candidates ca ON ca.affiliation_id=a.id WHERE a.person_id=data->>'id') THEN RAISE EXCEPTION 'crm_linked_person_identity_immutable'; END IF;
      data:=data||jsonb_build_object('revision',coalesce((old->>'revision')::int,0)+1,'created_at',coalesce(old->>'created_at',now()::text),'updated_at',now(),'actor',p_actor);
      IF old IS NULL THEN
        EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(NULL::%I,$1) RETURNING to_jsonb(%I.*)',tab,tab,tab) INTO stored USING data;
        disposition:='created';
      ELSE
        -- Mutable record tables have no inbound delete/reinsert path: update in place.
        EXECUTE (SELECT format('UPDATE %I SET (%s)=(SELECT %s FROM jsonb_populate_record(NULL::%I,$1)) WHERE id=$2 RETURNING to_jsonb(%I.*)',tab,string_agg(quote_ident(column_name),',' ORDER BY ordinal_position),string_agg(quote_ident(column_name),',' ORDER BY ordinal_position),tab,tab) FROM information_schema.columns WHERE table_schema='public' AND table_name=tab AND column_name<>'id') INTO stored USING data,data->>'id';
        disposition:='updated';
      END IF;
    END IF;
    results:=results||jsonb_build_array(jsonb_build_object('kind',k,'id',stored->>'id','revision',stored->'revision','disposition',disposition,'record',stored));
  END LOOP;
  FOR op IN SELECT value FROM jsonb_array_elements(p_command->'operations') LOOP
    PERFORM crm_validate_record(op->>'kind',op->'record'->>'id');
  END LOOP;
  stored:=jsonb_build_object('schema_version','crm.research.v1','request_id',rid,'payload_hash',p_hash,'operations',results,'committed_at',now());
  INSERT INTO crm_research_receipts(request_id,payload_hash,source,actor,receipt) VALUES(rid,p_hash,p_command->>'source',p_actor,stored);
  RETURN stored;
END $$;

CREATE OR REPLACE VIEW public.crm_candidate_profiles WITH (security_invoker=true) AS
SELECT c.id,c.company_id,c.method_id,c.affiliation_id,c.location_id,c.purpose,c.first_origin,c.state,c.reason,c.generation,c.revision,c.created_at,c.updated_at,c.actor,m.method_type,m.value,m.normalized_value,a.person_id,a.role,a.state AS affiliation_state,p.name AS person_name,
 CASE WHEN af.state='disputed' THEN 'disputed' ELSE coalesce(af.value#>>'{}',CASE WHEN c.affiliation_id IS NULL THEN 'not_person_specific' ELSE 'unresolved' END) END AS attribution_status,
 latest.id AS latest_attempt_id,latest.attempt_state AS latest_attempt_state,latest.reason AS latest_attempt_reason,
 completed.id AS verification_id,completed.mailbox_result,completed.checked_at AS verified_at,
 public.crm_candidate_is_primary(c.id) AS legacy_primary,c.phone_kind
FROM public.crm_contact_candidates c JOIN public.crm_contact_methods m ON m.id=c.method_id
LEFT JOIN public.crm_company_people a ON a.id=c.affiliation_id LEFT JOIN public.crm_people p ON p.id=a.person_id
LEFT JOIN public.crm_current_facts af ON af.candidate_id=c.id AND af.fact_key='person_attribution'
LEFT JOIN LATERAL(SELECT * FROM public.crm_verification_events e WHERE e.method_id=m.id ORDER BY e.checked_at DESC NULLS LAST,e.created_at DESC,e.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL(SELECT * FROM public.crm_verification_events e WHERE e.method_id=m.id AND e.attempt_state='completed' ORDER BY e.checked_at DESC NULLS LAST,e.created_at DESC,e.id DESC LIMIT 1) completed ON true;
