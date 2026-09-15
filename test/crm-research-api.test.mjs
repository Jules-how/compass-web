import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const server=loadTypescript('src/lib/crm-research-server.ts')
const query=loadTypescript('src/lib/crm-research-query.ts')
const json=(body,init={})=>new Response(JSON.stringify(body),init)

test('research writes validate before RPC, are flag gated and hash canonical defaults',async()=>{
  const prior=[process.env.COMPASS_CRM_RESEARCH,process.env.COMPASS_CRM_RESEARCH_WRITES]
  let calls=0,received
  const db={rpc:async(name,args)=>{calls++;received={name,args};return{data:{request_id:args.p_command.request_id},error:null}}}
  const input={schema_version:'crm.research.v1',request_id:'request',source:'Fixture',operations:[{kind:'company',expected_revision:0,record:{id:'company',name:'Example'}}]}
  try {
    delete process.env.COMPASS_CRM_RESEARCH
    await assert.rejects(server.applyCrmResearch(db,input,'agent'),/disabled/)
    process.env.COMPASS_CRM_RESEARCH='1';process.env.COMPASS_CRM_RESEARCH_WRITES='0'
    await assert.rejects(server.applyCrmResearch(db,input,'agent'),/read_only/)
    process.env.COMPASS_CRM_RESEARCH_WRITES='1'
    await assert.rejects(server.applyCrmResearch(db,{...input,ignored:true},'agent'),/Unrecognized key/)
    assert.equal(calls,0)
    await server.applyCrmResearch(db,input,'agent')
    assert.equal(received.name,'crm_research_apply');assert.equal(received.args.p_command.operations[0].record.identity_status,'unreviewed')
    const hash=received.args.p_hash
    await server.applyCrmResearch(db,{operations:input.operations,source:input.source,request_id:input.request_id,schema_version:input.schema_version},'agent')
    assert.equal(received.args.p_hash,hash)
  }finally{for(const [i,key] of ['COMPASS_CRM_RESEARCH','COMPASS_CRM_RESEARCH_WRITES'].entries())if(prior[i]===undefined)delete process.env[key];else process.env[key]=prior[i]}
})
test('company search counts before cursor and requests numeric ordering before bounded page',async()=>{
  const before=process.env.COMPASS_CRM_RESEARCH;process.env.COMPASS_CRM_RESEARCH='1'
  const calls=[]
  const db={rpc:(name,args,options)=>{
    const call={name,args,orders:[],head:options?.head};calls.push(call)
    const builder={select:()=>builder,order:(column,options)=>{call.orders.push([column,options]);return builder},limit:value=>{call.limit=value;return builder},or:value=>{call.cursor=value;return builder},then:resolve=>resolve(call.head?{count:201,error:null}:{data:[{id:'a',review_count:9},{id:'b',review_count:20}],error:null})};return builder
  }}
  try{
    const first=await server.searchCrmCompanies(db,query.parseCrmCompanyQuery(new URLSearchParams('sort=review_count&limit=1')))
    assert.equal(first.total_matching,201);assert.equal(first.companies.length,1);assert.ok(first.next_cursor)
    assert.deepEqual(calls[1].orders.map(value=>value[0]),['review_count','id']);assert.equal(calls[1].limit,2)
    const second=query.parseCrmCompanyQuery(new URLSearchParams({sort:'review_count',limit:'1',cursor:first.next_cursor}))
    await server.searchCrmCompanies(db,second)
    assert.equal(calls[2].cursor,undefined);assert.match(calls[3].cursor,/review_count.gt."9"/)
    await assert.rejects(server.readCrmCollection(db,new URLSearchParams('collection=people&company_id=c&method_id=m')),/Unsupported scope/)
  }finally{if(before===undefined)delete process.env.COMPASS_CRM_RESEARCH;else process.env.COMPASS_CRM_RESEARCH=before}
})
test('agent routes reject unauthenticated requests before creating a database client',async()=>{
  const before=process.env.COMPASS_AGENT_SECRET;process.env.COMPASS_AGENT_SECRET='fixture-secret'
  let accessed=false
  try {
    for(const file of ['src/app/api/agent/crm/research/route.ts','src/app/api/agent/crm/companies/route.ts']){
      const route=loadTypescript(file,{'@/lib/portal-admin':{getPortalAdminClient:()=>{accessed=true;throw new Error('unexpected db')}},'@/lib/portal-http':{portalJson:json},'@/lib/crm-research-api':{handleCrmRead:()=>{},handleCrmWrite:()=>{}},'@/lib/crm-research-http':{crmErrorResponse:()=>json({error:'unexpected'},{status:500})}})
      const response=await (route.POST||route.GET)(new Request('https://compass.test/api/agent/crm/companies'))
      assert.equal(response.status,401)
    }
    assert.equal(accessed,false)
  }finally{if(before===undefined)delete process.env.COMPASS_AGENT_SECRET;else process.env.COMPASS_AGENT_SECRET=before}
})
