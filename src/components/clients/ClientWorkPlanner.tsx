'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type {
  CompassProjectWithStats,
  CompassTask,
  TaskStatus
} from '@/lib/types'
import { TASK_STATUSES } from '@/lib/types'
import { formatPercentComplete } from '@/lib/project-stats'
import {
  PROJECT_BOARD_STATUSES,
  PROJECT_PRIORITIES,
  formatProjectDate,
  normalizeProjectStatus,
  projectHealthLabel,
  projectPriorityLabel,
  projectStatusLabel,
  type ProjectBoardStatus
} from '@/lib/project-pm'
import {
  computeTimelineBounds,
  dateToTimelinePercent,
  timelineBarLayout
} from '@/lib/work-timeline'

type ViewMode = 'list' | 'board' | 'timeline'

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  'not-started': 'Todo',
  'in-progress': 'In progress',
  completed: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

function statusTone(status: string): string {
  switch (normalizeProjectStatus(status)) {
    case 'in_progress':
      return 'bg-sky-50 text-sky-700 ring-sky-200'
    case 'planned':
      return 'bg-violet-50 text-violet-700 ring-violet-200'
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'canceled':
      return 'bg-neutral-100 text-neutral-500 ring-neutral-200'
    default:
      return 'bg-stone-100 text-stone-600 ring-stone-200'
  }
}

function taskTone(status: TaskStatus): string {
  switch (status) {
    case 'in-progress':
      return 'border-amber-300 bg-amber-50'
    case 'completed':
      return 'border-sky-300 bg-sky-50'
    case 'blocked':
      return 'border-red-300 bg-red-50'
    case 'cancelled':
      return 'border-neutral-300 bg-neutral-50'
    default:
      return 'border-stone-200 bg-white'
  }
}

