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
  assert.match(planner, /FixedMenu/)
  assert.match(planner, /GlyphButton/)
  assert.match(planner, /Open campaign page/)
  assert.match(planner, /sales\/pipeline\/\$\{/)
  assert.match(planner, /type ViewMode = 'list' \| 'board' \| 'timeline'/)
  assert.match(planner, /setView\(mode\)/)
  assert.match(planner, /view === 'list'/)
  assert.match(planner, /view === 'board'/)
  assert.match(planner, /view === 'timeline'/)
  assert.match(planner, /CAMPAIGN_STATUSES\.map/)
  assert.match(planner, /moveCampaignStatus/)

  const detailPage = read('src/app/(console)/sales/pipeline/[id]/page.tsx')
  assert.match(detailPage, /CampaignDetail/)
  assert.match(detailPage, /campaignId/)

  const sidecar = read('src/components/campaigns/CampaignSidecar.tsx')
  assert.match(sidecar, /Open campaign page/)
  assert.match(sidecar, /variant/)
  assert.match(sidecar, /Close details/)

  const timeline = read('src/lib/campaign-timeline.ts')
  assert.match(timeline, /buildHeaderModel/)
  assert.match(timeline, /weekends/)
  assert.match(timeline, /isoWeekNumber/)
  assert.match(timeline, /formatHoverDate/)
  assert.match(timeline, /zoomIn/)
  assert.match(timeline, /zoomOut/)
  assert.match(timeline, /stepTimelineZoom/)

  const wheelZoom = read('src/hooks/useTimelineWheelZoom.ts')
  assert.match(wheelZoom, /ctrlKey/)
  assert.match(wheelZoom, /stepTimelineZoom/)
  assert.match(wheelZoom, /passive: false/)

  assert.match(planner, /useTimelineWheelZoom/)

  const store = read('src/lib/campaign-local-store.ts')
  assert.match(store, /localStorage/)

  const labels = read('src/lib/campaigns.ts')
  assert.match(labels, /campaignPriorityLabel/)
  assert.match(labels, /campaignHealthLabel/)
})

test('timeline zoom helpers move between macro and micro scales', () => {
  const timeline = read('src/lib/campaign-timeline.ts')
  assert.match(timeline, /export function zoomIn/)
  assert.match(timeline, /export function zoomOut/)
  assert.match(timeline, /export function stepTimelineZoom/)

  const ZOOM_LEVELS = ['year', 'quarter', 'month', 'week']
  function zoomIn(zoom) {
    const index = ZOOM_LEVELS.indexOf(zoom)
    return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, index + 1)] ?? zoom
  }
  function zoomOut(zoom) {
    const index = ZOOM_LEVELS.indexOf(zoom)
    return ZOOM_LEVELS[Math.max(0, index - 1)] ?? zoom
  }
  function stepTimelineZoom(current, direction) {
    return direction > 0 ? zoomIn(current) : zoomOut(current)
  }

  assert.equal(stepTimelineZoom('year', 1), 'quarter')
  assert.equal(stepTimelineZoom('quarter', 1), 'month')
  assert.equal(stepTimelineZoom('month', 1), 'week')
  assert.equal(stepTimelineZoom('week', 1), 'week')
  assert.equal(stepTimelineZoom('week', -1), 'month')
  assert.equal(stepTimelineZoom('month', -1), 'quarter')
  assert.equal(stepTimelineZoom('quarter', -1), 'year')
  assert.equal(stepTimelineZoom('year', -1), 'year')
  assert.equal(zoomIn('year'), 'quarter')
  assert.equal(zoomOut('week'), 'month')
})
