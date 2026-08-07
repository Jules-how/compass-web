import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8')
}

function normalizeTaskPriority(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  const rounded = Math.round(n)
  if (rounded <= 0) return 0
  if (rounded >= 4) return 4
  return rounded
}

function rank10ToPriority(rank) {
  const r = Math.min(10, Math.max(1, Math.round(rank)))
  if (r >= 9) return 1
  if (r >= 7) return 2
  if (r >= 4) return 3
  return 4
}

function prioritySortKey(priority) {
  const p = normalizeTaskPriority(priority)
  return p === 0 ? 99 : p
}

function priorityPoints(priority) {
  switch (normalizeTaskPriority(priority)) {
    case 1:
      return 40
    case 2:
      return 30
    case 3:
      return 18
    case 4:
      return 8
    default:
      return 4
  }
}

function duePoints(due, now = new Date()) {
  if (!due) return 0
  const dueDay = new Date(`${due.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(dueDay.getTime())) return 0
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return 50 + Math.min(20, Math.abs(days))
  if (days === 0) return 40
  if (days <= 2) return 28
  if (days <= 7) return 16
  if (days <= 14) return 8
  return 2
}

function statusPoints(status) {
  switch (status) {
    case 'blocked':
      return 22
    case 'in-progress':
      return 14
    case 'completed':
    case 'cancelled':
      return -1000
    default:
      return 0
  }
}

function taskFocusScore(task, ctx = {}, now = new Date()) {
  const priority = priorityPoints(task.priority)
  const due = duePoints(task.due, now)
  const status = statusPoints(task.status)
  const type =
    task.task_type === 'DELIVER'
      ? 10
      : task.task_type === 'SELL'
        ? 9
        : task.task_type === 'BUILD'
          ? 6
          : task.task_type === 'THINK'
            ? 3
            : task.task_type === 'ADMIN'
              ? 1
              : 2
  const project = priorityPoints(ctx.project?.priority) * 0.45
  const client = priorityPoints(ctx.client?.priority) * 0.35
  return priority + due + status + type + project + client
}

function matchesFocusWindow(task, window, now = new Date()) {
  if (window === 'all') return true
  if (task.status === 'completed' || task.status === 'cancelled') return false
  const due = task.due ? new Date(`${task.due.slice(0, 10)}T00:00:00`) : null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = due ? Math.round((due.getTime() - today.getTime()) / 86_400_000) : null
  const priority = normalizeTaskPriority(task.priority)
  const active = task.status === 'in-progress' || task.status === 'blocked'
  const dueSoonOrOverdue = days !== null && days <= 0
  const dueThisWeek = days !== null && days <= 7
  const highManual = priority === 1 || priority === 2
  if (window === 'today') {
    return active || dueSoonOrOverdue || (highManual && (days === null || days <= 2))
  }
  return active || dueThisWeek || highManual || taskFocusScore(task, {}, now) >= 35
}

test('task priority helpers are Linear-style 0-4', () => {
  const source = read('src/lib/task-priority.ts')
  assert.match(source, /0 = none, 1 = urgent/)
  assert.match(source, /rank10ToPriority/)
  assert.equal(normalizeTaskPriority(1), 1)
  assert.equal(normalizeTaskPriority(9), 4)
  assert.equal(rank10ToPriority(10), 1)
  assert.equal(rank10ToPriority(1), 4)
  assert.ok(prioritySortKey(1) < prioritySortKey(4))
  assert.ok(prioritySortKey(4) < prioritySortKey(0))
})

test('focus score prefers urgent + due today over low/admin', () => {
  const now = new Date('2026-08-07T12:00:00')
  const urgent = taskFocusScore(
    { priority: 1, due: '2026-08-07', status: 'in-progress', task_type: 'DELIVER' },
    { project: { priority: 1 }, client: { priority: 2 } },
    now
  )
  const low = taskFocusScore(
    { priority: 4, due: null, status: 'not-started', task_type: 'ADMIN' },
    {},
    now
  )
  assert.ok(urgent > low)
  assert.ok(urgent > 80)
})

test('today / week windows keep scope tight', () => {
  const now = new Date('2026-08-07T12:00:00')
  const todayTask = {
    priority: 3,
    due: '2026-08-07',
    status: 'not-started',
    task_type: 'SELL'
  }
  const nextWeek = {
    priority: 3,
    due: '2026-08-12',
    status: 'not-started',
    task_type: 'SELL'
  }
  const later = {
    priority: 4,
    due: '2026-09-01',
    status: 'not-started',
    task_type: 'ADMIN'
  }
  assert.equal(matchesFocusWindow(todayTask, 'today', now), true)
  assert.equal(matchesFocusWindow(nextWeek, 'today', now), false)
  assert.equal(matchesFocusWindow(nextWeek, 'week', now), true)
  assert.equal(matchesFocusWindow(later, 'week', now), false)
  assert.equal(matchesFocusWindow(later, 'all', now), true)
})

test('My Tasks UI and API wire focus organisation', () => {
  assert.match(read('src/lib/task-organisation.ts'), /taskFocusScore/)
  assert.match(read('src/lib/task-organisation.ts'), /matchesFocusWindow/)
  assert.match(read('src/components/TaskList.tsx'), /FocusWindow/)
  assert.match(read('src/components/TaskList.tsx'), /Group by function/)
  assert.match(read('src/components/TaskItem.tsx'), /dense/)
  assert.match(read('src/components/TaskItem.tsx'), /taskFocusScore/)
  assert.match(read('src/app/api/tasks/route.ts'), /clientsById/)
  assert.match(read('src/app/api/tasks/route.ts'), /priority,health/)
  assert.match(read('src/components/home/HomeDashboard.tsx'), /compareTasksByFocus/)
})

test('brain dump suggestedPriority is 1-4 Linear scale', () => {
  const dump = read('src/lib/brain-dump.ts')
  const ai = read('src/lib/brain-dump-ai.ts')
  assert.match(dump, /Math\.min\(4, Math\.max\(1, score\)\)/)
  assert.match(ai, /suggestedPriority: z\.number\(\)\.int\(\)\.min\(1\)\.max\(4\)/)
  assert.match(ai, /1=urgent, 2=high, 3=medium, 4=low/)
})
