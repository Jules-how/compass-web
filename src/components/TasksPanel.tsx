'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask
} from '@/lib/types'
import TaskList from '@/components/TaskList'
import { LoadingBlock } from '@/components/LoadingBlock'

interface TasksPayload {
  topTasks: CompassTask[]
  subtasks: CompassTask[]
  projects: CompassProject[]
  businessFunctions: CompassBusinessFunction[]
}

export function TasksPanel() {
  const [data, setData] = useState<TasksPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/tasks', { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Failed to load tasks (${res.status})`)
      const body = (await res.json()) as TasksPayload
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  if (!data) return <LoadingBlock label="Loading tasks…" />

  const subtasksByParent = data.subtasks.reduce<Record<string, CompassTask[]>>((acc, task) => {
    const key = task.parent_task_id ?? ''
    ;(acc[key] ??= []).push(task)
    return acc
  }, {})
  const projectsById = Object.fromEntries(data.projects.map((p) => [p.id, p]))
  const businessFunctionsById = Object.fromEntries(data.businessFunctions.map((b) => [b.id, b]))

  return (
    <TaskList
      topTasks={data.topTasks}
      subtasksByParent={subtasksByParent}
      projectsById={projectsById}
      businessFunctionsById={businessFunctionsById}
      onRefresh={load}
    />
  )
}
