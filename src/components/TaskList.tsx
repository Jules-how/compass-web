'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskType
} from '@/lib/types'
import { TASK_TYPES } from '@/lib/types'
import TaskItem from './TaskItem'
import TaskCreate from './TaskCreate'
import TaskDetailPanel from './TaskDetailPanel'
import {
  compareTasksByManual,
  filterTasksForOrganisation,
  groupTasks,
  isDoneTask,
  isOpenTask,
  taskOrganisationFiltersFromSearch,
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
  focus: 'Focus',
  backlog: 'Backlog',
  done: 'Done'
}

const WINDOW_ORDER: FocusWindow[] = ['today', 'week', 'focus', 'backlog', 'done']
const LINGER_MS = 2200

export default function TaskList({
  topTasks,
  subtasksByParent,
  projectsById,
  businessFunctionsById,
  clientsById,
  onRefresh
}: TaskListProps) {
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [filters, setFilters] = useState<TaskOrganisationFilters>(() =>
    taskOrganisationFiltersFromSearch(searchParams)
  )
  const [groupBy, setGroupBy] = useState<TaskGroupBy>('none')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(
    () => searchParams.get('task')
  )
  const [completedOpen, setCompletedOpen] = useState(false)
  const [lingeringIds, setLingeringIds] = useState<Record<string, true>>({})
  const [togglingIds, setTogglingIds] = useState<Record<string, true>>({})
  const lingerTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const syncedQuery = useRef<string | null>(null)

  useEffect(() => {
    const key = searchParams.toString()
    if (syncedQuery.current === key) return
    syncedQuery.current = key
    setFilters(taskOrganisationFiltersFromSearch(searchParams))
    const taskId = searchParams.get('task')
    if (taskId) setSelectedTaskId(taskId)
  }, [searchParams])

  useEffect(() => {
    const timers = lingerTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

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
  const doneCount = useMemo(() => topTasks.filter(isDoneTask).length, [topTasks])

  const windowCounts = useMemo(() => {
    const counts = {} as Record<FocusWindow, number>
    for (const window of WINDOW_ORDER) {
      const base: TaskOrganisationFilters = {
        ...filters,
        window,
        status: window === 'done' ? 'all' : 'open',
        hideCompleted: window !== 'done'
      }
      counts[window] = filterTasksForOrganisation(topTasks, base, { projectOf, ctxOf }).length
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve fns are stable over props
  }, [topTasks, projectsById, clientsById, filters.functionId, filters.clientId, filters.projectId, filters.taskType])

  const visibleTasks = useMemo(() => {
    const filtered = filterTasksForOrganisation(topTasks, filters, { projectOf, ctxOf })
    const withLinger =
      filters.window === 'done'
        ? filtered
        : [
            ...filtered,
            ...topTasks.filter(
              (task) => lingeringIds[task.id] && isDoneTask(task) && !filtered.some((row) => row.id === task.id)
            )
          ]
    return [...withLinger].sort((a, b) => {
      const aLinger = lingeringIds[a.id] ? 1 : 0
      const bLinger = lingeringIds[b.id] ? 1 : 0
      if (aLinger !== bLinger) return bLinger - aLinger
      return compareTasksByManual(a, b)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTasks, filters, projectsById, clientsById, lingeringIds])

  const completedTasks = useMemo(() => {
    if (filters.window === 'done') return []
    return topTasks
      .filter((task) => isDoneTask(task) && !lingeringIds[task.id])
      .filter((task) => {
        const project = projectOf(task)
        const functionId = task.business_function_id ?? project?.business_function_id ?? null
        if (filters.functionId !== 'all' && functionId !== filters.functionId) return false
        if (filters.projectId !== 'all' && task.project_id !== filters.projectId) return false
        if (filters.clientId !== 'all' && (project?.client_id ?? null) !== filters.clientId) return false
        if (filters.taskType !== 'all' && task.task_type !== filters.taskType) return false
        return true
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTasks, filters, projectsById, clientsById, lingeringIds])

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

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null
    return (
      topTasks.find((task) => task.id === selectedTaskId) ??
      Object.values(subtasksByParent)
        .flat()
        .find((task) => task.id === selectedTaskId) ??
      null
    )
  }, [selectedTaskId, topTasks, subtasksByParent])

  function patchFilters(patch: Partial<TaskOrganisationFilters>) {
    setFilters((prev) => {
      const next = { ...prev, ...patch }
      if (patch.window === 'done') {
        next.status = 'all'
        next.hideCompleted = false
      } else if (patch.window) {
        next.status = 'open'
        next.hideCompleted = true
      }
      return next
    })
  }

  function clearLinger(taskId: string) {
    const existing = lingerTimers.current.get(taskId)
    if (existing) {
      clearTimeout(existing)
      lingerTimers.current.delete(taskId)
    }
    setLingeringIds((prev) => {
      if (!prev[taskId]) return prev
      const next = { ...prev }
      delete next[taskId]
      return next
    })
  }

  async function handleToggleDone(task: CompassTask) {
    if (togglingIds[task.id] || task.status === 'cancelled') return
    const nextStatus = task.status === 'completed' ? 'not-started' : 'completed'
    setTogglingIds((prev) => ({ ...prev, [task.id]: true }))
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      if (nextStatus === 'completed' && filters.window !== 'done') {
        setLingeringIds((prev) => ({ ...prev, [task.id]: true }))
        clearTimeout(lingerTimers.current.get(task.id))
        lingerTimers.current.set(
          task.id,
          setTimeout(() => {
            clearLinger(task.id)
            setCompletedOpen(true)
          }, LINGER_MS)
        )
      } else {
        clearLinger(task.id)
      }
      await refresh()
    } catch {
      clearLinger(task.id)
    } finally {
      setTogglingIds((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
    }
  }

  const emptyMessage =
    topTasks.length === 0
      ? 'No tasks yet. Create one to get started.'
      : filters.window === 'done'
        ? 'No completed tasks yet.'
        : 'Nothing in this view. Try another tab or clear a filter.'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div
            className="compass-seg shrink-0 text-xs"
            role="tablist"
            aria-label="Task windows"
          >
            {WINDOW_ORDER.map((window) => (
              <button
                key={window}
                type="button"
                role="tab"
                aria-selected={filters.window === window}
                onClick={() => patchFilters({ window })}
                className={cn(
                  'compass-seg-btn',
                  filters.window === window && 'compass-seg-btn-active'
                )}
              >
                {WINDOW_LABELS[window]}
                <span className="ml-1.5 inline-block min-w-[1.25rem] text-right tabular-nums opacity-70">
                  {windowCounts[window]}
                </span>
              </button>
            ))}
          </div>
          <p className="min-w-[11.5rem] text-xs tabular-nums text-neutral-500">
            {visibleTasks.length} shown · {openCount} open · {doneCount} done
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="compass-btn-primary shrink-0"
        >
          {creating ? 'Cancel' : 'New task'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.functionId}
          onChange={(e) => patchFilters({ functionId: e.target.value })}
          className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs"
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
          className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs"
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
          className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs"
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
          onChange={(e) => patchFilters({ taskType: e.target.value as TaskType | 'all' })}
          className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs"
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
          className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-xs"
          aria-label="Group tasks"
        >
          <option value="none">No grouping</option>
          <option value="project">Group by project</option>
          <option value="client">Group by client</option>
          <option value="function">Group by function</option>
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

      <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-soft">
        <div className="hidden grid-cols-[auto_minmax(0,1fr)_minmax(5.5rem,7.5rem)_minmax(4.5rem,6rem)_minmax(3.5rem,5rem)_auto] gap-x-3 border-b border-stone-100 bg-stone-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 sm:grid">
          <span className="w-5" />
          <span>Task</span>
          <span>Project</span>
          <span>Created</span>
          <span>Due</span>
          <span className="text-right"> </span>
        </div>
        {visibleTasks.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-neutral-500">{emptyMessage}</div>
        ) : (
          groups.map((group) => (
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
                    lingeringComplete={Boolean(lingeringIds[task.id])}
                    onOpen={(row) => setSelectedTaskId(row.id)}
                    onToggleDone={handleToggleDone}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {filters.window !== 'done' && completedTasks.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-soft">
          <button
            type="button"
            onClick={() => setCompletedOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-stone-50/80"
          >
            <div>
              <p className="text-sm font-medium text-neutral-800">Completed</p>
              <p className="text-xs text-neutral-500">
                Finished tasks park here · uncheck to reopen
              </p>
            </div>
            <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs tabular-nums text-neutral-600">
              {completedTasks.length}
              <span className="ml-2 text-neutral-400">{completedOpen ? 'Hide' : 'Show'}</span>
            </span>
          </button>
          {completedOpen ? (
            <ul className="border-t border-stone-100">
              {completedTasks.slice(0, 40).map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  subtasks={[]}
                  projectsById={projectsById}
                  businessFunctionsById={businessFunctionsById}
                  clientsById={clientsById}
                  dense
                  depth={0}
                  onOpen={(row) => setSelectedTaskId(row.id)}
                  onToggleDone={handleToggleDone}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailPanel
          task={selectedTask}
          projectsById={projectsById}
          businessFunctionsById={businessFunctionsById}
          onClose={() => setSelectedTaskId(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  )
}
