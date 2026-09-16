import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const {previewSignalValues,runScopeFilters}=loadTypescript('src/components/outbound/workflow/pipeline-ui-state.ts')
const definition={id:'service',writing_eligible:true}
const fact={id:'one',signal_id:'service',value:'Ducted installation',source_id:'source',quote:'We install ducted systems',evidence_strength:'high',usefulness:'high',supersedes_id:null}
test('preview excludes missing provenance and conflicts, while respecting explicit correction lineage',()=>{
 assert.deepEqual(previewSignalValues([fact],[definition]),{values:{service:'Ducted installation'},conflicts:[]})
 assert.deepEqual(previewSignalValues([{...fact,source_id:''}],[definition]).values,{})
 const contradictory={...fact,id:'two',value:'No installations'}
 assert.deepEqual(previewSignalValues([fact,contradictory],[definition]),{values:{},conflicts:['service']})
 assert.deepEqual(previewSignalValues([fact,{...contradictory,supersedes_id:'one'}],[definition]).values,{service:'No installations'})
 assert.deepEqual(previewSignalValues([fact],[{...definition,writing_eligible:false}]).values,{})
})
test('preview serializes grounded scalar lists consistently with saved jobs',()=>{
 assert.deepEqual(previewSignalValues([{...fact,value:['Ducted',4,true]}],[definition]).values,{service:'Ducted, 4, true'})
 assert.deepEqual(previewSignalValues([{...fact,value:{service:'Ducted'}}],[definition]).values,{})
 assert.deepEqual(previewSignalValues([{...fact,value:[['Ducted']]}],[definition]).values,{})
})
test('all-matching scope drops empty optional geography without changing entered scope',()=>{
 assert.deepEqual(runScopeFilters({q:'Installer',city:'',suburb:'',country:'AU',fit:'likely_fit',status:''}),{q:'Installer',country:'AU',fit:'likely_fit'})
})
