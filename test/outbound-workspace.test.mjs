import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const w = loadTypescript('src/lib/outbound-workspace.ts')
const now = new Date('2026-09-14T15:00:00Z')
test('due dates use the Sydney calendar including the UTC day boundary', () => {
  assert.equal(w.workspaceDue('2026-09-14', now), 'Overdue')
  assert.equal(w.workspaceDue('2026-09-15', now), 'Today')
  assert.equal(w.workspaceDue('2026-09-16', now), 'Upcoming')
  assert.equal(w.workspaceDue(null, now), 'Unscheduled')
})
test('preparation excludes unrelated, cancelled and outreach tasks even when recommendations reference them', () => {
  const tasks = [{id:'prep',source:'compass-outbound',title:'Prepare',status:'not-started'}, {id:'call',lead_id:'lead',title:'Call'}, {id:'cancelled',status:'cancelled'}, {id:'other',task_type:'SELL'}]
  const overview = {campaigns:[],recommendations:[{task_id:'call',lead_ids:[]},{task_id:'cancelled',lead_ids:[]},{task_id:'missing',lead_ids:[],title:'Review'}]}
  assert.deepEqual(w.workspaceTasks(tasks,overview).map(t=>t.id), ['missing','prep'])
})
test('no answer and decision maker outcomes do not manufacture interest', () => {
  for(const outcome of ['no_answer','decision_maker']) {
    const rows=w.workspaceMotion({leads:[{id:'a'}],tasks:[],touches:[{contact_id:'a',outcome,contacted_at:now.toISOString()}]})
    assert.equal(rows.length,0)
  }
  assert.equal(w.workspaceMotion({leads:[{id:'a',outbound_status:'interested',rhythm_disposition:'closed'}],tasks:[],touches:[]}).length,0)
})
test('restricted calls remain held even when their callback is overdue', () => {
  const data={leads:[{id:'a',phone:'0295550101',contact_restrictions:{call:{note:'No calls'}}}],tasks:[{lead_id:'a',outreach_channel:'call',due:'2026-09-14',status:'not-started'}],touches:[]}
  const row=w.workspaceCalls(data,now)[0]
  assert.equal(row.group,'Held');assert.equal(row.attention,false)
})
test('workspace renders live campaign counts without turning missing provider observations into zero', async () => {
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const payloads = {
    '/api/outbound/overview': { campaigns: [{ id:'real-campaign',name:'Recorded campaign',prepared_count:7,provider:null,freshness:'unknown' }],recommendations:[],coverage:{} },
    '/api/operator/outbound/rhythm': { leads:[],tasks:[],touches:[] },
    '/api/tasks': {topTasks:[],subtasks:[],projects:[],businessFunctions:[]}
  }
  const {OutboundWorkspace} = loadTypescript('src/components/outbound/OutboundWorkspace.tsx', {
    './OutboundWorkspace.module.css': {__esModule:true,default:new Proxy({}, {get:(_,key)=>String(key)})},
    '@/components/ActivePane': {useActivePane:()=>true},
    '@/lib/use-cached-json': {useCachedJson:key=>({data:payloads[key],reload:async()=>{}})},
    '@/components/ui/ModalFrame': {ModalFrame:()=>null},
    '@/components/TaskCreate': ()=>null,
    '@/components/TaskDetailPanel': ()=>null,
    'next/link': ({children, ...props})=>React.createElement('a',props,children)
  })
  const html = renderToStaticMarkup(React.createElement(OutboundWorkspace,{onEvidence:()=>{}}))
  assert.match(html,/Recorded campaign/)
  assert.match(html,/<strong>7<\/strong>prepared/)
  assert.match(html,/<strong>Unknown<\/strong>provider loaded/)
  assert.match(html,/No selected calls/)
})
