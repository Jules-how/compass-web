import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(root, 'src/lib/leads-ledger.ts'), 'utf8')

const DAY_MS = 86400000

function lastOutboundBucket(iso, nowMs) {
  if (!iso) return 'blank'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'blank'
  const days = Math.floor((nowMs - t) / DAY_MS)
  if (days <= 14) return '0-14'
  if (days <= 30) return '15-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

function campaignIdsFromLead(ids, latestId) {
  const seen = new Set()
  if (Array.isArray(ids)) {
    for (const item of ids) {
      const id = String(item ?? '').trim()
      if (id) seen.add(id)
    }
  } else if (typeof ids === 'string' && ids.trim()) {
    try {
      const parsed = JSON.parse(ids)
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const id = String(item ?? '').trim()
          if (id) seen.add(id)
        }
      }
    } catch {
      for (const part of ids.split(',')) {
        const id = part.trim()
        if (id) seen.add(id)
      }
    }
  }
  const latest = (latestId || '').trim()
  if (latest) seen.add(latest)
  return Array.from(seen)
}

function campaignOverlapKind(rowIds, oldIds, laterIds) {
  const hasOld = rowIds.some((id) => oldIds.has(id))
  const hasLater = rowIds.some((id) => laterIds.has(id))
  if (hasOld && hasLater) return 'both'
  if (hasOld) return 'old_only'
  if (hasLater) return 'later_only'
  return 'neither'
}

function canonicalizeVertical(raw) {
  const extra = { broker: 'mortgage-brokers', brokers: 'mortgage-brokers' }
  const trimmed = (raw || '').trim()
  if (!trimmed) return '(blank)'
  const lower = trimmed.toLowerCase()
  if (extra[lower]) return extra[lower]
  return lower
}

function canonicalizeState(raw) {
  const t = (raw || '').trim()
  if (!t) return '(blank)'
  const lower = t.toLowerCase()
  if (lower === 'nsw' || lower === 'new south wales') return 'NSW'
  if (lower === 'vic' || lower === 'victoria') return 'VIC'
  return t.toUpperCase().length <= 3 ? t.toUpperCase() : t
}

