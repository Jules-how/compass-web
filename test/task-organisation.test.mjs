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

function daysUntilDue(due, now = new Date()) {
  if (!due) return null
  const dueDay = new Date(`${due.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(dueDay.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
}

function isOpenTask(task) {
  return task.status !== 'completed' && task.status !== 'cancelled'
}

function isActiveTask(task) {
  return task.status === 'in-progress' || task.status === 'blocked'
}

function isFocusTask(task, now = new Date()) {
  if (!isOpenTask(task)) return false
  const days = daysUntilDue(task.due, now)
  const priority = normalizeTaskPriority(task.priority)
  const highManual = priority === 1 || priority === 2
  const dueSoon = days !== null && days <= 2
  return isActiveTask(task) || highManual || dueSoon
}

function matchesFocusWindow(task, window, now = new Date()) {
  if (window === 'done') return task.status === 'completed' || task.status === 'cancelled'
  if (!isOpenTask(task)) return false
  const days = daysUntilDue(task.due, now)
  const active = isActiveTask(task)
  const dueTodayOrOverdue = days !== null && days <= 0
  const dueThisWeek = days !== null && days <= 7
  if (window === 'today') return active || dueTodayOrOverdue
  if (window === 'week') return active || dueThisWeek
  if (window === 'focus') return isFocusTask(task, now)
  return !isFocusTask(task, now)
}

function compareTasksByManual(a, b, now = new Date()) {
  const priDiff = prioritySortKey(a.priority) - prioritySortKey(b.priority)
  if (priDiff !== 0) return priDiff
  const aDue = daysUntilDue(a.due, now)
  const bDue = daysUntilDue(b.due, now)
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue
  if (aDue !== null && bDue === null) return -1
  if (aDue === null && bDue !== null) return 1
  return (b.created_at ?? '').localeCompare(a.created_at ?? '')
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

test('today / week / focus / backlog / done windows differ', () => {
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
  const urgentNoDue = {
    priority: 1,
    due: null,
    status: 'not-started',
    task_type: 'DELIVER'
  }
  const done = {
    priority: 1,
    due: '2026-08-01',
    status: 'completed',
    task_type: 'DELIVER'
  }

  assert.equal(matchesFocusWindow(todayTask, 'today', now), true)
  assert.equal(matchesFocusWindow(nextWeek, 'today', now), false)
  assert.equal(matchesFocusWindow(nextWeek, 'week', now), true)
  assert.equal(matchesFocusWindow(later, 'week', now), false)
  assert.equal(matchesFocusWindow(urgentNoDue, 'today', now), false)
  assert.equal(matchesFocusWindow(urgentNoDue, 'focus', now), true)
  assert.equal(matchesFocusWindow(later, 'backlog', now), true)
  assert.equal(matchesFocusWindow(urgentNoDue, 'backlog', now), false)
  assert.equal(matchesFocusWindow(done, 'done', now), true)
  assert.equal(matchesFocusWindow(done, 'today', now), false)
})

test('manual sort prefers set priority then due date', () => {
  const now = new Date('2026-08-07T12:00:00')
  const urgent = {
    priority: 1,
    due: '2026-08-10',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z'
  }
  const soon = {
    priority: 3,
    due: '2026-08-08',
    created_at: '2026-08-02T00:00:00Z',
    updated_at: '2026-08-02T00:00:00Z'
  }
  assert.ok(compareTasksByManual(urgent, soon, now) < 0)
})

test('My Tasks UI wires windows, done checkbox, and detail panel', () => {
  assert.match(read('src/lib/task-organisation.ts'), /compareTasksByManual/)
  assert.match(read('src/lib/task-organisation.ts'), /FocusWindow = 'today' \| 'week' \| 'focus' \| 'backlog' \| 'done'/)
  assert.match(read('src/lib/task-organisation.ts'), /selectHomePriorities/)
  assert.match(read('src/lib/task-organisation.ts'), /bucketPriorityPlate/)
  assert.match(read('src/lib/task-organisation.ts'), /tasksHref/)
  assert.match(read('src/components/TaskList.tsx'), /FocusWindow/)
  assert.match(read('src/components/TaskList.tsx'), /taskOrganisationFiltersFromSearch/)
  assert.match(read('src/components/TaskList.tsx'), /useSearchParams/)
  assert.match(read('src/components/TaskList.tsx'), /Completed/)
  assert.match(read('src/components/TaskList.tsx'), /LINGER_MS/)
  assert.match(read('src/components/TaskItem.tsx'), /Mark as done/)
  assert.match(read('src/components/TaskItem.tsx'), /onToggleDone/)
  assert.doesNotMatch(read('src/components/TaskItem.tsx'), /NotesEditor/)
  assert.match(read('src/components/TaskDetailPanel.tsx'), /Edit task/)
  assert.match(read('src/components/TaskDetailPanel.tsx'), /NotesEditor/)
  assert.match(read('src/app/(console)/tasks/page.tsx'), /My Tasks/)
  assert.match(read('src/lib/list-columns.ts'), /created_at/)
  assert.match(read('src/app/api/tasks/route.ts'), /clientsById/)
})

test('Home Priorities is Focus subset aligned with My Tasks', () => {
  const now = new Date('2026-08-07T12:00:00')
  const urgentNoDue = {
    id: 'a',
    priority: 1,
    due: null,
    status: 'not-started',
    created_at: '2026-08-06T00:00:00Z',
    updated_at: '2026-08-06T00:00:00Z'
  }
  const backlogLater = {
    id: 'b',
    priority: 4,
    due: '2026-09-01',
    status: 'not-started',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z'
  }
  const instantlyFollowUp = {
    id: 'c',
    priority: 2,
    due: '2026-08-07',
    status: 'not-started',
    created_at: '2026-08-07T00:00:00Z',
    updated_at: '2026-08-07T00:00:00Z'
  }
  const selected = [urgentNoDue, backlogLater, instantlyFollowUp]
    .filter((task) => isFocusTask(task, now))
    .sort((a, b) => compareTasksByManual(a, b, now))
  assert.deepEqual(
    selected.map((t) => t.id),
    ['a', 'c']
  )
  assert.equal(matchesFocusWindow(instantlyFollowUp, 'today', now), true)
  assert.equal(matchesFocusWindow(instantlyFollowUp, 'focus', now), true)
  assert.equal(matchesFocusWindow(urgentNoDue, 'focus', now), true)
  assert.equal(matchesFocusWindow(urgentNoDue, 'today', now), false)

  const home = read('src/components/home/HomeDashboard.tsx')
  assert.match(home, /selectHomePriorities/)
  assert.match(home, /bucketPriorityPlate/)
  assert.match(home, /tasksHref/)
  assert.match(home, /window: 'focus'/)
  assert.doesNotMatch(home, /compareTasksByFocus/)

  const inbox = read('src/components/InboxPanel.tsx')
  assert.match(inbox, /due: fromSales \? dueToday/)
  assert.match(inbox, /task_type: fromSales \? 'SELL'/)
  assert.match(inbox, /tasksHref/)
})

test('brain dump suggestedPriority is 1-4 Linear scale', () => {
  const dump = read('src/lib/brain-dump.ts')
  const ai = read('src/lib/brain-dump-ai.ts')
  assert.match(dump, /Math\.min\(4, Math\.max\(1, score\)\)/)
  assert.match(ai, /suggestedPriority: z\.number\(\)\.int\(\)\.min\(1\)\.max\(4\)/)
  assert.match(ai, /1=urgent, 2=high, 3=medium, 4=low/)
})