export function ClientWorkPlanner({
  clientId,
  projects,
  tasks,
  onRefresh,
  compact = false
}: {
  clientId: string
  projects: CompassProjectWithStats[]
  tasks: CompassTask[]
  onRefresh: () => void | Promise<void>
  compact?: boolean
}) {
  const [view, setView] = useState<ViewMode>('list')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)

  const [projectName, setProjectName] = useState('')
  const [projectStatus, setProjectStatus] = useState<ProjectBoardStatus>('planned')
  const [projectPriority, setProjectPriority] = useState(0)
  const [projectStart, setProjectStart] = useState('')
  const [projectTarget, setProjectTarget] = useState('')

  const [taskTitle, setTaskTitle] = useState('')
  const [taskProjectId, setTaskProjectId] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [taskPriority, setTaskPriority] = useState(0)

  const tasksByProject = useMemo(() => {
    const map = new Map<string, CompassTask[]>()
    for (const task of tasks) {
      if (!task.project_id) continue
      const list = map.get(task.project_id) ?? []
      list.push(task)
      map.set(task.project_id, list)
    }
    return map
  }, [tasks])

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) => {
        const byStatus =
          PROJECT_BOARD_STATUSES.indexOf(normalizeProjectStatus(a.status)) -
          PROJECT_BOARD_STATUSES.indexOf(normalizeProjectStatus(b.status))
        if (byStatus !== 0) return byStatus
        return (a.target_date || '9999').localeCompare(b.target_date || '9999') || a.name.localeCompare(b.name)
      }),
    [projects]
  )

  const timelineBounds = useMemo(() => {
    const dates: Array<string | null | undefined> = []
    for (const project of projects) {
      dates.push(project.start_date, project.target_date)
    }
    for (const task of tasks) {
      dates.push(task.due)
    }
    return computeTimelineBounds(dates)
  }, [projects, tasks])

  const todayPercent =
    dateToTimelinePercent(timelineBounds.today.toISOString().slice(0, 10), timelineBounds) ?? 0

  async function createProject(event: React.FormEvent) {
    event.preventDefault()
    if (!projectName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim(),
          client_id: clientId,
          status: projectStatus,
          priority: projectPriority,
          start_date: projectStart || null,
          target_date: projectTarget || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setProjectName('')
      setProjectStatus('planned')
      setProjectPriority(0)
      setProjectStart('')
      setProjectTarget('')
      setCreatingProject(false)
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function createTask(event: React.FormEvent) {
    event.preventDefault()
    const projectId = taskProjectId || sortedProjects[0]?.id
    if (!taskTitle.trim() || !projectId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle.trim(),
          project_id: projectId,
          due: taskDue || null,
          priority: taskPriority,
          status: 'not-started',
          source: 'compass-web'
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setTaskTitle('')
      setTaskDue('')
      setTaskPriority(0)
      setCreatingTask(false)
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function patchProject(projectId: string, patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function patchTask(taskId: string, patch: Record<string, unknown>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const defaultTaskProjectId = taskProjectId || sortedProjects[0]?.id || ''

  return (
    <section className="compass-panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-neutral-900">
            {compact ? 'Projects & tasks' : 'Plan work'}
          </h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Client-scoped projects and tasks — same records as your main boards.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="compass-seg text-xs">
            {(['list', 'board', 'timeline'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`compass-seg-btn capitalize ${view === mode ? 'compass-seg-btn-active' : ''}`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setCreatingProject((value) => !value)
              setCreatingTask(false)
            }}
            className="compass-btn-primary"
          >
            {creatingProject ? 'Cancel' : 'New project'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingTask((value) => !value)
              setCreatingProject(false)
              if (!taskProjectId && sortedProjects[0]) setTaskProjectId(sortedProjects[0].id)
            }}
            disabled={sortedProjects.length === 0}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-stone-50 disabled:opacity-50"
          >
            {creatingTask ? 'Cancel' : 'New task'}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {creatingProject ? (
        <form
          onSubmit={createProject}
          className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-4 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Project name</span>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Website rebuild, Meta ads launch…"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
              disabled={saving}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Status</span>
            <select
              value={projectStatus}
              onChange={(e) => setProjectStatus(e.target.value as ProjectBoardStatus)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            >
              {PROJECT_BOARD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {projectStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Priority</span>
            <select
              value={projectPriority}
              onChange={(e) => setProjectPriority(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            >
              {PROJECT_PRIORITIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Start</span>
            <input
              type="date"
              value={projectStart}
              onChange={(e) => setProjectStart(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Target</span>
            <input
              type="date"
              value={projectTarget}
              onChange={(e) => setProjectTarget(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !projectName.trim()}
              className="compass-btn-primary"
            >
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      ) : null}

      {creatingTask ? (
        <form
          onSubmit={createTask}
          className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-4 sm:grid-cols-2"
        >
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-neutral-500">Task</span>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What needs doing?"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
              disabled={saving}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Project</span>
            <select
              value={defaultTaskProjectId}
              onChange={(e) => setTaskProjectId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            >
              {sortedProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Due</span>
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-neutral-500">Priority</span>
            <select
              value={taskPriority}
              onChange={(e) => setTaskPriority(Number(e.target.value))}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-2"
              disabled={saving}
            >
              {PROJECT_PRIORITIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || !taskTitle.trim() || !defaultTaskProjectId}
              className="compass-btn-primary"
            >
              {saving ? 'Adding…' : 'Add task'}
            </button>
          </div>
        </form>
      ) : null}

      {view === 'list' ? (
        <div className="space-y-3">
          {sortedProjects.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-neutral-500">
              No projects yet. Create one to plan tasks on a timeline for this client.
            </p>
          ) : (
            sortedProjects.map((project) => {
              const projectTasks = tasksByProject.get(project.id) ?? []
              return (
                <article
                  key={project.id}
                  className="overflow-hidden rounded-xl border border-stone-200 bg-white"
                >
                  <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-neutral-900 hover:text-sf-orange-dark"
                      >
                        {project.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span
                          className={`rounded-md px-1.5 py-0.5 font-medium ring-1 ring-inset ${statusTone(
                            project.status
                          )}`}
                        >
                          {projectStatusLabel(project.status)}
                        </span>
                        <span>{projectPriorityLabel(project.priority)}</span>
                        <span>{projectHealthLabel(project.health)}</span>
                        <span>
                          {formatProjectDate(project.start_date)} → {formatProjectDate(project.target_date)}
                        </span>
                      </div>
                    </div>
                    <select
                      value={normalizeProjectStatus(project.status)}
                      onChange={(e) => void patchProject(project.id, { status: e.target.value })}
                      className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                      disabled={saving}
                    >
                      {PROJECT_BOARD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {projectStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs tabular-nums text-neutral-500">
                      {formatPercentComplete(project.stats.percentComplete)} ·{' '}
                      {project.stats.completedCount}/{project.stats.issueCount}
                    </div>
                  </div>
                  {projectTasks.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-neutral-400">No tasks in this project yet.</p>
                  ) : (
                    <ul className="divide-y divide-stone-50">
                      {projectTasks.map((task) => (
                        <li
                          key={task.id}
                          className={`flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm ${taskTone(
                            task.status
                          )}`}
                        >
                          <span className="min-w-0 flex-1 font-medium text-neutral-900">{task.title}</span>
                          <span className="text-xs text-neutral-500">
                            Due {formatProjectDate(task.due)}
                          </span>
                          <select
                            value={task.status}
                            onChange={(e) => void patchTask(task.id, { status: e.target.value })}
                            className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                            disabled={saving}
                          >
                            {TASK_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {TASK_STATUS_LABEL[status]}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              )
            })
          )}
        </div>
      ) : null}

      {view === 'board' ? (
        <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
          {PROJECT_BOARD_STATUSES.map((status) => {
            const column = sortedProjects.filter(
              (project) => normalizeProjectStatus(project.status) === status
            )
            return (
              <section key={status} className="min-w-[180px] rounded-xl bg-stone-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    {projectStatusLabel(status)}
                  </h3>
                  <span className="text-xs tabular-nums text-neutral-400">{column.length}</span>
                </div>
                <ul className="space-y-2">
                  {column.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-stone-200 px-2 py-4 text-center text-xs text-neutral-400">
                      Empty
                    </li>
                  ) : (
                    column.map((project) => {
                      const projectTasks = tasksByProject.get(project.id) ?? []
                      const openTasks = projectTasks.filter(
                        (task) => task.status !== 'completed' && task.status !== 'cancelled'
                      )
                      return (
                        <li
                          key={project.id}
                          className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm"
                        >
                          <Link
                            href={`/projects/${project.id}`}
                            className="text-sm font-medium text-neutral-900 hover:text-sf-orange-dark"
                          >
                            {project.name}
                          </Link>
                          <div className="mt-1 text-[11px] text-neutral-500">
                            {formatProjectDate(project.start_date)} →{' '}
                            {formatProjectDate(project.target_date)}
                          </div>
                          <div className="mt-2 text-[11px] text-neutral-500">
                            {openTasks.length} open task{openTasks.length === 1 ? '' : 's'} ·{' '}
                            {formatPercentComplete(project.stats.percentComplete)}
                          </div>
                          <select
                            value={normalizeProjectStatus(project.status)}
                            onChange={(e) => void patchProject(project.id, { status: e.target.value })}
                            className="mt-2 w-full rounded border border-neutral-200 bg-white px-2 py-1 text-xs"
                            disabled={saving}
                          >
                            {PROJECT_BOARD_STATUSES.map((value) => (
                              <option key={value} value={value}>
                                Move to {projectStatusLabel(value)}
                              </option>
                            ))}
                          </select>
                          {openTasks.slice(0, 3).map((task) => (
                            <div
                              key={task.id}
                              className="mt-2 truncate rounded border border-stone-100 bg-stone-50 px-2 py-1 text-[11px] text-neutral-700"
                            >
                              {task.title}
                            </div>
                          ))}
                        </li>
                      )
                    })
                  )}
                </ul>
              </section>
            )
          })}
        </div>
      ) : null}

      {view === 'timeline' ? (
        <div className="overflow-x-auto">
          <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {formatProjectDate(timelineBounds.start.toISOString().slice(0, 10))} →{' '}
              {formatProjectDate(timelineBounds.end.toISOString().slice(0, 10))}
            </span>
            <span>Today</span>
          </div>
          <div className="min-w-[720px] space-y-4">
            {sortedProjects.length === 0 ? (
              <p className="py-10 text-center text-sm text-neutral-500">
                No projects on the timeline. Add start and target dates when you create a project.
              </p>
            ) : (
              sortedProjects.map((project) => {
                const { left, width } = timelineBarLayout(
                  project.start_date,
                  project.target_date,
                  timelineBounds,
                  todayPercent
                )
                const projectTasks = (tasksByProject.get(project.id) ?? []).filter((task) => task.due)
                return (
                  <div key={project.id} className="space-y-1.5">
                    <div className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${project.id}`}
                          className="block truncate text-sm font-medium text-neutral-800 hover:text-sf-orange-dark"
                        >
                          {project.name}
                        </Link>
                        <div className="text-[11px] text-neutral-400">
                          {projectStatusLabel(project.status)}
                        </div>
                      </div>
                      <div className="relative h-8 rounded-md bg-stone-100">
                        <div
                          className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-500"
                          style={{ left: `${todayPercent}%` }}
                        />
                        <Link
                          href={`/projects/${project.id}`}
                          className="absolute top-1/2 h-5 -translate-y-1/2 truncate rounded-full bg-sf-orange/85 px-2 text-[10px] font-medium leading-5 text-white"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${formatProjectDate(project.start_date)} – ${formatProjectDate(project.target_date)}`}
                        >
                          {project.name}
                        </Link>
                      </div>
                    </div>
                    {projectTasks.map((task) => {
                      const duePct = dateToTimelinePercent(task.due, timelineBounds) ?? todayPercent
                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-3"
                        >
                          <div className="truncate pl-3 text-xs text-neutral-500">{task.title}</div>
                          <div className="relative h-5">
                            <div
                              className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-500/40"
                              style={{ left: `${todayPercent}%` }}
                            />
                            <div
                              className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                                task.status === 'completed'
                                  ? 'border-sky-500 bg-sky-500'
                                  : task.status === 'blocked'
                                    ? 'border-red-500 bg-red-100'
                                    : 'border-sf-orange bg-white'
                              }`}
                              style={{ left: `${duePct}%` }}
                              title={`${task.title} · due ${formatProjectDate(task.due)}`}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
