-- Return explicit HTTP conflicts through PostgREST instead of generic SQL transaction failures.
DO $$
DECLARE fn regprocedure; definition text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.compass_publish_wave_brief(text,integer,text,jsonb)'::regprocedure,'public.compass_decide_wave_brief(text,integer,text,text)'::regprocedure] LOOP
    definition := pg_get_functiondef(fn);
    EXECUTE replace(definition, '40001', 'PT409');
  END LOOP;
END $$;
