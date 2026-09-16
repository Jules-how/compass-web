import test from 'node:test'
import assert from 'node:assert/strict'
import {loadTypescript} from './helpers/load-typescript.mjs'
const {pipelineCsvRows}=loadTypescript('src/lib/outbound-pipeline-jobs.ts')
test('general CSV preserves multiline/quotes and guards spreadsheet formulas',()=>{assert.equal(pipelineCsvRows(['company','body'],[{company:'=HYPERLINK("bad")',body:'First\n"Quoted"'}]),'"\'=HYPERLINK(""bad"")","First\n""Quoted"""\r\n');assert.equal(pipelineCsvRows(['phone'],[{phone:'+44 123'}]),'"\'+44 123"\r\n')})
