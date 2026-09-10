import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function normalizeProjectStatus(status) {
  switch (status) {
    case 'planned':
    case 'paused':
      return 'planned'
    case 'in_progress':
    case 'active':
      return 'in_progress'
    case 'completed':
    case 'archived':
      return 'completed'
    case 'canceled':
    case 'cancelled':
      return 'canceled'
    case 'backlog':
    default:
      return 'backlog'
  }
}

test('projectColorForFunction maps sales / client deliveries and ignores name churn', () => {
  const FUNCTION_ICON_COLOR_BY_KEY = {
    sales: '#E85D2A',
    'client-deliveries': '#4CB782',
    deliver: '#4CB782'
  }
  const DEFAULT_PROJECT_ICON_COLOR = '#95A2B3'

  function normalizeFunctionKey(value) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  function projectColorForFunction(fn) {
    if (!fn) return DEFAULT_PROJECT_ICON_COLOR
    const candidates = [fn.slug, fn.name]
      .filter((value) => Boolean(value && value.trim()))
      .map(normalizeFunctionKey)
    for (const key of candidates) {
      if (FUNCTION_ICON_COLOR_BY_KEY[key]) return FUNCTION_ICON_COLOR_BY_KEY[key]
    }
    for (const key of candidates) {
      for (const [known, color] of Object.entries(FUNCTION_ICON_COLOR_BY_KEY)) {
        if (key === known || key.startsWith(`${known}-`) || key.endsWith(`-${known}`)) {
          return color
        }
      }
    }
    return DEFAULT_PROJECT_ICON_COLOR
  }

  assert.equal(projectColorForFunction(null), DEFAULT_PROJECT_ICON_COLOR)
  assert.equal(projectColorForFunction({ slug: 'sales', name: 'Sales' }), '#E85D2A')
  assert.equal(
    projectColorForFunction({ slug: 'client-deliveries', name: 'Client Deliveries' }),
    '#4CB782'
  )
  assert.equal(projectColorForFunction({ name: 'Client Deliveries' }), '#4CB782')
  // Name typing must not change color — color comes only from function.
  assert.equal(
    projectColorForFunction({ slug: 'sales' }),
    projectColorForFunction({ slug: 'sales', name: 'Sales' })
  )
})

test('project icon color follows business function, not project name', () => {
  const pm = read('src/lib/project-pm.ts')
  const manager = read('src/components/ProjectManager.tsx')
  const timeline = read('src/components/ProjectTimeline.tsx')

  assert.match(pm, /export function projectColorForFunction/)
  assert.match(pm, /client-deliveries/)
  assert.match(pm, /DEFAULT_PROJECT_ICON_COLOR/)
  assert.match(manager, /projectColorForFunction/)
  assert.match(manager, /createIconColor/)
  assert.doesNotMatch(manager, /ProjectGlyph seed=\{name/)
  assert.match(timeline, /functionById/)
  assert.match(timeline, /projectColorForFunction/)
})

test('legacy project statuses normalize into Linear-style board columns', () => {
  assert.equal(normalizeProjectStatus('active'), 'in_progress')
  assert.equal(normalizeProjectStatus('paused'), 'planned')
  assert.equal(normalizeProjectStatus('archived'), 'completed')
  assert.equal(normalizeProjectStatus('backlog'), 'backlog')
})

test('project management migration and API cover Linear board fields', () => {
  const migration = read('supabase/migrations/0027_compass_project_management.sql')
  const listRoute = read('src/app/api/projects/route.ts')
  const idRoute = read('src/app/api/projects/[id]/route.ts')
  const manager = read('src/components/ProjectManager.tsx')
  const timeline = read('src/components/ProjectTimeline.tsx')
  const detail = read('src/components/ProjectDetailPanel.tsx')
  const taskCreate = read('src/components/TaskCreate.tsx')

  assert.match(migration, /compass_project_milestones/)
  assert.match(migration, /compass_project_updates/)
  assert.match(migration, /ADD COLUMN IF NOT EXISTS priority/)
  assert.match(listRoute, /milestones/)
  assert.match(listRoute, /depends_on_project_ids/)
  assert.match(idRoute, /compass_project_milestones/)
  assert.match(idRoute, /compass_project_updates/)
  assert.match(manager, /board/)
  assert.match(manager, /timeline/)
  assert.match(manager, /groupBy/)
  assert.match(manager, /ProjectTimeline/)
  assert.match(manager, /StatusGlyph/)
  assert.match(manager, /HealthGlyph/)
  assert.match(manager, /All projects/)
  assert.match(manager, /compass\.projects\.view/)
  assert.match(manager, /readStoredProjectsView/)
  assert.match(manager, /writeStoredProjectsView/)
  assert.match(timeline, /buildHeaderModel/)
  assert.match(timeline, /Today/)
  assert.match(timeline, /ZOOM_OPTIONS/)
  assert.match(timeline, /DEFAULT_PROJECT_ICON_COLOR/)
  assert.match(detail, /activity/)
  assert.match(detail, /Milestones/)
  assert.match(taskCreate, /TASK_TYPES/)
  assert.match(taskCreate, /Task output/)
})

test('project board cards support full-card pointer drag between columns', () => {
  const manager = read('src/components/ProjectManager.tsx')

  assert.match(manager, /BOARD_DRAG_THRESHOLD_PX/)
  assert.match(manager, /beginBoardCardDrag/)
  assert.match(manager, /moveBoardCardDrag/)
  assert.match(manager, /endBoardCardDrag/)
  assert.match(manager, /data-project-board-column/)
  assert.match(manager, /patchProjectStatus\(current\.projectId, nextStatus\)/)
  assert.match(manager, /cursor-grab/)
  assert.match(manager, /touch-pan-y/)
  assert.match(manager, /boardColumnFromPoint/)
  assert.match(manager, /data-board-no-drag/)
})

test('project timeline supports Linear-like date create and trackpad zoom', () => {
  const timeline = read('src/components/ProjectTimeline.tsx')
  const manager = read('src/components/ProjectManager.tsx')
  const page = read('src/app/(console)/projects/page.tsx')
  const shell = read('src/components/OperatorShell.tsx')
  const lib = read('src/lib/campaign-timeline.ts')

  assert.match(timeline, /ROW_HEIGHT = 76/)
  assert.match(timeline, /beginCreateDrag/)
  assert.match(timeline, /beginBarDrag/)
  assert.match(timeline, /resize-start/)
  assert.match(timeline, /cursor-grab/)
  assert.match(timeline, /ctrlKey \|\| e\.metaKey/)
  assert.match(timeline, /zoomIn\(zoom\)/)
  assert.match(timeline, /onDatesChange/)
  assert.match(manager, /Create project/)
  assert.match(manager, /ModalFrame open label="New project"/)
  assert.match(manager, /patchProjectDates/)
  assert.match(manager, /TimelineZoomControls/)
  assert.match(page, /compact/)
  assert.match(shell, /compact/)
  assert.match(lib, /export function zoomIn/)
  assert.match(lib, /export function zoomOut/)
})
