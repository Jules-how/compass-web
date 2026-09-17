import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {loadTypescript} from './helpers/load-typescript.mjs'
const {legacyOperations,legacyCompanyId}=loadTypescript('src/lib/crm-legacy-import.ts')
const lead={id:'lead-a',updated_at:'2026-09-01T00:00:00Z',company:'Example HVAC',website:'https://example.test/',city:'Sydney',state:'NSW',name:'Jo',role:'Owner',email:'jo@example.test',phone:'02 9000 0000',icp_status:'qualified',email_verify_status:'valid',opener:'Historical exact copy',outbound_status:'replied',suppression_reason:'opt_out'}

test('legacy bridge separates shared domains and preserves uncertain attribution',()=>{
 assert.notEqual(legacyCompanyId(lead),legacyCompanyId({...lead,id:'b',company:'Different franchise'}))
 assert.notEqual(legacyCompanyId({...lead,city:null}),legacyCompanyId({...lead,id:'b',city:null}))
 assert.equal(legacyCompanyId(lead),legacyCompanyId({...lead,id:'b',email:'second@example.test'}))
 const badContext={existing:new Set(),methodIds:new Map()};const bad=legacyOperations({...lead,company:'x'.repeat(501)},badContext);assert.equal(bad.operations.length,0);assert.ok(bad.warnings.includes('legacy_record_requires_review'));assert.equal(badContext.existing.size,0);
 const built=legacyOperations(lead,{existing:new Set(),methodIds:new Map([['email:jo@example.test','existing-method']])})
 assert.equal(built.operations.find(o=>o.kind==='candidate'&&o.record.method_id==='existing-method').record.state,'unresolved')
 assert.equal(built.operations.some(o=>o.kind==='verification'),false)
 assert.equal(built.operations.find(o=>o.kind==='company').record.identity_status,'unreviewed')
 assert.equal(built.operations.find(o=>o.kind==='affiliation').record.state,'unknown')
 assert.equal(legacyOperations({...lead,company:''},{existing:new Set(),methodIds:new Map()}).operations.length,0)
})

test('bounded legacy bridge is atomic, idempotent, source-preserving and leaves sending state intact',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE FUNCTION portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
 CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz,outbound_status text,suppression_reason text);
 CREATE TABLE compass_offer_revisions(id text PRIMARY KEY);
 CREATE TABLE compass_outbound_companies(id text PRIMARY KEY,name text,website text);CREATE TABLE compass_lead_list_members(lead_id text,list_id text);
 CREATE TABLE compass_lead_lists(id text PRIMARY KEY,name text NOT NULL,notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());`)
 for(const file of ['20260915090000_crm_research.sql','20260917090000_outbound_pipeline.sql','20260917091500_crm_international_contacts.sql','20260917092000_crm_legacy_bridge.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'))
 await db.query('INSERT INTO lead_contacts VALUES($1,$2,$3,$4,$5,$6,$7)',[lead.id,lead.email,lead.phone,lead.company,lead.updated_at,lead.outbound_status,lead.suppression_reason])
 await db.exec("INSERT INTO compass_lead_lists(id,name) VALUES('list','Legacy list');INSERT INTO compass_lead_list_members VALUES('lead-a','list')")
 const built=legacyOperations(lead,{existing:new Set(),methodIds:new Map()})
 const command={schema_version:'crm.research.v1',request_id:'inner',source:'Legacy bridge',operations:built.operations}
 const packets=[{command,hash:JSON.stringify(command)}],rows=[{lead_id:lead.id,company_id:built.companyId,snapshot:lead,warnings:built.warnings}]
 const apply=async(hash='outer')=>(await db.query('SELECT crm_legacy_apply($1,$2,$3,$4,$5) result',['outer',hash,'agent',packets,rows])).rows[0].result
 const result=await apply();assert.equal(result.rows,1);assert.equal(result.memberships_added,1);assert.equal(result.dispositions[0].status,'imported');assert.deepEqual(await apply(),result)
 await assert.rejects(apply('changed'),/idempotency_conflict/)
 const retained=(await db.query('SELECT * FROM lead_contacts')).rows[0]
 assert.equal(retained.suppression_reason,'opt_out');assert.equal(retained.outbound_status,'replied')
 assert.equal((await db.query('SELECT snapshot FROM crm_legacy_import_rows')).rows[0].snapshot.opener,lead.opener)
 assert.equal((await db.query('SELECT count(*)::int n FROM crm_verification_events')).rows[0].n,0)
 assert.equal((await db.query('SELECT identity_status FROM crm_companies')).rows[0].identity_status,'unreviewed')
 const page=(await db.query("SELECT crm_legacy_page('',NULL,25) result")).rows[0].result
 assert.equal(page.total,1);assert.equal(page.unlinked,0);assert.equal(page.next_after,null)
 await db.exec("UPDATE lead_contacts SET updated_at='2026-09-02' WHERE id='lead-a'")
 await assert.rejects(db.query('SELECT crm_legacy_apply($1,$2,$3,$4,$5)',['stale','stale','agent',[],rows]),/lead_revision_conflict/)
 await db.exec('SET ROLE anon')
 await assert.rejects(db.query("SELECT crm_legacy_page('',NULL,25)"),/permission denied/)
 }finally{await db.close()}
})
