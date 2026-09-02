import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of src/lib/campaign-queue.ts week bucketing for node:test (no TS transpile). */
function mondayOfWeek(dateOnly) {
  const d = new Date(`${dateOnly}T00:00:00Z`)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}

function queueWeekBucket(startDate, todayOnly) {
  const start = (startDate || '').trim()
  if (!start) return 'unscheduled'
  const startMonday = mondayOfWeek(start)
  const thisMonday = mondayOfWeek(todayOnly)
  const next = new Date(`${thisMonday}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 7)
  const nextMonday = next.toISOString().slice(0, 10)
  if (startMonday <= thisMonday) return 'this_week'
  if (startMonday === nextMonday) return 'next_week'
  return 'later'
}

test('queue week bucketing keeps overdue campaigns visible and splits weeks', () => {
  // Monday 2026-08-24 as "today".
  assert.equal(queueWeekBucket('2026-08-24', '2026-08-24'), 'this_week')
  assert.equal(queueWeekBucket('2026-08-30', '2026-08-24'), 'this_week') // Sunday same week
  assert.equal(queueWeekBucket('2026-08-18', '2026-08-24'), 'this_week') // overdue stays visible
  assert.equal(queueWeekBucket('2026-08-31', '2026-08-24'), 'next_week')
  assert.equal(queueWeekBucket('2026-09-07', '2026-08-24'), 'later')
  assert.equal(queueWeekBucket(null, '2026-08-24'), 'unscheduled')
  // Mid-week "today" resolves to the same Monday.
  assert.equal(queueWeekBucket('2026-08-31', '2026-08-27'), 'next_week')
})

test('campaign queue lib enforces the 30-lead promote minimum and 50-lead waves', () => {
  const lib = read('src/lib/campaign-queue.ts')
  assert.match(lib, /RECONTACT_PROMOTE_MIN = 30/)
  assert.match(lib, /QUEUE_WAVE_SIZE = 50/)
  assert.match(lib, /count >= RECONTACT_PROMOTE_MIN/)
})

/** Mirror of src/lib/campaign-queue.ts campaignReadiness for node:test. */
function campaignReadiness(c) {
  const blockers = []
  if (c.cohort === 0) blockers.push('no leads')
  else if (c.cohort < 30) blockers.push('thin cohort (<30)')
  if (c.copy_status !== 'ready' && c.copy_status !== 'live') {
    blockers.push(c.copy_status === 'draft' ? 'copy in draft' : 'no copy')
  }
  if (!c.bound) blockers.push('not bound')
  return { ready: blockers.length === 0, blockers }
}

test('campaign readiness names every launch blocker and clears when pushable', () => {
  assert.deepEqual(campaignReadiness({ cohort: 50, copy_status: 'ready', bound: true }), {
    ready: true,
    blockers: []
  })
  assert.deepEqual(campaignReadiness({ cohort: 50, copy_status: 'live', bound: true }).ready, true)
  assert.deepEqual(campaignReadiness({ cohort: 0, copy_status: 'none', bound: false }).blockers, [
    'no leads',
    'no copy',
    'not bound'
  ])
  assert.deepEqual(campaignReadiness({ cohort: 12, copy_status: 'draft', bound: true }).blockers, [
    'thin cohort (<30)',
    'copy in draft'
  ])
})

test('week capacity band is 3-5 launches and 250 leads, flagged both directions', () => {
  const lib = read('src/lib/campaign-queue.ts')
  assert.match(lib, /QUEUE_WEEK_SLOT_MIN = 3/)
  assert.match(lib, /QUEUE_WEEK_SLOT_MAX = 5/)
  assert.match(lib, /QUEUE_WEEK_SLOT_MAX \* QUEUE_WAVE_SIZE/)
  // weekLoad flags both under-cadence and over-capacity.
  assert.match(lib, /underCadence: slots < QUEUE_WEEK_SLOT_MIN/)
  assert.match(lib, /slots > QUEUE_WEEK_SLOT_MAX \|\| leads > QUEUE_WEEK_LEAD_CAPACITY/)
})

test('queue route is planning-only and reuses recontact + wave helpers', () => {
  const route = read('src/app/api/campaigns/queue/route.ts')
  assert.match(route, /applyRecontactReadyFilters/)
  assert.match(route, /listPipelineCampaigns/)
  assert.match(route, /insertPipelineCampaign/)
  assert.match(route, /RECONTACT_PROMOTE_MIN/)
  assert.match(route, /wave_lane: 'next'/)
  assert.doesNotMatch(route, /instantly\/(ensure|push)/)
  assert.match(route, /requireSameOrigin/)
  assert.match(route, /'draft', 'planned', 'paused'/)
  assert.match(route, /action !== 'promote' && action !== 'schedule'/)
  assert.match(route, /go_live_at/)
})

test('inventory rail owns 90-day cards and ranked slots on the outbound calendar', () => {
  const planner = read('src/components/campaigns/CampaignPlanner.tsx')
  assert.match(planner, /OutboundInventoryRail/)
  assert.match(planner, /placeInventoryCard/)
  assert.match(planner, /onDropInventory/)
  assert.match(planner, /Outbound/)
  assert.match(planner, /\/sales\/outbound\/craft/)

  const rail = read('src/components/campaigns/OutboundInventoryRail.tsx')
  assert.match(rail, /\/api\/campaigns\/queue/)
  assert.match(rail, /rankNextSlots/)
  assert.match(rail, /inventoryPoolCards/)
  assert.match(rail, /INVENTORY_DRAG_MIME/)
  assert.match(rail, /90 day/)

  const hub = read('src/components/outbound/OutboundHub.tsx')
  assert.doesNotMatch(hub, /OutboundQueueSection/)
})

/** Mirror of rankNextSlots for node:test. */
function rankNextSlots(input) {
  const booked = new Set(input.thisWeekVerticals.map((v) => v.trim().toLowerCase()).filter(Boolean))
  const room = Math.max(0, 5 - input.thisWeekSlots)
  const need = Math.max(0, 3 - input.thisWeekSlots)
  const take = Math.min(room, Math.max(need, Math.min(3, room)))
  if (take <= 0) return []
  const recs = []
  const used = new Set(booked)
  for (const group of input.recontactPool) {
    if (recs.length >= take) break
    if (!group.promotable) continue
    const vertical = group.vertical.trim().toLowerCase()
    if (!vertical || used.has(vertical)) continue
    recs.push({ kind: 'recontact', vertical, city: group.city, count: group.count })
    used.add(vertical)
  }
  for (const row of input.runway) {
    if (recs.length >= take) break
    const vertical = row.vertical.trim().toLowerCase()
    if (!vertical || used.has(vertical)) continue
    if (row.wavesLeft < 1) continue
    recs.push({ kind: 'fresh', vertical, city: null, count: row.sendable })
    used.add(vertical)
  }
  return recs
}

test('next slots prefer 90-day batches, skip booked trades, and stop at the weekly cap', () => {
  const recs = rankNextSlots({
    thisWeekSlots: 2,
    thisWeekVerticals: ['locksmiths'],
    recontactPool: [
      { vertical: 'locksmiths', city: 'Newcastle', count: 80, promotable: true },
      { vertical: 'plumbers', city: 'Sydney', count: 40, promotable: true },
      { vertical: 'electricians', city: null, count: 12, promotable: false }
    ],
    runway: [
      { vertical: 'hvac', sendable: 120, recontactReady: 0, wavesLeft: 2 },
      { vertical: 'plumbers', sendable: 200, recontactReady: 0, wavesLeft: 4 }
    ]
  })
  assert.deepEqual(
    recs.map((row) => row.vertical),
    ['plumbers', 'hvac']
  )
  assert.equal(recs[0].kind, 'recontact')
  assert.equal(recs[1].kind, 'fresh')

  assert.deepEqual(
    rankNextSlots({
      thisWeekSlots: 5,
      thisWeekVerticals: [],
      recontactPool: [{ vertical: 'plumbers', city: null, count: 40, promotable: true }],
      runway: []
    }),
    []
  )
})
