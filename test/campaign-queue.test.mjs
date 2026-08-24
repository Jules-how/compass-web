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
  // Reads the ready pool through the shared 90-day filter, not a re-implementation.
  assert.match(route, /applyRecontactReadyFilters/)
  assert.match(route, /tallyLeadsByCampaign/)
  // Promote gates on the shared minimum and never touches Instantly.
  assert.match(route, /RECONTACT_PROMOTE_MIN/)
  assert.match(route, /thin_cohort/)
  assert.doesNotMatch(route, /instantly\/(ensure|push)/)
  // Mutations require same-origin like every cookie-authenticated route.
  assert.match(route, /requireSameOrigin/)
  // Planning statuses only — active/completed campaigns stay out of the queue.
  assert.match(route, /'draft', 'planned', 'paused'/)
})

test('queue section is mounted in the outbound hub and links to the campaign workspace', () => {
  const hub = read('src/components/outbound/OutboundHub.tsx')
  assert.match(hub, /OutboundQueueSection/)

  const section = read('src/components/outbound/OutboundQueueSection.tsx')
  assert.match(section, /\/api\/campaigns\/queue/)
  assert.match(section, /\/sales\/pipeline\/\$\{c\.id\}/)
  // Reorder + reschedule go through the existing campaign PATCH.
  assert.match(section, /method: 'PATCH'/)
  assert.match(section, /start_date/)
  // Thin cohorts cannot be promoted.
  assert.match(section, /promotable/)
  // Cards carry the launch checklist; week lanes carry the capacity line.
  assert.match(section, /campaignReadiness/)
  assert.match(section, /weekLoad/)
  assert.match(section, /overbooked/)
})
