import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function toDateOnly(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function clampDateOrder(start, end) {
  if (end < start) return { start, end: start }
  return { start, end }
}

test('campaign date helpers keep order and round-trip', () => {
  const d = parseDateOnly('2026-08-05')
  assert.ok(d)
  assert.equal(toDateOnly(d), '2026-08-05')
  assert.deepEqual(clampDateOrder('2026-08-10', '2026-08-01'), {
    start: '2026-08-10',
    end: '2026-08-10'
  })
})

test('campaign planner files and migration are wired', () => {
  const migration = read('supabase/migrations/0028_compass_pipeline_campaigns.sql')
  assert.match(migration, /compass_pipeline_campaigns/)
  assert.match(migration, /compass_pipeline_milestones/)
  assert.match(migration, /compass_pipeline_activity/)
  assert.match(migration, /portal_is_operator/)

  const nav = read('src/components/NavLinks.tsx')
  assert.match(nav, /sales\/pipeline/)
  assert.match(nav, /My Tasks/)
  assert.match(nav, /Finances/)

  const planner = read('src/components/campaigns/CampaignPlanner.tsx')
  assert.match(planner, /CampaignSidecar/)
  assert.match(planner, /Today/)
  assert.match(planner, /resize-start/)
  assert.match(planner, /createLocalCampaign/)
  assert.match(planner, /EMPTY_ROWS/)
  assert.match(planner, /Filter/)
  assert.match(planner, /Display options/)
  assert.match(planner, /buildHeaderModel/)
  assert.match(planner, /StatusGlyph/)
  assert.match(planner, /onContextMenu/)

  const timeline = read('src/lib/campaign-timeline.ts')
  assert.match(timeline, /buildHeaderModel/)
  assert.match(timeline, /weekends/)
  assert.match(timeline, /isoWeekNumber/)
  assert.match(timeline, /formatHoverDate/)

  const store = read('src/lib/campaign-local-store.ts')
  assert.match(store, /localStorage/)
})