function buildLeadLedger(rows, opts) {
  const target = canonicalizeVertical(opts.vertical)
  const oldIds = new Set(opts.campaignIds ?? [])
  const laterIds = new Set(opts.laterCampaignIds ?? [])
  const wantOverlap = oldIds.size > 0 || laterIds.size > 0
  const nowMs = opts.nowMs ?? Date.now()
  const byStatus = {}
  const byState = {}
  const lastOutbound = { blank: 0, '0-14': 0, '15-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  const overlap = { old_only: 0, later_only: 0, both: 0, neither: 0 }
  let total = 0
  for (const row of rows) {
    if (canonicalizeVertical(row.vertical) !== target) continue
    total += 1
    const status = (row.outbound_status || '').trim() || '(blank)'
    byStatus[status] = (byStatus[status] || 0) + 1
    const state = canonicalizeState(row.state)
    byState[state] = (byState[state] || 0) + 1
    lastOutbound[lastOutboundBucket(row.last_outbound_at, nowMs)] += 1
    if (wantOverlap) {
      overlap[
        campaignOverlapKind(
          campaignIdsFromLead(row.instantly_campaign_ids, row.instantly_campaign_id),
          oldIds,
          laterIds
        )
      ] += 1
    }
  }
  return { vertical: target, total, byStatus, byState, lastOutbound, overlap: wantOverlap ? overlap : null }
}

test('leads-ledger.ts exports the bucket and overlap helpers', () => {
  assert.match(src, /export function lastOutboundBucket/)
  assert.match(src, /export function campaignOverlapKind/)
  assert.match(src, /export function buildLeadLedger/)
  assert.match(src, /'blank'/)
  assert.match(src, /'0-14'/)
  assert.match(src, /'15-30'/)
  assert.match(src, /'31-60'/)
  assert.match(src, /'61-90'/)
  assert.match(src, /'90\+'/)
  assert.match(src, /old_only/)
  assert.match(src, /later_only/)
  const route = readFileSync(resolve(root, 'src/app/api/agent/leads/ledger/route.ts'), 'utf8')
  assert.match(route, /vertical_required/)
  assert.match(route, /buildLeadLedger/)
})

test('last_outbound buckets use stored timestamps', () => {
  const now = Date.parse('2026-08-27T00:00:00.000Z')
  assert.equal(lastOutboundBucket(null, now), 'blank')
  assert.equal(lastOutboundBucket('2026-08-20T00:00:00.000Z', now), '0-14')
  assert.equal(lastOutboundBucket('2026-08-05T00:00:00.000Z', now), '15-30')
  assert.equal(lastOutboundBucket('2026-07-10T00:00:00.000Z', now), '31-60')
  assert.equal(lastOutboundBucket('2026-06-10T00:00:00.000Z', now), '61-90')
  assert.equal(lastOutboundBucket('2026-04-01T00:00:00.000Z', now), '90+')
  assert.equal(lastOutboundBucket('2026-07-15T00:00:00.000Z', now), '31-60')
})

test('campaign overlap splits old only, later only, both', () => {
  const oldIds = new Set(['v1', 'v2'])
  const laterIds = new Set(['help-me', 'jul'])
  assert.equal(campaignOverlapKind(['v1'], oldIds, laterIds), 'old_only')
  assert.equal(campaignOverlapKind(['jul'], oldIds, laterIds), 'later_only')
  assert.equal(campaignOverlapKind(['v1', 'help-me'], oldIds, laterIds), 'both')
  assert.equal(campaignOverlapKind(['other'], oldIds, laterIds), 'neither')
  assert.deepEqual(campaignIdsFromLead('["v1","v2"]', 'v3'), ['v1', 'v2', 'v3'])
  assert.deepEqual(campaignIdsFromLead(['help-me'], null), ['help-me'])
})

test('ledger aggregates status, state, recency, and overlap', () => {
  const now = Date.parse('2026-08-27T00:00:00.000Z')
  const ledger = buildLeadLedger(
    [
      {
        vertical: 'broker',
        outbound_status: 'uncontacted',
        state: 'victoria',
        last_outbound_at: null,
        instantly_campaign_ids: []
      },
      {
        vertical: 'mortgage-brokers',
        outbound_status: 'in_instantly',
        state: 'NSW',
        last_outbound_at: '2026-07-15T00:00:00.000Z',
        instantly_campaign_id: 'v1',
        instantly_campaign_ids: ['v1']
      },
      {
        vertical: 'mortgage-brokers',
        outbound_status: 'in_instantly',
        state: '',
        last_outbound_at: '2026-08-20T00:00:00.000Z',
        instantly_campaign_ids: ['v1', 'help-me']
      },
      {
        vertical: 'plumber',
        outbound_status: 'uncontacted',
        state: 'NSW',
        last_outbound_at: null
      }
    ],
    { vertical: 'broker', campaignIds: ['v1'], laterCampaignIds: ['help-me'], nowMs: now }
  )
  assert.equal(ledger.vertical, 'mortgage-brokers')
  assert.equal(ledger.total, 3)
  assert.equal(ledger.byStatus.uncontacted, 1)
  assert.equal(ledger.byStatus.in_instantly, 2)
  assert.equal(ledger.byState.VIC, 1)
  assert.equal(ledger.byState.NSW, 1)
  assert.equal(ledger.byState['(blank)'], 1)
  assert.equal(ledger.lastOutbound.blank, 1)
  assert.equal(ledger.lastOutbound['0-14'], 1)
  assert.equal(ledger.lastOutbound['31-60'], 1)
  assert.equal(ledger.overlap.old_only, 1)
  assert.equal(ledger.overlap.both, 1)
  assert.equal(ledger.overlap.later_only, 0)
  assert.equal(ledger.overlap.neither, 1)
})
