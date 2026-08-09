import type { FunctionWorkStats, TaskStatus } from '@/lib/types'

export function emptyFunctionStats(): FunctionWorkStats {
  return {
    projectCount: 0,
    activeProjectCount: 0,
    taskCount: 0,
    openTaskCount: 0,
    completedTaskCount: 0
  }
}

export function isActiveProjectStatus(status: string | null | undefined): boolean {
  const normalized = (status || '').trim().toLowerCase().replace(/\s+/g, '_')
  return normalized !== 'completed' && normalized !== 'cancelled' && normalized !== 'canceled'
}

export function isOpenTaskStatus(status: TaskStatus | string | null | undefined): boolean {
  return status !== 'completed' && status !== 'cancelled'
}

type ProjectStatRow = {
  id: string
  business_function_id: string | null
  status: string | null
}

type TaskStatRow = {
  id: string
  business_function_id: string | null
  project_id: string | null
  status: TaskStatus | string
  parent_task_id?: string | null
}

/**
 * Aggregate project/task counts per business function.
 * Tasks count when they are tagged with the function, or belong to a project in that function.
 */
export function computeFunctionStats(
  projects: ProjectStatRow[],
  tasks: TaskStatRow[]
): Map<string, FunctionWorkStats> {
  const stats = new Map<string, FunctionWorkStats>()
  const projectFunction = new Map<string, string>()

  for (const project of projects) {
    const functionId = project.business_function_id
    if (!functionId) continue
    projectFunction.set(project.id, functionId)
    const current = stats.get(functionId) ?? emptyFunctionStats()
    current.projectCount += 1
    if (isActiveProjectStatus(project.status)) current.activeProjectCount += 1
    stats.set(functionId, current)
  }

  const seenTasks = new Set<string>()
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
