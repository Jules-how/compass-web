'use client'

import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask
} from '@/lib/types'
import TaskList from '@/components/TaskList'
import { LoadingBlock } from '@/components/LoadingBlock'
import { useCachedJson } from '@/lib/use-cached-json'
import type { TaskClientMeta } from '@/lib/task-organisation'

interface TasksPayload {
  topTasks: CompassTask[]
  subtasks: CompassTask[]
  projects: CompassProject[]
  businessFunctions: CompassBusinessFunction[]
  clientsById?: Record<string, TaskClientMeta>
}

export function TasksPanel() {
  const { data, error, loading, reload } = useCachedJson<TasksPayload>('/api/tasks', '/api/tasks')

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void reload(true)}>
          Retry
        </button>
      </div>
    )
  }

  if (loading || !data) return <LoadingBlock label="Loading tasks…" />

  const subtasksByParent = data.subtasks.reduce<Record<string, CompassTask[]>>((acc, task) => {
    const key = task.parent_task_id ?? ''
    ;(acc[key] ??= []).push(task)
    return acc
  }, {})
  const projectsById = Object.fromEntries(data.projects.map((p) => [p.id, p]))
  const businessFunctionsById = Object.fromEntries(data.businessFunctions.map((b) => [b.id, b]))
  const clientsById = data.clientsById ?? {}

  return (
    <TaskList
      topTasks={data.topTasks}
      subtasksByParent={subtasksByParent}
      projectsById={projectsById}
      businessFunctionsById={businessFunctionsById}
      clientsById={clientsById}
      onRefresh={async () => {
        await reload(true)
      }}
    />
  )
}
