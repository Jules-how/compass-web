import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTypescript } from './helpers/load-typescript.mjs';
const { createPipelineReadStore, mergePipelineRecords } = loadTypescript('src/components/outbound/workflow/pipeline-read-store.ts');
const { formatCompanyLocation, companyStagePresentation, pipelineRunBlocker, PIPELINE_STAGE_INFO } = loadTypescript('src/components/outbound/workflow/pipeline-view-model.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };

test('A → B → A returns the correct cached view without a third request', async () => {
  const requests=[]; const store=createPipelineReadStore(async path => { requests.push(path); return { id:path }; });
  let stop=store.load('A',0,()=>{}); await tick(); stop();
  stop=store.load('B',0,()=>{}); await tick(); stop();
  assert.deepEqual(store.snapshot('A',0),{data:{id:'A'},error:'',loading:false});
  stop=store.load('A',0,()=>{}); await tick();
  assert.deepEqual(requests,['A','B']); stop();
});
test('a new list never renders another list’s records', async () => {
  const store=createPipelineReadStore(async path => ({ id:path }));
  store.load('?list=A',0,()=>{}); await tick();
  assert.deepEqual(store.snapshot('?list=B',0),{data:null,error:'',loading:true});
});
test('late A responses cannot overwrite B even when the transport ignores abort', async () => {
  const a=deferred(), b=deferred(); const seen=[];
  const store=createPipelineReadStore(path => path==='A'?a.promise:b.promise);
  store.load('A',0,value=>seen.push(['A',value])); await tick();
  store.load('B',0,value=>seen.push(['B',value])); await tick();
  b.resolve({id:'B'}); await tick(); a.resolve({id:'A'}); await tick();
  assert.equal(store.snapshot('B',0).data.id,'B');
  assert.equal(seen.filter(([key,value])=>key==='A'&&value.data).length,0);
  assert.equal(store.peek('A',0).data,null);
});
test('cleanup prevents late errors from changing the active state', async () => {
  const request=deferred(); let count=0; const store=createPipelineReadStore(()=>request.promise);
  const stop=store.load('A',0,()=>count++); await tick(); stop();
  request.reject(new Error('late failure')); await tick(); assert.equal(count,1);
});
test('expired views retain only their own rows while revalidating', async () => {
  let now=0, reads=0; const store=createPipelineReadStore(async()=>({n:++reads}),{now:()=>now,staleMs:10});
  let stop=store.load('A',0,()=>{}); await tick(); stop(); now=11;
  assert.deepEqual(store.snapshot('A',0),{data:{n:1},error:'',loading:true});
  stop=store.load('A',0,()=>{}); await tick(); assert.equal(store.snapshot('A',0).data.n,2); stop();
});
test('revision refresh preserves the current view but invalidates other cached scopes', async () => {
  const store=createPipelineReadStore(async path=>({id:path}));
  let stop=store.load('B',0,()=>{}); await tick(); stop();
  stop=store.load('A',0,()=>{}); await tick(); stop();
  assert.deepEqual(store.snapshot('A',1),{data:{id:'A'},error:'',loading:true});
  const states=[]; store.load('A',1,state=>states.push(state)); await tick();
  assert.equal(states[0].data.id,'A'); assert.equal(states[0].loading,true);
  assert.equal(store.peek('B',1).data,null); assert.equal(store.snapshot('A',1).loading,false);
});
test('refresh failure preserves the current rows with an explicit error', async () => {
  let fail=false; const store=createPipelineReadStore(async()=>{if(fail)throw new Error('offline');return {id:'A'};});
  store.load('A',0,()=>{}); await tick(); fail=true; store.load('A',1,()=>{}); await tick();
  assert.deepEqual(store.snapshot('A',1),{data:{id:'A'},error:'offline',loading:false});
});
test('authentication errors clear cached private rows', async () => {
  let deny=false; const store=createPipelineReadStore(async path=>{if(deny)throw Object.assign(new Error('Sign in'),{status:401});return {id:path};});
  let stop=store.load('B',0,()=>{}); await tick(); stop(); store.load('A',0,()=>{}); await tick();
  deny=true; store.load('A',1,()=>{}); await tick();
  assert.equal(store.snapshot('A',1).data,null); assert.equal(store.peek('B',0).data,null);
});
test('cache memory is bounded and uses least-recently-used eviction', async () => {
  const store=createPipelineReadStore(async path=>path,{maxEntries:2});
  for(const path of ['A','B','A','C']) { const stop=store.load(path,0,()=>{}); await tick(); stop(); }
  assert.equal(store.peek('A').data,'A'); assert.equal(store.peek('B').data,null); assert.equal(store.peek('C').data,'C');
});
test('disabled readers neither fetch nor expose earlier data', async () => {
  let reads=0; const store=createPipelineReadStore(async()=>++reads);
  store.load(null,0,()=>{}); await tick(); assert.equal(reads,0);
  assert.deepEqual(store.snapshot(null),{data:null,error:'',loading:false});
});
test('catalogue pages deduplicate IDs and retain newer record versions', () => {
  assert.deepEqual(mergePipelineRecords([{id:'a',v:1},{id:'b',v:1}],[{id:'a',v:2},{id:'c',v:1}]),[{id:'a',v:2},{id:'b',v:1},{id:'c',v:1}]);
});
test('unknown country placeholders are hidden, not inferred as Australia', () => {
  assert.equal(formatCompanyLocation({suburb:null,city:'Sydney',administrative_region:'NSW',country:'ZZ'}),'Sydney, NSW');
  assert.equal(formatCompanyLocation({suburb:null,city:null,administrative_region:null,country:'ZZ'}),'Location not recorded');
});
test('duplicate location labels are removed without inventing geography', () => {
  assert.equal(formatCompanyLocation({suburb:' Sydney ',city:'sydney',administrative_region:'NSW',country:'AU'}),'Sydney, NSW, AU');
});
test('unstarted held rows are shown as not started, not as a failed run', () => {
  const out=companyStagePresentation({stage_status:'held',reason:'Not started'},'contacts');
  assert.equal(out.status,'not_started'); assert.match(out.reason,/Contact sourcing has not run/);
});
test('a real hold and a real failure retain their state and reason', () => {
  assert.deepEqual(companyStagePresentation({stage_status:'held',reason:'No supported email'},'verify'),{status:'held',reason:'No supported email'});
  assert.equal(companyStagePresentation({stage_status:'failed',reason:'Not started'},'research').status,'failed');
});
test('no recorded stage result never becomes ready or completed in presentation', () => {
  for(const stage of Object.keys(PIPELINE_STAGE_INFO)) assert.equal(companyStagePresentation({stage_status:null,reason:null},stage).status,'not_started');
});
const runnable={writable:true,busy:false,uncertain:false,loading:false,error:'',stage:'research',listId:'list',workflowId:'workflow',templateId:'',selectedCount:2,allMatching:false,total:20,requiresVerificationRun:false,verificationRunId:''};
test('run controls explain missing list, workflow, selection and loading', () => {
  assert.match(pipelineRunBlocker({...runnable,listId:''}),/working list/);
  assert.match(pipelineRunBlocker({...runnable,workflowId:''}),/workflow/);
  assert.match(pipelineRunBlocker({...runnable,selectedCount:0}),/Select/);
  assert.match(pipelineRunBlocker({...runnable,loading:true}),/load successfully/);
  assert.match(pipelineRunBlocker({...runnable,error:'failed'}),/load successfully/);
});
test('uncertain saves, read-only access and empty all-matching scopes prevent new runs', () => {
  assert.match(pipelineRunBlocker({...runnable,uncertain:true}),/previous save/);
  assert.match(pipelineRunBlocker({...runnable,writable:false}),/read-only/);
  assert.match(pipelineRunBlocker({...runnable,allMatching:true,total:0}),/Select/);
  assert.equal(pipelineRunBlocker(runnable),'');
});
test('writing still requires the selected template and the required verification run', () => {
  assert.match(pipelineRunBlocker({...runnable,stage:'write'}),/template/);
  assert.match(pipelineRunBlocker({...runnable,stage:'write',templateId:'t',requiresVerificationRun:true}),/verification run/);
  assert.equal(pipelineRunBlocker({...runnable,stage:'write',templateId:'t',requiresVerificationRun:true,verificationRunId:'v'}),'');
});

// These hook-contract tests inject a deterministic React boundary, not a browser renderer.
function hookHarness() {
  const slots=[]; let index=0, effects=[], dirty=false, renderFn;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const react={
    useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true;}}];},
    useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},
    useEffect(fn,deps){const i=index++;const before=slots[i];if(!before||!same(before.deps,deps)){slots[i]={deps,cleanup:before?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
    useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,fn};return slots[i].fn;},
  };
  return { react, render(fn){renderFn=fn;index=0;dirty=false;return fn();}, flush(){let out;for(let n=0;n<30;n++){const work=effects;effects=[];work.forEach(fn=>fn());if(!dirty) return out;index=0;dirty=false;out=renderFn();}throw new Error('Effect loop');} };
}
function withStorage(fn) {
  const previous=globalThis.sessionStorage, data=new Map(), writes=[];
  globalThis.sessionStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{writes.push([key,value]);data.set(key,value);},removeItem:key=>data.delete(key)};
  try{return fn({data,writes});}finally{globalThis.sessionStorage=previous;}
}
test('editor key changes never persist A’s draft into B’s recovery buffer',()=>withStorage(({data,writes})=>{
  data.set('A',JSON.stringify({text:'saved A'}));data.set('B',JSON.stringify({text:'saved B'}));
  const harness=hookHarness();const {useEditorBuffer}=loadTypescript('src/components/outbound/workflow/pipeline-client.ts',{'react':harness.react,'@/lib/outbound-pipeline':{PIPELINE_VERSION:'outbound.pipeline.v1'}});
  let key='A', current;const render=()=>current=useEditorBuffer(key,{text:`server ${key}`});
  harness.render(render);harness.flush();current[1]({text:'edited A'});harness.render(render);harness.flush();
  const start=writes.length;key='B';harness.render(render);harness.flush();
  assert.equal(current[0].text,'saved B');
  assert.equal(writes.slice(start).some(([k,v])=>k==='B'&&JSON.parse(v).text==='edited A'),false);
  assert.equal(JSON.parse(data.get('A')).text,'edited A');
}));
test('server re-renders do not overwrite an unsaved editor buffer for the same key',()=>withStorage(()=>{
  const harness=hookHarness();const {useEditorBuffer}=loadTypescript('src/components/outbound/workflow/pipeline-client.ts',{'react':harness.react,'@/lib/outbound-pipeline':{PIPELINE_VERSION:'outbound.pipeline.v1'}});
  let initial={text:'server'},current;const render=()=>current=useEditorBuffer('A',initial);
  harness.render(render);harness.flush();current[1]({text:'manual'});harness.render(render);harness.flush();
  initial={text:'new server result'};harness.render(render);harness.flush();assert.equal(current[0].text,'manual');
}));
test('query building retains exact IDs and encodes filters',()=>{
  const {queryPath}=loadTypescript('src/components/outbound/workflow/pipeline-client.ts',{'react':{},'@/lib/outbound-pipeline':{PIPELINE_VERSION:'outbound.pipeline.v1'}});
  const path=queryPath('companies',{list_id:'list with spaces',q:'A&B',after:'',city:undefined});
  const params=new URLSearchParams(path.slice(1));assert.equal(params.get('list_id'),'list with spaces');assert.equal(params.get('q'),'A&B');assert.equal(params.has('after'),false);assert.equal(params.get('limit'),'100');
});
