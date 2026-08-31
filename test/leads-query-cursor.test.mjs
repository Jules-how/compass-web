import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function encodeLeadCursor(email, id) {
  return Buffer.from(`${email}\t${id}`, 'utf8').toString('base64url')
}

function decodeLeadCursor(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  const decoded = Buffer.from(value, 'base64url').toString('utf8')
  const tab = decoded.indexOf('\t')
  if (tab < 0) return null
  const email = decoded.slice(0, tab)
  const id = decoded.slice(tab + 1).trim()
  if (!id) return null
  return { email, id }
}

function afterCursor(rows, cursor) {
  return rows.filter(
    (row) => row.email > cursor.email || (row.email === cursor.email && row.id > cursor.id)
  )
}

test('cursor round-trips email + id including @', () => {
  const token = encodeLeadCursor('ada@shop.com.au', 'contact-1')
  assert.deepEqual(decodeLeadCursor(token), { email: 'ada@shop.com.au', id: 'contact-1' })
})

test('keyset walks (email, id) without repeating', () => {
  const rows = [
    { email: 'a@x.com', id: '1' },
    { email: 'a@x.com', id: '2' },
    { email: 'b@x.com', id: '3' },
    { email: 'c@x.com', id: '4' }
  ]
  const page1 = rows.slice(0, 2)
  const cursor = { email: page1[1].email, id: page1[1].id }
  const page2 = afterCursor(rows, cursor)
  assert.deepEqual(
    page2.map((r) => r.id),
    ['3', '4']
  )
  assert.equal(
    page2.some((r) => r.id === '1' || r.id === '2'),
    false
  )
})

test('legacy agent GET is only status/limit/q', () => {
  function isLegacy(search) {
    const params = new URLSearchParams(search)
    const allowed = new Set(['status', 'limit', 'q'])
    for (const key of params.keys()) {
      if (!allowed.has(key)) return false
    }
    return true
  }
  assert.equal(isLegacy('status=replied&limit=40&q=acme'), true)
  assert.equal(isLegacy('view=rows&limit=2000'), false)
  assert.equal(isLegacy('pipeline_campaign_id=none'), false)
})

test('UI export uses a 5000 row path, not the 100 row table cap', () => {
  const search = read('src/lib/lead-search.ts')
  const list = read('src/app/api/leads/list/route.ts')
  const cols = read('src/lib/list-columns.ts')
  assert.match(cols, /LEAD_EXPORT_MAX = 5000/)
  assert.match(cols, /LEAD_UI_PAGE_MAX = 100/)
  assert.match(search, /mode\?: 'ui' \| 'agent' \| 'export'/)
  assert.match(search, /mode === 'export' \? LEAD_EXPORT_MAX/)
  assert.match(list, /mode: exportLimit \? 'export' : 'ui'/)
  assert.match(list, /LEAD_EXPORT_MAX/)
})

test('shared filter grammar includes state and unattached none', () => {
  const src = read('src/lib/leads-query.ts')
  assert.match(src, /state:/)
  assert.match(src, /unattached|pipelineId\?\.toLowerCase\(\) === 'none'/)
  assert.match(src, /encodeLeadCursor/)
  assert.match(src, /applyLeadKeyset/)
  assert.match(src, /isLegacyAgentLeadsRequest/)
  assert.match(src, /unverified_only/)
  assert.match(src, /is_archived/)
  assert.match(src, /filters\.bucket === 'archived'/)
})
