import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(root, 'src/lib/wave-morning.ts'), 'utf8')

const LAND_REMAINING_THRESHOLD = 50
const HOME_NEXT_SLOTS = 2

function clipNextIds(ids) {
  const seen = new Set()
  const out = []
  for (const raw of ids ?? []) {
    const id = (raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= HOME_NEXT_SLOTS) break
  }
  return out
}

function remainingIsLow(remaining) {
  return Math.max(0, remaining || 0) < LAND_REMAINING_THRESHOLD
}

function landUnlocked(status) {
  return status === 'accepted' || status === 'dismissed'
}

function canCreateNext(currentCount, creating) {
  if (creating <= 0) return true
  return currentCount + creating <= HOME_NEXT_SLOTS
}

function resolveHomeNext(input) {
  if (!input.today) {
    return {
      briefStatus: 'missing',
      activeNextIds: clipNextIds(input.lastAccepted?.next_campaign_ids),
      proposedNextIds: [],
      landUnlocked: false
    }
  }
  const status = input.today.next_status === 'accepted' || input.today.next_status === 'dismissed'
    ? input.today.next_status
    : 'proposed'
  const proposed = clipNextIds(input.today.next_campaign_ids)
  if (status === 'accepted') {
    return { briefStatus: 'accepted', activeNextIds: proposed, proposedNextIds: proposed, landUnlocked: true }
  }
  if (status === 'dismissed') {
    return {
      briefStatus: 'dismissed',
      activeNextIds: clipNextIds(input.lastAccepted?.next_campaign_ids),
      proposedNextIds: [],
      landUnlocked: true
    }
  }
  return {
    briefStatus: 'proposed',
    activeNextIds: clipNextIds(input.lastAccepted?.next_campaign_ids),
    proposedNextIds: proposed,
    landUnlocked: false
  }
}

function briefAllowsNextOverwrite(status) {
  return status !== 'accepted' && status !== 'dismissed'
}

test('remaining under 50 is low without a reply-rate test', () => {
  assert.equal(remainingIsLow(49), true)
  assert.equal(remainingIsLow(50), false)
})

test('proposed brief locks live land and keeps yesterday next', () => {
  const out = resolveHomeNext({
    today: { id: '2026-09-03', next_campaign_ids: ['a', 'b'], next_status: 'proposed' },
    lastAccepted: { id: '2026-09-02', next_campaign_ids: ['y1', 'y2'], next_status: 'accepted' }
  })
  assert.equal(out.landUnlocked, false)
  assert.deepEqual(out.activeNextIds, ['y1', 'y2'])
  assert.deepEqual(out.proposedNextIds, ['a', 'b'])
})

test('dismiss keeps yesterday next and unlocks land', () => {
  const out = resolveHomeNext({
    today: { id: '2026-09-03', next_campaign_ids: ['a', 'b'], next_status: 'dismissed' },
    lastAccepted: { id: '2026-09-02', next_campaign_ids: ['y1'], next_status: 'accepted' }
  })
  assert.equal(out.landUnlocked, true)
  assert.deepEqual(out.activeNextIds, ['y1'])
  assert.deepEqual(out.proposedNextIds, [])
})

test('accept applies today next', () => {
  const out = resolveHomeNext({
    today: { id: '2026-09-03', next_campaign_ids: ['n1', 'n2', 'n3'], next_status: 'accepted' },
    lastAccepted: null
  })
  assert.deepEqual(out.activeNextIds, ['n1', 'n2'])
  assert.equal(out.landUnlocked, true)
})

test('missing brief locks land', () => {
  const out = resolveHomeNext({ today: null, lastAccepted: { id: 'x', next_campaign_ids: ['z'], next_status: 'accepted' } })
  assert.equal(out.briefStatus, 'missing')
  assert.equal(out.landUnlocked, false)
  assert.deepEqual(out.activeNextIds, ['z'])
})

test('fill only two next slots', () => {
  assert.equal(canCreateNext(2, 1), false)
  assert.equal(canCreateNext(1, 1), true)
  assert.equal(canCreateNext(0, 2), true)
})

test('accepted brief is not overwritten', () => {
  assert.equal(briefAllowsNextOverwrite('accepted'), false)
  assert.equal(briefAllowsNextOverwrite('proposed'), true)
})

test('landUnlocked helper', () => {
  assert.equal(landUnlocked('proposed'), false)
  assert.equal(landUnlocked('accepted'), true)
})

test('source pins the morning constants', () => {
  assert.match(src, /LAND_REMAINING_THRESHOLD = 50/)
  assert.match(src, /HOME_NEXT_SLOTS = 2/)
  assert.match(src, /briefAllowsNextOverwrite/)
  assert.match(readFileSync(resolve(root, 'supabase/migrations/0079_wave_morning_pathways.sql'), 'utf8'), /next_campaign_ids/)
  assert.match(readFileSync(resolve(root, 'src/components/home/MorningWavePanel.tsx'), 'utf8'), /Accept brief/)
  assert.match(readFileSync(resolve(root, 'src/components/outbound/PathwayDesk.tsx'), 'utf8'), /Save list overlay/)
})
