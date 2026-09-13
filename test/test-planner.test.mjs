import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypescript } from './helpers/load-typescript.mjs'
const planner = loadTypescript('src/lib/test-planner.ts')
const campaigns = loadTypescript('src/lib/campaigns.ts')
const server = loadTypescript('src/lib/campaigns-server.ts', { './lead-lists': {} })
test('future Sydney plans retain nine am on both sides of daylight saving', () => {
  assert.equal(campaigns.sydneyNineAmIso('2026-09-14'), '2026-09-13T23:00:00.000Z')
  assert.equal(campaigns.sydneyNineAmIso('2026-10-12'), '2026-10-11T22:00:00.000Z')
  assert.equal(planner.planDatePatch(undefined, '2026-10-12').start_date, '2026-10-12')
})
test('moving a campaign retains its local time and duration without touching copy or status', () => {
  const patch = planner.planDatePatch({ go_live_at: '2026-09-14T03:30:00Z', end_date: '2026-09-18', status: 'paused' }, '2026-10-12')
  assert.deepEqual(patch, {go_live_at:'2026-10-12T02:30:00.000Z', start_date:'2026-10-12',end_date:'2026-10-16'})
})
test('week calculations cross month and year boundaries and retain weekends', () => {
  assert.equal(planner.planMonday('2027-01-03'), '2026-12-28')
  assert.equal(planner.shiftPlanDay('2026-12-28', 7), '2027-01-04')
  assert.equal(planner.planDate({go_live_at:'2026-09-18T23:00:00Z'}),'2026-09-19')
  assert.equal(planner.canMovePlan({status:'active'}), false)
})
test('creation persists test identity and comparison atomically with campaign fields', () => {
  const row = server.buildCampaignInsert({name:'Sydney subject',status:'planned',experiment_factor:'subject',experiment_status:'queued',experiment_role:'challenger',parent_campaign_id:'control',testing_variable:'subject',sample_size_target:200})
  assert.equal(row.experiment_factor,'subject'); assert.equal(row.experiment_status,'queued')
  assert.equal(row.parent_campaign_id,'control'); assert.equal(row.experiment_role,'challenger')
  assert.equal(row.sample_size_target,200); assert.equal(row.instantly_campaign_id,null)
})
test('a stale campaign revision fails without overwriting the other writer', async () => {
  const predicates=[]
  const query={update(){return this},eq(key,value){predicates.push([key,value]);return this},select(){return this},async maybeSingle(){return {data:null,error:null}}}
  await assert.rejects(server.updatePipelineCampaignRow({from(){return query}},'campaign-1',{name:'changed',expected_updated_at:'old'}),/campaign_conflict/)
  assert.deepEqual(predicates,[['id','campaign-1'],['updated_at','old']])
})
test('legacy schema fallback omits only unavailable lineage fields', async () => {
  const seen=[]
  const result=await server.withCampaignColumns('id,offer_revision_id,market_test_id,name',async columns=>{seen.push(columns);return seen.length===1?{error:{code:'42703',message:'column compass_pipeline_campaigns.offer_revision_id does not exist'}}:{error:null,data:[]}})
  assert.deepEqual(seen,['id,offer_revision_id,market_test_id,name','id,name']);assert.equal(result.error,null)
  let calls=0
  await server.withCampaignColumns('id',async()=>{calls++;return {error:{code:'42703',message:'column other does not exist'}}})
  assert.equal(calls,1)
})
