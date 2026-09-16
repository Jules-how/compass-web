import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const {readPipeline,pipelineCapabilities}=loadTypescript('src/lib/outbound-pipeline-server.ts')
test('bounded reads project fields and bind cursor to filters',async()=>{
 process.env.COMPASS_OUTBOUND_PIPELINE='1';process.env.COMPASS_CRM_RESEARCH='1';const calls=[];
 const db={from(){let limit=0;return {select(){return this},eq(){return this},gt(k,v){calls.push(['gt',k,v]);return this},order(){return this},limit(n){limit=n;calls.push(['limit',n]);return this},then(resolve){resolve({data:limit?[{id:'a',name:'A',secret:'x'},{id:'b',name:'B'}]:[],count:2,error:null})}}}};
 const page=await readPipeline(db,new URLSearchParams('collection=lists&limit=1&fields=name'));assert.equal(page.total_matching,2);assert.deepEqual(page.records,[{id:'a',name:'A'}]);assert.deepEqual(calls,[['limit',0],['limit',2]]);assert.ok(page.next_after);
 await assert.rejects(readPipeline(db,new URLSearchParams('collection=lists&id=changed&after='+page.next_after)),/cursor_scope_conflict/)
})
test('missing migration is an honest capability failure',async()=>{process.env.COMPASS_OUTBOUND_PIPELINE='1';process.env.COMPASS_CRM_RESEARCH='1';const result=await pipelineCapabilities({rpc:async()=>({error:{code:'42883',message:'missing'}})});assert.equal(result.schema_ready,false);assert.equal(result.reason,'pipeline_schema_unavailable')})
