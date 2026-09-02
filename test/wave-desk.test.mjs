import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function suggestWaveMoves(input) {
  const suggestions = []
  for (const row of input.instantly) {
    const sends = Math.max(0, row.sendCount || 0)
    const replies = Math.max(0, row.replyCount || 0)
    const rate = sends > 0 ? replies / sends : 0
    const remaining = Math.max(0, row.remaining || 0)
    if (sends >= 1000 && replies === 0) {
      suggestions.push({ kind: 'kill' })
      continue
    }
    if (sends >= 100 && rate < 0.01) {
      suggestions.push({ kind: 'pause_inspect' })
      continue
    }
    if (row.status === 'live' && rate >= 0.05 && remaining < 50) {
      suggestions.push({ kind: 'load_more' })
    }
  }
  if (suggestions.length === 0) suggestions.push({ kind: 'new_list' })
  return suggestions
}

function mergeWaveBriefPayload(existing, incoming) {
  const recommendation = incoming.recommendation?.trim() || existing?.recommendation || null
  const scan = incoming.scan ?? existing?.scan ?? {}
  return {
    recommendation,
    scan,
    ...(existing?.created_at ? { created_at: existing.created_at } : {})
  }
}

test('5 percent replies with thin remainder queues a top-up', () => {
  const out = suggestWaveMoves({
    instantly: [
      { status: 'live', sendCount: 200, replyCount: 10, remaining: 20 }
    ]
  })
  assert.equal(out[0].kind, 'load_more')
})

test('sub 1 percent after 100 sends queues a deliverability pause', () => {
  const out = suggestWaveMoves({
    instantly: [{ status: 'live', sendCount: 120, replyCount: 0, remaining: 80 }]
  })
  assert.equal(out[0].kind, 'pause_inspect')
})

test('waves UI and agent route exist', () => {
  const board = read('src/components/outbound/OfferWavesBoard.tsx')
  assert.match(board, /OFFER_WAVE_COLUMN_LABELS/)
  assert.match(board, /WaveAddCampaign/)
  assert.match(board, /recontactReady/)
  assert.match(read('src/components/outbound/WaveCampaignCard.tsx'), /wave_rationale/)
  assert.match(read('src/app/api/agent/outbound/waves/route.ts'), /normalizeWaveLane\(rec.wave_lane\) \|\| 'recommended'/)
  assert.match(read('src/app/api/agent/outbound/waves/route.ts'), /instantly_campaign_id: instantlyId/)
  assert.match(read('src/app/api/agent/outbound/waves/route.ts'), /mergeWaveBriefPayload/)
  assert.match(read('src/app/api/campaigns/route.ts'), /listPipelineCampaigns/)
  assert.match(read('src/lib/outbound-desk.ts'), /DEFAULT_OUTBOUND_DESK: OutboundDeskId = 'waves'/)
})

test('morning brief merge keeps an existing recommendation when scan-only', () => {
  const existing = {
    recommendation: 'Keep topping Sydney roofers',
    scan: { emailsSentToday: 12 },
    created_at: '2026-09-01T22:00:00.000Z'
  }
  const merged = mergeWaveBriefPayload(existing, { scan: { emailsSentToday: 40 } })
  assert.equal(merged.recommendation, 'Keep topping Sydney roofers')
  assert.equal(merged.scan.emailsSentToday, 40)
  assert.equal(merged.created_at, existing.created_at)
})

test('morning brief merge replaces recommendation when a new one is sent', () => {
  const merged = mergeWaveBriefPayload(
    { recommendation: 'Old call', scan: { a: 1 }, created_at: '2026-09-01T22:00:00.000Z' },
    { recommendation: '  Pause and inspect inboxes.  ', scan: { a: 2 } }
  )
  assert.equal(merged.recommendation, 'Pause and inspect inboxes.')
  assert.equal(merged.scan.a, 2)
})
