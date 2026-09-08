import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
// Exercise the production functions, not copies of their implementation.
const source = fs.readFileSync(new URL('../src/lib/leads-query.ts', import.meta.url), 'utf8').replace(/^import .*$/gm, '')
const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText
const exports = {}
vm.runInNewContext(output, {exports, Buffer, URLSearchParams, Set})
const {encodeLeadCursor, decodeLeadCursor, applyLeadKeyset} = exports
const plain = (x) => JSON.parse(JSON.stringify(x))
test('cursor distinguishes a missing email from an empty email', () => {
  for (const email of [null, '', 'a@business.example']) {
    assert.deepEqual(plain(decodeLeadCursor(encodeLeadCursor(email, 'row-2'))), {email, id:'row-2'})
  }
  assert.notEqual(encodeLeadCursor(null, '2'), encodeLeadCursor('', '2'))
})
test('existing non-null cursor links still work', () => {
  const old = Buffer.from('a@business.example\trow-1').toString('base64url')
  assert.deepEqual(plain(decodeLeadCursor(old)), {email:'a@business.example',id:'row-1'})
  assert.equal(decodeLeadCursor(Buffer.from('[7,"id"]').toString('base64url')), null)
})
test('non-null page includes the remaining null-email tail', () => {
  let filter
  const query = {or: (v) => {filter = v; return query}}
  assert.equal(applyLeadKeyset(query, {email:'z@business.example',id:'2'}), query)
  assert.match(filter, /email\.is\.null/)
  assert.match(filter, /email\.gt\./)
})
test('null-email page stays in the null tail and advances by id', () => {
  let filter
  const query = {or: (v) => {filter = v; return query}}
  applyLeadKeyset(query, {email:null,id:'row-600'})
  assert.match(filter, /^and\(email\.is\.null,id\.gt\./)
  assert.doesNotMatch(filter, /email\.eq|email\.gt/)
})
