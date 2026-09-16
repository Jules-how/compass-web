import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypescript } from './helpers/load-typescript.mjs'
const navigation = loadTypescript('src/lib/outbound-desk.ts')
const { createCallingDetailCache } = loadTypescript('src/lib/calling-detail-cache.ts')

test('URL changes select secondary desks and return normal Outbound to leads', () => {
  const sequence = ['', '?desk=evidence', '?desk=notebook', '?desk=overview', '', '?desk=timeline', '?campaign=fixture']
  assert.deepEqual(sequence.map(navigation.outboundDeskFromSearch), ['workflow', 'evidence', 'notebook', 'overview', 'workflow', 'workflow', 'overview'])
})
test('calling cache enforces contact identity, expiry and bounded least-recently-used storage', () => {
  const cache = createCallingDetailCache(2, 30)
  const a = { lead: { id: 'a' }, note: 'recorded a' }
  cache.set('a', a, 0)
  cache.set('b', { lead: { id: 'b' } }, 1)
  assert.equal(cache.get('a', 2), a)
  cache.set('c', { lead: { id: 'c' } }, 3)
  assert.equal(cache.get('b', 4), null)
  assert.throws(() => cache.set('a', { lead: { id: 'different' } }, 4), /identity/)
  assert.equal(cache.get('a', 5), a)
  assert.equal(cache.get('a', 30), null)
  cache.clear()
  assert.equal(cache.get('c', 4), null)
})

test('capability cutover keeps the real overview until enabled without changing explicit links', () => {
  assert.equal(navigation.resolveOutboundDesk('',false),'overview')
  assert.equal(navigation.resolveOutboundDesk('',true),'workflow')
  for(const desk of ['overview','evidence','notebook','waves','calendar','workflow'])assert.equal(navigation.resolveOutboundDesk('?desk='+desk,false),desk)
  assert.equal(navigation.resolveOutboundDesk('?campaign=fixture',true),'overview')
  const backForward=['','?desk=waves','','?desk=overview','?desk=waves']
  assert.deepEqual(backForward.map(query=>navigation.resolveOutboundDesk(query,true)),['workflow','waves','workflow','overview','waves'])
})
