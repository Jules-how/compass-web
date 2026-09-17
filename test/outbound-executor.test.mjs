import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'

test('saved adapter reservations require an attached live session and fresh probe',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz,outbound_status text,suppression_reason text);
 CREATE TABLE compass_offer_revisions(id text PRIMARY KEY);INSERT INTO compass_offer_revisions VALUES('offer');
 CREATE TABLE compass_outbound_companies(id text PRIMARY KEY);CREATE TABLE compass_lead_list_members(lead_id text,list_id text);
 CREATE TABLE compass_lead_lists(id text PRIMARY KEY,name text NOT NULL,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`)
 for(const f of ['20260915090000_crm_research.sql','20260917090000_outbound_pipeline.sql','20260917120000_outbound_executor.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'))
 await db.exec(`INSERT INTO crm_companies(id,name,actor) VALUES('c','Fixture','fixture');
 INSERT INTO compass_lead_lists(id,name) VALUES('l','Fixture');
 INSERT INTO outbound_pipeline_workflows(id,name,policy,actor) VALUES('w','Fixture','{}','fixture');
 INSERT INTO outbound_pipeline_runs(id,list_id,workflow_version_id,stage,status,scope_count,actor) VALUES('r','l','w','research','running',1,'fixture');
 INSERT INTO outbound_pipeline_items(id,run_id,company_id,input_revision,status,lease_token,lease_until,actor) VALUES('i','r','c',1,'running','lease',now()+interval '5 minutes','fixture');`)
 let seq=0
 const command=async(action,data={},revision=0,actor='agent',request_id='request-'+(++seq))=>{
  const c={action,data,session_id:'session',request_id,expected_revision:revision}
  return (await db.query('SELECT outbound_executor_command($1,$2,$3) result',[c,JSON.stringify(c),actor])).rows[0].result
 }
 const capability={id:'http.fetch',stages:['research'],adapter_version:'fixture',tool_name:'fixture reader',probe:{status:'ready',checked_at:new Date().toISOString(),detail:'Read-only fixture probe'}}
 const register=await command('register',{name:'Fixture',tools:[capability]});assert.equal(register.session.revision,1)
 await assert.rejects(command('attach',{item_id:'i',lease_token:'wrong'},1),/invalid_lease/)
 const reserve=async(id,tool='http.fetch')=>db.query('INSERT INTO outbound_pipeline_attempts(id,item_id,tool_id,provider_request_id,status,estimated_cost,currency,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,'i',tool,'provider-'+id,'reserved',0,'AUD','agent'])
 await assert.rejects(reserve('before-attach'),/saved_adapter_unavailable/)
 await command('attach',{item_id:'i',lease_token:'lease'},1)
 await reserve('first')
 await assert.rejects(reserve('substitute','parallel.extract'),/saved_adapter_unavailable/)
 await db.exec("UPDATE outbound_executor_sessions SET expires_at=now()-interval '1 second'")
 await assert.rejects(reserve('expired'),/saved_adapter_unavailable/)
 await db.exec("UPDATE outbound_pipeline_attempts SET status='completed',actual_cost=0 WHERE id='first'")
 assert.equal((await db.query("SELECT status FROM outbound_pipeline_attempts WHERE id='first'")).rows[0].status,'completed')
 await assert.rejects(command('register',{name:'bad',tools:[capability]},1,'operator:fixture'),/agent_session_required/)
 await assert.rejects(command('register',{name:'stale',tools:[{...capability,probe:{...capability.probe,checked_at:'2001-01-01T00:00:00Z'}}]},1),/stale_adapter_probe/)
 await db.exec('SET ROLE anon')
 await assert.rejects(db.query("SELECT outbound_executor_command('{}','x','agent')"),/permission denied/)
 }finally{await db.close()}
})

// Exercise API orchestration in addition to the SQL authority boundary.
import {loadTypescript} from './helpers/load-typescript.mjs'
const {writeOutboundExecutor,readOutboundExecutors}=loadTypescript('src/lib/outbound-executor-server.ts')
const enable=()=>{for(const k of ['COMPASS_OUTBOUND_PIPELINE','COMPASS_OUTBOUND_PIPELINE_WRITES','COMPASS_CRM_RESEARCH','COMPASS_CRM_RESEARCH_WRITES'])process.env[k]='1'}
test('old exact registration retries reach the authoritative receipt replay',async()=>{
 enable();const receipt={request_id:'same',session:{id:'session',revision:1}}
 const packet={action:'register',request_id:'same',session_id:'session',expected_revision:0,data:{name:'Fixture',tools:[{id:'custom.reader',stages:['research'],adapter_version:'1',tool_name:'fixture',probe:{status:'ready',checked_at:'2001-01-01T00:00:00Z',detail:'Historical successful probe'}}]}}
 let calls=0;const db={rpc:async(name,args)=>{calls++;assert.equal(name,'outbound_executor_command');assert.equal(args.p_command.data.tools[0].probe.checked_at,'2001-01-01T00:00:00Z');return {data:receipt,error:null}}}
 assert.deepEqual(await writeOutboundExecutor(db,packet,'agent'),receipt);assert.equal(calls,1)
})
test('custom tools combine fresh capabilities across sessions without stale masking',async()=>{
 enable();const capability=(stage,status='ready',checked_at=new Date().toISOString())=>({id:'custom.reader',stages:[stage],adapter_version:'1',tool_name:'fixture',probe:{status,checked_at,detail:'Fixture'}})
 const sessions=[{id:'first',tools:[capability('verify','unavailable')]},{id:'second',tools:[capability('research')]},{id:'third',tools:[capability('contacts')]},{id:'fourth',tools:[capability('write','ready','2001-01-01T00:00:00Z')]}]
 const db={from(){return {select(){return this},gt(){return this},order(){return this},limit:async()=>({data:sessions,error:null})}}}
 const result=await readOutboundExecutors(db);const custom=result.tools.find(t=>t.id==='custom.reader');assert.equal(custom.available,true);assert.deepEqual(new Set(custom.available_stages),new Set(['research','contacts']));assert.equal(result.tools.filter(t=>t.id==='custom.reader').length,1)
})
