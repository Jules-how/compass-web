import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { loadTypescript } from './helpers/load-typescript.mjs'
const { parseCrmCommand } = loadTypescript('src/lib/crm-research-schema.ts')
const op = (kind, record, expected_revision = 0) => ({ kind, record, expected_revision })
let seq = 0
const packet = operations => parseCrmCommand({schema_version:'crm.research.v1',request_id:'international-'+(++seq),source:'Fixture',operations})

test('international fields and supported social links validate without inventing geography', () => {
  const location = {id:'loc',company_id:'c',label:'Toronto',kind:'premises',source_id:'s',country_code:'CA',administrative_region:'Ontario',city:'Toronto',postcode:'M5V 1A1',timezone:'America/Toronto'}
  assert.equal(packet([op('location',location)]).operations[0].record.country_code,'CA')
  assert.throws(() => packet([op('location',{...location,timezone:'Sydney probably'})]))
  assert.equal('country_code' in packet([op('location',{id:'legacy',company_id:'c',label:'Old',kind:'premises',source_id:'s'})]).operations[0].record,false)
  assert.equal(packet([op('method',{id:'instagram',method_type:'instagram',value:'https://www.instagram.com/example/#bio',normalized_value:'ignored'})]).operations[0].record.normalized_value,'https://www.instagram.com/example/')
  assert.throws(() => packet([op('method',{id:'bad',method_type:'facebook',value:'javascript:alert(1)',normalized_value:'bad'})]))
})

test('additive migration preserves international values on old writes and rejects phone labels on emails',async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE FUNCTION public.portal_is_operator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE lead_contacts(id text PRIMARY KEY,email text,phone text,company text,updated_at timestamptz);
      CREATE TABLE compass_outbound_companies(id text PRIMARY KEY);
      CREATE TABLE compass_lead_list_members(lead_id text,list_id text);`)
    await db.exec(fs.readFileSync('supabase/migrations/20260915090000_crm_research.sql','utf8'))
    await db.exec(fs.readFileSync('supabase/migrations/20260917091500_crm_international_contacts.sql','utf8'))
    const apply = async operations => {const p=packet(operations);return db.query('SELECT crm_research_apply($1,$2,$3)',[p,JSON.stringify(p),'fixture'])}
    await apply([op('source',{id:'s',source_type:'legacy_import'}),op('company',{id:'c',name:'Example'}),op('location',{id:'loc',company_id:'c',label:'Toronto',kind:'premises',source_id:'s',country_code:'CA',administrative_region:'Ontario',city:'Toronto',timezone:'America/Toronto'})])
    await apply([op('location',{id:'loc',company_id:'c',label:'Toronto revised',kind:'premises',source_id:'s',city:'Toronto'},1)])
    let row=(await db.query("SELECT country_code,timezone,revision FROM crm_company_locations WHERE id='loc'")).rows[0]
    assert.deepEqual(row,{country_code:'CA',timezone:'America/Toronto',revision:2})
    await apply([op('location',{id:'loc',company_id:'c',label:'Toronto revised',kind:'premises',source_id:'s',city:'Toronto',timezone:null},2)])
    assert.equal((await db.query("SELECT timezone FROM crm_company_locations WHERE id='loc'")).rows[0].timezone,null)
    await apply([op('method',{id:'phone',method_type:'phone',value:'02 9000 0000',normalized_value:'ignored'}),op('candidate',{id:'phone-candidate',company_id:'c',method_id:'phone',first_origin:'legacy_unknown',phone_kind:'business'})])
    assert.equal((await db.query("SELECT phone_kind FROM crm_candidate_profiles WHERE id='phone-candidate'")).rows[0].phone_kind,'business')
    await apply([op('candidate',{id:'phone-candidate',company_id:'c',method_id:'phone',first_origin:'legacy_unknown',reason:'Old client update'},1)])
    assert.equal((await db.query("SELECT phone_kind FROM crm_candidate_profiles WHERE id='phone-candidate'")).rows[0].phone_kind,'business')
    await assert.rejects(apply([op('method',{id:'email',method_type:'email',value:'office@example.test',normalized_value:'ignored'}),op('candidate',{id:'email-candidate',company_id:'c',method_id:'email',first_origin:'legacy_unknown',phone_kind:'mobile'})]),/phone_classification_requires_phone/)
    assert.equal((await db.query("SELECT count(*)::int n FROM crm_contact_methods WHERE id='email'")).rows[0].n,0)
  } finally {await db.close()}
})
