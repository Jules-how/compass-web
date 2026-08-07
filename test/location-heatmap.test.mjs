import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of location-heatmap helpers for behavioral coverage without TS imports. */
const SPLIT_RE = /\s*(?:[·•|/]|;|\n|,|\band\b)\s*/i

function normalizeLocationKey(token) {
  return token.replace(/\s+/g, ' ').trim().toLowerCase()
}

function parseLocationTokens(raw) {
  if (!raw) return []
  const seen = new Set()
  const out = []
  for (const part of raw.split(SPLIT_RE)) {
    const token = part.replace(/\s+/g, ' ').trim()
    if (!token) continue
    const key = normalizeLocationKey(token)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(token)
  }
  return out
}

function normalizeStatus(status) {
  if (status === 'active' || status === 'paused' || status === 'archived') return status
  return 'draft'
}

function buildLocationHeatmap(sources, options = {}) {
  const limit = options.limit ?? 12
  const buckets = new Map()
  let adSetsWithLocations = 0
  let adSetsMissingLocations = 0

  for (const source of sources) {
    const tokens = parseLocationTokens(source.locations)
    if (tokens.length === 0) {
      adSetsMissingLocations += 1
      continue
    }
    adSetsWithLocations += 1
    const status = normalizeStatus(source.status)
    const used = new Set()
    for (const token of tokens) {
      const key = normalizeLocationKey(token)
      if (!key || used.has(key)) continue
      used.add(key)
      let acc = buckets.get(key)
      if (!acc) {
        acc = {
          labelCounts: new Map(),
          byStatus: { active: 0, paused: 0, draft: 0, archived: 0 },
          total: 0
        }
        buckets.set(key, acc)
      }
      acc.total += 1
      acc.byStatus[status] += 1
      acc.labelCounts.set(token, (acc.labelCounts.get(token) ?? 0) + 1)
    }
  }

  const maxTotal = Math.max(0, ...Array.from(buckets.values(), (b) => b.total))
  const rows = Array.from(buckets.entries())
    .map(([key, acc]) => {
      let label = key
      let best = 0
      for (const [candidate, count] of acc.labelCounts) {
        if (count > best) {
          best = count
          label = candidate
        }
      }
      return {
        key,
        label,
        total: acc.total,
        intensity: maxTotal > 0 ? acc.total / maxTotal : 0,
        byStatus: { ...acc.byStatus }
      }
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit))

  const visibleMax = rows[0]?.total ?? 0
  for (const row of rows) {
    row.intensity = visibleMax > 0 ? row.total / visibleMax : 0
  }

  return {
    rows,
    maxTotal: visibleMax,
    adSetsWithLocations,
    adSetsMissingLocations,
    uniqueLocations: buckets.size
  }
}

test('parseLocationTokens splits Meta free-text targeting notes', () => {
  assert.deepEqual(parseLocationTokens('Australia · Sydney 25km · exclude regional QLD'), [
    'Australia',
    'Sydney 25km',
    'exclude regional QLD'
  ])
  assert.deepEqual(parseLocationTokens('Melbourne, Sydney and Brisbane'), [
    'Melbourne',
    'Sydney',
    'Brisbane'
  ])
  assert.deepEqual(parseLocationTokens(''), [])
  assert.deepEqual(parseLocationTokens(null), [])
})

test('buildLocationHeatmap ranks locations and buckets by status', () => {
  const model = buildLocationHeatmap([
    { locations: 'Sydney · Australia', status: 'active' },
    { locations: 'sydney · Melbourne', status: 'active' },
    { locations: 'Australia', status: 'paused' },
    { locations: null, status: 'draft' },
    { locations: '  ', status: 'draft' }
  ])

  assert.equal(model.adSetsWithLocations, 3)
  assert.equal(model.adSetsMissingLocations, 2)
  assert.equal(model.uniqueLocations, 3)
  assert.equal(model.rows[0].label, 'Australia')
  assert.equal(model.rows[0].total, 2)
  assert.equal(model.rows[0].byStatus.active, 1)
  assert.equal(model.rows[0].byStatus.paused, 1)
  assert.equal(model.rows[0].intensity, 1)

  const sydney = model.rows.find((r) => r.key === 'sydney')
  assert.ok(sydney)
  assert.equal(sydney.label, 'Sydney')
  assert.equal(sydney.total, 2)
  assert.equal(sydney.byStatus.active, 2)
})

test('location heatmap wires into Meta Ads Manager', () => {
  const lib = read('src/lib/location-heatmap.ts')
  const component = read('src/components/clients/LocationTargetingHeatmap.tsx')
  const panel = read('src/components/clients/MetaAdsManagerPanel.tsx')

  assert.match(lib, /export function buildLocationHeatmap/)
  assert.match(lib, /export function parseLocationTokens/)
  assert.match(component, /Location heatmap/)
  assert.match(component, /buildLocationHeatmap/)
  assert.match(panel, /LocationTargetingHeatmap/)
})
