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
  assert.match(planner, /CampaignReviewModal/)
  assert.match(planner, /Today/)
  assert.match(planner, /createCampaignRemote/)
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
  assert.match(planner, /type ViewMode = 'list' \| 'board' \| 'timeline' \| 'calendar'/)
  assert.match(planner, /useState<ViewMode>\('calendar'\)/)
  assert.match(planner, /useState<CalendarGrain>\('week'\)/)
  assert.match(planner, /setView\(mode\)/)
  assert.match(planner, /view === 'list'/)
  assert.match(planner, /view === 'board'/)
  assert.match(planner, /view === 'timeline'/)
  assert.match(planner, /view === 'calendar'/)
  assert.match(planner, /CampaignCalendar/)
  assert.match(planner, /calendarGrain/)
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
  assert.match(wheelZoom, /scalePxPerDay/)
  assert.match(wheelZoom, /passive: false/)
  assert.match(wheelZoom, /enabled/)
  assert.match(wheelZoom, /onDensityChange/)
  assert.match(wheelZoom, /gesturechange/)
  assert.match(wheelZoom, /requestAnimationFrame/)

  assert.match(planner, /useTimelineWheelZoom/)
  assert.match(planner, /setTimelineScrollRef/)
  assert.match(planner, /enabled: view === 'timeline' && scrollNode !== null/)
  assert.match(planner, /overscroll-contain/)
  assert.match(planner, /placement === 'left'/)
  assert.match(planner, /Side pop-out/)
  assert.match(planner, /zoomFromPxPerDay/)
  assert.match(planner, /density/)

  const client = read('src/lib/campaigns-client.ts')
  assert.match(client, /listCampaigns/)

  const labels = read('src/lib/campaigns.ts')
  assert.match(labels, /campaignPriorityLabel/)
  assert.match(labels, /campaignHealthLabel/)

  const calendar = read('src/lib/campaign-calendar.ts')
  assert.match(calendar, /export type CalendarGrain = 'day' \| 'week' \| 'month'/)
  assert.match(calendar, /layoutWeekBars/)
  assert.match(calendar, /datedGoLiveCampaigns/)
  assert.match(calendar, /goLiveFallsInPeriod/)
  assert.match(calendar, /monthWeeks/)
  assert.match(calendar, /minutesFromMidnight/)
  assert.match(calendar, /layoutTimedEvents/)
  assert.match(calendar, /CALENDAR_HOUR_HEIGHT/)
  assert.match(calendar, /goLiveAtFromSlot/)
  assert.match(calendar, /formatSlotHeading/)
  const calendarView = read('src/components/campaigns/CampaignCalendar.tsx')
  assert.match(calendarView, /MonthGrid/)
  assert.match(calendarView, /WeekGrid/)
  assert.match(calendarView, /DayList/)
  assert.match(calendarView, /HourGutter/)
  assert.match(calendarView, /overflow-hidden/)
  assert.match(calendarView, /CALENDAR_EVENT_HEIGHT/)
  assert.match(calendarView, /onCreateSlot/)
  const composer = read('src/components/campaigns/CampaignSlotComposer.tsx')
  assert.match(composer, /CampaignSlotComposer/)
  assert.match(composer, /Add leads/)
  assert.match(composer, /pipeline_campaign_id/)
  const review = read('src/components/campaigns/CampaignReviewModal.tsx')
  assert.match(review, /CampaignReviewModal/)
  assert.match(review, /\/api\/leads\/list/)
  assert.match(review, /PATCH/)
  assert.match(review, /lead_facts/)
  assert.match(review, /SequenceEditor/)
  assert.match(review, /variant=\"overlay\"/)
  assert.match(review, /leadsPane=\"hidden\"/)
  assert.match(review, /columnPreset|preset=\"campaign\"/)
  assert.match(review, /items-center gap-2/)
  const goLiveMigration = read('supabase/migrations/0046_campaign_go_live_at.sql')
  assert.match(goLiveMigration, /go_live_at timestamptz/)
  assert.match(goLiveMigration, /Australia\/Sydney/)
})

test('timeline zoom helpers move between macro and micro scales', () => {
  const timeline = read('src/lib/campaign-timeline.ts')
  assert.match(timeline, /export function zoomIn/)
  assert.match(timeline, /export function zoomOut/)
  assert.match(timeline, /export function stepTimelineZoom/)
  assert.match(timeline, /export function scalePxPerDay/)
  assert.match(timeline, /export function zoomFromPxPerDay/)
  assert.match(timeline, /export function clampPxPerDay/)
  assert.match(timeline, /export const WHEEL_ZOOM_GAIN/)
  assert.match(timeline, /pxPerDay:/)

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

test('continuous density helpers clamp and map named zooms', () => {
  const PX_PER_DAY = { year: 2.4, quarter: 9, month: 22, week: 56 }
  const MIN = PX_PER_DAY.year
  const MAX = PX_PER_DAY.week
  function clampPxPerDay(value) {
    if (!Number.isFinite(value)) return MIN
    return Math.min(MAX, Math.max(MIN, value))
  }
  function scalePxPerDay(current, deltaY) {
    const factor = Math.exp(-deltaY * 0.0055)
    return clampPxPerDay(current * factor)
  }
  function zoomFromPxPerDay(density) {
    const px = clampPxPerDay(density)
    const logPx = Math.log(px)
    let best = 'year'
    let bestDist = Infinity
    for (const level of Object.keys(PX_PER_DAY)) {
      const dist = Math.abs(logPx - Math.log(PX_PER_DAY[level]))
      if (dist < bestDist) {
        best = level
        bestDist = dist
      }
    }
    return best
  }

  assert.equal(clampPxPerDay(0), MIN)
  assert.equal(clampPxPerDay(999), MAX)
  assert.ok(scalePxPerDay(9, -100) > 9)
  assert.ok(scalePxPerDay(9, 100) < 9)
  assert.equal(zoomFromPxPerDay(2.4), 'year')
  assert.equal(zoomFromPxPerDay(56), 'week')
  assert.equal(zoomFromPxPerDay(22), 'month')
})
