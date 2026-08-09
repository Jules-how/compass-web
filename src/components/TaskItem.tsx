'use client'

import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask
} from '@/lib/types'
import {
  daysUntilDue,
  formatCreatedAt,
  type TaskClientMeta
} from '@/lib/task-organisation'
import {
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
  lingeringComplete?: boolean
  onOpen: (task: CompassTask) => void
  onToggleDone: (task: CompassTask) => void | Promise<void>
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
  return 'text-neutral-500'
}

function formatDue(due: string | null): string | null {
  if (!due) return null
  const days = daysUntilDue(due)
  const label = due.slice(0, 10)
  if (days === null) return label
  if (days < 0) return `${Math.abs(days)}d late`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return `${days}d`
  return label
}

export default function TaskItem({
  task,
  subtasks,
  projectsById,
  businessFunctionsById,
  clientsById = {},
  dense = true,
  depth,
  lingeringComplete = false,
  onOpen,
  onToggleDone
}: TaskItemProps) {
  const project = task.project_id ? projectsById[task.project_id] : null
  const bfId = task.business_function_id ?? project?.business_function_id ?? null
  const bf = bfId ? businessFunctionsById[bfId] : null
  const client =
    project?.client_id && clientsById[project.client_id]
      ? clientsById[project.client_id]
      : project?.client_name
        ? {
            id: project.client_id ?? '',
            name: project.client_name,
            priority: 0,
            health: 'no_updates'
          }
        : null
  const hasSubtasks = subtasks.length > 0
  const dueLabel = formatDue(task.due)
  const createdLabel = formatCreatedAt(task.created_at)
  const isCompleted = task.status === 'completed' || lingeringComplete
  const isCancelled = task.status === 'cancelled'

  return (
    <li>
      <div
        className={`grid grid-cols-[auto_minmax(0,1fr)_minmax(5.5rem,7.5rem)_minmax(4.5rem,6rem)_minmax(3.5rem,5rem)_auto] items-center gap-x-3 border-b border-stone-100 px-3 py-2.5 last:border-b-0 hover:bg-stone-50/80 ${
          isCompleted || isCancelled ? 'bg-stone-50/40' : ''
        } ${dense ? '' : ''}`}
        style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
      >
        <button
          type="button"
          onClick={() => void onToggleDone(task)}
          disabled={isCancelled}
          aria-label={isCompleted ? 'Mark as not done' : 'Mark as done'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
            isCompleted
              ? 'border-emerald-500 bg-emerald-500 text-white'
              : 'border-stone-300 bg-white text-transparent hover:border-sf-orange'
          } ${isCancelled ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path
              d="M3.5 8.2 6.4 11l6.1-6.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onOpen(task)}
          className="min-w-0 text-left"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`truncate text-sm ${
                isCompleted || isCancelled
                  ? 'text-neutral-400 line-through'
                  : 'font-medium text-neutral-900'
              }`}
            >
              {task.title}
            </span>
            {task.priority > 0 ? (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-semibold ring-1 ${priorityTone(task.priority)}`}
                title={taskPriorityLabel(task.priority)}
              >
                {taskPriorityShort(task.priority)}
              </span>
            ) : null}
            {task.task_type ? (
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                {task.task_type}
              </span>
            ) : null}
            {task.status === 'blocked' ? (
              <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                Blocked
              </span>
            ) : null}
            {task.status === 'in-progress' && !isCompleted ? (
              <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                In progress
              </span>
            ) : null}
            {lingeringComplete ? (
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                Done
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400 sm:hidden">
            {project ? <span>{project.name}</span> : null}
            {client ? <span>{client.name}</span> : null}
            {createdLabel ? <span>Created {createdLabel}</span> : null}
          </div>
        </button>

        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-xs text-neutral-700">{project?.name ?? '—'}</p>
          <p className="truncate text-[11px] text-neutral-400">
            {client?.name ?? bf?.name ?? 'No client'}
          </p>
        </div>

        <div className="hidden text-xs text-neutral-500 sm:block">
          {createdLabel ?? '—'}
        </div>

        <div className={`hidden text-xs sm:block ${dueTone(task.due)}`}>
          {dueLabel ?? '—'}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {hasSubtasks ? (
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-500">
              {subtasks.length}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onOpen(task)}
            className="rounded-xl border border-stone-200 px-2 py-1 text-[11px] text-neutral-600 transition hover:bg-white"
          >
            Open
          </button>
        </div>
      </div>

      {hasSubtasks ? (
        <ul className="border-l border-stone-100 bg-stone-50/40">
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
              lingeringComplete={false}
              onOpen={onOpen}
              onToggleDone={onToggleDone}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
