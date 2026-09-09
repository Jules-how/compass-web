-- Pathfinder adds strategy/evidence links, never copies execution records.
CREATE TABLE public.compass_pathfinder_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id text NOT NULL REFERENCES public.compass_settings(id) ON DELETE RESTRICT,
  work_type text NOT NULL CHECK (work_type IN ('project','task','checkpoint','goal')),
  work_id text NOT NULL,
  relation text NOT NULL DEFAULT 'contributes' CHECK (relation IN ('contributes','hypothesis')),
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','proposed')),
  rationale text NOT NULL DEFAULT '',
  actor text NOT NULL CHECK (actor IN ('operator','agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(goal_id,work_type,work_id,relation)
);

CREATE TABLE public.compass_pathfinder_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id text NOT NULL REFERENCES public.compass_settings(id) ON DELETE RESTRICT,
  goal_revision integer NOT NULL CHECK (goal_revision > 0),
  idempotency_key text NOT NULL UNIQUE,
  provenance text NOT NULL CHECK (provenance IN ('measured','reported','estimate')),
  value numeric,
  accepted boolean,
  source text NOT NULL CHECK (length(trim(source)) > 0),
  detail text NOT NULL DEFAULT '',
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  observed_at timestamptz NOT NULL,
  evidence_ids text[] NOT NULL DEFAULT '{}',
  actor text NOT NULL CHECK (actor IN ('operator','agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(value,accepted) = 1),
  CHECK (actor <> 'agent' OR provenance <> 'measured')
);
CREATE INDEX compass_pathfinder_observations_goal_idx ON public.compass_pathfinder_observations(goal_id,observed_at DESC);

CREATE TABLE public.compass_pathfinder_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id text NOT NULL REFERENCES public.compass_settings(id) ON DELETE RESTRICT,
  issue_key text NOT NULL,
  title text NOT NULL,
  symptom text NOT NULL,
  hypothesis text NOT NULL DEFAULT '',
  alternatives text NOT NULL DEFAULT '',
  next_action text NOT NULL,
  expected_benefit text NOT NULL DEFAULT '',
  effort_minutes integer CHECK (effort_minutes >= 0),
  uncertainty text NOT NULL DEFAULT '',
  prerequisites text NOT NULL DEFAULT '',
  opportunity_cost text NOT NULL DEFAULT '',
  review_on date,
  evidence_ids text[] NOT NULL DEFAULT '{}',
  source text NOT NULL,
  task_id text REFERENCES public.compass_tasks(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','watching','resolved','dismissed')),
  revision integer NOT NULL DEFAULT 1,
  actor text NOT NULL CHECK (actor IN ('operator','agent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(goal_id,issue_key)
);

-- Append-only receipts also preserve the previous and new versions of findings/links.
CREATE TABLE public.compass_pathfinder_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id text NOT NULL REFERENCES public.compass_settings(id) ON DELETE RESTRICT,
  actor text NOT NULL CHECK (actor IN ('operator','agent')),
  action text NOT NULL,
  subject_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX compass_pathfinder_activity_goal_idx ON public.compass_pathfinder_activity(goal_id,created_at DESC);

-- All public writes are through authenticated server commands; clients only read.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['compass_pathfinder_links','compass_pathfinder_observations','compass_pathfinder_issues','compass_pathfinder_activity'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY operator_read ON public.%I FOR SELECT TO authenticated USING (public.portal_is_operator())', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE FUNCTION public.pathfinder_audit_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO compass_pathfinder_activity(goal_id,actor,action,subject_id,before_data,after_data)
  VALUES (NEW.goal_id, NEW.actor, TG_TABLE_NAME || '.' || lower(TG_OP), NEW.id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
  RETURN NEW;
END $$;
CREATE TRIGGER pathfinder_links_audit AFTER INSERT OR UPDATE ON public.compass_pathfinder_links FOR EACH ROW EXECUTE FUNCTION public.pathfinder_audit_change();
CREATE TRIGGER pathfinder_observations_audit AFTER INSERT ON public.compass_pathfinder_observations FOR EACH ROW EXECUTE FUNCTION public.pathfinder_audit_change();
CREATE TRIGGER pathfinder_issues_audit AFTER INSERT OR UPDATE ON public.compass_pathfinder_issues FOR EACH ROW EXECUTE FUNCTION public.pathfinder_audit_change();

-- The operator's decision creates at most one canonical task, even on concurrent retries.
-- Uses the same existing Sync v2 creation RPC as /api/tasks; no external action is performed.
CREATE FUNCTION public.pathfinder_create_issue_task(p_issue_id uuid,p_existing_task_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE finding compass_pathfinder_issues; result jsonb; new_task_id text;
BEGIN
  IF NOT public.portal_is_operator() THEN RAISE EXCEPTION 'operator_required'; END IF;
  SELECT * INTO finding FROM compass_pathfinder_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'issue_not_found'; END IF;
  IF finding.task_id IS NOT NULL THEN
    RETURN jsonb_build_object('task_id',finding.task_id,'reused',true);
  END IF;
  IF finding.status NOT IN ('open','watching') THEN RAISE EXCEPTION 'issue_closed'; END IF;
  IF p_existing_task_id IS NOT NULL THEN
    PERFORM id FROM compass_tasks WHERE id=p_existing_task_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
    new_task_id := p_existing_task_id;
  ELSE
  result := public.portal_operator_create_task_mutation(jsonb_build_object(
    'title', finding.title, 'status','not-started','priority',0,'source','pathfinder',
    'notes', finding.next_action || E'\n\nOutcome: ' || finding.expected_benefit || E'\nEvidence: ' || finding.source || E'\nPathfinder issue: ' || finding.id::text
  ));
  new_task_id := result->'task'->>'id';
  IF new_task_id IS NULL THEN RAISE EXCEPTION 'task_creation_failed'; END IF;
  END IF;
  UPDATE compass_pathfinder_issues SET task_id = new_task_id, revision = revision + 1, actor='operator', updated_at=now() WHERE id=finding.id;
  INSERT INTO compass_pathfinder_links(goal_id,work_type,work_id,relation,state,rationale,actor)
  VALUES(finding.goal_id,'task',new_task_id,'contributes','active',finding.expected_benefit,'operator')
  ON CONFLICT(goal_id,work_type,work_id,relation) DO UPDATE SET state='active',actor='operator',updated_at=now();
  RETURN jsonb_build_object('task_id',new_task_id,'reused',p_existing_task_id IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.pathfinder_create_issue_task(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pathfinder_create_issue_task(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.pathfinder_audit_change() FROM PUBLIC;

-- Preserve an open task editor's draft when another view or agent changes the task.
CREATE FUNCTION public.pathfinder_apply_task(p_task_id text,p_patch jsonb,p_expected_updated_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE task_stamp timestamptz;
BEGIN
  IF NOT public.portal_is_operator() THEN RAISE EXCEPTION 'operator_required'; END IF;
  SELECT updated_at INTO task_stamp FROM compass_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'resource not found'; END IF;
  IF task_stamp IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('status','conflict','error','Task changed. Reload before saving.');
  END IF;
  RETURN public.portal_operator_apply_task_mutation(p_task_id,p_patch,NULL);
END $$;
REVOKE ALL ON FUNCTION public.pathfinder_apply_task(text,jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pathfinder_apply_task(text,jsonb,timestamptz) TO authenticated;
