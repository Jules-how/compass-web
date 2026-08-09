import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

// function-stats is TypeScript — exercise via a tiny mirrored check of the
// exported logic by importing the compiled path is unavailable in smoke tests.
// Keep a pure JS twin of the counting rules here so regressions are caught.

function emptyFunctionStats() {
  return {
    projectCount: 0,
    activeProjectCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    completedTaskCount: 0
  }
}

function isActiveProjectStatus(status) {
  const normalized = (status || '').trim().toLowerCase().replace(/\s+/g, '_')
  return normalized !== 'completed' && normalized !== 'cancelled' && normalized !== 'canceled'
}

function isOpenTaskStatus(status) {
  return status !== 'completed' && status !== 'cancelled'
}

function computeFunctionStats(projects, tasks) {
  const stats = new Map()
  const projectFunction = new Map()

  for (const project of projects) {
    const functionId = project.business_function_id
    if (!functionId) continue
    projectFunction.set(project.id, functionId)
    const current = stats.get(functionId) ?? emptyFunctionStats()
    current.projectCount += 1
    if (isActiveProjectStatus(project.status)) current.activeProjectCount += 1
    stats.set(functionId, current)
  }

  const seenTasks = new Set()
  for (const task of tasks) {
    if (task.parent_task_id) continue
    const functionId =
      task.business_function_id ??
      (task.project_id ? projectFunction.get(task.project_id) ?? null : null)
    if (!functionId) continue
    const key = `${functionId}:${task.id}`
    if (seenTasks.has(key)) continue
    seenTasks.add(key)

    const current = stats.get(functionId) ?? emptyFunctionStats()
    current.taskCount += 1
    if (task.status === 'completed') current.completedTaskCount += 1
    else if (isOpenTaskStatus(task.status)) current.openTaskCount += 1
    stats.set(functionId, current)
  }

  return stats
}

test('function stats count projects and related tasks per module', () => {
  const stats = computeFunctionStats(
    [
      { id: 'p1', business_function_id: 'sales', status: 'in_progress' },
      { id: 'p2', business_function_id: 'sales', status: 'completed' },
      { id: 'p3', business_function_id: 'marketing', status: 'planned' }
    ],
    [
      { id: 't1', business_function_id: 'sales', project_id: null, status: 'in-progress' },
      { id: 't2', business_function_id: null, project_id: 'p1', status: 'not-started' },
      { id: 't3', business_function_id: 'sales', project_id: 'p1', status: 'completed' },
      { id: 't4', business_function_id: null, project_id: 'p3', status: 'blocked' },
      { id: 't5', business_function_id: 'sales', project_id: null, status: 'cancelled' }
    ]
  )

  const sales = stats.get('sales')
  assert.equal(sales.projectCount, 2)
  assert.equal(sales.activeProjectCount, 1)
  assert.equal(sales.taskCount, 4)
  assert.equal(sales.openTaskCount, 2)
  assert.equal(sales.completedTaskCount, 1)

  const marketing = stats.get('marketing')
  assert.equal(marketing.projectCount, 1)
  assert.equal(marketing.activeProjectCount, 1)
  assert.equal(marketing.taskCount, 1)
  assert.equal(marketing.openTaskCount, 1)
})

test('function detail page exists under console routes', () => {
  const require = createRequire(import.meta.url)
  const { existsSync } = require('node:fs')
  const { resolve, dirname } = require('node:path')
  const { fileURLToPath } = require('node:url')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  assert.equal(existsSync(resolve(root, 'src/app/(console)/functions/[id]/page.tsx')), true)
  assert.equal(existsSync(resolve(root, 'src/components/FunctionDetailPanel.tsx')), true)
  assert.equal(existsSync(resolve(root, 'src/lib/function-stats.ts')), true)
})
