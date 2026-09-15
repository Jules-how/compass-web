-- Additive research ledger. Never updates leads, preparations or reservations.
CREATE TABLE public.crm_research_sources (
  id text PRIMARY KEY, source_type text NOT NULL CHECK(source_type IN ('official_site','directory','business_register','provider','operator_report','legacy_import','generator')),
  url text, provider text, external_id text, retrieved_at timestamptz, published_at timestamptz,
  content_hash text, artifact_ref text, note text NOT NULL DEFAULT ''
);
CREATE TABLE public.crm_companies (
  id text PRIMARY KEY, name text NOT NULL CHECK(length(name)>0), legal_name text, country text NOT NULL DEFAULT 'AU', website text,
  domains jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(domains)='array'),
  identity_status text NOT NULL DEFAULT 'unreviewed' CHECK(identity_status IN ('unreviewed','reviewed','disputed')),
  parent_company_id text REFERENCES public.crm_companies(id), parent_relation text CHECK(parent_relation IN ('owned_by','franchise_of')),
  identifiers jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(identifiers)='array'), is_archived boolean NOT NULL DEFAULT false,
  CHECK ((parent_company_id IS NULL)=(parent_relation IS NULL)), CHECK(parent_company_id IS DISTINCT FROM id)
);
CREATE TABLE public.crm_company_locations (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES public.crm_companies(id), label text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('premises','service_area')), address text, city text, state text,
  regions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(regions)='array'), source_id text NOT NULL REFERENCES public.crm_research_sources(id),
  observed_at timestamptz, status text NOT NULL DEFAULT 'unknown' CHECK(status IN ('active','closed','unknown'))
);
CREATE TABLE public.crm_people (
  id text PRIMARY KEY, name text NOT NULL, profile_url text, source_id text NOT NULL REFERENCES public.crm_research_sources(id),
  identity_status text NOT NULL DEFAULT 'unreviewed' CHECK(identity_status IN ('unreviewed','reviewed','disputed'))
);
CREATE TABLE public.crm_company_people (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES public.crm_companies(id), person_id text NOT NULL REFERENCES public.crm_people(id),
  location_id text REFERENCES public.crm_company_locations(id), role text NOT NULL,
  state text NOT NULL DEFAULT 'unknown' CHECK(state IN ('current','former','unknown')),
  source_id text NOT NULL REFERENCES public.crm_research_sources(id), observed_at timestamptz, decision_maker_basis text NOT NULL DEFAULT ''
);
CREATE TABLE public.crm_contact_methods (
  id text PRIMARY KEY, method_type text NOT NULL CHECK(method_type IN ('email','phone','linkedin','contact_form')),
  value text NOT NULL, normalized_value text NOT NULL, normalization_version integer NOT NULL DEFAULT 1 CHECK(normalization_version=1),
  UNIQUE(method_type, normalized_value)
);
CREATE TABLE public.crm_contact_candidates (
  id text PRIMARY KEY, company_id text NOT NULL REFERENCES public.crm_companies(id), method_id text NOT NULL REFERENCES public.crm_contact_methods(id),
  affiliation_id text REFERENCES public.crm_company_people(id), location_id text REFERENCES public.crm_company_locations(id),
  purpose text NOT NULL CHECK(purpose IN ('general','personal_work','department','unknown')),
  first_origin text NOT NULL CHECK(first_origin IN ('published_general','published_personal_work','provider_enriched','generated_hypothesis','legacy_unknown')),
  state text NOT NULL DEFAULT 'unresolved' CHECK(state IN ('retained','unresolved','rejected')), reason text NOT NULL DEFAULT '', generation jsonb,
  CHECK(first_origin<>'generated_hypothesis' OR (generation IS NOT NULL AND affiliation_id IS NOT NULL)),
  CHECK(first_origin='generated_hypothesis' OR generation IS NULL),
  CHECK(first_origin<>'published_personal_work' OR affiliation_id IS NOT NULL)
);
CREATE UNIQUE INDEX crm_candidate_identity ON public.crm_contact_candidates(company_id,method_id,coalesce(affiliation_id,''),coalesce(location_id,''));
CREATE TABLE public.crm_research_observations (
  id text PRIMARY KEY, company_id text REFERENCES public.crm_companies(id), location_id text REFERENCES public.crm_company_locations(id),
  person_id text REFERENCES public.crm_people(id), affiliation_id text REFERENCES public.crm_company_people(id), candidate_id text REFERENCES public.crm_contact_candidates(id),
  fact_key text NOT NULL, value jsonb NOT NULL, source_id text NOT NULL REFERENCES public.crm_research_sources(id),
  quote text NOT NULL DEFAULT '', locator text NOT NULL DEFAULT '', observed_at timestamptz, effective_date text,
  evidence_type text NOT NULL CHECK(evidence_type IN ('published','provider_assertion','operator_report','inference','legacy_import','generation')),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed','rejected')),
  rationale text NOT NULL DEFAULT '', researcher text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '', extraction_version text NOT NULL DEFAULT '',
  basis_ids jsonb NOT NULL DEFAULT '[]', supersedes_ids jsonb NOT NULL DEFAULT '[]',
  CHECK(num_nonnulls(company_id,location_id,person_id,affiliation_id,candidate_id)=1),
  CHECK(evidence_type IN ('legacy_import','generation') OR (observed_at IS NOT NULL AND (quote<>'' OR locator<>''))),
  CHECK(evidence_type<>'inference' OR (jsonb_array_length(basis_ids)>0 AND rationale<>'')),
  CHECK(NOT(fact_key='person_attribution' AND value='"supported"'::jsonb AND evidence_type IN ('provider_assertion','generation','legacy_import')))
);
CREATE TABLE public.crm_verification_events (
  id text PRIMARY KEY, method_id text NOT NULL REFERENCES public.crm_contact_methods(id), provider text NOT NULL,
  provider_request_id text, provider_result_id text, cache_key text, submitted_address text NOT NULL,
  checked_at timestamptz, received_at timestamptz, attempt_state text NOT NULL CHECK(attempt_state IN ('completed','failed','timed_out','pending')),
  mailbox_result text CHECK(mailbox_result IN ('valid','invalid','catch_all','unknown','risky')), raw_status text NOT NULL DEFAULT '', reason text NOT NULL DEFAULT '',
  artifact_ref text, source_id text REFERENCES public.crm_research_sources(id), legacy_import boolean NOT NULL DEFAULT false,
  CHECK((attempt_state='completed')=(mailbox_result IS NOT NULL)),
  CHECK(legacy_import OR (checked_at IS NOT NULL AND provider_request_id IS NOT NULL))
);
CREATE UNIQUE INDEX crm_verification_provider_event ON public.crm_verification_events(provider,provider_request_id,coalesce(provider_result_id,''),method_id,attempt_state) WHERE provider_request_id IS NOT NULL;
CREATE TABLE public.crm_lead_links (
  id text PRIMARY KEY, lead_id text NOT NULL REFERENCES public.lead_contacts(id), company_id text NOT NULL REFERENCES public.crm_companies(id),
  affiliation_id text REFERENCES public.crm_company_people(id), location_id text REFERENCES public.crm_company_locations(id),
  primary_email_candidate_id text REFERENCES public.crm_contact_candidates(id), primary_phone_candidate_id text REFERENCES public.crm_contact_candidates(id),
  match_state text NOT NULL CHECK(match_state IN ('proposed','confirmed','rejected')), reason text NOT NULL, source_id text NOT NULL REFERENCES public.crm_research_sources(id),
  expected_lead_updated_at timestamptz, UNIQUE(lead_id,company_id)
);
CREATE UNIQUE INDEX crm_one_confirmed_lead_company ON public.crm_lead_links(lead_id) WHERE match_state='confirmed';
CREATE TABLE public.crm_legacy_company_links (
  id text PRIMARY KEY, outbound_company_id text NOT NULL REFERENCES public.compass_outbound_companies(id), company_id text NOT NULL REFERENCES public.crm_companies(id),
  match_state text NOT NULL CHECK(match_state IN ('proposed','confirmed','rejected')), reason text NOT NULL, source_id text NOT NULL REFERENCES public.crm_research_sources(id),
  UNIQUE(outbound_company_id,company_id)
);
CREATE TABLE public.crm_research_receipts (
  request_id text PRIMARY KEY, payload_hash text NOT NULL, source text NOT NULL, actor text NOT NULL, receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['crm_research_sources','crm_companies','crm_company_locations','crm_people','crm_company_people','crm_contact_methods','crm_contact_candidates','crm_research_observations','crm_verification_events','crm_lead_links','crm_legacy_company_links'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0), ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN actor text NOT NULL',tab);
  END LOOP;
  FOREACH tab IN ARRAY ARRAY['crm_research_sources','crm_companies','crm_company_locations','crm_people','crm_company_people','crm_contact_methods','crm_contact_candidates','crm_research_observations','crm_verification_events','crm_lead_links','crm_legacy_company_links','crm_research_receipts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('CREATE POLICY crm_operator_read ON public.%I FOR SELECT TO authenticated USING(public.portal_is_operator())',tab);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  END LOOP;
END $$;
CREATE INDEX crm_company_name ON public.crm_companies(lower(name),id);
CREATE INDEX crm_location_company ON public.crm_company_locations(company_id);
CREATE INDEX crm_location_regions ON public.crm_company_locations USING gin(regions);
CREATE INDEX crm_affiliation_company ON public.crm_company_people(company_id,person_id);
CREATE INDEX crm_candidate_company ON public.crm_contact_candidates(company_id,id);
CREATE INDEX crm_observation_company ON public.crm_research_observations(company_id,fact_key,observed_at DESC);
CREATE INDEX crm_observation_candidate ON public.crm_research_observations(candidate_id,fact_key,observed_at DESC);
CREATE INDEX crm_observation_supersedes ON public.crm_research_observations USING gin(supersedes_ids);
CREATE INDEX crm_verification_method ON public.crm_verification_events(method_id,checked_at DESC,id);
CREATE INDEX crm_lead_company ON public.crm_lead_links(company_id) WHERE match_state='confirmed';

CREATE FUNCTION public.crm_research_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'crm_immutable_record'; END $$;
DO $$ DECLARE tab text; BEGIN
  FOREACH tab IN ARRAY ARRAY['crm_research_sources','crm_research_observations','crm_verification_events','crm_research_receipts','crm_contact_methods'] LOOP
    EXECUTE format('CREATE TRIGGER crm_immutable BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.crm_research_immutable()',tab);
  END LOOP;
END $$;

-- Only active reviewed observations establish current fields. Contradictory values
-- yield disputed/NULL until an explicit observation supersedes the conflicting IDs.
CREATE VIEW public.crm_current_facts WITH (security_invoker=true) AS
SELECT company_id,location_id,person_id,affiliation_id,candidate_id,fact_key,
  CASE WHEN count(DISTINCT value)=1 THEN (jsonb_agg(value)->0) ELSE NULL END AS value,
  CASE WHEN count(DISTINCT value)=1 THEN 'supported' ELSE 'disputed' END AS state,
  max(observed_at) AS observed_at, jsonb_agg(id ORDER BY id) AS evidence_ids
FROM public.crm_research_observations o
WHERE review_status='reviewed' AND fact_key NOT IN ('note','contact_origin') AND NOT EXISTS(
  SELECT 1 FROM public.crm_research_observations newer WHERE newer.review_status='reviewed' AND newer.supersedes_ids ? o.id
)
GROUP BY company_id,location_id,person_id,affiliation_id,candidate_id,fact_key;

CREATE VIEW public.crm_company_profiles WITH (security_invoker=true) AS
WITH profiles AS (
 SELECT c.*,coalesce(f.facts,'{}'::jsonb) AS facts,f.research_observed_at,
  coalesce(l.regions,'[]'::jsonb) AS regions,
  (SELECT count(*)::int FROM public.crm_company_people a WHERE a.company_id=c.id) AS people_count,
  (SELECT count(*)::int FROM public.crm_contact_candidates ca WHERE ca.company_id=c.id) AS candidate_count
 FROM public.crm_companies c
 LEFT JOIN LATERAL (
   SELECT jsonb_object_agg(fact_key,jsonb_build_object('value',value,'state',state,'observed_at',observed_at,'evidence_ids',evidence_ids)) AS facts,CASE WHEN count(*) FILTER(WHERE observed_at IS NULL)>0 THEN NULL ELSE min(observed_at) END AS research_observed_at
   FROM public.crm_current_facts f WHERE f.company_id=c.id
 ) f ON true
 LEFT JOIN LATERAL (
   SELECT jsonb_agg(DISTINCT region) AS regions FROM public.crm_company_locations loc CROSS JOIN LATERAL jsonb_array_elements_text(loc.regions) region
   WHERE loc.company_id=c.id AND loc.status='active'
 ) l ON true
)
SELECT p.*,
 facts#>>'{customer_mix,value}' AS customer_mix,
 (facts#>>'{installs_air_conditioning,value}')::boolean AS installs_air_conditioning,
 (facts#>>'{installs_ducted,value}')::boolean AS installs_ducted,
 (facts#>>'{installs_multi_split,value}')::boolean AS installs_multi_split,
 facts#>>'{established_status,value}' AS established_status,
 (facts#>>'{reviews,value,count}')::integer AS review_count,
 (facts#>>'{reviews,value,rating}')::numeric AS review_rating,
 CASE WHEN facts#>>'{business_age,value,year}' IS NOT NULL THEN extract(year FROM current_date)::integer-(facts#>>'{business_age,value,year}')::integer END AS age_years,
 facts#>>'{business_age,value,basis}' AS age_basis,
 CASE
  WHEN country<>'AU' OR facts#>>'{customer_mix,value}'='commercial_only' OR facts#>>'{operating_status,value}'='closed' THEN 'not_in_target'
  WHEN identity_status='reviewed' AND country='AU' AND facts#>>'{customer_mix,value}' IN ('residential_only','mixed')
    AND facts#>>'{operating_status,value}'='active' AND facts#>>'{installs_air_conditioning,value}'='true'
    AND (facts#>>'{installs_ducted,value}'='true' OR facts#>>'{installs_multi_split,value}'='true')
    AND facts#>>'{established_status,value}'='supported' AND jsonb_array_length(regions)>0 THEN 'eligible'
  ELSE 'research_needed' END AS fit_status
FROM profiles p;

-- A boolean-only bridge avoids granting research readers direct access to the
-- legacy lead ledger, whose table privileges predate these migrations.
CREATE FUNCTION public.crm_candidate_is_primary(p_id text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (coalesce(public.portal_is_operator(),false) OR current_setting('role',true)='service_role') THEN RETURN false; END IF;
  RETURN EXISTS(SELECT 1 FROM crm_contact_candidates c JOIN crm_contact_methods m ON m.id=c.method_id
    JOIN crm_lead_links l ON l.match_state='confirmed' AND (l.primary_email_candidate_id=c.id OR l.primary_phone_candidate_id=c.id)
    JOIN lead_contacts lead ON lead.id=l.lead_id WHERE c.id=p_id AND (
      (l.primary_email_candidate_id=c.id AND m.method_type='email' AND m.normalized_value=lower(trim(lead.email))) OR
      (l.primary_phone_candidate_id=c.id AND m.method_type='phone' AND m.normalized_value=regexp_replace(trim(lead.phone),'[[:space:]().-]','','g'))));
END $$;
REVOKE ALL ON FUNCTION public.crm_candidate_is_primary(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_candidate_is_primary(text) TO authenticated,service_role;

CREATE VIEW public.crm_candidate_profiles WITH (security_invoker=true) AS
SELECT c.*,m.method_type,m.value,m.normalized_value,a.person_id,a.role,a.state AS affiliation_state,p.name AS person_name,
 CASE WHEN af.state='disputed' THEN 'disputed' ELSE coalesce(af.value#>>'{}',CASE WHEN c.affiliation_id IS NULL THEN 'not_person_specific' ELSE 'unresolved' END) END AS attribution_status,
 latest.id AS latest_attempt_id,latest.attempt_state AS latest_attempt_state,latest.reason AS latest_attempt_reason,
 completed.id AS verification_id,completed.mailbox_result,completed.checked_at AS verified_at,
 public.crm_candidate_is_primary(c.id) AS legacy_primary
FROM public.crm_contact_candidates c JOIN public.crm_contact_methods m ON m.id=c.method_id
LEFT JOIN public.crm_company_people a ON a.id=c.affiliation_id LEFT JOIN public.crm_people p ON p.id=a.person_id
LEFT JOIN public.crm_current_facts af ON af.candidate_id=c.id AND af.fact_key='person_attribution'
LEFT JOIN LATERAL(SELECT * FROM public.crm_verification_events e WHERE e.method_id=m.id ORDER BY e.checked_at DESC NULLS LAST,e.created_at DESC,e.id DESC LIMIT 1) latest ON true
LEFT JOIN LATERAL(SELECT * FROM public.crm_verification_events e WHERE e.method_id=m.id AND e.attempt_state='completed' ORDER BY e.checked_at DESC NULLS LAST,e.created_at DESC,e.id DESC LIMIT 1) completed ON true;
GRANT SELECT ON public.crm_current_facts,public.crm_company_profiles,public.crm_candidate_profiles TO authenticated,service_role;

-- Internal invariant checks run after every atomic packet. No lead writes occur.
CREATE FUNCTION public.crm_validate_record(p_kind text,p_id text) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb; tab text; ref text; other crm_research_observations; lead lead_contacts; ca crm_contact_candidates; method crm_contact_methods; owner text; old_subject text;
BEGIN
  IF p_kind='company' THEN
    IF EXISTS(WITH RECURSIVE parents AS(SELECT id,parent_company_id,ARRAY[id] path,false cycle FROM crm_companies WHERE id=p_id UNION ALL SELECT c.id,c.parent_company_id,path||c.id,c.id=ANY(path) FROM parents p JOIN crm_companies c ON c.id=p.parent_company_id WHERE NOT cycle) SELECT 1 FROM parents WHERE cycle) THEN RAISE EXCEPTION 'crm_company_cycle'; END IF;
    IF EXISTS(SELECT 1 FROM crm_companies WHERE id=p_id AND identity_status='reviewed') AND NOT EXISTS(SELECT 1 FROM crm_research_observations WHERE company_id=p_id AND fact_key='note' AND review_status='reviewed' AND rationale<>'' AND observed_at IS NOT NULL) THEN RAISE EXCEPTION 'crm_identity_review_evidence_required'; END IF;
    FOR ref IN SELECT x->>'source_id' FROM crm_companies c CROSS JOIN LATERAL jsonb_array_elements(c.identifiers) x WHERE c.id=p_id LOOP
      IF NOT EXISTS(SELECT 1 FROM crm_research_sources WHERE id=ref) THEN RAISE EXCEPTION 'crm_identifier_source_missing'; END IF;
    END LOOP;
  ELSIF p_kind IN ('affiliation','candidate','lead_link') THEN
    tab:=CASE p_kind WHEN 'affiliation' THEN 'crm_company_people' WHEN 'candidate' THEN 'crm_contact_candidates' ELSE 'crm_lead_links' END;
    EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1',tab) INTO r USING p_id;
    IF r->>'location_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM crm_company_locations WHERE id=r->>'location_id' AND company_id=r->>'company_id') THEN RAISE EXCEPTION 'crm_location_company_mismatch'; END IF;
    IF r->>'affiliation_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM crm_company_people WHERE id=r->>'affiliation_id' AND company_id=r->>'company_id') THEN RAISE EXCEPTION 'crm_affiliation_company_mismatch'; END IF;
    IF p_kind='candidate' THEN
      SELECT * INTO ca FROM crm_contact_candidates WHERE id=p_id;
      IF ca.first_origin IN ('published_general','published_personal_work','provider_enriched') AND NOT EXISTS(
        SELECT 1 FROM crm_research_observations o JOIN crm_research_sources s ON s.id=o.source_id
        WHERE o.candidate_id=p_id AND o.fact_key='contact_origin' AND o.value=to_jsonb(ca.first_origin) AND o.review_status='reviewed'
          AND ((ca.first_origin='provider_enriched' AND o.evidence_type='provider_assertion' AND s.source_type='provider') OR (ca.first_origin<>'provider_enriched' AND o.evidence_type='published' AND s.url IS NOT NULL))
      ) THEN RAISE EXCEPTION 'crm_contact_origin_evidence_required'; END IF;
      IF ca.first_origin='published_personal_work' AND NOT EXISTS(SELECT 1 FROM crm_current_facts WHERE candidate_id=p_id AND fact_key='person_attribution' AND state='supported' AND value='"supported"') THEN RAISE EXCEPTION 'crm_person_attribution_required'; END IF;
    ELSIF p_kind='lead_link' THEN
      SELECT * INTO lead FROM lead_contacts WHERE id=r->>'lead_id' FOR SHARE;
      IF lead.updated_at::timestamptz IS DISTINCT FROM (r->>'expected_lead_updated_at')::timestamptz THEN RAISE EXCEPTION 'crm_lead_revision_conflict'; END IF;
      FOREACH ref IN ARRAY ARRAY[r->>'primary_email_candidate_id',r->>'primary_phone_candidate_id'] LOOP
        IF ref IS NOT NULL THEN
          SELECT * INTO ca FROM crm_contact_candidates WHERE id=ref;
          SELECT * INTO method FROM crm_contact_methods WHERE id=ca.method_id;
          IF ca.company_id IS DISTINCT FROM r->>'company_id' THEN RAISE EXCEPTION 'crm_primary_company_mismatch'; END IF;
          IF ref=r->>'primary_email_candidate_id' AND (method.method_type<>'email' OR method.normalized_value IS DISTINCT FROM lower(trim(lead.email))) THEN RAISE EXCEPTION 'crm_primary_email_mismatch'; END IF;
          IF ref=r->>'primary_phone_candidate_id' AND (method.method_type<>'phone' OR method.normalized_value IS DISTINCT FROM regexp_replace(trim(lead.phone),'[[:space:]().-]','','g')) THEN RAISE EXCEPTION 'crm_primary_phone_mismatch'; END IF;
        END IF;
      END LOOP;
    END IF;
  ELSIF p_kind='verification' THEN
    SELECT to_jsonb(v) INTO r FROM crm_verification_events v WHERE id=p_id;
    IF NOT EXISTS(SELECT 1 FROM crm_contact_methods WHERE id=r->>'method_id' AND method_type='email' AND normalized_value=r->>'submitted_address') THEN RAISE EXCEPTION 'crm_verification_address_mismatch'; END IF;
  ELSIF p_kind='observation' THEN
    SELECT * INTO other FROM crm_research_observations WHERE id=p_id;
    old_subject:=coalesce(other.company_id,other.location_id,other.person_id,other.affiliation_id,other.candidate_id);
    IF EXISTS(WITH RECURSIVE chain AS (
      SELECT id,supersedes_ids,ARRAY[id] path,false cycle FROM crm_research_observations WHERE id=p_id
      UNION ALL SELECT o.id,o.supersedes_ids,c.path||o.id,o.id=ANY(c.path) FROM chain c
      CROSS JOIN LATERAL jsonb_array_elements_text(c.supersedes_ids) ref_id
      JOIN crm_research_observations o ON o.id=ref_id WHERE NOT c.cycle
    ) SELECT 1 FROM chain WHERE cycle) THEN RAISE EXCEPTION 'crm_supersession_cycle'; END IF;
    FOR ref IN SELECT jsonb_array_elements_text(other.supersedes_ids) LOOP
      IF ref=p_id OR NOT EXISTS(SELECT 1 FROM crm_research_observations o WHERE o.id=ref AND (o.company_id,o.location_id,o.person_id,o.affiliation_id,o.candidate_id,o.fact_key) IS NOT DISTINCT FROM (other.company_id,other.location_id,other.person_id,other.affiliation_id,other.candidate_id,other.fact_key) AND o.created_at<=other.created_at) THEN RAISE EXCEPTION 'crm_invalid_supersession'; END IF;
    END LOOP;
    FOR ref IN SELECT jsonb_array_elements_text(other.basis_ids) LOOP
      IF ref=p_id OR NOT EXISTS(SELECT 1 FROM crm_research_observations o WHERE o.id=ref AND coalesce(o.company_id,o.location_id,o.person_id,o.affiliation_id,o.candidate_id)=old_subject) THEN RAISE EXCEPTION 'crm_evidence_subject_mismatch'; END IF;
    END LOOP;
    IF other.fact_key='person_attribution' AND other.value='"supported"'::jsonb THEN
      SELECT * INTO ca FROM crm_contact_candidates WHERE id=other.candidate_id;
      IF ca.affiliation_id IS NULL THEN RAISE EXCEPTION 'crm_person_attribution_requires_person'; END IF;
      IF other.evidence_type='published' AND NOT EXISTS(
        SELECT 1 FROM crm_company_people a JOIN crm_people p ON p.id=a.person_id JOIN crm_contact_methods m ON m.id=ca.method_id
        JOIN crm_research_sources s ON s.id=other.source_id
        WHERE a.id=ca.affiliation_id AND s.url IS NOT NULL AND position(lower(p.name) IN lower(other.quote))>0 AND position(lower(m.value) IN lower(other.quote))>0
      ) THEN RAISE EXCEPTION 'crm_person_address_quote_required'; END IF;
    END IF;
  END IF;
END $$;

CREATE FUNCTION public.crm_research_apply(p_command jsonb,p_hash text,p_actor text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
REVOKE ALL ON FUNCTION public.crm_research_apply(jsonb,text,text),public.crm_validate_record(text,text),public.crm_research_immutable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_research_apply(jsonb,text,text) TO service_role;

CREATE FUNCTION public.crm_research_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('schema_version','crm.research.v1','lead_columns',(SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='lead_contacts'),'alternate_outreach_enabled',false)
$$;
REVOKE ALL ON FUNCTION public.crm_research_capabilities() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_research_capabilities() TO service_role;

CREATE FUNCTION public.crm_company_matches(p public.crm_company_profiles,f jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT
  (coalesce(f->>'include_archived','false')='true' OR NOT p.is_archived)
  AND (coalesce(f->>'q','')='' OR position(lower(f->>'q') IN lower(p.name||' '||coalesce(p.website,'')||' '||p.domains::text))>0)
  AND (coalesce(f->>'customer_mix','')='' OR coalesce(p.customer_mix,'unknown')=ANY(string_to_array(f->>'customer_mix',',')))
  AND (coalesce(f->>'region','')='' OR p.regions ?| string_to_array(f->>'region',','))
  AND (coalesce(f->>'fit_status','')='' OR p.fit_status=f->>'fit_status')
  AND (coalesce(f->>'established_status','')='' OR p.established_status=f->>'established_status')
  AND (coalesce(f->>'system','')='' OR (f->>'system'='ducted' AND p.installs_ducted) OR (f->>'system'='multi_split' AND p.installs_multi_split) OR (f->>'system'='high_ticket' AND (p.installs_ducted OR p.installs_multi_split)))
  AND (f->>'min_reviews' IS NULL OR p.review_count>=(f->>'min_reviews')::int)
  AND (f->>'min_rating' IS NULL OR p.review_rating>=(f->>'min_rating')::numeric)
  AND (f->>'min_age' IS NULL OR p.age_years>=(f->>'min_age')::int)
  AND (coalesce(f->>'age_basis','')='' OR p.age_basis=f->>'age_basis')
  AND (coalesce(f->>'freshness','')='' OR (f->>'freshness'='unknown' AND p.research_observed_at IS NULL)
    OR (f->>'freshness'='fresh' AND p.research_observed_at>=now()-make_interval(days=>coalesce((f->>'fresh_days')::int,90)))
    OR (f->>'freshness'='stale' AND p.research_observed_at<now()-make_interval(days=>coalesce((f->>'fresh_days')::int,90))))
  AND (coalesce(f->>'missing_fact','')='' OR NOT(p.facts ? (f->>'missing_fact')) OR p.facts#>>ARRAY[f->>'missing_fact','state']='disputed')
  AND ((coalesce(f->>'origin','')='' AND coalesce(f->>'attribution','')='' AND coalesce(f->>'mailbox','')='' AND coalesce(f->>'role','')='') OR EXISTS(
    SELECT 1 FROM crm_candidate_profiles c WHERE c.company_id=p.id
      AND (coalesce(f->>'origin','')='' OR c.first_origin=f->>'origin' OR EXISTS(SELECT 1 FROM crm_research_observations cf WHERE cf.candidate_id=c.id AND cf.fact_key='contact_origin' AND cf.value=to_jsonb(f->>'origin') AND cf.review_status='reviewed' AND NOT EXISTS(SELECT 1 FROM crm_research_observations newer WHERE newer.review_status='reviewed' AND newer.supersedes_ids ? cf.id)))
      AND (coalesce(f->>'attribution','')='' OR c.attribution_status=f->>'attribution')
      AND (coalesce(f->>'mailbox','')='' OR c.mailbox_result=f->>'mailbox')
      AND (coalesce(f->>'role','')='' OR (c.affiliation_state='current' AND position(lower(f->>'role') IN lower(c.role))>0))
  ))
$$;
CREATE FUNCTION public.crm_search_companies(p_filters jsonb DEFAULT '{}') RETURNS SETOF public.crm_company_profiles LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT p.* FROM crm_company_profiles p WHERE crm_company_matches(p,p_filters)
$$;
CREATE FUNCTION public.crm_research_lead_scope(p_list_ids text[] DEFAULT NULL,p_company_filters jsonb DEFAULT '{}') RETURNS SETOF public.lead_contacts LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT l.* FROM lead_contacts l WHERE
  (p_list_ids IS NULL OR EXISTS(SELECT 1 FROM compass_lead_list_members m WHERE m.lead_id=l.id AND m.list_id=ANY(p_list_ids)))
  AND EXISTS(SELECT 1 FROM crm_lead_links link JOIN crm_company_profiles p ON p.id=link.company_id WHERE link.lead_id=l.id AND link.match_state='confirmed' AND crm_company_matches(p,p_company_filters))
$$;
REVOKE ALL ON FUNCTION public.crm_company_matches(public.crm_company_profiles,jsonb),public.crm_search_companies(jsonb),public.crm_research_lead_scope(text[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_company_matches(public.crm_company_profiles,jsonb),public.crm_search_companies(jsonb),public.crm_research_lead_scope(text[],jsonb) TO authenticated,service_role;
