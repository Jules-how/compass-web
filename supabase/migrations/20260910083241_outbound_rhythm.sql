-- Additive outreach capture on the existing lead, touch and task records.
ALTER TABLE public.lead_contacts
 ADD COLUMN IF NOT EXISTS rhythm_selected_at timestamptz,
 ADD COLUMN IF NOT EXISTS rhythm_offer_key text,
 ADD COLUMN IF NOT EXISTS rhythm_timezone text,
 ADD COLUMN IF NOT EXISTS rhythm_disposition text,
 ADD COLUMN IF NOT EXISTS rhythm_last_interaction_at timestamptz,
 ADD COLUMN IF NOT EXISTS rhythm_revision integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS contact_restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS contact_source_key text,
 ADD COLUMN IF NOT EXISTS contact_phone_source_url text;
CREATE UNIQUE INDEX IF NOT EXISTS lead_contact_source_key_idx ON public.lead_contacts(contact_source_key) WHERE contact_source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_rhythm_selection_idx ON public.lead_contacts(rhythm_offer_key,rhythm_selected_at,id) WHERE rhythm_selected_at IS NOT NULL;
ALTER TABLE public.lead_outreach_touches
 ADD COLUMN IF NOT EXISTS direction text,
 ADD COLUMN IF NOT EXISTS outcome text,
 ADD COLUMN IF NOT EXISTS note text,
 ADD COLUMN IF NOT EXISTS person_reached text,
 ADD COLUMN IF NOT EXISTS disposition text,
 ADD COLUMN IF NOT EXISTS external_event_id text,
 ADD COLUMN IF NOT EXISTS request_payload jsonb,
 ADD COLUMN IF NOT EXISTS save_result jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS lead_touch_external_idx ON public.lead_outreach_touches(source,external_event_id) WHERE external_event_id IS NOT NULL;
ALTER TABLE public.compass_tasks
 ADD COLUMN IF NOT EXISTS lead_id text REFERENCES public.lead_contacts(id),
 ADD COLUMN IF NOT EXISTS outreach_channel text,
 ADD COLUMN IF NOT EXISTS outreach_reason text,
 ADD COLUMN IF NOT EXISTS outreach_timezone text,
 ADD COLUMN IF NOT EXISTS outreach_state text CHECK (outreach_state IN ('proposed','accepted','unresolved')),
 ADD COLUMN IF NOT EXISTS originating_touch_id text,
 ADD COLUMN IF NOT EXISTS outreach_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS task_primary_outreach_idx ON public.compass_tasks(lead_id) WHERE outreach_primary AND status NOT IN ('completed','cancelled');
