import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const directory=new URL('../src/components/outbound/workflow/',import.meta.url);
const source=readFileSync(new URL('model.ts',directory),'utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,crypto,require:()=>JSON.parse(readFileSync(new URL('example-cohort.json',directory),'utf8'))});
const M=exports;
test('research checkpoint precedes draft creation; source and contact issues remain independent',()=>{
 const b=M.createBatch();M.prepare(b);assert.equal(b.phase,'research');assert.equal(b.rows.filter(r=>r.body).length,0);M.prepare(b,true);assert.equal(b.rows.filter(r=>r.body).length,7);assert.equal(b.rows.filter(M.hasIssue).length,6);
 const held=b.rows.find(r=>r.body&&!r.contactPublished);assert.ok(held);assert.equal(M.approve(b,held),true);assert.equal(M.hasIssue(held),true);
});
test('copy and evidence corrections preserve exact old versions and invalidate approval',()=>{
 const b=M.createBatch(M.defaults,true),r=b.rows.find(r=>r.body);assert.equal(M.approve(b,r),true);const oldBody=r.body;M.revise(b,r,'Revised subject',r.body);assert.equal(r.approved,null);assert.equal(r.revisions[0].approved,true);assert.equal(r.revisions[0].body,oldBody);assert.equal(r.version,2);M.approve(b,r);M.revise(b,r,r.subject,r.body,'Corrected writing evidence');assert.equal(r.body,'');assert.equal(r.approved,null);assert.equal(r.version,3);assert.equal(M.approve(b,r),false);
});
test('missing opt-out blocks approval without overwriting the prior version',()=>{const b=M.createBatch(M.defaults,true),r=b.rows.find(r=>r.body);M.revise(b,r,r.subject,r.opener);assert.ok(M.checks(r).includes('Opt-out is missing'));assert.equal(M.approve(b,r),false);assert.ok(r.revisions[0].body.includes('won’t follow up'))});
test('explicit inventory selection determines membership, including non-leading records',()=>{
 const all=M.createBatch().rows,ids=[all[3].id,all[8].id];
 const batch=M.createBatch({...M.defaults,size:10,companyIds:ids});
 assert.deepEqual(Array.from(batch.rows,r=>r.id),ids);
 assert.equal(M.createBatch({...M.defaults,companyIds:[]}).rows.length,0);
 assert.equal(M.createBatch({...M.defaults,companyIds:[ids[0],ids[0],-99]}).rows.length,1);
});
