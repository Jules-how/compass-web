import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

/** Mirror of src/lib/work-timeline.ts for behavioral coverage without TS imports. */
function computeTimelineBounds(dates, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const end = new Date(today.getFullYear() + 1, today.getMonth() + 2, 1)
  for (const value of dates) {
    if (!value) continue
    const date = new Date(`${value}T00:00:00`)
    if (Number.isNaN(date.getTime())) continue
    if (date < start) start.setTime(date.getTime())
    if (date > end) end.setTime(date.getTime())
  }
  return { start, end, today }
}

function dateToTimelinePercent(value, bounds) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`).getTime()
  if (Number.isNaN(date)) return null
  const start = bounds.start.getTime()
  const end = bounds.end.getTime()
  if (end <= start) return 0
  return Math.min(100, Math.max(0, ((date - start) / (end - start)) * 100))
}

function timelineBarLayout(startDate, targetDate, bounds, fallbackPercent) {
  const startPct = dateToTimelinePercent(startDate, bounds) ?? fallbackPercent
  const endPct = dateToTimelinePercent(targetDate, bounds) ?? startPct + 4
  const left = Math.min(startPct, endPct)
  const width = Math.max(3, Math.abs(endPct - startPct))
  return { left, width }
}

test('computeTimelineBounds expands around project and task dates', () => {
  const today = new Date('2026-08-06T12:00:00')
  const bounds = computeTimelineBounds(['2026-01-01', '2026-12-15', null], today)
  assert.equal(bounds.start.toISOString().slice(0, 10), '2026-01-01')
  assert.ok(bounds.end >= new Date('2026-12-15T00:00:00'))
})

test('timelineBarLayout keeps a visible bar when only one date exists', () => {
  const today = new Date('2026-08-06T12:00:00')
  const bounds = computeTimelineBounds(['2026-08-01', '2026-09-01'], today)
  const bar = timelineBarLayout('2026-08-15', null, bounds, 50)
  assert.ok(bar.width >= 3)
  assert.ok(bar.left >= 0 && bar.left <= 100)
})

test('client overview includes a mini project/task planner with timeline', () => {
  const detail = read('src/components/clients/ClientDetailPanel.tsx')
  const planner = read('src/components/clients/ClientWorkPlanner.tsx')
  const clientRoute = read('src/app/api/clients/[id]/route.ts')
  const projectsRoute = read('src/app/api/projects/route.ts')
  const manager = read('src/components/ProjectManager.tsx')

  assert.match(detail, /ClientWorkPlanner/)
  assert.match(detail, /tasks/)
  assert.match(planner, /timeline/)
  assert.match(planner, /New project/)
  assert.match(planner, /New task/)
  assert.match(planner, /client_id: clientId/)
  assert.match(planner, /\/api\/tasks/)
  assert.match(clientRoute, /TASK_LIST_COLUMNS/)
  assert.match(clientRoute, /tasks/)
  assert.match(projectsRoute, /client_name/)
  assert.match(manager, /clientFilter/)
  assert.match(manager, /client_id: clientId/)
  assert.match(read('src/app/api/tasks/route.ts'), /client_name/)
  assert.match(read('src/components/TaskItem.tsx'), /client_name/)
})
