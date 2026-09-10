-- Editorial revisions are independent of platform metrics. Legacy rows remain unreviewed.
ALTER TABLE public.compass_wave_briefs
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS publisher text,
  ADD COLUMN IF NOT EXISTS run_id text,
  ADD COLUMN IF NOT EXISTS decision_revision integer,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metrics_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.compass_wave_publications (
  run_id text PRIMARY KEY,
  day text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.compass_wave_publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compass_wave_publications FROM anon, authenticated;
GRANT ALL ON public.compass_wave_publications TO service_role;

CREATE OR REPLACE FUNCTION public.compass_publish_wave_brief(
  p_day text, p_expected_revision integer, p_decision_value text, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  old public.compass_wave_briefs; prior public.compass_wave_publications;
  decision_value text; stamp timestamptz := now(); snapshot jsonb; result jsonb;
  action jsonb; action_id text; action_ids jsonb := '[]'; item jsonb; task_id text;
  task_ids jsonb := '[]'; marker text; task_state text;
BEGIN
  IF p_day <> to_char(now() AT TIME ZONE 'Australia/Sydney','YYYY-MM-DD')
    OR p_expected_revision IS NULL OR p_expected_revision < 0
    OR coalesce(p_payload->>'publisher','') <> 'compass-morning-pilot'
    OR coalesce(p_payload->>'runId','') !~ '^[a-zA-Z0-9._:-]{8,160}$'
    OR length(trim(coalesce(p_payload->>'recommendation',''))) = 0
    OR coalesce((p_payload->>'decisionRevision')::integer,0) < 1 THEN
    RAISE EXCEPTION 'Invalid brief publication' USING ERRCODE = '22023';
  END IF;
  -- Lock the source too: a decision change cannot race a successful publication.
  SELECT value INTO decision_value FROM public.compass_settings
    WHERE id = 'planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0' FOR SHARE;
  IF decision_value IS NULL OR decision_value IS DISTINCT FROM p_decision_value THEN
    RAISE EXCEPTION 'Decisions changed. Reload before publishing.' USING ERRCODE = '40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wave:' || p_day,0));
  SELECT * INTO prior FROM public.compass_wave_publications WHERE run_id = p_payload->>'runId';
  IF FOUND THEN
    IF prior.day <> p_day OR prior.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Run ID already used with different content' USING ERRCODE = '40001';
    END IF;
    RETURN prior.result || jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO old FROM public.compass_wave_briefs WHERE id = p_day FOR UPDATE;
  IF coalesce(old.revision,0) <> p_expected_revision THEN
    RAISE EXCEPTION 'Brief changed. Reload before publishing.' USING ERRCODE = '40001';
  END IF;
  snapshot := CASE WHEN old.id IS NULL THEN '[]'::jsonb
    ELSE coalesce(old.history,'[]') || jsonb_build_array(to_jsonb(old) - 'history' - 'metrics') END;
  INSERT INTO public.compass_wave_briefs
    (id,generated_at,reviewed_at,revision,publisher,run_id,decision_revision,recommendation,scan,
     next_campaign_ids,next_status,resolved_at,history)
  VALUES (p_day,stamp,stamp,p_expected_revision+1,p_payload->>'publisher',p_payload->>'runId',
    (p_payload->>'decisionRevision')::integer,p_payload->>'recommendation',coalesce(p_payload->'scan','{}'),
    ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'next_campaign_ids','[]'))),
    'proposed',NULL,snapshot)
  ON CONFLICT (id) DO UPDATE SET generated_at=stamp,reviewed_at=stamp,
    revision=EXCLUDED.revision,publisher=EXCLUDED.publisher,run_id=EXCLUDED.run_id,
    decision_revision=EXCLUDED.decision_revision,recommendation=EXCLUDED.recommendation,
    scan=EXCLUDED.scan,next_campaign_ids=EXCLUDED.next_campaign_ids,next_status='proposed',
    resolved_at=NULL,history=EXCLUDED.history;
  FOR action IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'actions','[]')) LOOP
    -- Reconcile an unchanged open action across mornings. Never revive completed work.
    action_id := NULL;
    SELECT id INTO action_id FROM public.compass_wave_actions
      WHERE source='agent' AND title=action->>'title'
        AND campaign_id IS NOT DISTINCT FROM nullif(action->>'campaign_id','')
        AND status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF action_id IS NULL THEN
      action_id := 'wave-act-' || md5(p_day || ':' || (p_payload->>'runId') || ':' || action::text);
      INSERT INTO public.compass_wave_actions(id,title,kind,detail,source,status,week_start,campaign_id)
      VALUES(action_id,action->>'title',action->>'kind',action->>'detail','agent','queued',
        date_trunc('week',p_day::date)::date,nullif(action->>'campaign_id',''));
    END IF;
    action_ids := action_ids || jsonb_build_array(jsonb_build_object('id',action_id,'title',action->>'title'));
  END LOOP;
  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(p_payload->'tasks','[]')) LOOP
    marker := item->>'marker'; task_id := NULL;
    SELECT id,status INTO task_id,task_state FROM public.compass_tasks
      WHERE source='daily-setup' AND split_part(notes,E'\n',1)=marker LIMIT 1 FOR UPDATE;
    IF task_id IS NULL THEN
      task_id := 'task-' || md5(marker);
      INSERT INTO public.compass_tasks(id,title,status,priority,due,source,notes,task_type,created_at,updated_at,mirrored_at)
      VALUES(task_id,item->>'title','not-started',2,p_day,'daily-setup',item->>'notes',item->>'task_type',stamp,stamp,stamp);
    ELSIF task_state NOT IN ('completed','cancelled') THEN
      UPDATE public.compass_tasks SET title=item->>'title',notes=item->>'notes',
        task_type=item->>'task_type',updated_at=stamp WHERE id=task_id;
    END IF;
    task_ids := task_ids || jsonb_build_array(jsonb_build_object('id',task_id,'title',item->>'title'));
  END LOOP;
  result := jsonb_build_object('ok',true,'briefId',p_day,'revision',p_expected_revision+1,
    'actions',action_ids,'tasks',task_ids,'campaigns','[]'::jsonb,'replayed',false);
  INSERT INTO public.compass_wave_publications(run_id,day,payload,result)
    VALUES(p_payload->>'runId',p_day,p_payload,result);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_update_wave_metrics(p_day text,p_metrics jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF p_day <> to_char(now() AT TIME ZONE 'Australia/Sydney','YYYY-MM-DD') THEN
    RAISE EXCEPTION 'Invalid metrics day';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wave:' || p_day,0));
  INSERT INTO public.compass_wave_briefs(id,metrics,metrics_updated_at)
    VALUES(p_day,p_metrics,now())
  ON CONFLICT(id) DO UPDATE SET metrics=EXCLUDED.metrics,metrics_updated_at=EXCLUDED.metrics_updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.compass_decide_wave_brief(
  p_day text,p_revision integer,p_decision_value text,p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE old public.compass_wave_briefs; source_value text; stamp timestamptz:=now();
BEGIN
  IF p_action NOT IN ('accept','dismiss') OR p_action IS NULL
    OR p_day <> to_char(now() AT TIME ZONE 'Australia/Sydney','YYYY-MM-DD') THEN
    RAISE EXCEPTION 'Invalid brief decision';
  END IF;
  SELECT value INTO source_value FROM public.compass_settings
    WHERE id='planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0' FOR SHARE;
  IF source_value IS NULL OR source_value IS DISTINCT FROM p_decision_value THEN
    RAISE EXCEPTION 'Decisions changed. Refresh the brief.' USING ERRCODE='40001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('wave:' || p_day,0));
  SELECT * INTO old FROM public.compass_wave_briefs WHERE id=p_day FOR UPDATE;
  IF old.id IS NULL OR old.reviewed_at IS NULL OR p_revision IS NULL OR old.revision<>p_revision THEN
    RAISE EXCEPTION 'Brief changed or is unreviewed. Refresh before deciding.' USING ERRCODE='40001';
  END IF;
  IF old.next_status<>'proposed' THEN
    RAISE EXCEPTION 'This brief has already been resolved.' USING ERRCODE='40001';
  END IF;
  UPDATE public.compass_wave_briefs SET
    history=history || jsonb_build_array(to_jsonb(old)-'history'-'metrics'),
    next_status=CASE WHEN p_action='accept' THEN 'accepted' ELSE 'dismissed' END,
    resolved_at=stamp,revision=revision+1 WHERE id=p_day;
  RETURN jsonb_build_object('ok',true,'revision',p_revision+1);
END;
$$;
REVOKE ALL ON FUNCTION public.compass_publish_wave_brief(text,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.compass_update_wave_metrics(text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.compass_decide_wave_brief(text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compass_publish_wave_brief(text,integer,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.compass_update_wave_metrics(text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.compass_decide_wave_brief(text,integer,text,text) TO service_role;
