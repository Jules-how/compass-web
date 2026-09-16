import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
test('pipeline migration and atomic company-first scope',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz,outbound_status text,suppression_reason text,is_archived boolean DEFAULT false,recontact_ok integer DEFAULT 1,instantly_campaign_id text);
 CREATE TABLE compass_offer_revisions(id text PRIMARY KEY);INSERT INTO compass_offer_revisions VALUES('offer-v1');
 CREATE TABLE compass_outbound_companies(id text PRIMARY KEY);CREATE TABLE compass_lead_list_members(lead_id text,list_id text);
 CREATE TABLE compass_lead_lists(id text PRIMARY KEY,name text NOT NULL,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`)
 await db.exec(fs.readFileSync('supabase/migrations/20260915090000_crm_research.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/migrations/20260917090000_outbound_pipeline.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/migrations/20260917100000_outbound_pipeline_jobs.sql','utf8'))
 await db.exec(`CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
 CREATE TABLE compass_pipeline_campaigns(id text PRIMARY KEY,offer_revision_id text,status text,sequence_draft jsonb,instantly_campaign_id text);
 CREATE TABLE compass_outbound_configs(campaign_id text PRIMARY KEY,recipe jsonb,settings jsonb);
 CREATE TABLE compass_outbound_runs(id text PRIMARY KEY,campaign_id text,source_hash text,artifact_path text,source_rows jsonb,candidates jsonb,candidates_hash text,context jsonb,context_hash text,status text);
 CREATE TABLE compass_outbound_preparations(id text PRIMARY KEY,run_id text,hash text,input_hash text,context_hash text,bundle jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE compass_outbound_approvals(preparation_id text PRIMARY KEY,hash text,actor_id uuid,approved_at timestamptz DEFAULT now());
 CREATE TABLE compass_outbound_loads(preparation_id text PRIMARY KEY,instantly_campaign_id text);
 CREATE TABLE compass_outbound_reservations(identity_key text PRIMARY KEY,preparation_id text);
 CREATE TABLE compass_outbound_receipt_history(preparation_id text,receipt_hash text,receipt jsonb);
 CREATE FUNCTION outbound_check_preparation(text,boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"legacy":true}'::jsonb $$;
 CREATE FUNCTION outbound_reserve_load(text,text) RETURNS void LANGUAGE sql AS $$ SELECT $$;`)
 await db.exec(fs.readFileSync('supabase/migrations/20260917110000_outbound_pipeline_delivery.sql','utf8'))

 await db.exec(`INSERT INTO crm_companies(id,name,actor) VALUES('company','No email company','fixture')`)
 let n=0;const apply=async(operations,request='request-'+(++n))=>{const c={schema_version:'outbound.pipeline.v1',request_id:request,source:'fixture',operations};return(await db.query('SELECT outbound_pipeline_apply($1,$2,$3) result',[c,JSON.stringify(c),'agent'])).rows[0].result}
 const op=(kind,record,expected_revision=0)=>({kind,record,expected_revision});
 const list=op('list',{id:'list',name:'List'});assert.deepEqual(await apply([list],'repeat-001'),await apply([list],'repeat-001'))
 await apply([op('membership',{id:'member',list_id:'list',company_id:'company',active:true,origin:'fixture'})])
 assert.equal((await db.query(`SELECT * FROM outbound_pipeline_companies('{"list_id":"list"}')`)).rows[0].name,'No email company')
 await assert.rejects(apply([op('list',{id:'list',name:'stale'})]),/revision_conflict/)
 await assert.rejects(apply([op('list',{id:'rolled','name':'Rolled'}),op('membership',{id:'bad',list_id:'rolled',company_id:'missing',origin:'bad'})]));assert.equal((await db.query("SELECT * FROM compass_lead_lists WHERE id='rolled'")).rows.length,0)
 await assert.rejects(apply([op('draft',{id:'forged',approved:true})]),/reserved_field/)
 await db.exec("UPDATE compass_lead_lists SET name='Legacy edit' WHERE id='list'");assert.equal((await db.query("SELECT revision FROM compass_lead_lists WHERE id='list'")).rows[0].revision,2)

 const policy={offer_version_id:'offer-v1',icp_version_id:'icp-v1',criteria:[{id:'service',label:'Service',instructions:'Read service page',required:true,exclusion:false}],signals:[{id:'service',label:'Service',collection_instructions:'Read',acceptable_evidence:'Official',usefulness_guidance:'Distinctive',writing_eligible:true,value_type:'text',required:true}],tools:[{id:'http',stage:'research',fallback_on:[],missing_fields:[],max_attempts:1,cache_max_age_days:7}],checkpoints:['research'],target_roles:['Owner'],verification:{accepted:['valid'],reuse_days:0},budget:{amount:0,currency:'AUD'},concurrency:1};
 await apply([op('workflow',{id:'workflow',name:'Workflow',policy}),op('list',{id:'list',name:'List',workflow_version_id:'workflow',offer_version_id:'offer-v1',icp_version_id:'icp-v1'},2)])
 await db.exec(`INSERT INTO crm_research_sources(id,source_type,url,actor) VALUES('source','official_site','https://example.test','fixture');INSERT INTO crm_companies(id,name,actor) VALUES('foreign','Foreign','fixture')`)
 await apply([op('signal',{id:'foreign-signal',company_id:'foreign',workflow_version_id:'workflow',signal_id:'service',value:'ducted',source_id:'source',observed_at:new Date().toISOString(),quote:'Ducted',evidence_strength:'high',usefulness:'high'})])
 const assessment={id:'assessment',company_id:'company',workflow_version_id:'workflow',input_revision:1,criteria:[{id:'service',required:true,exclusion:false,outcome:'supported',evidence_ids:['foreign-signal']}],fit:'sure_fit',reason:'Evidence'};
 await assert.rejects(apply([op('assessment',assessment)]),/foreign_or_stale_evidence/)
 await apply([op('signal',{id:'own-signal',company_id:'company',workflow_version_id:'workflow',signal_id:'service',value:'ducted',source_id:'source',observed_at:new Date().toISOString(),quote:'Ducted',evidence_strength:'high',usefulness:'high'})])
 await apply([op('assessment',{...assessment,input_revision:2,criteria:[{...assessment.criteria[0],evidence_ids:['own-signal']}]})])
 let runRev=0;const command=async(action,data={},actor='agent')=>{const c={schema_version:'outbound.pipeline.v1',request_id:'run-request-'+(++n),source:'fixture',action,run_id:'run',expected_revision:runRev,data};const result=(await db.query('SELECT outbound_pipeline_run($1,$2,$3) result',[c,JSON.stringify(c),actor])).rows[0].result;runRev=result.run.revision;return result}
 const started=await command('start',{list_id:'list',workflow_version_id:'workflow',stage:'research'});assert.equal(started.run.scope_count,1)
 const claimed=await command('claim');const lease={item_id:claimed.item.id,lease_token:claimed.item.lease_token};
 await assert.rejects(command('finish_item',{...lease,status:'completed',result:{}}),/stage_output_required/)
 await assert.rejects(command('reserve_attempt',{...lease,attempt_id:'attempt',tool_id:'other',provider_request_id:'provider-1',estimated_cost:0,currency:'AUD'}),/tool_not_allowed/)
 await command('reserve_attempt',{...lease,attempt_id:'attempt',tool_id:'http',provider_request_id:'provider-1',estimated_cost:0,currency:'AUD'})
 await assert.rejects(command('finish_item',{...lease,status:'completed',result:{assessment_ids:['assessment']}}),/not_finishable/)
 await command('report_attempt',{...lease,attempt_id:'attempt',status:'completed',outcome:'success',actual_cost:0,source_ids:['source'],duration_ms:100})
 const finished=await command('finish_item',{...lease,status:'completed',result:{assessment_ids:['assessment']}});assert.equal(finished.run.status,'checkpoint')
 await assert.rejects(command('approve'),/operator_required/);await assert.rejects(command('resume'),/invalid_transition/)
 assert.equal((await command('approve',{},'operator:fixture')).run.status,'completed')

 assert.equal((await db.query(`SELECT count(*)::int n FROM outbound_pipeline_companies('{"list_id":"list","stage":"contacts"}')`)).rows[0].n,1)
 await db.exec(`INSERT INTO crm_contact_methods(id,method_type,value,normalized_value,actor) VALUES('mail','email','office@example.test','office@example.test','fixture');INSERT INTO crm_contact_candidates(id,company_id,method_id,purpose,first_origin,actor) VALUES('candidate','company','mail','general','published_general','fixture')`)
 await apply([op('recipient',{id:'recipient',list_id:'list',company_id:'company',candidate_id:'candidate',method_id:'mail',mailbox:'office@example.test',suitable:true,reason:'Published business inbox'})])
 assert.equal((await db.query(`SELECT company_name,eligibility FROM outbound_pipeline_recipient_profiles WHERE id='recipient'`)).rows[0].company_name,'No email company')
 await db.exec(`INSERT INTO crm_verification_events(id,method_id,provider,provider_request_id,submitted_address,checked_at,attempt_state,mailbox_result,actor) VALUES('verification','mail','fixture','verify-1','office@example.test',now(),'completed','valid','fixture')`)
 const rawRun=async(id,action,data,rev=0,actor='agent')=>{const c={schema_version:'outbound.pipeline.v1',request_id:'raw-request-'+(++n),source:'fixture',action,run_id:id,expected_revision:rev,data};return(await db.query('SELECT outbound_pipeline_run($1,$2,$3) result',[c,JSON.stringify(c),actor])).rows[0].result}
 const template={mode:'deterministic',subject:'Hello',opener:'Published fact',body:'Body',cta:'Reply',unsubscribe:'Opt out',slots:{},followups:[]};await apply([op('template',{id:'template',name:'Template',policy:template})]);
 const noReuse=await rawRun('write-no-reuse','start',{list_id:'list',workflow_version_id:'workflow',stage:'write',template_version_id:'template'});assert.equal(noReuse.run.scope_count,0);assert.equal(noReuse.run.status,'blocked')
 const verify=await rawRun('verify-run','start',{list_id:'list',workflow_version_id:'workflow',stage:'verify'});assert.equal(verify.run.scope_count,1)
 const vc=await rawRun('verify-run','claim',{},verify.run.revision)
 await db.exec(`INSERT INTO crm_verification_events(id,method_id,provider,provider_request_id,submitted_address,checked_at,attempt_state,mailbox_result,actor) VALUES('verification-current','mail','fixture','verify-2','office@example.test',now(),'completed','valid','fixture')`)
 const vf=await rawRun('verify-run','finish_item',{item_id:vc.item.id,lease_token:vc.item.lease_token,status:'completed',result:{verification_ids:['verification-current']}},vc.run.revision);assert.equal(vf.run.status,'completed')
 const write=await rawRun('write-current','start',{list_id:'list',workflow_version_id:'workflow',stage:'write',template_version_id:'template',verification_run_id:'verify-run'});assert.equal(write.run.scope_count,1)
 const cancelled=await rawRun('write-current','cancel',{},write.run.revision);await assert.rejects(rawRun('write-current','claim',{},cancelled.run.revision),/not_executable/)
 const receipt=(await db.query("SELECT payload_hash,actor,receipt FROM outbound_pipeline_receipts WHERE request_id='repeat-001'")).rows[0];assert.equal(receipt.actor,'agent');assert.equal(receipt.receipt.results[0].id,'list')

 const copy={subject:'Hello',opener:'Published fact',body:'Original manual text',cta:'Reply',unsubscribe:'Opt out',followups:[]};
 await apply([op('draft',{id:'draft-1',list_id:'list',recipient_id:'recipient',template_version_id:'template',copy,provenance:'manual',input_refs:['own-signal']})]);
 await apply([op('draft',{id:'draft-2',list_id:'list',recipient_id:'recipient',template_version_id:'template',copy:{...copy,body:'Replacement'},provenance:'template',input_refs:['own-signal'],previous_id:'draft-1'})]);
 await assert.rejects(apply([op('draft',{id:'draft-stale',list_id:'list',recipient_id:'recipient',template_version_id:'template',copy,provenance:'manual',input_refs:[],previous_id:'draft-1'})]),/revision_conflict/);
 assert.equal((await db.query("SELECT copy->>'body' body FROM outbound_pipeline_drafts WHERE id='draft-1'")).rows[0].body,'Original manual text');
 assert.equal((await db.query("SELECT current_draft_id FROM outbound_pipeline_recipient_profiles WHERE id='recipient'")).rows[0].current_draft_id,'draft-2');

 const jobCommand=(action,id,data={},rev=0)=>({schema_version:'outbound.pipeline.v1',request_id:'job-request-'+(++n),source:'fixture',action,job_id:id,expected_revision:rev,data});
 const createJob=async(c)=>(await db.query('SELECT outbound_pipeline_job_create($1,$2,$3) result',[c,JSON.stringify(c),'agent'])).rows[0].result;
 const preview=await createJob(jobCommand('preview_apply','apply-job',{current_list_id:'list',template_version_id:'template'}));assert.equal(preview.job.total_count,1);
 const frozen=(await db.query("SELECT * FROM outbound_pipeline_job_items WHERE job_id='apply-job'")).rows[0];assert.equal(frozen.payload.previous_id,'draft-2');
 await apply([op('draft',{id:'draft-concurrent',list_id:'list',recipient_id:'recipient',template_version_id:'template',copy:{...copy,body:'Concurrent manual'},provenance:'manual',input_refs:[],previous_id:'draft-2'})]);
 const chunk=jobCommand('apply_chunk','apply-job',{},preview.job.revision);
 const conflicted=(await db.query('SELECT outbound_pipeline_job_commit($1,$2,$3,$4,$5) result',[chunk,JSON.stringify(chunk),'agent',[{item_id:frozen.id,status:'applied',copy}],''])).rows[0].result;assert.equal(conflicted.job.conflicted_count,1);assert.equal(conflicted.job.status,'attention');
 const exportJob=await createJob(jobCommand('create_export','export-job',{list_id:'list',grain:'companies',columns:['id','name']}));assert.equal(exportJob.job.total_count,1);
 const exportItem=(await db.query("SELECT * FROM outbound_pipeline_job_items WHERE job_id='export-job'")).rows[0];assert.equal(exportItem.payload.row.name,'No email company');
 await db.exec("UPDATE crm_companies SET name='Changed after freeze' WHERE id='company'");assert.equal((await db.query("SELECT payload#>>'{row,name}' name FROM outbound_pipeline_job_items WHERE id=$1",[exportItem.id])).rows[0].name,'No email company');
 const exportChunk=jobCommand('export_chunk','export-job',{},exportJob.job.revision);
 const exported=(await db.query('SELECT outbound_pipeline_job_commit($1,$2,$3,$4,$5) result',[exportChunk,JSON.stringify(exportChunk),'agent',[{item_id:exportItem.id,status:'applied'}],'"company","No email company"\r\n'])).rows[0].result;assert.equal(exported.job.status,'completed');assert.equal(exported.job.applied_count,1);

 await db.exec(`INSERT INTO lead_contacts(id,email,company,outbound_status) VALUES('delivery-lead','office@example.test','Changed after freeze','uncontacted');INSERT INTO crm_lead_links(id,lead_id,company_id,match_state,reason,source_id,actor) VALUES('delivery-link','delivery-lead','company','confirmed','Exact source match','source','fixture')`);
 const deliveryContext={campaign_id:'campaign',offer_revision_id:'offer-v1',market_test_id:null,offer:{},vertical:'',city:'',recipe:{mode:'evidence_draft',subject:'{{subject}}',opener:'{{opener}}'},settings:{timezone:'Europe/London',email_list:['sender@example.test'],from:'09:00',to:'17:00',daily_limit:10},sequence:{steps:[]},pipeline:{manifest_id:'manifest',list_id:'list',workflow_version_id:'workflow',template_version_id:'template'}};
 await db.query("INSERT INTO compass_pipeline_campaigns VALUES('campaign','offer-v1','testing',$1,'provider-campaign')",[deliveryContext.sequence]);await db.query("INSERT INTO compass_outbound_configs VALUES('campaign',$1,$2)",[deliveryContext.recipe,deliveryContext.settings]);
 const dc={schema_version:'outbound.pipeline.v1',request_id:'delivery-create',source:'fixture',manifest_id:'manifest',expected_revision:0,action:'create',data:{list_id:'list',campaign_id:'campaign',workflow_version_id:'workflow',template_version_id:'template',verification_run_id:'verify-run'}};
 const dm=(await db.query('SELECT outbound_pipeline_delivery_create($1,$2,$3,$4) result',[dc,JSON.stringify(dc),'agent',deliveryContext])).rows[0].result;assert.equal(dm.manifest.total_count,1);
 const di=(await db.query("SELECT * FROM outbound_pipeline_delivery_items WHERE manifest_id='manifest'")).rows[0];assert.deepEqual(di.snapshot.reasons,[]);
 const build={...dc,request_id:'delivery-build',expected_revision:1,action:'build_chunk',data:{}};
 const rendered={candidate:{id:'recipient',company_id:'company',lead_id:'delivery-lead',email:'office@example.test',company:'Changed after freeze',website:'https://example.test',evidence:[],identity_reviewed:false},status:'pass',reasons:[],rendered:{candidate_id:'recipient',values:{email:'office@example.test'},steps:[]}};
 const built=(await db.query('SELECT outbound_pipeline_delivery_commit($1,$2,$3,$4) result',[build,JSON.stringify(build),'agent',[{item_id:di.id,record:rendered}]])).rows[0].result;assert.equal(built.manifest.status,'review');assert.equal(built.manifest.hash.length,64);
 assert.equal((await db.query("SELECT outbound_check_preparation('legacy',false) result")).rows[0].result.legacy,true);
 await db.query("SELECT outbound_approve_preparation('manifest',$1)",[built.manifest.hash]);
 await db.query("SELECT outbound_reserve_load('manifest','provider-campaign')");assert.equal((await db.query("SELECT count(*)::int n FROM compass_outbound_reservations WHERE preparation_id='manifest'")).rows[0].n,2);
 await apply([op('draft',{id:'changed-after-approval',list_id:'list',recipient_id:'recipient',template_version_id:'template',copy,provenance:'manual',input_refs:[],previous_id:'draft-concurrent'})]);
 await assert.rejects(db.query("SELECT outbound_check_preparation('manifest',true)"),/draft_changed/);
 }finally{await db.close()}
})
