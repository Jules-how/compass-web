import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const c=loadTypescript('src/lib/campaign-reconcile.ts')
const provider='2509e085-8c15-4695-8cb3-eaa90654c9dc'
test('new provider identity is stable across repeated reconciliation',()=>{
 assert.deepEqual(c.resolveCampaignIdentity([],provider,'installation-booking'),c.resolveCampaignIdentity([],provider,'installation-booking'))
 assert.equal(c.resolveCampaignIdentity([],provider,'installation-booking').id,`campaign-instantly-${provider}`)
})
test('existing campaign reused and conflicting bindings held without replacement',()=>{
 assert.deepEqual(c.resolveCampaignIdentity([{id:'old-id',offer_key:'installation-booking'}],provider,'installation-booking'),{id:'old-id',existing:true})
 assert.throws(()=>c.resolveCampaignIdentity([{id:'old-id',offer_key:'other'}],provider,'installation-booking'),/offer_conflict/)
 assert.throws(()=>c.resolveCampaignIdentity([{id:'one',offer_key:'installation-booking'},{id:'two',offer_key:'installation-booking'}],provider,'installation-booking'),/binding_conflict/)
})
test('registration requires source and targeting, cannot carry provider write instructions',()=>{
 const p={provider_id:provider,offer_key:'installation-booking',vertical_tags:['hvac'],location_tags:['sydney'],source:'verified task 01a08b4f'}
 assert.equal(c.campaignReconcileInput.safeParse(p).success,true)
 assert.equal(c.campaignReconcileInput.safeParse({...p,source:''}).success,false)
 assert.equal(c.campaignReconcileInput.safeParse({...p,activate:true}).success,false)
})
