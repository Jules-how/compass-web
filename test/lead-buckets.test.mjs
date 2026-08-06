import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

test('lead buckets split prospects from leads by outbound status', () => {
  const buckets = read('src/lib/lead-buckets.ts')
  assert.match(buckets, /PROSPECT_OUTBOUND_STATUSES/)
  assert.match(buckets, /interested/)
  assert.match(buckets, /booked/)
  assert.match(buckets, /converted/)

  const api = read('src/app/api/leads/list/route.ts')
  assert.match(api, /parseLeadBucket/)
  assert.match(api, /filters\.bucket === 'prospects'/)
  assert.match(api, /outbound_status\.not\.in/)

  const table = read('src/components/LeadTable.tsx')
  assert.match(table, /Prospects/)
  assert.match(table, /switchBucket\('prospects'\)/)
  assert.match(table, /LeadSidecar/)
  assert.doesNotMatch(table, /Add calculation/)
  assert.match(table, /Add \/ remove columns/)
})
