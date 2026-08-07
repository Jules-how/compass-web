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
  assert.match(timeline, /5e6ad2/)
  assert.match(detail, /activity/)
  assert.match(detail, /Milestones/)
  assert.match(taskCreate, /TASK_TYPES/)
  assert.match(taskCreate, /Task output/)
})
