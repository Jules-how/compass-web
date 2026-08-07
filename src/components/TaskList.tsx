'use client'

import { useMemo, useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskStatus,
  TaskType
} from '@/lib/types'
import { TASK_STATUSES, TASK_TYPES } from '@/lib/types'
import TaskItem from './TaskItem'
import TaskCreate from './TaskCreate'
import {
  compareTasksByFocus,
  defaultTaskOrganisationFilters,
  filterTasksForOrganisation,
  groupTasks,
  isOpenTask,
  type FocusWindow,
  type TaskClientMeta,
  type TaskFocusContext,
  type TaskGroupBy,
  type TaskOrganisationFilters
} from '@/lib/task-organisation'

interface TaskListProps {
  topTasks: CompassTask[]
  subtasksByParent: Record<string, CompassTask[]>
  projectsById: Record<string, CompassProject>
  businessFunctionsById: Record<string, CompassBusinessFunction>
  clientsById: Record<string, TaskClientMeta>
  onRefresh?: () => void | Promise<void>
}

const WINDOW_LABELS: Record<FocusWindow, string> = {
  today: 'Today',
  week: 'This week',
  all: 'All'
}

const STATUS_FILTER_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

export default function TaskList({
  topTasks,
  subtasksByParent,
  projectsById,
  businessFunctionsById,
  clientsById,
  onRefresh
}: TaskListProps) {
  const [creating, setCreating] = useState(false)
  const [filters, setFilters] = useState<TaskOrganisationFilters>(defaultTaskOrganisationFilters)
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('function')

  async function refresh() {
    await onRefresh?.()
  }

  const projectOf = (task: CompassTask) =>
    task.project_id ? projectsById[task.project_id] : null

  const ctxOf = (task: CompassTask): TaskFocusContext => {
    const project = projectOf(task)
    const client = project?.client_id ? clientsById[project.client_id] : null
    return { project, client }
  }

  const functionOf = (task: CompassTask) => {
    const project = projectOf(task)
    const id = task.business_function_id ?? project?.business_function_id
    return id ? businessFunctionsById[id] : null
  }

  const openCount = useMemo(() => topTasks.filter(isOpenTask).length, [topTasks])

  const windowCounts = useMemo(() => {
    const base = { ...filters, status: 'open' as const, hideCompleted: true }
    return {
      today: filterTasksForOrganisation(
        topTasks,
        { ...base, window: 'today' },
        { projectOf, ctxOf }
      ).length,
      week: filterTasksForOrganisation(
        topTasks,
        { ...base, window: 'week' },
        { projectOf, ctxOf }
      ).length,
      all: openCount
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve fns are stable over props
  }, [topTasks, projectsById, clientsById, openCount, filters.status, filters.hideCompleted])

  const visibleTasks = useMemo(() => {
    const filtered = filterTasksForOrganisation(topTasks, filters, { projectOf, ctxOf })
    return [...filtered].sort((a, b) => compareTasksByFocus(a, b, ctxOf))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTasks, filters, projectsById, clientsById])

  const groups = useMemo(
    () => groupTasks(visibleTasks, groupBy, { projectOf, functionOf }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleTasks, groupBy, projectsById, businessFunctionsById]
  )

  const clientOptions = useMemo(() => {
    return Object.values(clientsById).sort((a, b) => a.name.localeCompare(b.name))
  }, [clientsById])

  const projectOptions = useMemo(() => {
    return Object.values(projectsById).sort((a, b) => a.name.localeCompare(b.name))
  }, [projectsById])

  const bfOptions = useMemo(() => {
    return Object.values(businessFunctionsById).sort((a, b) => a.sort_order - b.sort_order)
  }, [businessFunctionsById])

  function patchFilters(patch: Partial<TaskOrganisationFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-xs">
            {(Object.keys(WINDOW_LABELS) as FocusWindow[]).map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => patchFilters({ window })}
                className={`rounded-md px-2.5 py-1.5 font-medium transition ${
                  filters.window === window
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {WINDOW_LABELS[window]}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {windowCounts[window]}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            {visibleTasks.length} shown · {openCount} open · {topTasks.length} total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="compass-btn-primary"
        >
          {creating ? 'Cancel' : 'New task'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.status}
          onChange={(e) =>
            patchFilters({
              status: e.target.value as TaskOrganisationFilters['status'],
              hideCompleted: e.target.value === 'open'
            })
          }
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Filter by status"
        >
          <option value="open">Open only</option>
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_FILTER_LABELS[status]}
            </option>
          ))}
        </select>

        <select
          value={filters.functionId}
          onChange={(e) => patchFilters({ functionId: e.target.value })}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Filter by function"
        >
          <option value="all">All functions</option>
          {bfOptions.map((bf) => (
            <option key={bf.id} value={bf.id}>
              {bf.name}
            </option>
          ))}
        </select>

        <select
          value={filters.clientId}
          onChange={(e) => patchFilters({ clientId: e.target.value })}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Filter by client"
        >
          <option value="all">All clients</option>
          {clientOptions.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>

        <select
          value={filters.projectId}
          onChange={(e) => patchFilters({ projectId: e.target.value })}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Filter by project"
        >
          <option value="all">All projects</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          value={filters.taskType}
          onChange={(e) =>
            patchFilters({ taskType: e.target.value as TaskType | 'all' })
          }
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {TASK_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as TaskGroupBy)}
          className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Group tasks"
        >
          <option value="none">No grouping</option>
          <option value="function">Group by function</option>
          <option value="client">Group by client</option>
          <option value="project">Group by project</option>
          <option value="type">Group by type</option>
          <option value="status">Group by status</option>
        </select>
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

      {visibleTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300/80 bg-stone-50/40 px-4 py-12 text-center text-sm text-neutral-500">
          {topTasks.length === 0
            ? 'No tasks yet. Create one to get started.'
            : 'Nothing in this focus window. Try This week or All, or clear a filter.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-soft">
          {groups.map((group) => (
            <section key={group.key} className="border-b border-stone-100 last:border-b-0">
              {groupBy !== 'none' ? (
                <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/95 px-3 py-1.5 backdrop-blur">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {group.label}
                  </h3>
                  <span className="text-[11px] tabular-nums text-neutral-400">
                    {group.items.length}
                  </span>
                </header>
              ) : null}
              <ul>
                {group.items.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    subtasks={subtasksByParent[task.id] ?? []}
                    projectsById={projectsById}
                    businessFunctionsById={businessFunctionsById}
                    clientsById={clientsById}
                    dense
                    depth={0}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
