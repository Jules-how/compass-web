import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

const KINDS = [
  'offers',
  'expressions',
  'structures',
  'ctas',
  'subjects',
  'openers',
  'templates'
]

const COMPACT_OMIT = {
  offers: ['pack_summary'],
  expressions: ['body', 'notes'],
  structures: ['slots', 'description'],
  ctas: ['body'],
  subjects: ['notes'],
  openers: ['body', 'notes'],
  templates: ['sequence']
}

function clampListLimit(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 40
  return Math.min(Math.floor(n), 100)
}

function compactOutboundRow(kind, row, full = false) {
  if (full) return { ...row }
  const omit = new Set(COMPACT_OMIT[kind])
  const out = {}
  for (const [key, value] of Object.entries(row)) {
    if (omit.has(key)) continue
    out[key] = value
  }
  return out
}

test('agent-outbound helpers: limit clamp', () => {
  assert.equal(clampListLimit(null), 40)
  assert.equal(clampListLimit('0'), 40)
  assert.equal(clampListLimit('12'), 12)
  assert.equal(clampListLimit('999'), 100)
})

test('agent-outbound helpers: compact omits heavy fields unless full', () => {
  const row = {
    id: 'offer-1',
    offer_key: 'ai-enablement',
    name: 'AI Enablement',
    pack_summary: 'long pack',
    updated_at: '2026-08-07T00:00:00Z'
  }
  const compact = compactOutboundRow('offers', row, false)
  assert.equal(compact.pack_summary, undefined)
  assert.equal(compact.offer_key, 'ai-enablement')
  const full = compactOutboundRow('offers', row, true)
  assert.equal(full.pack_summary, 'long pack')

  const expr = compactOutboundRow(
    'expressions',
    { id: 'e1', label: 'x', body: 'secret body', notes: 'n', status: 'draft' },
    false
  )
  assert.equal(expr.body, undefined)
  assert.equal(expr.notes, undefined)
  assert.equal(expr.label, 'x')
})

test('agent outbound routes and helper module exist', () => {
  assert.equal(existsSync(resolve(root, 'src/lib/agent-outbound.ts')), true)
  assert.equal(existsSync(resolve(root, 'src/app/api/agent/outbound/summary/route.ts')), true)
  assert.equal(existsSync(resolve(root, 'src/app/api/agent/outbound/[kind]/route.ts')), true)
  assert.equal(existsSync(resolve(root, 'src/app/api/agent/outbound/[kind]/[id]/route.ts')), true)
  assert.equal(
    existsSync(resolve(root, 'src/app/api/agent/outbound/campaigns/[campaignId]/copy/route.ts')),
    true
  )
})

test('agent outbound routes use requireAgentAuth and reject cookie-only path', () => {
  const files = [
    'src/app/api/agent/outbound/summary/route.ts',
    'src/app/api/agent/outbound/[kind]/route.ts',
    'src/app/api/agent/outbound/[kind]/[id]/route.ts',
    'src/app/api/agent/outbound/campaigns/[campaignId]/copy/route.ts'
  ]
  for (const rel of files) {
    const src = read(rel)
    assert.match(src, /requireAgentAuth/)
    assert.doesNotMatch(src, /requireSameOrigin/)
    assert.doesNotMatch(src, /requirePortalAccess/)
  }
})

test('agent-outbound module maps kinds and omits heavy list fields', () => {
  const src = read('src/lib/agent-outbound.ts')
  for (const kind of KINDS) {
    assert.match(src, new RegExp(`'${kind}'`))
    assert.match(src, new RegExp(`compass_outbound_${kind}`))
  }
  assert.match(src, /pack_summary/)
  assert.match(src, /sequence/)
  assert.match(src, /LIST_LIMIT_MAX = 100/)
  assert.match(src, /wave_cap/)
  assert.match(src, /copy_confirmed_at/)
  assert.match(src, /copyPatchClearsConfirm/)
})

test('AGENT_BRIDGE documents outbound agent endpoints', () => {
  const bridge = read('docs/AGENT_BRIDGE.md')
  assert.match(bridge, /COMPASS_AGENT_SECRET/)
  assert.match(bridge, /\/api\/agent\/brief/)
  assert.match(bridge, /\/api\/agent\/outbound\/summary/)
  assert.match(bridge, /\/api\/agent\/outbound\/:kind/)
  assert.match(bridge, /campaigns\/:campaignId\/copy/)
})
