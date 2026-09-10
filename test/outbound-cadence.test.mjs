import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function asCount(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

function normalizeCadencePrefs(raw) {
  let target = asCount(raw?.target)
  let cap = asCount(raw?.cap)
  if (target != null && cap != null && cap < target) cap = target
  return { target, cap }
}

function cadenceWeekLoad(slots, prefs) {
  const overCapacity = prefs.cap != null && slots > prefs.cap
  const underTarget = prefs.target != null && slots < prefs.target
  const bits = [`${slots} launched this week`]
  if (overCapacity) bits.push('over cap')
  else if (underTarget) bits.push('under target')
  return { slots, overCapacity, underTarget, label: bits.join(' · ') }
}

function cadenceTake(thisWeekSlots, prefs, suggestionCap = 3) {
  const { target, cap } = prefs
  const room = cap == null ? Number.POSITIVE_INFINITY : Math.max(0, cap - thisWeekSlots)
  if (target == null && cap == null) return suggestionCap
  if (target == null) return Math.min(suggestionCap, room)
  const need = Math.max(0, target - thisWeekSlots)
  return Math.min(need, room)
}

function cassetteBayCount(filled, prefs) {
  const filledSafe = Math.max(0, filled)
  const emptyWanted = prefs.target != null ? Math.max(0, prefs.target - filledSafe) : 1
  const emptyCapped =
    prefs.cap != null ? Math.min(emptyWanted, Math.max(0, prefs.cap - filledSafe)) : emptyWanted
  return filledSafe + emptyCapped
}

test('cadence prefs treat empty as none and lift cap up to target', () => {
  assert.deepEqual(normalizeCadencePrefs({}), { target: null, cap: null })
  assert.deepEqual(normalizeCadencePrefs({ target: 4, cap: 2 }), { target: 4, cap: 4 })
  assert.deepEqual(normalizeCadencePrefs({ target: '3', cap: '' }), { target: 3, cap: null })
})

test('cadence week load never prints a default 3-5 band', () => {
  assert.equal(cadenceWeekLoad(2, { target: null, cap: null }).label, '2 launched this week')
  assert.equal(cadenceWeekLoad(2, { target: 4, cap: null }).label, '2 launched this week · under target')
  assert.equal(cadenceWeekLoad(6, { target: 4, cap: 5 }).label, '6 launched this week · over cap')
  assert.equal(cadenceWeekLoad(4, { target: 4, cap: 5 }).overCapacity, false)
  assert.equal(cadenceWeekLoad(4, { target: 4, cap: 5 }).underTarget, false)
})

test('cadence take uses target/cap, and suggestions only when both are none', () => {
  assert.equal(cadenceTake(17, { target: null, cap: null }), 3)
  assert.equal(cadenceTake(2, { target: 5, cap: null }), 3)
  assert.equal(cadenceTake(5, { target: 5, cap: null }), 0)
  assert.equal(cadenceTake(2, { target: null, cap: 3 }), 1)
  assert.equal(cadenceTake(3, { target: null, cap: 3 }), 0)
})

test('cassette bay count follows target, else one add bay, cap limits empties', () => {
  assert.equal(cassetteBayCount(2, { target: 5, cap: null }), 5)
  assert.equal(cassetteBayCount(2, { target: 5, cap: 4 }), 4)
  assert.equal(cassetteBayCount(3, { target: null, cap: null }), 4)
  assert.equal(cassetteBayCount(0, { target: null, cap: null }), 1)
  assert.equal(cassetteBayCount(4, { target: null, cap: 4 }), 4)
})

test('shared cadence helper and control exist, without live 3-5 doctrine', () => {
  const lib = read('src/lib/outbound-cadence.ts')
  assert.match(lib, /CADENCE_STORAGE_KEY = 'compass.outbound.cadence.v1'/)
  assert.match(lib, /rankNextSlotsWithPrefs/)
  assert.doesNotMatch(lib, /QUEUE_WEEK_SLOT_MIN/)
  assert.doesNotMatch(lib, /QUEUE_WEEK_SLOT_MAX/)
  assert.doesNotMatch(lib, /3–5/)
  assert.doesNotMatch(lib, /3-5 this week/)
  assert.match(lib, /launched this week/)

  const control = read('src/components/outbound/CadenceControl.tsx')
  assert.match(control, /Target/)
  assert.match(control, /Cap/)
  assert.match(control, /placeholder="none"/)
  assert.doesNotMatch(control, /QUEUE_WEEK_SLOT/)
})

test('offer wave decision desk badges follow send and reply thresholds', () => {
  const lib = read('src/lib/campaigns.ts')
  assert.match(lib, /export function evaluateOfferWaveDecision/)
  assert.match(lib, /Kill \/ Overhaul Offer/)
  assert.match(lib, /Validated: Expand to 1,000 Sends/)
  assert.match(lib, /Inspect Mailbox Deliverability/)
  assert.match(lib, /export function offerWaveColumn/)
  assert.match(lib, /Recommended next list/)
  assert.match(lib, /Next campaigns/)
  assert.match(lib, /Live campaigns/)
  assert.doesNotMatch(lib, /Sourcing & Data/)
  const board = read('src/components/outbound/OfferWavesBoard.tsx')
  assert.match(board, /KanbanBoard/)
  assert.match(board, /Outlook/)
  assert.match(board, /WaveAddCampaign/)
  assert.match(board, /Leads eligible for recontact/)
  assert.match(board, /90-day recontact criteria/)
  assert.match(read('src/app/api/agent/instantly/duplicate-template/route.ts'), /duplicateFillCaptureTemplate/)
  assert.match(read('src/app/api/agent/outbound/waves/route.ts'), /suggestWaveMoves/)
})

test('live outbound desk switcher offers waves, calendar, and timeline', () => {
  const desk = read('src/lib/outbound-desk.ts')
  assert.match(desk, /OUTBOUND_DESK_STORAGE_KEY = [\"']compass.outbound.desk.v5[\"']/)
  assert.match(desk, /DEFAULT_OUTBOUND_DESK: OutboundDeskId = [\"']overview[\"']/)
  assert.match(desk, /waves/)
  assert.match(desk, /calendar/)
  assert.match(desk, /timeline/)
  assert.match(desk, /LEGACY_DESKS/)

  const landing = read('src/components/outbound/OutboundDesk.tsx')
  assert.match(landing, /OfferWavesBoard/)
  assert.doesNotMatch(landing, /PathwayDesk/)
  assert.doesNotMatch(landing, /CassettePreview/)
  assert.doesNotMatch(landing, /RunwayPreview/)
  assert.doesNotMatch(landing, /FactoryPreview/)
  assert.match(landing, /CampaignPlanner/)
  assert.match(landing, /initialView/)
  assert.match(landing, /CadenceControl/)
  assert.doesNotMatch(landing, /QUEUE_WEEK_SLOT/)
  assert.doesNotMatch(landing, /3–5/)
})
