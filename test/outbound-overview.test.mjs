import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './helpers/load-typescript.mjs';
const { outboundOverview, observationFreshness, previousDay } = loadTypescript('src/lib/outbound-overview-core.ts');
const now = new Date('2026-09-11T00:00:00Z');
const lead = (patch = {}) => ({ id:'l1', company:'Fixture Air', phone:'published phone', email:null, icp_status:'pass', outbound_status:'uncontacted', rhythm_timezone:'Australia/Perth', contact_restrictions:{}, ...patch });
const campaign = (patch = {}) => ({ id:'c1', name:'Fixture Perth', status:'planned', instantly_campaign_id:'p1', provider:{ status:'paused', observed_at:now.toISOString(), sent:40, loaded:40, contacted:40, replies:0 }, ...patch });
const input = (patch = {}) => ({ day:'2026-09-11', campaigns:[campaign()], preparations:[], sources:[{id:'source:instantly',data:{status:'current',checked_at:now.toISOString()}}], tasks:[], accepted_task_ids:[], leads:[], rhythm_tasks:[], reply_ids:[], ready_ids:[], touches:[], activity_partial:false, rhythm_partial:false, ...patch });
const action = (id, patch = {}) => ({ id, title:id, status:'not-started', due:'2026-09-10T22:00:00Z', lead_id:'l1', outreach_state:'accepted', outreach_channel:'call', ...patch });
const event = (id, at, patch = {}) => ({id,contact_id:'l1',contacted_at:at,channel:'email',direction:'outbound',outcome:'email_sent',source:'fixture',...patch});
test('provider pause overrides plan and preserves all forty sends; absent analytics never zero', () => {
 const result=outboundOverview(input(),now);
 assert.equal(result.campaigns[0].provider_status,'paused');
 assert.equal(result.campaigns[0].provider.sent,40);
 assert.equal(result.recommendations.some(a=>/restart|activate/i.test(a.title)),false);
 const missing=outboundOverview(input({campaigns:[campaign({provider:null})]}),now);
 assert.equal(missing.campaigns[0].provider_status,'unknown');
 assert.equal(missing.campaigns[0].freshness,'unknown');
 assert.equal(missing.campaigns[0].provider,null);
});
test('deduplicates exact stage identities, subtracts loaded receipts, never combines with provider total',()=>{
 const preparations=[['a','prepared',['1','2','2']],['b','prepared',['2','3']],['c','loaded',['2']]].map(([id,status,lead_ids])=>({id,data:{campaign_id:'c1',status,lead_ids}}));
 const c=outboundOverview(input({preparations}),now).campaigns[0];
 assert.equal(c.prepared_count,2);assert.equal(c.loaded_receipt_count,1);assert.equal(c.overlapping_stage_count,1);assert.equal(c.provider.loaded,40);
});
test('failed refresh retains evidence but cannot be called current live status',()=>{
 const r=outboundOverview(input({sources:[{id:'source:instantly',data:{status:'error',error:'Connection failed'}}]}),now);
 assert.equal(r.campaigns[0].provider.sent,40);assert.equal(r.campaigns[0].refresh_error,'Connection failed');assert.equal(r.recommendations[0].kind,'source');
 assert.equal(observationFreshness('2026-09-10T22:00:00Z',now),'stale');
 assert.equal(observationFreshness('2026-09-12T00:00:00Z',now),'unknown');
});
test('due callbacks win, future callbacks stay scheduled and suppression blocks contact',()=>{
 const r=outboundOverview(input({leads:[lead()],rhythm_tasks:[action('due'),action('future',{due:'2026-09-12T00:00:00Z'})]}),now);
 assert.equal(r.recommended_next,'task:due');assert.equal(r.recommendations.find(a=>a.id==='task:future').state,'scheduled');
 const blocked=outboundOverview(input({leads:[lead({contact_restrictions:{all:true}})],rhythm_tasks:[action('due')]}),now);
 assert.equal(blocked.recommended_next,null);assert.equal(blocked.recommendations[0].state,'blocked');
});
test('same task appears once across day and rhythm; reviewed order preserved, changed recommendation separate',()=>{
 const a=action('a'), b=action('b');
 const r=outboundOverview(input({leads:[lead()],tasks:[a,b],rhythm_tasks:[a],accepted_task_ids:['b','a']}),now);
 assert.deepEqual(r.recommendations.map(a=>a.id),['task:b','task:a']);assert.equal(r.recommended_next,'task:a');assert.equal(r.accepted_order_preserved,true);
});
test('recorded days use Sydney midnight, deduplicate events, exclude undated and planning touches',()=>{
 const r=outboundOverview(input({touches:[event('1','2026-09-10T13:59:59Z'),event('2','2026-09-10T14:00:00Z'),event('2','2026-09-10T14:00:00Z'),event('3','2026-09-10T15:00:00Z',{request_payload:{at_verified:false}}),event('4','2026-09-10T16:00:00Z',{channel:'call',outcome:'next_step'})]}),now);
 assert.equal(r.activity[0].email_sends,1);assert.equal(r.activity[1].email_sends,1);assert.equal(r.activity[1].calls,0);assert.equal(r.coverage.undated_events,1);
 assert.equal(previousDay('2027-01-01'),'2026-12-31');
 const dst=outboundOverview(input({day:'2026-10-05',touches:[event('1','2026-10-04T12:59:59Z'),event('2','2026-10-04T13:00:00Z')]}),new Date('2026-10-05T00:00:00Z'));
 assert.equal(dst.activity[0].email_sends,1);assert.equal(dst.activity[1].email_sends,1);
});
test('activity failure produces null counts; partial and zero recorded are qualified',()=>{
 const bad=outboundOverview(input({activity_error:'unavailable'}),now);assert.equal(bad.activity[0].calls,null);assert.equal(bad.coverage.activity,'unavailable');
 const partial=outboundOverview(input({activity_partial:true}),now);assert.equal(partial.coverage.activity,'partial');assert.match(partial.coverage.message,/not zero activity/);
});
test('no-email call proposal requires selected ready cleared fit; known valid email is not fallback list',()=>{
 const r=outboundOverview(input({leads:[lead(),lead({id:'l2',email:'published',email_verify_status:'valid'}),lead({id:'l3',contact_restrictions:{all:true}})],ready_ids:['l1','l1','l2','l3']}),now);
 assert.deepEqual(r.recommendations.find(a=>a.kind==='call').lead_ids,['l1']);
 assert.equal(r.call_accounts[0].window,'Outside 9am–5pm local calling window');
});
test('follow-up review needs actual contact, minimum age and known inactive campaign; active sequence left alone',()=>{
 const l=lead({email:'published',email_verify_status:'valid',outbound_status:'in_instantly',last_outbound_at:'2026-09-08T00:00:00Z',instantly_campaign_id:'p1'});
 assert.equal(outboundOverview(input({leads:[l]}),now).recommendations[0].kind,'followup_review');
 for (const provider of [{status:'active',observed_at:now.toISOString()},{status:'paused',observed_at:'2026-09-09T00:00:00Z'}]) assert.equal(outboundOverview(input({leads:[l],campaigns:[campaign({provider})]}),now).recommendations.some(a=>a.kind==='followup_review'),false);
 assert.equal(outboundOverview(input({leads:[{...l,last_outbound_at:null}]}),now).recommendations.length,0);
});
test('call coverage failure or partial selection never triggers a false refill recommendation',()=>{
 for (const flags of [{rhythm_error:'failed'},{rhythm_partial:true}]) assert.equal(outboundOverview(input({call_target:10,ready_days:2,...flags}),now).recommendations.some(a=>a.kind==='supply'),false);
});
test('UI and agent route use same projection, enforce auth, and fail without fabricated success',async()=>{
 let reads=0;
 const snapshot={day:'fixture',campaigns:[]};
 const stubs={
  '@/lib/outbound-overview-server':{loadOutboundOverview:async()=>{reads++;return snapshot}},
  '@/lib/portal-http':{portalJson:(b,o)=>({body:b,status:o?.status||200}),portalAccessResponse:()=>null,requireSameOrigin:()=>null},
  '@/lib/agent-auth':{requireAgentAuth:()=>null}, '@/lib/portal-access':{requirePortalAccess:async()=>({})}
 };
 const ui=loadTypescript('src/app/api/outbound/overview/route.ts',stubs), agent=loadTypescript('src/app/api/agent/outbound/overview/route.ts',stubs);
 assert.deepEqual(await ui.GET(),await agent.GET(new Request('https://test/')));assert.equal(reads,2);
 const denied={status:401};
 const locked=loadTypescript('src/app/api/agent/outbound/overview/route.ts',{...stubs,'@/lib/agent-auth':{requireAgentAuth:()=>denied}});
 assert.equal(await locked.GET(new Request('https://test/')),denied);assert.equal(reads,2);
 const failure=loadTypescript('src/app/api/outbound/overview/route.ts',{...stubs,'@/lib/outbound-overview-server':{loadOutboundOverview:async()=>{throw Error('private details')}}});
 const r=await failure.GET();assert.equal(r.status,503);assert.doesNotMatch(r.body.error,/private/);
 const origin=loadTypescript('src/app/api/outbound/overview/route.ts',{...stubs,'@/lib/portal-http':{...stubs['@/lib/portal-http'],requireSameOrigin:()=>({status:403})}});
 assert.equal((await origin.POST(new Request('https://test/'))).status,403);
});

