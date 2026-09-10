import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadTypescript } from './helpers/load-typescript.mjs'

const model = loadTypescript('src/lib/reports-model.ts')

test('reports retain unknown counts, including malformed numeric values', () => {
  for (const summary of [undefined, {}, {total:null}, {total:'0'}, {total:-1}, {total:1.2}, {total:Infinity}]) assert.equal(model.reportCount(summary, 'total'), null)
  assert.equal(model.reportCount({total:0}, 'total'), 0)
  assert.equal(model.reportCount({total:43}, 'total'), 43)
})
test('dashboard preferences accept only known, unique dashboard ids', () => {
  assert.deepEqual(model.parseReportFavorites('["crm","crm","coverage","random",3]'), ['crm','coverage'])
  assert.deepEqual(model.parseReportFavorites('broken'), [])
  assert.deepEqual(model.parseReportFavorites('{"crm":true}'), [])
})
test('work report deduplicates tasks and separates cancelled and unknown statuses', () => {
  const parent={id:'p1',status:'in-progress',due:'2026-09-08'}
  const data={topTasks:[parent,{id:'p2',status:'cancelled',due:'2026-09-01'},{id:'p3',status:'unrecognised',due:'2026-09-01'}],subtasks:[parent,{id:'s1',status:'completed',due:null},{id:'s2',status:'not-started',due:'2026-09-11'},{id:'s3',status:'blocked',due:'invalid'}],projects:[{id:'a',status:'active'},{id:'b',status:'canceled'},{id:'c',status:'legacy-unknown'}]}
  const report=model.summarizeWorkReport(data,new Date('2026-09-10T08:00:00Z'))
  assert.equal(report.taskCount,6)
  assert.equal(report.openTaskCount,3)
  assert.equal(report.overdueCount,1)
  assert.equal(report.missingDue,1)
  assert.equal(report.taskBars.find(r=>r.label==='Completed').count,1)
  assert.equal(report.taskBars.find(r=>r.label==='Cancelled').count,1)
  assert.equal(report.taskBars.find(r=>r.label==='Unrecognised status').count,1)
  assert.equal(report.projectBars.find(r=>r.label==='In progress').count,1)
  assert.equal(report.projectBars.find(r=>r.label==='Unrecognised status').count,1)
})
test('overdue report uses Sydney calendar date and excludes today', () => {
  const report=model.summarizeWorkReport({projects:[],subtasks:[],topTasks:[{id:'yesterday',status:'blocked',due:'2026-09-10'},{id:'today',status:'not-started',due:'2026-09-11'}]},new Date('2026-09-10T16:00:00Z'))
  assert.deepEqual(report.overdue.map(t=>t.id),['yesterday'])
})
test('malformed work payload does not become an empty dashboard', () => {
  for(const value of [undefined,{}, {topTasks:[],projects:[]}, {topTasks:[null],subtasks:[],projects:[]}]) assert.equal(model.isWorkReportPayload(value),false)
  assert.equal(model.isWorkReportPayload({topTasks:[],subtasks:[],projects:[]}),true)
})
function renderReports(dashboard, cache) {
  const {ReportsWorkspace}=loadTypescript('src/components/ReportsWorkspace.tsx',{
    'next/link': ({children,...props})=>React.createElement('a',props,children),
    'next/navigation': {useSearchParams:()=>new URLSearchParams(dashboard?`dashboard=${dashboard}`:'')},
    '@/lib/use-cached-json':{useCachedJson:()=>({data:undefined,error:null,loading:false,refreshing:false,updatedAt:0,reload:async()=>{},...cache})}
  })
  return renderToStaticMarkup(React.createElement(ReportsWorkspace))
}
test('failed ledger source is visible and unavailable metrics are never rendered as zero', () => {
  const html=renderReports('crm',{error:'Failed to load (503)'})
  assert.match(html,/role="alert"/)
  assert.match(html,/Figures are unavailable/)
  assert.match(html,/Unavailable from source/)
  assert.doesNotMatch(html,/<strong>0<\/strong>/)
  assert.match(html,/Retry/)
})
test('reports library exposes the three selectable dashboards', () => {
  const html=renderReports(null,{})
  for(const id of ['crm','coverage','work']) assert.match(html,new RegExp(`/reports\\?dashboard=${id}`))
  assert.match(html,/Favorites are saved in this browser/)
})

test('stale report values retain an explicit failed-refresh label', () => {
  const html=renderReports('crm',{error:'Failed to load (503)',updatedAt:1789027200000,data:{summary:{total:37,replied:0}}})
  assert.match(html,/last successful load/)
  assert.match(html,/<strong>37<\/strong>/)
  assert.match(html,/<strong>0<\/strong>/)
  assert.match(html,/Unavailable from source/)
})
test('record identity is a keyboard button and sorting announces current-page scope', () => {
  const {default:RecordsTable}=loadTypescript('src/components/ui/records-table.tsx',{'@/components/LeadColumnPicker':{LeadColumnPicker:()=>null}})
  const html=renderToStaticMarkup(React.createElement(RecordsTable,{leads:[{id:'test-record',company:'Harbour Air [test]',name:null,email:null}],columns:['company'],widths:{},onResizeColumn:()=>{},selected:new Set(),onToggleRow:()=>{},onToggleAll:()=>{},onRowActivate:()=>{}}))
  assert.match(html,/button[^>]+aria-label="Open Harbour Air \[test\]"/)
  assert.match(html,/Column sorting applies to this page of records/)
  assert.match(html,/Resize Company column\. Use left and right arrows/)
})

test('timestamp due dates use the Sydney day rather than their UTC prefix', () => {
  const report=model.summarizeWorkReport({projects:[],subtasks:[],topTasks:[{id:'today-in-sydney',status:'blocked',due:'2026-09-10T16:00:00Z'}]},new Date('2026-09-10T20:00:00Z'))
  assert.equal(report.overdueCount,0)
})
