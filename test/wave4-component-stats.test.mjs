import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function inWindow(ts, since) {
  if (!since) return true
  return Date.parse(ts) >= Date.parse(since)
}

function countLeadOutcomes(events, leadId, since) {
  let replies = 0
  let positive = 0
  let meetings = 0
  for (const event of events) {
    if (event.lead_id !== leadId) continue
    if (!inWindow(event.ts, since)) continue
    if (event.type === 'email.replied') replies += 1
    if (event.type === 'lead.interested') positive += 1
    if (event.type === 'lead.meeting_booked') meetings += 1
  }
  return { replies, positive, meetings }
}

function rollupLeadGrain(leads, events, grain, since) {
  const buckets = new Map()
  for (const lead of leads) {
    const key =
      grain === 'opener_kind'
        ? (lead.opener_kind || 'none').trim() || 'none'
        : (lead.lead_facts?.[0]?.kind || 'none').trim() || 'none'
    const outcomes = countLeadOutcomes(events, lead.id, since)
    if (outcomes.replies + outcomes.positive + outcomes.meetings <= 0) continue
    const cur = buckets.get(key) || { key, positive: 0, meetings: 0 }
    cur.positive += outcomes.positive
    cur.meetings += outcomes.meetings
    buckets.set(key, cur)
  }
  return [...buckets.values()]
}

test('wave4 module wiring exists', () => {
  assert.match(read('src/lib/component-stats.ts'), /recomputeComponentStats/)
  assert.match(read('src/lib/instantly-backfill.ts'), /runInstantlyBackfill/)
  assert.match(read('src/lib/action-ranking.ts'), /rankActions/)
  assert.match(read('supabase/migrations/0068_compass_component_stats.sql'), /compass_component_stats/)
})

test('rollupLeadGrainFromEvents groups opener_kind', () => {
  const leads = [
    { id: 'l1', opener_kind: 'review', lead_facts: [] },
    { id: 'l2', opener_kind: 'review', lead_facts: [] }
  ]
  const events = [
    { lead_id: 'l1', type: 'lead.interested', ts: '2026-01-10T00:00:00.000Z' },
    { lead_id: 'l2', type: 'lead.meeting_booked', ts: '2026-01-11T00:00:00.000Z' }
  ]
  const rows = rollupLeadGrain(leads, events, 'opener_kind', null)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].key, 'review')
  assert.equal(rows[0].positive, 1)
  assert.equal(rows[0].meetings, 1)
})
