-- Bounded source-row bridge. No existing lead, fit, suppression, copy or sending state is changed.
CREATE TABLE public.crm_legacy_import_rows (
 lead_id text PRIMARY KEY REFERENCES public.lead_contacts(id), company_id text REFERENCES public.crm_companies(id),
 snapshot jsonb NOT NULL, warnings jsonb NOT NULL DEFAULT '[]', request_id text NOT NULL, actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_legacy_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_legacy_import_rows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_legacy_import_rows FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.crm_legacy_import_rows TO service_role;
CREATE POLICY crm_legacy_operator_read ON public.crm_legacy_import_rows FOR SELECT TO authenticated USING(public.portal_is_operator());
GRANT SELECT ON public.crm_legacy_import_rows TO authenticated;

CREATE FUNCTION public.crm_legacy_page(p_after text DEFAULT '',p_until text DEFAULT NULL,p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ceiling text; rows jsonb; total bigint; remaining bigint;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'crm_invalid_limit'; END IF;
 SELECT coalesce(p_until,max(id)) INTO ceiling FROM lead_contacts;
 SELECT count(*) INTO total FROM lead_contacts WHERE id<=ceiling;
 SELECT count(*) INTO remaining FROM lead_contacts l WHERE l.id<=ceiling AND NOT EXISTS(SELECT 1 FROM crm_lead_links x WHERE x.lead_id=l.id AND x.match_state='confirmed');
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]') INTO rows FROM
 (SELECT lc.* FROM lead_contacts lc WHERE lc.id>p_after AND lc.id<=ceiling ORDER BY lc.id LIMIT p_limit)l;
 RETURN jsonb_build_object('rows',rows,'until',ceiling,'total',total,'unlinked',remaining,
 'next_after',CASE WHEN EXISTS(SELECT 1 FROM lead_contacts WHERE id>(rows->-1->>'id') AND id<=ceiling) THEN rows->-1->>'id' ELSE NULL END);
END $$;
CREATE FUNCTION public.crm_legacy_apply(p_request_id text,p_hash text,p_actor text,p_packets jsonb,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior crm_research_receipts; r jsonb; p jsonb; result jsonb; results jsonb:='[]'; member_count integer; row_count integer:=0;
BEGIN
 IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 25 OR jsonb_array_length(p_packets)>25 THEN RAISE EXCEPTION 'crm_invalid_import_size'; END IF;
 PERFORM pg_advisory_xact_lock(19850915,1);
 SELECT * INTO prior FROM crm_research_receipts WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>p_hash OR prior.actor<>p_actor THEN RAISE EXCEPTION 'crm_idempotency_conflict'; END IF;
  RETURN prior.receipt;
 END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF NOT EXISTS(SELECT 1 FROM lead_contacts WHERE id=r->>'lead_id' AND updated_at IS NOT DISTINCT FROM (r#>>'{snapshot,updated_at}')::timestamptz FOR SHARE) THEN RAISE EXCEPTION 'crm_lead_revision_conflict'; END IF;
 END LOOP;
 FOR p IN SELECT value FROM jsonb_array_elements(p_packets) LOOP
  result:=crm_research_apply(p->'command',p->>'hash',p_actor);
  results:=results||jsonb_build_array(jsonb_build_object('request_id',p->'command'->>'request_id','operations',jsonb_array_length(result->'operations')));
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  INSERT INTO crm_legacy_import_rows(lead_id,company_id,snapshot,warnings,request_id,actor)
   VALUES(r->>'lead_id',r->>'company_id',r->'snapshot',r->'warnings',p_request_id,p_actor) ON CONFLICT(lead_id) DO NOTHING;
  row_count:=row_count+1;
 END LOOP;
 -- Existing domain-based company identities are only proposed correspondences.
 -- Several locations/franchises may share one website; never confirm such a merge.
 INSERT INTO crm_legacy_company_links(id,outbound_company_id,company_id,match_state,reason,source_id,actor)
 SELECT 'legacy-company-link-'||md5(o.id||':'||l.company_id),o.id,l.company_id,'proposed',
  'Exact historical name and website; location/legal identity needs review.',min(l.source_id),p_actor
 FROM crm_lead_links l JOIN crm_companies c ON c.id=l.company_id
 JOIN compass_outbound_companies o ON o.name=c.name AND o.website=c.website AND c.website IS NOT NULL
 WHERE l.lead_id IN(SELECT value->>'lead_id' FROM jsonb_array_elements(p_rows))
 GROUP BY o.id,l.company_id ON CONFLICT(outbound_company_id,company_id) DO NOTHING;
 INSERT INTO outbound_pipeline_memberships(id,list_id,company_id,active,origin,actor)
 SELECT 'legacy-membership-'||md5(m.list_id||':'||l.company_id),m.list_id,l.company_id,true,'Legacy recipient membership',p_actor
 FROM compass_lead_list_members m JOIN crm_lead_links l ON l.lead_id=m.lead_id AND l.match_state='confirmed'
 WHERE m.lead_id IN(SELECT value->>'lead_id' FROM jsonb_array_elements(p_rows))
 GROUP BY m.list_id,l.company_id ON CONFLICT(list_id,company_id) DO NOTHING;
 GET DIAGNOSTICS member_count=ROW_COUNT;
 result:=jsonb_build_object('request_id',p_request_id,'rows',row_count,'memberships_added',member_count,'packets',results,'dispositions',(SELECT jsonb_agg(jsonb_build_object('lead_id',value->>'lead_id','company_id',value->>'company_id','status',CASE WHEN value->>'company_id' IS NULL THEN 'held' WHEN value->'warnings'?'already_linked' THEN 'already_linked' ELSE 'imported' END,'warnings',value->'warnings')) FROM jsonb_array_elements(p_rows)));
 INSERT INTO crm_research_receipts(request_id,payload_hash,source,actor,receipt) VALUES(p_request_id,p_hash,'Legacy CRM bridge',p_actor,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_legacy_page(text,text,integer),public.crm_legacy_apply(text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_legacy_page(text,text,integer),public.crm_legacy_apply(text,text,text,jsonb,jsonb) TO service_role;
