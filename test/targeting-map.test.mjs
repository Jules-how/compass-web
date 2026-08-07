import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of targeting-map helpers for behavioral coverage without TS imports. */
function normalizePlace(value) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function classifyOutboundOutcome(status) {
  const s = (status ?? '').trim().toLowerCase()
  if (s === 'converted') return 'converted'
  if (s === 'booked' || s === 'meeting_booked') return 'booked'
  if (s === 'interested') return 'interested'
  if (s === 'replied') return 'replied'
  if (s === 'contacted' || s === 'uncontacted') return 'contacted'
  if (s === 'not_interested' || s === 'suppressed') return 'other'
  if (!s) return 'contacted'
  return 'other'
}

function isSuccessOutcome(outcome) {
  return outcome === 'converted' || outcome === 'booked' || outcome === 'interested'
}

function isReplyOutcome(outcome) {
  return isSuccessOutcome(outcome) || outcome === 'replied'
}

function locationKey(city, state) {
  const c = normalizePlace(city)
  const s = normalizePlace(state)
  if (!c && !s) return null
  return `${c || '_'}|${s || '_'}`
}

function buildTargetingMap(rows, options = {}) {
  const limit = options.limit ?? 40
  const buckets = new Map()
  let missingLocation = 0

  for (const row of rows) {
    const key = locationKey(row.city ?? null, row.state ?? null)
    if (!key) {
      missingLocation += 1
      continue
    }
    const outcome = classifyOutboundOutcome(row.outbound_status)
    let acc = buckets.get(key)
    if (!acc) {
      acc = {
        city: row.city?.trim() || null,
        state: row.state?.trim() || null,
        targeted: 0,
        successes: 0,
        replies: 0
      }
      buckets.set(key, acc)
    }
    acc.targeted += 1
    if (isSuccessOutcome(outcome)) acc.successes += 1
    if (isReplyOutcome(outcome)) acc.replies += 1
  }

  const points = Array.from(buckets.entries())
    .map(([key, acc]) => ({
      key,
      city: acc.city,
      state: acc.state,
      targeted: acc.targeted,
      successes: acc.successes,
      replies: acc.replies,
      successRate: acc.targeted > 0 ? acc.successes / acc.targeted : 0
    }))
    .sort(
      (a, b) =>
        b.successes - a.successes ||
        b.successRate - a.successRate ||
        b.targeted - a.targeted
    )
    .slice(0, limit)

  let allSuccesses = 0
  let allTargeted = 0
  for (const acc of buckets.values()) {
    allTargeted += acc.targeted
    allSuccesses += acc.successes
  }

  return {
    points,
    totals: {
      targeted: allTargeted,
      successes: allSuccesses,
      missingLocation,
      located: buckets.size,
      successRate: allTargeted > 0 ? allSuccesses / allTargeted : 0
    },
    source: options.source ?? 'live'
  }
}

test('classifyOutboundOutcome maps Instantly-style statuses to success buckets', () => {
  assert.equal(classifyOutboundOutcome('converted'), 'converted')
  assert.equal(classifyOutboundOutcome('meeting_booked'), 'booked')
  assert.equal(classifyOutboundOutcome('booked'), 'booked')
  assert.equal(classifyOutboundOutcome('interested'), 'interested')
  assert.equal(classifyOutboundOutcome('replied'), 'replied')
  assert.equal(classifyOutboundOutcome('contacted'), 'contacted')
  assert.equal(classifyOutboundOutcome('not_interested'), 'other')
})

test('buildTargetingMap ranks locations by wins and success rate', () => {
  const model = buildTargetingMap([
    { city: 'Sydney', state: 'NSW', outbound_status: 'contacted' },
    { city: 'Sydney', state: 'NSW', outbound_status: 'contacted' },
    { city: 'Sydney', state: 'NSW', outbound_status: 'interested' },
    { city: 'Sydney', state: 'NSW', outbound_status: 'booked' },
    { city: 'Melbourne', state: 'VIC', outbound_status: 'contacted' },
    { city: 'Melbourne', state: 'VIC', outbound_status: 'contacted' },
    { city: 'Melbourne', state: 'VIC', outbound_status: 'contacted' },
    { city: 'Melbourne', state: 'VIC', outbound_status: 'replied' },
    { city: null, state: null, outbound_status: 'converted' }
  ])

  assert.equal(model.totals.missingLocation, 1)
  assert.equal(model.totals.located, 2)
  assert.equal(model.totals.targeted, 8)
  assert.equal(model.totals.successes, 2)
  assert.equal(model.points[0].city, 'Sydney')
  assert.equal(model.points[0].successes, 2)
  assert.equal(model.points[0].targeted, 4)
  assert.equal(model.points[1].city, 'Melbourne')
  assert.equal(model.points[1].successes, 0)
  assert.equal(model.points[1].replies, 1)
})

test('targeting success map wires into Sales overview + API', () => {
  const lib = read('src/lib/targeting-map.ts')
  const component = read('src/components/sales/TargetingSuccessMap.tsx')
  const overview = read('src/components/sales/SalesOverview.tsx')
  const route = read('src/app/api/leads/targeting-map/route.ts')

  assert.match(lib, /export function buildTargetingMap/)
  assert.match(lib, /export function resolveGeo/)
  assert.match(component, /Where you target/)
  assert.match(component, /\/api\/leads\/targeting-map/)
  assert.match(overview, /TargetingSuccessMap/)
  assert.match(route, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(route, /lead_contacts/)
  assert.match(route, /city,state,outbound_status/)

  // Ensure the mistaken client Meta heatmap is gone.
  const metaPanel = read('src/components/clients/MetaAdsManagerPanel.tsx')
  assert.doesNotMatch(metaPanel, /LocationTargetingHeatmap/)
  assert.doesNotMatch(metaPanel, /Location heatmap/)
})
