import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {loadTypescript} from './helpers/load-typescript.mjs'
const {parseCrmCommand}=loadTypescript('src/lib/crm-research-schema.ts')
const op=(kind,record,expected_revision=0)=>({kind,record,expected_revision})
const time='2026-09-01T00:00:00Z'
const obs=(id,value,extra={})=>op('observation',{id,company_id:'c',source_id:'s',fact_key:'customer_mix',value,quote:'Fixture evidence',observed_at:time,evidence_type:'published',review_status:'reviewed',...extra})
test('research migration, atomic writes, ownership separation, query grain and operator boundaries',async t=>{
  const db=new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE FUNCTION public.portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.operator',true)='true' $$;
      CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz,outbound_status text,suppression_reason text);
      CREATE TABLE compass_outbound_companies(id text PRIMARY KEY);
      CREATE TABLE compass_lead_list_members(lead_id text,list_id text);
      INSERT INTO lead_contacts VALUES('lead','office@example.test','0290000000','Example','2026-09-01','replied','opt_out');
      GRANT SELECT ON lead_contacts,compass_lead_list_members TO authenticated,service_role;
    `)
    await db.exec(fs.readFileSync('supabase/migrations/20260915090000_crm_research.sql','utf8'))
    let serial=0
    function command(operations,id='request-'+(++serial)){return parseCrmCommand({schema_version:'crm.research.v1',request_id:id,source:'Fixture',operations})}
    async function apply(operations,id){const packet=command(operations,id);return (await db.query('SELECT crm_research_apply($1,$2,$3) result',[packet,JSON.stringify(packet),'fixture'])).rows[0].result}
    await apply([op('source',{id:'s',source_type:'official_site',url:'https://example.test',retrieved_at:time}),op('company',{id:'c',name:'Example',domains:['shared.test']}),op('company',{id:'c2',name:'Separate franchise',domains:['shared.test']})])
    await t.test('shared domain keeps distinct companies; reviewed identity needs evidence',async()=>{
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_companies')).rows[0].n,2)
      await assert.rejects(apply([op('company',{id:'c',name:'Example',domains:['shared.test'],identity_status:'reviewed'},1)]),/identity_review_evidence/)
    })
    await t.test('conflict is disputed; explicit supersession retains history',async()=>{
      await apply([obs('o1','mixed'),obs('o2','commercial_only')])
      assert.equal((await db.query("SELECT customer_mix,fit_status FROM crm_company_profiles WHERE id='c'")).rows[0].customer_mix,null)
      await apply([obs('o3','mixed',{supersedes_ids:['o1','o2']})])
      assert.equal((await db.query("SELECT customer_mix FROM crm_company_profiles WHERE id='c'")).rows[0].customer_mix,'mixed')
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_research_observations')).rows[0].n,3)
      await assert.rejects(apply([obs('cycle-a','mixed',{supersedes_ids:['cycle-b']}),obs('cycle-b','mixed',{supersedes_ids:['cycle-a']})]),/supersession_cycle/)
    })
    await t.test('one failed operation rolls back whole packet; receipts enforce hash and revision',async()=>{
      await assert.rejects(apply([op('company',{id:'rollback',name:'Rollback'}),op('location',{id:'bad',company_id:'c',label:'Bad',kind:'premises',source_id:'missing'})]))
      assert.equal((await db.query("SELECT count(*)::int n FROM crm_companies WHERE id='rollback'")).rows[0].n,0)
      const operations=[op('company',{id:'idempotent',name:'Idempotent'})]
      const first=await apply(operations,'stable'),second=await apply(operations,'stable')
      assert.deepEqual(second,first)
      await assert.rejects(apply([op('company',{id:'different',name:'Different'})],'stable'),/idempotency_conflict/)
      await assert.rejects(apply([op('company',{id:'idempotent',name:'Changed'},0)]),/revision_conflict/)
      await apply([op('company',{id:'idempotent',name:'Changed'},1)])
    })
    await t.test('verification history never creates personal ownership or changes primary/suppression',async()=>{
      await apply([op('person',{id:'p',name:'Jo Smith',source_id:'s'}),op('affiliation',{id:'a',company_id:'c',person_id:'p',role:'Owner',source_id:'s'}),op('method',{id:'m',method_type:'email',value:'jo@example.test',normalized_value:'jo@example.test'}),op('candidate',{id:'ca',company_id:'c',method_id:'m',affiliation_id:'a',first_origin:'generated_hypothesis',generation:{generator_version:'v1',format_ids:['first'],name_tokens:['Jo','Smith'],domain:'example.test'}})])
      for(const [index,result] of ['valid','invalid','catch_all','unknown'].entries())await apply([op('verification',{id:'v'+index,method_id:'m',provider:'Fixture',provider_request_id:'req'+index,submitted_address:'jo@example.test',checked_at:`2026-09-0${index+1}T00:00:00Z`,attempt_state:'completed',mailbox_result:result})])
      await apply([op('verification',{id:'failed',method_id:'m',provider:'Fixture',provider_request_id:'failed',submitted_address:'jo@example.test',checked_at:'2026-09-05T00:00:00Z',attempt_state:'timed_out'})])
      const candidate=(await db.query("SELECT * FROM crm_candidate_profiles WHERE id='ca'")).rows[0]
      assert.equal(candidate.attribution_status,'unresolved');assert.equal(candidate.mailbox_result,'unknown');assert.equal(candidate.latest_attempt_state,'timed_out')
      await assert.rejects(apply([op('verification',{id:'wrong',method_id:'m',provider:'Fixture',provider_request_id:'wrong',submitted_address:'other@example.test',checked_at:time,attempt_state:'completed',mailbox_result:'valid'})]),/address_mismatch/)
      await assert.rejects(apply([op('affiliation',{id:'a',company_id:'c2',person_id:'p',role:'Owner',source_id:'s'},1)]),/affiliation_identity_immutable/)
      const lead=(await db.query("SELECT * FROM lead_contacts WHERE id='lead'")).rows[0]
      assert.equal(lead.email,'office@example.test');assert.equal(lead.outbound_status,'replied');assert.equal(lead.suppression_reason,'opt_out')
    })
    await t.test('link guards revisions and primary address; full dataset filtering has company grain',async()=>{
      await assert.rejects(apply([op('lead_link',{id:'l',lead_id:'lead',company_id:'c',source_id:'s',match_state:'confirmed',reason:'fixture',expected_lead_updated_at:time,primary_email_candidate_id:'ca'})]),/primary_email_mismatch/)
      await apply([op('lead_link',{id:'l',lead_id:'lead',company_id:'c',source_id:'s',match_state:'confirmed',reason:'fixture',expected_lead_updated_at:time})])
      assert.equal((await db.query(`SELECT count(*)::int n FROM crm_search_companies('{"customer_mix":"mixed"}')`)).rows[0].n,1)
      assert.equal((await db.query(`SELECT count(*)::int n FROM crm_research_lead_scope(NULL,'{"customer_mix":"mixed"}')`)).rows[0].n,1)
    })
    await t.test('numeric sorting spans pages, nulls last, and contact filters share a candidate',async()=>{
      for(let start=0;start<61;start+=20){const operations=[];for(let i=start;i<Math.min(start+20,61);i++){
        const id='page-'+String(i).padStart(3,'0');operations.push(op('company',{id,name:'Page '+i}));
        if(i<60)operations.push(obs('reviews-'+i,{count:[100,9,10][i%3],rating:4.5,profile_id:id,platform:'Fixture',scope:'company'},{company_id:id,fact_key:'reviews'}))
      }await apply(operations)}
      const ordered=(await db.query(`SELECT id,review_count FROM crm_search_companies('{"q":"Page"}') ORDER BY review_count ASC NULLS LAST,id ASC`)).rows
      assert.equal(ordered.length,61);assert.equal(ordered[0].review_count,9);assert.equal(ordered[20].review_count,10);assert.equal(ordered[40].review_count,100);assert.equal(ordered[60].review_count,null)
      const first=(await db.query(`SELECT id,review_count FROM crm_search_companies('{"q":"Page"}') ORDER BY review_count ASC NULLS LAST,id ASC LIMIT 50`)).rows
      const last=first.at(-1)
      const next=(await db.query(`SELECT id,review_count FROM crm_search_companies('{"q":"Page"}') WHERE review_count>$1 OR (review_count=$1 AND id>$2) OR review_count IS NULL ORDER BY review_count ASC NULLS LAST,id ASC`,[last.review_count,last.id])).rows
      assert.deepEqual([...first,...next],ordered)
      await apply([op('method',{id:'general-method',method_type:'email',value:'office@example.test',normalized_value:'office@example.test'}),op('candidate',{id:'general-route',company_id:'c',method_id:'general-method',first_origin:'published_general'}),obs('general-origin','published_general',{company_id:null,candidate_id:'general-route',fact_key:'contact_origin'}),op('verification',{id:'general-valid',method_id:'general-method',provider:'Fixture',provider_request_id:'general-check',submitted_address:'office@example.test',checked_at:time,attempt_state:'completed',mailbox_result:'valid'})])
      assert.equal((await db.query(`SELECT count(*)::int n FROM crm_search_companies('{"origin":"generated_hypothesis","mailbox":"valid"}')`)).rows[0].n,0)
      assert.equal((await db.query(`SELECT count(*)::int n FROM crm_search_companies('{"origin":"published_general","mailbox":"valid"}')`)).rows[0].n,1)
      const operations=[op('company',{id:'concurrent',name:'Concurrent'})]
      const receipts=await Promise.all([apply(operations,'concurrent-request'),apply(operations,'concurrent-request')]);assert.deepEqual(receipts[0],receipts[1])
    })
    await t.test('old or undated service areas cannot look fresh beside newer company facts',async()=>{
      await apply([op('location',{id:'old-area',company_id:'page-000',label:'Sydney',kind:'service_area',source_id:'s',status:'active',regions:['sydney'],observed_at:'2001-01-01T00:00:00Z'})])
      const profile=(await db.query("SELECT regions,research_observed_at FROM crm_company_profiles WHERE id='page-000'")).rows[0]
      assert.deepEqual(profile.regions,['sydney']);assert.equal(new Date(profile.research_observed_at).getUTCFullYear(),2001)
      await apply([op('location',{id:'undated-area',company_id:'page-000',label:'Melbourne',kind:'service_area',source_id:'s',status:'active',regions:['melbourne']})])
      assert.equal((await db.query("SELECT research_observed_at FROM crm_company_profiles WHERE id='page-000'")).rows[0].research_observed_at,null)
    })
    await t.test('current primary badge follows legacy address without expanding reader privileges',async()=>{
      await db.exec("SET test.operator='true'")
      await apply([op('lead_link',{id:'l',lead_id:'lead',company_id:'c',source_id:'s',match_state:'confirmed',reason:'fixture',expected_lead_updated_at:time,primary_email_candidate_id:'general-route'},1)])
      assert.equal((await db.query("SELECT legacy_primary FROM crm_candidate_profiles WHERE id='general-route'")).rows[0].legacy_primary,true)
      await db.exec("UPDATE lead_contacts SET email='new@example.test' WHERE id='lead'; REVOKE SELECT ON lead_contacts FROM authenticated; SET ROLE authenticated")
      assert.equal((await db.query("SELECT legacy_primary FROM crm_candidate_profiles WHERE id='general-route'")).rows[0].legacy_primary,false)
      await db.exec('RESET ROLE')
    })
    await t.test('nonoperator cannot read, operators cannot directly write, anonymous cannot execute',async()=>{
      await db.exec("SET ROLE authenticated; SET test.operator='false'")
      assert.equal((await db.query('SELECT count(*)::int n FROM crm_companies')).rows[0].n,0)
      await db.exec("SET test.operator='true'")
      assert.ok((await db.query('SELECT count(*)::int n FROM crm_companies')).rows[0].n>0)
      await assert.rejects(db.exec("INSERT INTO crm_companies(id,name,actor) VALUES('unauthorized','No','test')"),/permission denied/)
      await db.exec('RESET ROLE; SET ROLE anon')
      await assert.rejects(db.query("SELECT crm_research_apply('{}','x','anon')"),/permission denied/)
      await db.exec('RESET ROLE')
    })
  }finally{await db.close()}
})
