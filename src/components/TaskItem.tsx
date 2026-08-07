'use client'

import { useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskStatus
} from '@/lib/types'
import { TASK_STATUSES } from '@/lib/types'
import NotesEditor from './NotesEditor'
import { executionObjective, executionReadiness } from '@/lib/execution-contract'

interface TaskItemProps {
  task: CompassTask
  subtasks: CompassTask[]
  projectsById: Record<string, CompassProject>
  businessFunctionsById: Record<string, CompassBusinessFunction>
  depth: number
  onChanged: () => void | Promise<void>
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

const STATUS_DOT: Record<TaskStatus, string> = {
  'not-started': 'bg-neutral-300',
  'in-progress': 'bg-blue-500',
  completed: 'bg-green-500',
  blocked: 'bg-red-500',
  cancelled: 'bg-neutral-400'
}

export default function TaskItem({
  task,
  subtasks,
  projectsById,
  businessFunctionsById,
  depth,
  onChanged
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const project = task.project_id ? projectsById[task.project_id] : null
  const bf = task.business_function_id ? businessFunctionsById[task.business_function_id] : null
  const hasSubtasks = subtasks.length > 0
  const contractReadiness = executionReadiness(task)
  const contractObjective = executionObjective(task.execution_contract)

  async function patchTask(payload: Partial<CompassTask>) {
    setUpdating(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdating(false)
    }
  }

  async function handleStatusChange(value: TaskStatus) {
    await patchTask({ status: value })
  }

  async function handleDelete() {
    if (!confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    setUpdating(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdating(false)
    }
  }

  const isCompleted = task.status === 'completed'

  return (
    <li>
      <div
        className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-neutral-300"
        style={{ marginLeft: depth * 16 }}
      >
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[task.status]}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-sm font-medium ${
                  isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-900'
                }`}
              >
                {task.title}
              </span>
              {project && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {project.client_name ? `${project.client_name} · ${project.name}` : project.name}
                </span>
              )}
              {bf && (
                <span className="rounded-full bg-sf-orange-light/40 px-2 py-0.5 text-xs text-sf-orange-dark">
                  {bf.name}
                </span>
              )}
              {task.due && (
                <span className="text-xs text-neutral-400">due {task.due}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
              disabled={updating}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs focus:border-sf-orange focus:outline-none"
              aria-label="Task status"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            {hasSubtasks && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100"
              >
                {expanded ? `Hide ${subtasks.length}` : `${subtasks.length} subtask${subtasks.length === 1 ? '' : 's'}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100"
            >
              {showNotes ? 'Hide notes' : 'Notes'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={updating}
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {expanded && <div className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500"><span className="font-medium">L{task.execution_level} · {task.execution_mode ?? 'Unspecified'} · {contractReadiness}</span>{contractObjective && <p className="mt-1">{contractObjective}</p>}</div>}

        {showNotes && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <NotesEditor task={task} />
          </div>
        )}
      </div>

      {expanded && hasSubtasks && (
        <ul className="mt-2 space-y-2">
          {subtasks.map((sub) => (
            <TaskItem
              key={sub.id}
              task={sub}
              subtasks={[]}
              projectsById={projectsById}
              businessFunctionsById={businessFunctionsById}
              depth={depth + 1}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
