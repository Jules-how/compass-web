import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function computeProjectStats(rows) {
  const stats = new Map()
  for (const row of rows) {
    if (!row.project_id) continue
    const current = stats.get(row.project_id) ?? {
      issueCount: 0,
      completedCount: 0,
      percentComplete: 0
    }
    current.issueCount += 1
    if (row.status === 'completed') current.completedCount += 1
    stats.set(row.project_id, current)
  }
  for (const value of stats.values()) {
    value.percentComplete =
      value.issueCount === 0 ? 0 : Math.round((value.completedCount / value.issueCount) * 100)
  }
  return stats
}

test('project stats aggregate issue counts and percent complete', () => {
  const stats = computeProjectStats([
    { project_id: 'p1', status: 'completed' },
    { project_id: 'p1', status: 'in-progress' },
    { project_id: 'p1', status: 'completed' },
    { project_id: 'p2', status: 'not-started' },
    { project_id: null, status: 'completed' }
  ])

  assert.deepEqual(stats.get('p1'), {
    issueCount: 3,
    completedCount: 2,
    percentComplete: 67
  })
  assert.deepEqual(stats.get('p2'), {
    issueCount: 1,
    completedCount: 0,
    percentComplete: 0
  })
  assert.equal(stats.has(''), false)
})

test('projects API returns stats and project detail GET is operator-gated', () => {
  const listRoute = read('src/app/api/projects/route.ts')
  const idRoute = read('src/app/api/projects/[id]/route.ts')
  const detailPage = read('src/app/projects/[id]/page.tsx')
  const statsLib = read('src/lib/project-stats.ts')

  assert.match(statsLib, /export function computeProjectStats/)
  assert.match(listRoute, /computeProjectStats/)
  assert.match(listRoute, /compass_tasks/)
  assert.match(idRoute, /export async function GET/)
  assert.match(idRoute, /requirePortalAccess\(\{\s*operator:\s*true\s*\}\)/)
  assert.match(detailPage, /requireOperatorPageAccess/)
  assert.match(detailPage, /ProjectDetailPanel/)
})

test('operator shell is sidebar-first with Compass brand and sectioned surfaces', () => {
  const shell = read('src/components/OperatorShell.tsx')
  const nav = read('src/components/NavLinks.tsx')

  assert.match(shell, /switchflow/)
  assert.match(shell, /compass/)
  assert.match(shell, /compass-sidebar/)
  assert.match(shell, /orientation="vertical"/)
  for (const href of ['/home', '/inbox', '/tasks', '/projects', '/functions', '/sales/pipeline']) {
    assert.match(nav, new RegExp(`href: '${href}'`))
  }
  assert.match(nav, /My Tasks/)
  assert.doesNotMatch(nav, /href: '\/delivery'/)
})
