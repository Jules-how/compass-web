import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function ratePct(part, whole) {
  if (whole <= 0) return 0
  return Math.round((1000 * part) / whole) / 10
}

function computeOutcomeMetrics(volume, counts) {
  const sent = Math.max(0, volume.sent)
  const bounced = Math.max(0, volume.bounced)
  const delivered = Math.max(0, sent - bounced)
  const positive = Math.max(0, counts.positive)
  const meetings = Math.max(0, counts.meetings)
  return {
    delivered,
    positive,
    meetings,
    positiveRate: ratePct(positive, delivered),
    meetingsPer100: delivered > 0 ? Math.round((1000 * meetings) / delivered) / 10 : 0
  }
}

test('outcome metrics zero delivered', () => {
  const m = computeOutcomeMetrics({ sent: 0, bounced: 0 }, { positive: 2, meetings: 1 })
  assert.equal(m.delivered, 0)
  assert.equal(m.positiveRate, 0)
  assert.equal(m.meetingsPer100, 0)
})

test('outcome metrics bounce-only volume', () => {
  const m = computeOutcomeMetrics({ sent: 10, bounced: 10 }, { positive: 0, meetings: 0 })
  assert.equal(m.delivered, 0)
  assert.equal(m.positiveRate, 0)
  assert.equal(m.meetingsPer100, 0)
})

test('outcome metrics mixed statuses use ledger not Instantly opportunities', () => {
  const m = computeOutcomeMetrics({ sent: 200, bounced: 8 }, { positive: 6, meetings: 2 })
  assert.equal(m.delivered, 192)
  assert.equal(m.positive, 6)
  assert.equal(m.meetings, 2)
  assert.equal(m.positiveRate, ratePct(6, 192))
  assert.equal(m.meetingsPer100, Math.round((1000 * 2) / 192) / 10)
})

test('outcome metrics wiring stops using Instantly opportunities as meetings', () => {
  const instantly = read('src/lib/instantly.ts')
  assert.match(instantly, /positiveReplies: 0/)
  assert.match(instantly, /meetings: 0/)
  assert.doesNotMatch(instantly, /positiveReplies: opportunities/)

  const factor = read('src/lib/outbound-factor-performance.ts')
  assert.match(factor, /computeOutcomeMetrics/)
  assert.match(factor, /meetingsPer100/)
  assert.match(factor, /wave_positive_count/)

  const compare = read('src/components/outbound/OutboundExperimentCompare.tsx')
  assert.match(compare, /Mtgs\/100/)
  assert.match(compare, /computeOutcomeMetrics/)

  const panel = read('src/components/outbound/CampaignExperimentPanel.tsx')
  assert.match(panel, /Live N/)
  assert.match(panel, /meetings \/ 100/)
})
