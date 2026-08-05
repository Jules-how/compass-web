'use client'

import { useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask
} from '@/lib/types'
import TaskItem from './TaskItem'
import TaskCreate from './TaskCreate'

interface TaskListProps {
  topTasks: CompassTask[]
  subtasksByParent: Record<string, CompassTask[]>
  projectsById: Record<string, CompassProject>
  businessFunctionsById: Record<string, CompassBusinessFunction>
  onRefresh?: () => void | Promise<void>
}

export default function TaskList({
  topTasks,
  subtasksByParent,
  projectsById,
  businessFunctionsById,
  onRefresh
}: TaskListProps) {
  const [creating, setCreating] = useState(false)

  async function refresh() {
    await onRefresh?.()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-500">
          {topTasks.length} top-level task{topTasks.length === 1 ? '' : 's'}
        </h2>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-sf-orange px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sf-orange-dark"
        >
          {creating ? 'Cancel' : 'New task'}
        </button>
      </div>

      {creating && (
        <TaskCreate
          projectsById={projectsById}
          businessFunctionsById={businessFunctionsById}
          onCreated={async () => {
            setCreating(false)
            await refresh()
          }}
        />
      )}

      <ul className="space-y-2">
        {topTasks.length === 0 && (
          <li className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            No tasks yet. Create one to get started.
          </li>
        )}
        {topTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            subtasks={subtasksByParent[task.id] ?? []}
            projectsById={projectsById}
            businessFunctionsById={businessFunctionsById}
            depth={0}
            onChanged={refresh}
          />
        ))}
      </ul>
    </div>
  )
}
