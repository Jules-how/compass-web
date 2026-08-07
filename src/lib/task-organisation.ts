import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskStatus,
  TaskType
} from '@/lib/types'
import { normalizeTaskPriority, prioritySortKey } from '@/lib/task-priority'

export type FocusWindow = 'today' | 'week' | 'all'
export type TaskGroupBy = 'none' | 'function' | 'client' | 'project' | 'type' | 'status'

export type TaskClientMeta = {
  id: string
  name: string
  priority: number
  health: string
}

export type TaskFocusContext = {
  project?: Pick<
    CompassProject,
    'priority' | 'health' | 'client_id' | 'client_name' | 'name' | 'business_function_id'
  > | null
  client?: Pick<TaskClientMeta, 'priority' | 'health'> | null
}

export type FocusScoreBreakdown = {
  total: number
  priority: number
  due: number
  status: number
  type: number
  project: number
  client: number
}

const MS_DAY = 86_400_000

function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseDueDay(due: string | null | undefined): Date | null {
  if (!due) return null
  const parsed = new Date(`${due.slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** Whole days from today (local) to due date. Negative = overdue. */
export function daysUntilDue(due: string | null | undefined, now = new Date()): number | null {
  const dueDay = parseDueDay(due)
  if (!dueDay) return null
  const today = startOfLocalDay(now)
  return Math.round((dueDay.getTime() - today.getTime()) / MS_DAY)
}

export function isOpenTask(task: Pick<CompassTask, 'status'>): boolean {
  return task.status !== 'completed' && task.status !== 'cancelled'
}

function priorityPoints(priority: number | null | undefined): number {
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

function duePoints(due: string | null | undefined, now = new Date()): number {
  const days = daysUntilDue(due, now)
  if (days === null) return 0
  if (days < 0) return 50 + Math.min(20, Math.abs(days))
  if (days === 0) return 40
  if (days <= 2) return 28
  if (days <= 7) return 16
  if (days <= 14) return 8
  return 2
}

function statusPoints(status: TaskStatus): number {
  switch (status) {
    case 'blocked':
      return 22
    case 'in-progress':
      return 14
    case 'not-started':
      return 0
    case 'completed':
    case 'cancelled':
      return -1000
    default:
      return 0
  }
}

function typePoints(taskType: TaskType | null | undefined): number {
  switch (taskType) {
    case 'DELIVER':
      return 10
    case 'SELL':
      return 9
    case 'BUILD':
      return 6
    case 'THINK':
      return 3
    case 'ADMIN':
      return 1
    default:
      return 2
  }
}

function healthPoints(health: string | null | undefined): number {
  switch (health) {
    case 'off_track':
      return 12
    case 'at_risk':
      return 8
    case 'on_track':
      return 2
    default:
      return 0
  }
}

/**
 * Deterministic focus score — higher = do sooner.
 * Transparent, cheap, and stable across reloads (no AI).
 */
export function taskFocusScore(
  task: Pick<CompassTask, 'priority' | 'due' | 'status' | 'task_type'>,
  ctx: TaskFocusContext = {},
  now = new Date()
): FocusScoreBreakdown {
  const priority = priorityPoints(task.priority)
  const due = duePoints(task.due, now)
  const status = statusPoints(task.status)
  const type = typePoints(task.task_type)
  const project =
    priorityPoints(ctx.project?.priority) * 0.45 + healthPoints(ctx.project?.health)
  const client =
    priorityPoints(ctx.client?.priority) * 0.35 + healthPoints(ctx.client?.health) * 0.75
  const total = priority + due + status + type + project + client
  return { total, priority, due, status, type, project, client }
}

export function compareTasksByFocus(
  a: CompassTask,
  b: CompassTask,
  ctxFor: (task: CompassTask) => TaskFocusContext,
  now = new Date()
): number {
  const scoreDiff =
    taskFocusScore(b, ctxFor(b), now).total - taskFocusScore(a, ctxFor(a), now).total
  if (scoreDiff !== 0) return scoreDiff
  const priDiff = prioritySortKey(a.priority) - prioritySortKey(b.priority)
  if (priDiff !== 0) return priDiff
  const aDue = daysUntilDue(a.due, now)
  const bDue = daysUntilDue(b.due, now)
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue
  if (aDue !== null && bDue === null) return -1
  if (aDue === null && bDue !== null) return 1
  return b.updated_at.localeCompare(a.updated_at)
}

/**
 * Today: open work that is due today/overdue, active (in progress/blocked),
 * or high-urgency (priority 1–2) even without a due date.
 * Week: today set ∪ due within 7 days ∪ open high-score work (top half of open).
 * All: every task (caller may still hide completed).
 */
export function matchesFocusWindow(
  task: CompassTask,
  window: FocusWindow,
  ctx: TaskFocusContext = {},
  now = new Date()
): boolean {
  if (window === 'all') return true
  if (!isOpenTask(task)) return false

  const days = daysUntilDue(task.due, now)
  const priority = normalizeTaskPriority(task.priority)
  const active = task.status === 'in-progress' || task.status === 'blocked'
  const dueSoonOrOverdue = days !== null && days <= 0
  const dueThisWeek = days !== null && days <= 7
  const highManual = priority === 1 || priority === 2

  if (window === 'today') {
    return active || dueSoonOrOverdue || (highManual && (days === null || days <= 2))
  }

  // week
  if (active || dueThisWeek || highManual) return true
  const score = taskFocusScore(task, ctx, now).total
  return score >= 35
}

export type TaskOrganisationFilters = {
  window: FocusWindow
  status: 'open' | 'all' | TaskStatus
  functionId: string | 'all'
  clientId: string | 'all'
  projectId: string | 'all'
  taskType: TaskType | 'all'
  hideCompleted: boolean
}

export function defaultTaskOrganisationFilters(): TaskOrganisationFilters {
  return {
    window: 'today',
    status: 'open',
    functionId: 'all',
    clientId: 'all',
    projectId: 'all',
    taskType: 'all',
    hideCompleted: true
  }
}

export function filterTasksForOrganisation(
  tasks: CompassTask[],
  filters: TaskOrganisationFilters,
  resolve: {
    projectOf: (task: CompassTask) => CompassProject | null | undefined
    ctxOf: (task: CompassTask) => TaskFocusContext
  },
  now = new Date()
): CompassTask[] {
  return tasks.filter((task) => {
    if (filters.hideCompleted && (task.status === 'completed' || task.status === 'cancelled')) {
      if (filters.window !== 'all' || filters.status === 'open') return false
    }
    if (filters.status === 'open' && !isOpenTask(task)) return false
    if (filters.status !== 'open' && filters.status !== 'all' && task.status !== filters.status) {
      return false
    }
    if (!matchesFocusWindow(task, filters.window, resolve.ctxOf(task), now)) return false

    const project = resolve.projectOf(task)
    const functionId = task.business_function_id ?? project?.business_function_id ?? null
    if (filters.functionId !== 'all' && functionId !== filters.functionId) return false
    if (filters.projectId !== 'all' && task.project_id !== filters.projectId) return false
    if (filters.clientId !== 'all') {
      const clientId = project?.client_id ?? null
      if (clientId !== filters.clientId) return false
    }
    if (filters.taskType !== 'all' && task.task_type !== filters.taskType) return false
    return true
  })
}

export type TaskGroup = {
  key: string
  label: string
  items: CompassTask[]
}

export function groupTasks(
  tasks: CompassTask[],
  groupBy: TaskGroupBy,
  resolve: {
    projectOf: (task: CompassTask) => CompassProject | null | undefined
    functionOf: (task: CompassTask) => CompassBusinessFunction | null | undefined
  }
): TaskGroup[] {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'Tasks', items: tasks }]
  }

  const buckets = new Map<string, TaskGroup>()

  const ensure = (key: string, label: string) => {
    let group = buckets.get(key)
    if (!group) {
      group = { key, label, items: [] }
      buckets.set(key, group)
    }
    return group
  }

  for (const task of tasks) {
    const project = resolve.projectOf(task)
    if (groupBy === 'function') {
      const bf = resolve.functionOf(task)
      const id = task.business_function_id ?? project?.business_function_id ?? 'none'
      ensure(id, bf?.name ?? 'No function').items.push(task)
    } else if (groupBy === 'client') {
      const clientId = project?.client_id ?? 'none'
      const label = project?.client_name?.trim() || (clientId === 'none' ? 'No client' : 'Unknown client')
      ensure(clientId, label).items.push(task)
    } else if (groupBy === 'project') {
      const id = task.project_id ?? 'none'
      ensure(id, project?.name ?? 'No project').items.push(task)
    } else if (groupBy === 'type') {
      const key = task.task_type ?? 'none'
      ensure(key, task.task_type ?? 'No type').items.push(task)
    } else if (groupBy === 'status') {
      ensure(task.status, task.status).items.push(task)
    }
  }

  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label))
}
