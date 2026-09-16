-- Connected agents report actual adapter probes; expired sessions cannot reserve new calls.
CREATE TABLE public.outbound_executor_sessions (
 id text PRIMARY KEY,name text NOT NULL,revision integer NOT NULL DEFAULT 1,actor text NOT NULL,
 tools jsonb NOT NULL CHECK(jsonb_typeof(tools)='array'),expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.outbound_executor_claims (
 item_id text PRIMARY KEY REFERENCES public.outbound_pipeline_items(id),session_id text NOT NULL REFERENCES public.outbound_executor_sessions(id),
 lease_token text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['outbound_executor_sessions','outbound_executor_claims'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 EXECUTE format('CREATE POLICY executor_operator_read ON public.%I FOR SELECT TO authenticated USING(public.portal_is_operator())',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
END LOOP;END $$;
CREATE FUNCTION public.outbound_executor_command(p_command jsonb,p_hash text,p_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s outbound_executor_sessions;prior outbound_pipeline_receipts;d jsonb:=p_command->'data';a text:=p_command->>'action';result jsonb;
BEGIN
 IF p_actor<>'agent' THEN RAISE EXCEPTION 'pipeline_agent_session_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('executor:'||(p_command->>'session_id')));
 SELECT * INTO prior FROM outbound_pipeline_receipts WHERE request_id=p_command->>'request_id';
 IF FOUND THEN IF prior.actor<>p_actor OR prior.payload_hash<>p_hash THEN RAISE EXCEPTION 'pipeline_idempotency_conflict'; END IF;RETURN prior.receipt;END IF;
 SELECT * INTO s FROM outbound_executor_sessions WHERE id=p_command->>'session_id' FOR UPDATE;
 IF coalesce(s.revision,0)<>(p_command->>'expected_revision')::integer THEN RAISE EXCEPTION 'pipeline_executor_revision_conflict'; END IF;
 IF a='register' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'tools')t WHERE (t#>>'{probe,checked_at}')::timestamptz<now()-interval '10 minutes' OR (t#>>'{probe,checked_at}')::timestamptz>now()+interval '1 minute') THEN RAISE EXCEPTION 'pipeline_stale_adapter_probe';END IF;
  INSERT INTO outbound_executor_sessions(id,name,actor,tools,expires_at) VALUES(p_command->>'session_id',d->>'name',p_actor,d->'tools',now()+interval '10 minutes')
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,tools=excluded.tools,expires_at=excluded.expires_at,revision=outbound_executor_sessions.revision+1,updated_at=now() RETURNING * INTO s;
 ELSIF a='heartbeat' THEN
  IF s.id IS NULL THEN RAISE EXCEPTION 'pipeline_executor_not_found'; END IF;
  -- Heartbeats extend presence only. They never refresh the adapter probe time.
  UPDATE outbound_executor_sessions SET expires_at=now()+interval '10 minutes',revision=revision+1,updated_at=now() WHERE id=s.id RETURNING * INTO s;
 ELSIF a='attach' THEN
  IF s.id IS NULL OR s.expires_at<=now() THEN RAISE EXCEPTION 'pipeline_executor_unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM outbound_pipeline_items WHERE id=d->>'item_id' AND status='running' AND lease_token=d->>'lease_token' AND lease_until>now()) THEN RAISE EXCEPTION 'pipeline_invalid_lease'; END IF;
  INSERT INTO outbound_executor_claims(item_id,session_id,lease_token) VALUES(d->>'item_id',s.id,d->>'lease_token')
   ON CONFLICT(item_id) DO UPDATE SET session_id=excluded.session_id,lease_token=excluded.lease_token,created_at=now();
 ELSE RAISE EXCEPTION 'pipeline_invalid_executor_action';END IF;
 result:=jsonb_build_object('request_id',p_command->>'request_id','session',to_jsonb(s));
 INSERT INTO outbound_pipeline_receipts(request_id,payload_hash,actor,source,receipt) VALUES(p_command->>'request_id',p_hash,p_actor,'Connected executor',result);
 RETURN result;
END $$;
CREATE FUNCTION public.outbound_executor_reservation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM outbound_pipeline_items i JOIN outbound_pipeline_runs r ON r.id=i.run_id
  JOIN outbound_executor_claims c ON c.item_id=i.id AND c.lease_token=i.lease_token
  JOIN outbound_executor_sessions s ON s.id=c.session_id AND s.expires_at>now()
  CROSS JOIN LATERAL jsonb_array_elements(s.tools)t
  WHERE i.id=NEW.item_id AND i.lease_until>now() AND t->>'id'=NEW.tool_id AND t->'stages'?r.stage
   AND t#>>'{probe,status}'='ready' AND (t#>>'{probe,checked_at}')::timestamptz>now()-interval '10 minutes'
 ) THEN RAISE EXCEPTION 'pipeline_saved_adapter_unavailable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER executor_before_reservation BEFORE INSERT ON public.outbound_pipeline_attempts FOR EACH ROW EXECUTE FUNCTION public.outbound_executor_reservation_guard();
REVOKE ALL ON FUNCTION public.outbound_executor_command(jsonb,text,text),public.outbound_executor_reservation_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_executor_command(jsonb,text,text) TO service_role;
