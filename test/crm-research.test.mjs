import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const schema=loadTypescript('src/lib/crm-research-schema.ts')
const query=loadTypescript('src/lib/crm-research-query.ts')
const legacy=loadTypescript('src/lib/lead-write-validation.ts')
const packet=operations=>({schema_version:'crm.research.v1',request_id:'request-test',source:'Test fixture',operations})
const op=(kind,record)=>({kind,expected_revision:0,record})
const observation={id:'o',company_id:'company',fact_key:'customer_mix',value:'mixed',source_id:'source',quote:'We serve homes and businesses.',observed_at:'2026-09-01T00:00:00Z',evidence_type:'published',review_status:'reviewed'}
test('strict packets reject unknown fields and invalid observations before any persistence',()=>{
  assert.throws(()=>schema.parseCrmCommand({...packet([op('company',{id:'c',name:'Company',revenue:100})])}),schema.CrmValidationError)
  assert.throws(()=>schema.parseCrmCommand(packet([op('observation',{...observation,person_id:'p'})])),/Exactly one/)
  assert.throws(()=>schema.parseCrmCommand(packet([op('observation',{...observation,value:'commercial-ish'})])),/value/)
  assert.throws(()=>schema.parseCrmCommand(packet([op('observation',{...observation,observed_at:null})])),/observation date/)
  assert.throws(()=>schema.parseCrmCommand(packet([op('company',{id:'c',name:'Company'}),op('company',{id:'c',name:'Other'})])),/One operation/)
})
test('mailbox validity cannot establish personal attribution',()=>{
  for(const evidence_type of ['provider_assertion','generation','legacy_import'])assert.throws(()=>schema.parseCrmCommand(packet([op('observation',{...observation,company_id:null,candidate_id:'candidate',fact_key:'person_attribution',value:'supported',evidence_type})])),/cannot establish/)
  for(const mailbox_result of ['catch_all','unknown','invalid','valid','risky'])assert.equal(schema.parseCrmCommand(packet([op('verification',{id:'v',method_id:'m',provider:'Fixture',provider_request_id:'p',submitted_address:'JO@EXAMPLE.TEST',checked_at:'2026-09-01T00:00:00Z',attempt_state:'completed',mailbox_result})])).operations[0].record.mailbox_result,mailbox_result)
  assert.throws(()=>schema.parseCrmCommand(packet([op('verification',{id:'v',method_id:'m',provider:'Fixture',provider_request_id:'p',submitted_address:'jo@example.test',checked_at:'2026-09-01T00:00:00Z',attempt_state:'failed',mailbox_result:'valid'})])),/Incomplete attempts/)
})
test('generated candidates require named context, inputs and at most 20 formats',()=>{
  const candidate={id:'c',company_id:'company',method_id:'method',first_origin:'generated_hypothesis'}
  assert.throws(()=>schema.parseCrmCommand(packet([op('candidate',candidate)])),/named affiliation/)
  const record={...candidate,affiliation_id:'a',generation:{generator_version:'v1',format_ids:['first.last'],name_tokens:['Jo','Smith'],domain:'example.test'}}
  assert.equal(schema.parseCrmCommand(packet([op('candidate',record)])).operations[0].record.first_origin,'generated_hypothesis')
  assert.throws(()=>schema.parseCrmCommand(packet([op('candidate',{...record,generation:{...record.generation,format_ids:Array(21).fill('f')}})])),/20/)
})
test('normalization preserves distinct route types and never invents Australian country code',()=>{
  assert.equal(schema.normalizeCrmMethod('email',' JO@EXAMPLE.TEST '),'jo@example.test')
  assert.equal(schema.normalizeCrmMethod('phone','(02) 9000 0000'),'0290000000')
  assert.equal(schema.normalizeCrmMethod('phone','+61 2 9000 0000'),'+61290000000')
  assert.throws(()=>schema.parseCrmCommand(packet([op('method',{id:'m',method_type:'contact_form',value:'javascript:alert(1)',normalized_value:'x'})])),/HTTP URL/)
})
test('query filters are strict and cursors bind full query plus numeric sort and direction',()=>{
  const parsed=query.parseCrmCompanyQuery(new URLSearchParams('min_reviews=10&sort=review_count&direction=desc'))
  assert.equal(parsed.min_reviews,10)
  assert.throws(()=>query.parseCrmCompanyQuery(new URLSearchParams('revenue_guess=10')),query.CrmValidationError)
  const expected={sort:'review_count',direction:'desc',scope:query.queryFingerprint({customer_mix:'mixed'})}
  const raw=query.encodeResearchCursor({v:1,...expected,value:10,id:'c'})
  assert.equal(query.decodeResearchCursor(raw,expected).value,10)
  assert.throws(()=>query.decodeResearchCursor(raw,{...expected,direction:'asc'}),/changed query/)
  assert.match(query.cursorClause({v:1,...expected,value:null,id:'c'}),/review_count.is.null,id.lt/)
})
test('legacy commit rejects silent loss of unsupported fields and rich facts',()=>{
  assert.throws(()=>legacy.validateLeadCommitInput({email:'jo@example.test',candidates:[]},'rows.0'),/Unsupported field/)
  assert.throws(()=>legacy.validateLeadCommitInput({lead_facts:[{kind:'about',claim:'A company',url:null,quote:'Rich evidence'}]},'rows.0'),/unknown_fields/)
  assert.doesNotThrow(()=>legacy.validateLeadCommitInput({company:'Example',phone:'0290000000',phone_source_url:'https://example.test'},'rows.0'))
})