CREATE INDEX IF NOT EXISTS task_outreach_queue_idx ON public.compass_tasks(status,due,lead_id) WHERE lead_id IS NOT NULL;
CREATE TABLE public.compass_outbound_rhythm_preferences (
 id text PRIMARY KEY DEFAULT 'default' CHECK(id='default'),
 call_target integer NOT NULL DEFAULT 10 CHECK(call_target BETWEEN 0 AND 200),
 ready_days integer NOT NULL DEFAULT 2 CHECK(ready_days BETWEEN 1 AND 14),
 revision integer NOT NULL DEFAULT 0,
 accepted boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.compass_outbound_rhythm_preferences(id) VALUES('default');
CREATE TABLE public.compass_outbound_work_log (
 id uuid PRIMARY KEY,
 day date NOT NULL,
 category text NOT NULL CHECK(category IN ('preparation','selling','systems')),
 minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compass_outbound_rhythm_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_rhythm_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_work_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compass_outbound_work_log FORCE ROW LEVEL SECURITY;
CREATE POLICY rhythm_preferences_operator ON public.compass_outbound_rhythm_preferences FOR SELECT TO authenticated USING(public.portal_is_operator());
CREATE POLICY rhythm_work_operator ON public.compass_outbound_work_log FOR SELECT TO authenticated USING(public.portal_is_operator());
REVOKE ALL ON public.compass_outbound_rhythm_preferences,public.compass_outbound_work_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.compass_outbound_rhythm_preferences,public.compass_outbound_work_log TO authenticated;
GRANT ALL ON public.compass_outbound_rhythm_preferences,public.compass_outbound_work_log TO service_role;

CREATE FUNCTION public.compass_outbound_rhythm_save(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 agent boolean := coalesce(auth.role(),'')='service_role';
 l lead_contacts; t compass_tasks; ev lead_outreach_touches; prefs compass_outbound_rhythm_preferences;
 result jsonb; tid text; eid text; stamp timestamptz := clock_timestamp(); n jsonb := p->'next';
 op text := p->>'operation'; state text; task_payload jsonb; restriction text;
BEGIN
 IF NOT agent AND NOT public.portal_is_operator() THEN RAISE EXCEPTION 'operator_required'; END IF;
 IF op='preferences' THEN
  IF agent THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
  SELECT * INTO prefs FROM compass_outbound_rhythm_preferences WHERE id='default' FOR UPDATE;
  IF prefs.revision IS DISTINCT FROM (p->>'revision')::int THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  UPDATE compass_outbound_rhythm_preferences SET call_target=(p->>'call_target')::int,ready_days=(p->>'ready_days')::int,accepted=true,revision=revision+1,updated_at=stamp WHERE id='default' RETURNING * INTO prefs;
  RETURN to_jsonb(prefs);
 END IF;
 IF op='work' THEN
  IF agent THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
  INSERT INTO compass_outbound_work_log(id,day,category,minutes,note) VALUES((p->>'request_id')::uuid,(p->>'day')::date,p->>'category',(p->>'minutes')::int,coalesce(p->>'note','')) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM compass_outbound_work_log WHERE id=(p->>'request_id')::uuid AND day=(p->>'day')::date AND category=p->>'category' AND minutes=(p->>'minutes')::int AND note=coalesce(p->>'note','')) THEN RAISE EXCEPTION 'request_id_reused'; END IF;
  RETURN jsonb_build_object('saved',true);
 END IF;
 SELECT * INTO l FROM lead_contacts WHERE id=p->>'lead_id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
 eid := 'rhythm-' || (p->>'request_id');
 IF op='capture' THEN
  SELECT * INTO ev FROM lead_outreach_touches WHERE id=eid;
  IF FOUND THEN
   IF ev.request_payload IS DISTINCT FROM p THEN RAISE EXCEPTION 'request_id_reused'; END IF;
   RETURN ev.save_result || jsonb_build_object('replayed',true);
  END IF;
 END IF;
 IF l.rhythm_revision IS DISTINCT FROM (p->>'revision')::int THEN RAISE EXCEPTION 'revision_conflict'; END IF;
 IF op='select' THEN
  IF NOT (p->>'selected')::boolean AND EXISTS(SELECT 1 FROM compass_tasks WHERE lead_id=l.id AND status NOT IN ('completed','cancelled')) THEN RAISE EXCEPTION 'close_or_reschedule_open_actions_first'; END IF;
  UPDATE lead_contacts SET rhythm_selected_at=CASE WHEN (p->>'selected')::boolean THEN stamp ELSE NULL END,rhythm_offer_key='installation-booking',rhythm_timezone=nullif(p->>'timezone',''),rhythm_revision=rhythm_revision+1 WHERE id=l.id;
  RETURN jsonb_build_object('saved',true);
 END IF;
 IF n IS NOT NULL THEN
  IF n->>'channel' NOT IN ('call','email','sms','other') OR n->>'state' NOT IN ('accepted','proposed') OR nullif(trim(n->>'title'),'') IS NULL THEN RAISE EXCEPTION 'invalid_next_action'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=n->>'timezone') THEN RAISE EXCEPTION 'invalid_timezone'; END IF;
  PERFORM (n->>'due')::timestamptz;
  IF l.contact_restrictions ?| ARRAY['all','unknown',n->>'channel'] OR (l.suppression_reason IS NOT NULL AND l.suppression_reason !~* 'bounced|invalid|manual_email_only') THEN RAISE EXCEPTION 'contact_restricted'; END IF;
  IF n->>'channel'='sms' AND nullif(trim(n->>'sms_basis'),'') IS NULL THEN RAISE EXCEPTION 'text_invitation_required'; END IF;
 END IF;
 IF op NOT IN ('capture','task') THEN RAISE EXCEPTION 'invalid_operation'; END IF;
 IF agent AND (coalesce(n->>'state','proposed')='accepted' OR p->>'task_status' IN ('completed','cancelled') OR coalesce((p->>'complete_task')::boolean,false)) THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
 IF nullif(p->>'task_id','') IS NOT NULL THEN
  SELECT * INTO t FROM compass_tasks WHERE id=p->>'task_id' AND lead_id=l.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  IF t.updated_at IS DISTINCT FROM (p->>'expected_updated_at')::timestamptz THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  IF t.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'task_closed'; END IF;
 END IF;
 IF op='capture' THEN
  IF p->>'outcome' NOT IN ('no_answer','invalid_route','office_reached','decision_maker','information_requested','meeting_agreed','meeting_held','not_now','not_interested','do_not_contact','next_step') THEN RAISE EXCEPTION 'invalid_outcome'; END IF;
  IF p->>'channel' NOT IN ('call','email','sms','other') OR p->>'direction' NOT IN ('inbound','outbound') OR p->>'disposition' NOT IN ('schedule','closed','unresolved') THEN RAISE EXCEPTION 'invalid_capture'; END IF;
  IF p->>'disposition'='closed' AND length(trim(coalesce(p->>'note','')))=0 THEN RAISE EXCEPTION 'closure_reason_required'; END IF;
  IF p->>'outcome'='do_not_contact' AND p->>'disposition'='schedule' THEN RAISE EXCEPTION 'record_restriction_before_scheduling'; END IF;
  IF p->>'outcome'='do_not_contact' THEN
   restriction := p->>'restriction';
   IF restriction NOT IN ('all','call','email','sms','unknown') THEN RAISE EXCEPTION 'restriction_scope_required'; END IF;
   UPDATE lead_contacts SET contact_restrictions=contact_restrictions || jsonb_build_object(restriction,jsonb_build_object('at',stamp,'note',p->>'note')),
     suppression_reason=CASE WHEN restriction IN ('all','unknown') THEN 'manual_do_not_contact' WHEN restriction='email' THEN 'manual_email_only' ELSE suppression_reason END,
     recontact_ok=CASE WHEN restriction IN ('all','unknown','email') THEN 0 ELSE recontact_ok END WHERE id=l.id;
  END IF;
  UPDATE lead_contacts SET rhythm_disposition=p->>'disposition',rhythm_last_interaction_at=(p->>'occurred_at')::timestamptz WHERE id=l.id;
  INSERT INTO lead_outreach_touches(id,contact_id,contacted_at,channel,direction,outcome,note,person_reached,disposition,source,request_payload)
   VALUES(eid,l.id,(p->>'occurred_at')::timestamptz,p->>'channel',p->>'direction',p->>'outcome',p->>'note',p->>'person_reached',p->>'disposition',CASE WHEN agent THEN 'agent_manual' ELSE 'operator_manual' END,p);
 END IF;
 IF t.id IS NOT NULL AND (op='task' OR coalesce((p->>'complete_task')::boolean,false)) THEN
  IF agent THEN
   -- Agents may revise proposals, never silently move accepted work.
   IF t.outreach_state='accepted' THEN RAISE EXCEPTION 'operator_confirmation_required'; END IF;
   UPDATE compass_tasks SET title=coalesce(n->>'title',title),due=coalesce(n->>'due',due),updated_at=stamp WHERE id=t.id;
  ELSE
   task_payload := CASE WHEN coalesce((p->>'complete_task')::boolean,false) THEN jsonb_build_object('status','completed') ELSE jsonb_strip_nulls(jsonb_build_object('status',p->>'task_status','title',n->>'title','due',n->>'due')) END;
   result := public.portal_operator_apply_task_mutation(t.id,task_payload,NULL);
   IF result->>'status'='conflict' THEN RAISE EXCEPTION 'revision_conflict'; END IF;
  END IF;
  IF op='task' AND n IS NOT NULL THEN
   UPDATE compass_tasks SET outreach_channel=n->>'channel',outreach_reason=n->>'reason',outreach_timezone=n->>'timezone',outreach_state=n->>'state',updated_at=stamp WHERE id=t.id;
  END IF;
 END IF;
 IF op='capture' AND p->>'disposition' IN ('schedule','unresolved') THEN
  state := CASE WHEN p->>'disposition'='unresolved' THEN 'unresolved' ELSE coalesce(n->>'state','proposed') END;
  IF state NOT IN ('accepted','proposed','unresolved') THEN RAISE EXCEPTION 'invalid_state'; END IF;
  IF p->>'disposition'='schedule' AND (nullif(n->>'due','') IS NULL OR nullif(n->>'timezone','') IS NULL) THEN RAISE EXCEPTION 'callback_time_required'; END IF;
  IF p->>'disposition'='schedule' THEN PERFORM (n->>'due')::timestamptz; END IF;
  -- Reuse an unresolved primary action; otherwise require an explicit additional commitment.
  SELECT * INTO ev FROM lead_outreach_touches WHERE id=eid;
  SELECT * INTO t FROM compass_tasks WHERE lead_id=l.id AND outreach_primary AND status NOT IN ('completed','cancelled') FOR UPDATE;
  IF FOUND AND NOT coalesce((p->>'additional')::boolean,false) THEN
   RAISE EXCEPTION 'open_action_exists_complete_or_keep_additional';
  END IF;
  tid := 'task-' || gen_random_uuid()::text;
  task_payload := jsonb_build_object('id',tid,'title',coalesce(nullif(n->>'title',''),'Review next step: ' || coalesce(l.company,l.name,'Lead')),'status','not-started','priority',0,'task_type','SELL','source','outbound-rhythm','due',n->>'due','notes',coalesce(n->>'reason',p->>'note','') || E'\nLead: /sales/outbound/rhythm?lead=' || l.id);
  IF agent THEN
   INSERT INTO compass_tasks(id,title,status,priority,task_type,source,due,notes) VALUES(tid,task_payload->>'title','not-started',0,'SELL','outbound-rhythm',n->>'due',task_payload->>'notes');
  ELSE
   result := public.portal_operator_create_task_mutation(task_payload);
   tid := result->'task'->>'id';
   IF tid IS NULL THEN RAISE EXCEPTION 'task_creation_failed'; END IF;
  END IF;
  UPDATE compass_tasks SET lead_id=l.id,outreach_channel=coalesce(n->>'channel','other'),outreach_reason=coalesce(n->>'reason',p->>'note'),outreach_timezone=n->>'timezone',outreach_state=state,originating_touch_id=eid,outreach_primary=(t.id IS NULL) WHERE id=tid;
 END IF;
 UPDATE lead_contacts SET rhythm_revision=rhythm_revision+1,rhythm_selected_at=coalesce(rhythm_selected_at,stamp),rhythm_offer_key=coalesce(rhythm_offer_key,'installation-booking'),
 rhythm_timezone=coalesce(nullif(n->>'timezone',''),rhythm_timezone),
 last_outbound_at=CASE WHEN op='capture' AND p->>'direction'='outbound' THEN greatest(last_outbound_at,(p->>'occurred_at')::timestamptz) ELSE last_outbound_at END WHERE id=l.id;
 result := jsonb_build_object('saved',true,'touch_id',CASE WHEN op='capture' THEN eid ELSE NULL END,'task_id',tid,'revision',l.rhythm_revision+1);
 IF op='capture' THEN UPDATE lead_outreach_touches SET save_result=result WHERE id=eid; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.compass_outbound_rhythm_save(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_outbound_rhythm_save(jsonb) TO authenticated,service_role;

ALTER TABLE public.lead_contacts ADD COLUMN IF NOT EXISTS instantly_event_at timestamptz;
-- One atomic provider event: retries do not duplicate, older events cannot regress state.
CREATE FUNCTION public.compass_outbound_provider_event(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l lead_contacts; at timestamptz:=(p->>'at')::timestamptz; s text:=p->>'status'; latest boolean; old_rank int; new_rank int;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service_required'; END IF;
 SELECT * INTO l FROM lead_contacts WHERE id=p->>'lead_id' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'lead_not_found'; END IF;
 IF EXISTS(SELECT 1 FROM lead_outreach_touches WHERE id=p->>'id') THEN RETURN jsonb_build_object('replayed',true,'status',l.outbound_status); END IF;
 INSERT INTO lead_outreach_touches(id,contact_id,contacted_at,channel,direction,outcome,note,source,external_event_id,instantly_campaign_id)
 VALUES(p->>'id',l.id,at,'email',CASE WHEN p->>'event'='email_sent' THEN 'outbound' ELSE 'inbound' END,p->>'event',p->>'note','instantly_webhook',p->>'id',p->>'campaign_id');
 IF p->>'event'='email_sent' THEN UPDATE lead_contacts SET last_outbound_at=greatest(last_outbound_at,at) WHERE id=l.id; END IF;
 latest := l.instantly_event_at IS NULL OR at>=l.instantly_event_at;
 old_rank := CASE l.outbound_status WHEN 'converted' THEN 6 WHEN 'meeting_booked' THEN 5 WHEN 'interested' THEN 4 WHEN 'replied' THEN 3 WHEN 'out_of_office' THEN 2 ELSE 0 END;
 new_rank := CASE s WHEN 'converted' THEN 6 WHEN 'meeting_booked' THEN 5 WHEN 'interested' THEN 4 WHEN 'replied' THEN 3 WHEN 'out_of_office' THEN 2 ELSE 0 END;
 IF latest THEN
  UPDATE lead_contacts SET instantly_event_at=at,instantly_synced_at=now(),updated_at=now(),
    last_outbound_at=CASE WHEN p->>'event'='email_sent' THEN greatest(last_outbound_at,at) ELSE last_outbound_at END,
    outbound_status=CASE WHEN l.outbound_status IN ('suppressed','unsubscribed','dead') THEN l.outbound_status WHEN s='suppressed' OR new_rank>=old_rank OR s IN ('not_interested','wrong_person') THEN s ELSE l.outbound_status END,
    interest_label=CASE WHEN new_rank>=old_rank THEN coalesce(p->>'interest_label',interest_label) ELSE interest_label END,
    suppression_reason=CASE WHEN s='suppressed' THEN p->>'suppression_reason' ELSE suppression_reason END,
    recontact_ok=CASE WHEN s='suppressed' THEN 0 ELSE recontact_ok END,
    pipeline_stage=CASE WHEN new_rank>=old_rank THEN coalesce(p->>'pipeline_stage',pipeline_stage) ELSE pipeline_stage END
  WHERE id=l.id;
 END IF;
 -- A late unsubscribe must still be honoured even when an older send arrived first.
 IF p->>'event'='lead_unsubscribed' THEN UPDATE lead_contacts SET outbound_status='suppressed',recontact_ok=0,suppression_reason='instantly_unsubscribed' WHERE id=l.id; END IF;
 RETURN jsonb_build_object('replayed',false,'stale',NOT latest);
END $$;
REVOKE ALL ON FUNCTION public.compass_outbound_provider_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_outbound_provider_event(jsonb) TO service_role;
