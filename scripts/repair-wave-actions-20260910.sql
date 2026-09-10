-- Incident-only cleanup. Keep a restorable snapshot; never mark business work done.
BEGIN;
CREATE TEMP TABLE wave_repair_targets ON COMMIT DROP AS
WITH ranked AS (
 SELECT a.*, row_number() OVER (PARTITION BY title,campaign_id ORDER BY created_at,id) AS occurrence
 FROM public.compass_wave_actions a
 WHERE source='agent' AND status='queued'
   AND created_at >= '2026-09-06T00:00:00Z' AND created_at < '2026-09-10T01:27:33Z'
   AND created_at=updated_at
)
SELECT id,updated_at FROM ranked
WHERE occurrence>1 OR title IN (
 'Do not land; brief locked','Do not land; home brief locked',
 'Phone Unibox non-no replies after MTC',
 'Phone Unibox non-no replies after Asuria (incl. flagged roofing positive)',
 'Prepare Melbourne Plumber draft only — no scrape, no activate','test'
);
INSERT INTO public.compass_settings(id,value,scope,is_secret,updated_at,mirrored_at)
SELECT 'incident.wave-brief.2026-09-10.actions',jsonb_agg(to_jsonb(a))::text,'incident',0,now(),now()
FROM public.compass_wave_actions a JOIN wave_repair_targets t USING(id)
HAVING count(*)>0 ON CONFLICT(id) DO NOTHING;
WITH corrected AS (
 UPDATE public.compass_wave_actions a
 SET status='cancelled',updated_at=now(),
 detail=concat_ws(E'\n',a.detail,'Cancelled during 10 September brief repair: superseded guidance or duplicate from retired Cursor Daily Setup Agent. Original queued record preserved in incident.wave-brief.2026-09-10.actions. Not completed work.')
 FROM wave_repair_targets t
 WHERE a.id=t.id AND a.status='queued' AND a.updated_at=t.updated_at
 RETURNING a.id,a.title,a.status
)
SELECT title,count(*) AS cancelled FROM corrected GROUP BY title ORDER BY title;
COMMIT;
