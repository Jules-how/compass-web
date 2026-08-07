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
import type { TaskClientMeta } from '@/lib/task-organisation'
import { daysUntilDue, taskFocusScore } from '@/lib/task-organisation'
import {
  TASK_PRIORITIES,
  normalizeTaskPriority,
  taskPriorityLabel,
  taskPriorityShort
} from '@/lib/task-priority'

interface TaskItemProps {
  task: CompassTask
  subtasks: CompassTask[]
  projectsById: Record<string, CompassProject>
  businessFunctionsById: Record<string, CompassBusinessFunction>
  clientsById?: Record<string, TaskClientMeta>
  dense?: boolean
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

function priorityTone(priority: number): string {
  switch (normalizeTaskPriority(priority)) {
    case 1:
      return 'bg-red-50 text-red-700 ring-red-200'
    case 2:
      return 'bg-orange-50 text-orange-700 ring-orange-200'
    case 3:
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 4:
      return 'bg-stone-100 text-stone-600 ring-stone-200'
    default:
      return 'bg-transparent text-neutral-400 ring-transparent'
  }
}

function dueTone(due: string | null): string {
  const days = daysUntilDue(due)
  if (days === null) return 'text-neutral-400'
  if (days < 0) return 'font-medium text-red-600'
  if (days === 0) return 'font-medium text-orange-700'
  if (days <= 2) return 'text-amber-700'
  return 'text-neutral-400'
}

function formatDue(due: string | null): string | null {
  if (!due) return null
  const days = daysUntilDue(due)
  const label = due.slice(0, 10)
  if (days === null) return label
  if (days < 0) return `${label} · ${Math.abs(days)}d late`
  if (days === 0) return `${label} · today`
  if (days === 1) return `${label} · tomorrow`
  if (days <= 7) return `${label} · ${days}d`
  return label
}

export default function TaskItem({
  task,
  subtasks,
  projectsById,
  businessFunctionsById,
  clientsById = {},
  dense = false,
  depth,
  onChanged
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const project = task.project_id ? projectsById[task.project_id] : null
  const bfId = task.business_function_id ?? project?.business_function_id ?? null
  const bf = bfId ? businessFunctionsById[bfId] : null
  const client =
    project?.client_id && clientsById[project.client_id]
      ? clientsById[project.client_id]
      : project?.client_name
        ? { id: project.client_id ?? '', name: project.client_name, priority: 0, health: 'no_updates' }
        : null
  const hasSubtasks = subtasks.length > 0
  const contractReadiness = executionReadiness(task)
  const contractObjective = executionObjective(task.execution_contract)
  const score = taskFocusScore(task, { project, client }).total
  const dueLabel = formatDue(task.due)
  const isCompleted = task.status === 'completed'

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

  async function handlePriorityChange(value: number) {
    await patchTask({ priority: value })
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

  const rowPad = dense ? 'px-3 py-2' : 'p-3'
  const shellClass = dense
    ? `border-b border-stone-100 last:border-b-0 hover:bg-stone-50/80 ${rowPad}`
    : `rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:border-neutral-300 ${rowPad}`

  return (
    <li>
      <div className={shellClass} style={dense ? undefined : { marginLeft: depth * 16 }}>
        <div className="flex items-center gap-2.5">
          <span
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[task.status]}`}
            title={STATUS_LABELS[task.status]}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={`text-sm ${
                  isCompleted ? 'text-neutral-400 line-through' : 'font-medium text-neutral-900'
                }`}
              >
                {task.title}
              </span>
              {task.priority > 0 ? (
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold ring-1 ${priorityTone(task.priority)}`}
                  title={taskPriorityLabel(task.priority)}
                >
                  {taskPriorityShort(task.priority)}
                </span>
              ) : null}
              {task.task_type ? (
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                  {task.task_type}
                </span>
              ) : null}
              {client ? (
                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-800">
                  {client.name}
                </span>
              ) : null}
              {project ? (
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-600">
                  {project.name}
                </span>
              ) : null}
              {bf ? (
                <span className="rounded bg-sf-orange-light/40 px-1.5 py-0.5 text-[11px] text-sf-orange-dark">
                  {bf.name}
                </span>
              ) : null}
              {dueLabel ? <span className={`text-[11px] ${dueTone(task.due)}`}>{dueLabel}</span> : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!dense ? (
              <span className="hidden text-[10px] tabular-nums text-neutral-300 sm:inline" title="Focus score">
                {Math.round(score)}
              </span>
            ) : (
              <span
                className="hidden w-7 text-right text-[10px] tabular-nums text-neutral-300 sm:inline"
                title={`Focus score ${Math.round(score)}`}
              >
                {Math.round(score)}
              </span>
            )}

            <select
              value={normalizeTaskPriority(task.priority)}
              onChange={(e) => handlePriorityChange(Number(e.target.value))}
              disabled={updating}
              className="max-w-[5.5rem] rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-[11px] focus:border-sf-orange focus:outline-none"
              aria-label="Task priority"
            >
              {TASK_PRIORITIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>

            <select
              value={task.status}
              onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
              disabled={updating}
              className="max-w-[7.5rem] rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-[11px] focus:border-sf-orange focus:outline-none"
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
                className="rounded-md border border-neutral-200 px-1.5 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-100"
              >
                {expanded ? `Hide ${subtasks.length}` : `${subtasks.length}`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="rounded-md border border-neutral-200 px-1.5 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-100"
            >
              {showNotes ? 'Hide' : 'Notes'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={updating}
              className="rounded-md border border-neutral-200 px-1.5 py-1 text-[11px] text-red-600 transition hover:bg-red-50"
            >
              Del
            </button>
          </div>
        </div>

        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        {expanded && (
          <div className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
            <span className="font-medium">
              L{task.execution_level} · {task.execution_mode ?? 'Unspecified'} · {contractReadiness}
            </span>
            {contractObjective && <p className="mt-1">{contractObjective}</p>}
          </div>
        )}

        {showNotes && (
          <div className="mt-2 border-t border-neutral-100 pt-2">
            <NotesEditor task={task} />
          </div>
        )}
      </div>

      {expanded && hasSubtasks && (
        <ul className={dense ? 'border-l border-stone-100 bg-stone-50/40' : 'mt-2 space-y-2'}>
          {subtasks.map((sub) => (
            <TaskItem
              key={sub.id}
              task={sub}
              subtasks={[]}
              projectsById={projectsById}
              businessFunctionsById={businessFunctionsById}
              clientsById={clientsById}
              dense={dense}
              depth={depth + 1}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
