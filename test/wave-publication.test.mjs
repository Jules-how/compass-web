import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = await readFile(new URL('../supabase/migrations/20260910030000_wave_brief_publication.sql', import.meta.url),'utf8');
async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE compass_settings(id text PRIMARY KEY,value text);
    CREATE TABLE compass_wave_briefs(id text PRIMARY KEY,generated_at timestamptz DEFAULT now(), recommendation text,scan jsonb DEFAULT '{}',created_at timestamptz DEFAULT now(),next_campaign_ids text[] DEFAULT '{}',next_status text DEFAULT 'proposed',resolved_at timestamptz);
    CREATE TABLE compass_wave_actions(id text PRIMARY KEY,title text,kind text,detail text,source text,status text,week_start date,campaign_id text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE TABLE compass_tasks(id text PRIMARY KEY,title text,status text,priority int,due text,source text,notes text,task_type text,created_at timestamptz,updated_at timestamptz,mirrored_at timestamptz);
    INSERT INTO compass_settings VALUES('planning.note.458e8ef0-80cc-5405-aa5c-eb804faf70b0','decision-four');
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;`);
  await db.exec(migration);
  const day = (await db.query("select to_char(now() at time zone 'Australia/Sydney','YYYY-MM-DD') as day")).rows[0].day;
  const payload = { publisher:'compass-morning-pilot',runId:'test-run-001',decisionRevision:4,recommendation:'Sydney reviewed proposal',scan:{writeup:'Current plan'},next_campaign_ids:[],actions:[{title:'Review existing cohort',kind:'volume'}],tasks:[{title:'Review cohort',marker:`daily_setup:${day}:review-cohort`,notes:`daily_setup:${day}:review-cohort\n\nEvidence`,task_type:'SELL'}] };
  const publish = (rev=0,body=payload,source='decision-four') => db.query('select compass_publish_wave_brief($1,$2,$3,$4) as result',[day,rev,source,body]);
  const row = async () => (await db.query('select * from compass_wave_briefs where id=$1',[day])).rows[0];
  return {db,day,payload,publish,row};
}

test('legacy history retained; atomic publication retries do not duplicate actions/tasks', async()=>{
  const {db,day,payload,publish,row}=await setup();
  try {
    await db.query("insert into compass_wave_briefs(id,recommendation) values($1,'Old Melbourne guidance')",[day]);
    const first=(await publish()).rows[0].result;
    assert.equal(first.revision,1);
    assert.equal((await row()).history[0].recommendation,'Old Melbourne guidance');
    assert.equal((await publish()).rows[0].result.replayed,true);
    assert.equal((await db.query('select count(*) as n from compass_wave_actions')).rows[0].n,1);
    assert.equal((await db.query('select count(*) as n from compass_tasks')).rows[0].n,1);
    await assert.rejects(publish(1,{...payload,recommendation:'Changed retry'}),/different content/);
    await assert.rejects(publish(0,{...payload,runId:'test-run-002'}),/Brief changed/);
    assert.equal((await row()).recommendation,'Sydney reviewed proposal');
  } finally {await db.close();}
});

test('metrics neither refresh editorial time nor restore old text in either write order',async()=>{
 const {db,day,payload,publish,row}=await setup();
 try {
   await db.query('select compass_update_wave_metrics($1,$2)',[day,{emailsSentToday:12}]);
   assert.equal((await row()).reviewed_at,null);
   await publish(); const before=await row();
   await db.query('select compass_update_wave_metrics($1,$2)',[day,{emailsSentToday:30}]);
   assert.equal((await row()).reviewed_at.getTime(),before.reviewed_at.getTime());
   assert.equal((await row()).revision,1);
   assert.equal((await row()).scan.writeup,'Current plan');
   await publish(1,{...payload,runId:'test-run-002',recommendation:'Updated',scan:{}});
   assert.deepEqual((await row()).scan,{});
   assert.equal((await row()).metrics.emailsSentToday,30);
 } finally {await db.close();}
});

test('source conflicts and stale acceptance fail; revised advice needs a fresh decision',async()=>{
 const {db,day,payload,publish,row}=await setup();
 try {
   await assert.rejects(publish(0,payload,'obsolete-decision'),/Decisions changed/);
   await publish();
   await assert.rejects(db.query("select compass_decide_wave_brief($1,0,'decision-four','accept')",[day]),/changed or is unreviewed/);
   await db.query("select compass_decide_wave_brief($1,1,'decision-four','accept')",[day]);
   assert.equal((await row()).next_status,'accepted');
   await publish(2,{...payload,runId:'test-run-002'});
   assert.equal((await row()).next_status,'proposed');
   assert.equal((await row()).resolved_at,null);
   await db.exec("update compass_settings set value='decision-five'");
   await assert.rejects(publish(3,{...payload,runId:'test-run-003'}),/Decisions changed/);
   await assert.rejects(db.query("select compass_decide_wave_brief($1,3,'decision-four','accept')",[day]),/Decisions changed/);
 } finally {await db.close();}
});

test('publication validates identity/day; failure rolls back whole batch; RPCs restricted',async()=>{
 const {db,day,payload,publish,row}=await setup();
 try {
   await assert.rejects(publish(0,{...payload,publisher:'legacy'}),/Invalid brief/);
   await assert.rejects(db.query('select compass_publish_wave_brief($1,0,$2,$3)',['2020-01-01','decision-four',payload]),/Invalid brief/);
   await db.exec("alter table compass_wave_actions add constraint test_failure check(title <> 'Fail')");
   await assert.rejects(publish(0,{...payload,actions:[{title:'Fail'}]}),/test_failure/);
   assert.equal(await row(),undefined);
   await db.exec('SET ROLE anon');
   await assert.rejects(publish(),/permission denied/);
   await db.exec('RESET ROLE; SET ROLE authenticated');
   await assert.rejects(db.query('select compass_update_wave_metrics($1,$2)',[day,{}]),/permission denied/);
   await db.exec('RESET ROLE; SET ROLE service_role');
   assert.equal((await publish()).rows[0].result.revision,1);
 } finally {await db.close();}
});

test('Home freshness distinguishes legacy, prior-day and superseded advice', async()=>{
 const {loadTypescript}=await import('./helpers/load-typescript.mjs');
 const {waveReviewState}=loadTypescript('src/lib/wave-publication.ts',{
   '@/lib/portal-admin':{}, '@/lib/agreement-server':{}
 });
 const current={id:'2026-09-10',recommendation:'Current',reviewed_at:'2026-09-10T01:00:00Z',publisher:'compass-morning-pilot',decision_revision:4};
 assert.equal(waveReviewState(null,'2026-09-10',4),'missing');
 assert.equal(waveReviewState({recommendation:'Legacy'},'2026-09-10',4),'unreviewed');
 assert.equal(waveReviewState(current,'2026-09-10',4),'current');
 assert.equal(waveReviewState(current,'2026-09-10',5),'stale');
 assert.equal(waveReviewState(current,'2026-09-11',4),'stale');
});