test('loader refreshes old source once for concurrent readers, includes bound events, excludes unrelated records',async()=>{
 const liveNow=new Date(); const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(liveNow);
 let refreshes=0, released=false; let release;
 const gate=new Promise(r=>release=r);
 const operating={day, sources:[{id:'source:instantly',data:{checked_at:new Date(Date.now()-600000).toISOString()}}], campaigns:[campaign()], preparations:[], queue:[],waiting:[],proposals:[],confirmation:[],review:null};
 const touches=[event('bound',liveNow.toISOString(),{instantly_campaign_id:'p1'}),event('outside',liveNow.toISOString(),{contact_id:'other',instantly_campaign_id:'other'})];
 const chain={select(){return this},gte(){return this},lte(){return this},order(){return this},limit(){return Promise.resolve({data:touches,error:null})}};
 const server=loadTypescript('src/lib/outbound-overview-server.ts',{
  '@/lib/portal-admin':{getPortalAdminClient:()=>({from:()=>chain})},
  '@/lib/operating-server':{loadOperatingDay:async()=>operating,refreshOperatingCampaigns:async()=>{refreshes++;await gate;released=true;return {ok:true}}},
  '@/lib/outbound-rhythm-server':{loadRhythm:async()=>({ready:[],leads:[],tasks:[],replies:[],partial:false,preferences:{}})}
 });
 const first=server.loadOutboundOverview(),second=server.loadOutboundOverview();
 await new Promise(r=>setImmediate(r));assert.equal(refreshes,1);release();
 const [a,b]=await Promise.all([first,second]);assert.equal(released,true);
 assert.equal(a.activity[1].email_sends,1);assert.equal(b.activity[1].events[0].id,'bound');
});
test('loader keeps campaign evidence on refresh, activity and rhythm failure and reports unavailable',async()=>{
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const operating={day,sources:[{id:'source:instantly',data:{checked_at:'2020-01-01T00:00:00Z'}}],campaigns:[campaign()],preparations:[],queue:[],waiting:[],proposals:[],confirmation:[],review:null};
 const chain={select(){return this},gte(){return this},lte(){return this},order(){return this},limit(){return Promise.resolve({data:null,error:{message:'private'}})}};
 const server=loadTypescript('src/lib/outbound-overview-server.ts',{
  '@/lib/portal-admin':{getPortalAdminClient:()=>({from:()=>chain})},
  '@/lib/operating-server':{loadOperatingDay:async()=>operating,refreshOperatingCampaigns:async()=>{throw Error('private')}},
  '@/lib/outbound-rhythm-server':{loadRhythm:async()=>{throw Error('private')}}
 });
 const r=await server.loadOutboundOverview();assert.equal(r.campaigns[0].provider.sent,40);assert.match(r.campaigns[0].refresh_error,/failed/);assert.equal(r.activity[0].email_sends,null);assert.equal(r.coverage.calls,'unavailable');assert.doesNotMatch(JSON.stringify(r),/private/);
});
test('city expansion is explicitly provisional, skips tagged cities and waits for existing prepared work',()=>{
 const base=input({campaigns:[campaign({location_tags:['Melbourne']})],call_target:10,ready_days:2});
 const proposal=outboundOverview(base,now).recommendations.find(a=>a.kind==='city_proposal');
 assert.match(proposal.title,/Brisbane/);assert.match(proposal.reason,/not a claim/);assert.equal(proposal.state,'proposed');
 assert.equal(outboundOverview({...base,preparations:[{id:'p',data:{campaign_id:'c1',status:'prepared',lead_ids:['l1']}}]},now).recommendations.some(a=>a.kind==='city_proposal'),false);
});
test('completion evidence is a review proposal and blocked prerequisites cannot become next',()=>{
 const r=outboundOverview(input({leads:[lead()],tasks:[action('proof',{operating_context:{state:'awaiting_confirmation',campaign_id:'c1'}}),action('blocked',{operating_context:{state:'blocked',campaign_id:'c1'}})]}),now);
 const proof=r.recommendations.find(a=>a.task_id==='proof');assert.equal(proof.kind,'confirmation');assert.equal(proof.state,'proposed');assert.match(proof.title,/Review completion/);assert.equal(r.recommendations.find(a=>a.task_id==='blocked').state,'blocked');
});
test('unbound preparation is not a provider outage; unrelated partial refresh does not invalidate a current campaign',()=>{
 const unbound=outboundOverview(input({campaigns:[campaign({instantly_campaign_id:null,provider:null})]}),now);
 assert.equal(unbound.campaigns[0].provider_status,'not connected');assert.equal(unbound.recommendations.length,0);
 const partial=outboundOverview(input({sources:[{id:'source:instantly',data:{status:'partial',checked_at:now.toISOString(),error:'Different campaign failed'}}]}),now);
 assert.equal(partial.campaigns[0].refresh_error,null);
});
