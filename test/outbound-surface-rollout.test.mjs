import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const {pipelineCapabilities}=loadTypescript('src/lib/outbound-pipeline-server.ts')
test('backfill capability can be writable while the default lead table remains gated',async()=>{
 const names=['COMPASS_OUTBOUND_PIPELINE','COMPASS_CRM_RESEARCH','COMPASS_OUTBOUND_PIPELINE_WRITES','COMPASS_CRM_RESEARCH_WRITES','COMPASS_OUTBOUND_PIPELINE_SURFACE']
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]))
 try{
  for(const name of names)process.env[name]='1'
  delete process.env.COMPASS_OUTBOUND_PIPELINE_SURFACE
  const db={rpc:async()=>({data:{},error:null})}
  const before=await pipelineCapabilities(db)
  assert.equal(before.writable,true);assert.equal(before.schema_ready,true);assert.equal(before.surface_ready,false)
  process.env.COMPASS_OUTBOUND_PIPELINE_SURFACE='1'
  assert.equal((await pipelineCapabilities(db)).surface_ready,true)
  process.env.COMPASS_OUTBOUND_PIPELINE='0'
  assert.equal((await pipelineCapabilities(db)).surface_ready,false)
 }finally{for(const name of names)previous[name]===undefined?delete process.env[name]:process.env[name]=previous[name]}
})
