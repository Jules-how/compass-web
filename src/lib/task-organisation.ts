import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskStatus,
  TaskType
} from '@/lib/types'
import { normalizeTaskPriority, prioritySortKey } from '@/lib/task-priority'

export type FocusWindow = 'today' | 'week' | 'focus' | 'backlog' | 'done'
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

export function isDoneTask(task: Pick<CompassTask, 'status'>): boolean {
  return task.status === 'completed' || task.status === 'cancelled'
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
 * Kept for Home / legacy callers; My Tasks sorts manually instead.
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
  return compareTasksByManual(a, b, now)
}

/** Operator sort: priority you set → due date → newest created. */
export function compareTasksByManual(a: CompassTask, b: CompassTask, now = new Date()): number {
  const priDiff = prioritySortKey(a.priority) - prioritySortKey(b.priority)
  if (priDiff !== 0) return priDiff
  const aDue = daysUntilDue(a.due, now)
  const bDue = daysUntilDue(b.due, now)
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue
  if (aDue !== null && bDue === null) return -1
  if (aDue === null && bDue !== null) return 1
  const createdDiff = (b.created_at ?? '').localeCompare(a.created_at ?? '')
  if (createdDiff !== 0) return createdDiff
  return b.updated_at.localeCompare(a.updated_at)
}

export function isActiveTask(task: Pick<CompassTask, 'status'>): boolean {
  return task.status === 'in-progress' || task.status === 'blocked'
}

export function isFocusTask(
  task: CompassTask,
  now = new Date()
): boolean {
  if (!isOpenTask(task)) return false
  const days = daysUntilDue(task.due, now)
  const priority = normalizeTaskPriority(task.priority)
  const highManual = priority === 1 || priority === 2
  const dueSoon = days !== null && days <= 2
  return isActiveTask(task) || highManual || dueSoon
}

/** Cap for Home Priorities — curated Focus slice, not the full open plate. */
export const HOME_PRIORITY_LIMIT = 24

/**
 * Home Priorities = same Focus membership as My Tasks Focus window,
 * ordered with the same manual sort (priority → due → created).
 */
export function selectHomePriorities(tasks: CompassTask[], now = new Date()): CompassTask[] {
  return tasks
    .filter((task) => isFocusTask(task, now))
    .sort((a, b) => compareTasksByManual(a, b, now))
    .slice(0, HOME_PRIORITY_LIMIT)
}

export type PriorityPlateBucketKey =
  | 'overdue'
  | 'today'
  | 'nodate'
  | 'tomorrow'
  | 'week'
  | 'later'

export type PriorityPlateBucket = {
  key: PriorityPlateBucketKey
  label: string
  tasks: CompassTask[]
}

/**
 * Bucket a Focus/priority slice by due proximity.
 * Undated focus work sits near the top (after overdue) so Instantly
 * follow-ups and P1–P2 without dates are not buried under “Later”.
 */
export function bucketPriorityPlate(
  tasks: CompassTask[],
  now = new Date()
): PriorityPlateBucket[] {
  const today = startOfLocalDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const buckets: Record<PriorityPlateBucketKey, CompassTask[]> = {
    overdue: [],
    today: [],
    nodate: [],
    tomorrow: [],
    week: [],
    later: []
  }

  for (const task of tasks) {
    const days = daysUntilDue(task.due, now)
    if (days === null) {
      buckets.nodate.push(task)
      continue
    }
    if (days < 0) buckets.overdue.push(task)
    else if (days === 0) buckets.today.push(task)
    else if (days === 1) buckets.tomorrow.push(task)
    else if (days <= 7) buckets.week.push(task)
    else buckets.later.push(task)
  }

  const order: Array<{ key: PriorityPlateBucketKey; label: string }> = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Today' },
    { key: 'nodate', label: 'No date' },
    { key: 'tomorrow', label: 'Tomorrow' },
    { key: 'week', label: 'This week' },
    { key: 'later', label: 'Later' }
  ]

  return order
    .map(({ key, label }) => ({ key, label, tasks: buckets[key] }))
    .filter((bucket) => bucket.tasks.length > 0)
}

export function isFocusWindow(value: string | null | undefined): value is FocusWindow {
  return (
    value === 'today' ||
    value === 'week' ||
    value === 'focus' ||
    value === 'backlog' ||
    value === 'done'
  )
}

/** Deep-link into My Tasks with the matching window (and optional task). */
export function tasksHref(opts?: { window?: FocusWindow; taskId?: string | null }): string {
  const params = new URLSearchParams()
  if (opts?.window) params.set('window', opts.window)
  if (opts?.taskId) params.set('task', opts.taskId)
  const qs = params.toString()
  return qs ? `/tasks?${qs}` : '/tasks'
}

/**
 * Today: due today/overdue or actively working.
 * Week: due within 7 days or actively working.
 * Focus: P1–P2, active, or due within 2 days.
 * Backlog: open work that is not Focus.
 * Done: completed or cancelled.
 */
export function matchesFocusWindow(
  task: CompassTask,
  window: FocusWindow,
  _ctx: TaskFocusContext = {},
  now = new Date()
): boolean {
  if (window === 'done') return isDoneTask(task)
  if (!isOpenTask(task)) return false

  const days = daysUntilDue(task.due, now)
  const active = isActiveTask(task)
  const dueTodayOrOverdue = days !== null && days <= 0
  const dueThisWeek = days !== null && days <= 7

  if (window === 'today') {
    return active || dueTodayOrOverdue
  }
  if (window === 'week') {
    return active || dueThisWeek
  }
  if (window === 'focus') {
    return isFocusTask(task, now)
  }
  // backlog
  return !isFocusTask(task, now)
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

export function defaultTaskOrganisationFilters(
  window: FocusWindow = 'today'
): TaskOrganisationFilters {
  const done = window === 'done'
  return {
    window,
    status: done ? 'all' : 'open',
    functionId: 'all',
    clientId: 'all',
    projectId: 'all',
    taskType: 'all',
    hideCompleted: !done
  }
}

export function taskOrganisationFiltersFromSearch(
  search: URLSearchParams | { get: (key: string) => string | null }
): TaskOrganisationFilters {
  const windowParam = search.get('window')
  return defaultTaskOrganisationFilters(isFocusWindow(windowParam) ? windowParam : 'today')
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
    if (filters.window === 'done') {
      if (!isDoneTask(task)) return false
    } else {
      if (filters.hideCompleted && isDoneTask(task)) return false
      if (filters.status === 'open' && !isOpenTask(task)) return false
      if (filters.status !== 'open' && filters.status !== 'all' && task.status !== filters.status) {
        return false
      }
      if (!matchesFocusWindow(task, filters.window, resolve.ctxOf(task), now)) return false
    }

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

export function formatCreatedAt(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
