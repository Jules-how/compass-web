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

  const query = read('src/lib/leads-query.ts')
  assert.match(query, /parseLeadBucket/)
  assert.match(query, /filters\.bucket === 'prospects'/)
  assert.match(query, /outbound_status\.not\.in/)

  const table = read('src/components/LeadTable.tsx')
  assert.match(table, /Prospects/)
  assert.match(table, /switchBucket\('prospects'\)/)
  assert.match(table, /LeadSidecar/)
})
