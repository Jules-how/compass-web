'use client'

import { ArrowRight, Plus } from 'lucide-react'
import { workFetch } from '@/lib/workspace-change'

import { useEffect, useMemo, useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  CompassTask,
  TaskStatus,
} from '@/lib/types'
import TaskCreate from '@/components/TaskCreate'
import TaskDetailPanel from '@/components/TaskDetailPanel'
import { LoadingBlock } from '@/components/LoadingBlock'
import {
  KanbanBoard,
  type KanbanColumn,
  type KanbanTask,
} from '@/components/ui/kanban-board'
import { useCachedJson } from '@/lib/use-cached-json'
import { normalizeTaskPriority, prioritySortKey } from '@/lib/task-priority'
import type { TaskClientMeta } from '@/lib/task-organisation'

interface TasksPayload {
  topTasks: CompassTask[]
  subtasks: CompassTask[]
  projects: CompassProject[]
  businessFunctions: CompassBusinessFunction[]
  clientsById?: Record<string, TaskClientMeta>
}

const LANES: Array<{
  id: TaskStatus
  title: string
  color: string
  hint: string
}> = [
  { id: 'not-started', title: 'Todo', color: '#a8a29e', hint: 'Not started.' },
  {
    id: 'in-progress',
    title: 'In progress',
    color: '#e4b544',
    hint: 'In play today.',
  },
  {
    id: 'blocked',
    title: 'Blocked',
    color: '#b45309',
    hint: 'Waiting on someone else.',
  },
  {
    id: 'completed',
    title: 'Done',
    color: '#16a34a',
    hint: 'Finished or cancelled.',
  },
]

function laneForStatus(status: string): TaskStatus {
  if (status === 'in-progress') return 'in-progress'
  if (status === 'blocked') return 'blocked'
  if (status === 'completed' || status === 'cancelled' || status === 'done')
    return 'completed'
  return 'not-started'
}

function dueLabel(due: string | null): string | undefined {
  if (!due) return undefined
  const day = due.slice(0, 10)
  const parsed = new Date(`${day}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return day
  return parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function taskToKanban(
  task: CompassTask,
  projectsById: Record<string, CompassProject>,
): KanbanTask {
  const priority = normalizeTaskPriority(task.priority)
  const project = task.project_id ? projectsById[task.project_id] : null
  const tags = [project?.name].filter(Boolean) as string[]
  return {
    id: task.id,
    title: task.title,
    badge: priority === 1 ? 'Urgent' : priority === 2 ? 'High' : undefined,
    tags,
    dueDate: dueLabel(task.due),
  }
}

export function TasksPanel() {
  const { data, error, loading, reload } = useCachedJson<TasksPayload>(
    '/api/tasks',
    '/api/tasks',
  )
  const [view, setView] = useState<'list' | 'board'>('board')
  const [viewLoaded, setViewLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [pendingMoves, setPendingMoves] = useState<string[]>([])
  const [folder, setFolder] = useState<'open' | 'waiting' | 'completed'>('open')
  const [createLane, setCreateLane] = useState<TaskStatus | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('compass.tasks.view')
      if (stored === 'list' || stored === 'board') setView(stored)
    } catch { /* The board remains usable without local storage. */ }
    setViewLoaded(true)
  }, [])

  useEffect(() => {
    if (!viewLoaded) return
    try { localStorage.setItem('compass.tasks.view', view) } catch { /* Optional preference. */ }
  }, [view, viewLoaded])

  const filteredTasks = useMemo(() => (data?.topTasks ?? []).filter(task => {
    if (projectFilter === 'unassigned' && task.project_id) return false
    if (projectFilter !== 'all' && projectFilter !== 'unassigned' && task.project_id !== projectFilter) return false
    return !search.trim() || task.title.toLowerCase().includes(search.trim().toLowerCase())
  }), [data?.topTasks, search, projectFilter])

  const projectsById = useMemo(
    () =>
      Object.fromEntries(
        (data?.projects ?? []).map((project) => [project.id, project]),
      ),
    [data?.projects],
  )
  const businessFunctionsById = useMemo(
    () =>
      Object.fromEntries(
        (data?.businessFunctions ?? []).map((row) => [row.id, row]),
      ),
    [data?.businessFunctions],
  )

  const selectedTask = useMemo(() => {
    if (!selectedId || !data) return null
    return (
      data.topTasks.find((task) => task.id === selectedId) ??
      data.subtasks.find((task) => task.id === selectedId) ??
      null
    )
  }, [selectedId, data])

  const kanbanColumns = useMemo((): KanbanColumn[] => {
    const tasks = filteredTasks
    return LANES.map((lane) => ({
      id: lane.id,
      title: lane.title,
      color: lane.color,
      emptyText: 'Drop a task here.',
      onAdd: () => setCreateLane(lane.id),
      tasks: tasks
        .filter((task) => laneForStatus(task.status) === lane.id)
        .sort((a, b) => prioritySortKey(a.priority) - prioritySortKey(b.priority))
        .map((task) => ({ ...taskToKanban(task, projectsById), draggable: !pendingMoves.includes(task.id) })),
    }))
  }, [filteredTasks, projectsById, pendingMoves])

  async function moveTask(
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
  ) {
    if (fromColumnId === toColumnId) return
    if (!LANES.some((lane) => lane.id === toColumnId)) return
    if (pendingMoves.includes(taskId)) return
    setPendingMoves(current => [...current, taskId])
    setMoveError(null)
    setNote('Moving task…')
    try {
      const res = await workFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toColumnId, expected_updated_at: data?.topTasks.find(task => task.id === taskId)?.updated_at }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not move task. Please try again.')
      }
      setNote(
        `Moved to ${LANES.find((lane) => lane.id === toColumnId)?.title ?? toColumnId}.`,
      )
      await reload(true)
    } catch (err) {
      setNote(null)
      setMoveError(err instanceof Error ? err.message : 'Move failed')
    } finally {
      setPendingMoves(current => current.filter(id => id !== taskId))
    }
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button
          type="button"
          className="underline"
          onClick={() => void reload(true)}
        >
          Retry
        </button>
      </div>
    )
  }

  if (loading || !data) return <LoadingBlock label="Loading tasks…" />

  return (
    <div className="tasks-workspace space-y-4">
      {note || moveError ? <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {note ? (
            <p role="status" className="text-[12px] text-emerald-800">
              {note}
            </p>
          ) : null}
          {moveError ? (
            <p role="alert" className="text-[12px] text-red-700">
              {moveError}
            </p>
          ) : null}
        </div>
      </section> : null}

      {createLane ? (
        <TaskCreate
          projectsById={projectsById}
          businessFunctionsById={businessFunctionsById}
          defaultStatus={createLane}
          hideStatus
          onCancel={() => setCreateLane(null)}
          onCreated={async () => {
            setCreateLane(null)
            setNote('Task added.')
            await reload(true)
          }}
        />
      ) : null}

      <div className="tasks-workspace-toolbar">
        <div className="flex flex-wrap items-center gap-3">
          <span className="projects-view-label">All tasks <span>{filteredTasks.length}</span></span>
        <div className="compass-seg" aria-label="Task view">
          <button
            className={`compass-seg-btn ${view === 'list' ? 'compass-seg-btn-active' : ''}`}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            List
          </button>
          <button
            className={`compass-seg-btn ${view === 'board' ? 'compass-seg-btn-active' : ''}`}
            aria-pressed={view === 'board'}
            onClick={() => setView('board')}
          >
            Board
          </button>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="projects-search" type="search" aria-label="Search tasks" placeholder="Search tasks…"
            value={search} onChange={event => setSearch(event.target.value)} />
          <select className="tasks-project-filter" aria-label="Filter tasks by project" value={projectFilter} onChange={event => setProjectFilter(event.target.value)}>
            <option value="all">All projects</option>
            <option value="unassigned">No project</option>
            {data.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button type="button" className="compass-btn-primary" onClick={() => setCreateLane('not-started')}><Plus size={15} aria-hidden /> New task</button>
        </div>
      </div>
      {view === 'list' ? <div className="projects-view-switch" role="group" aria-label="Task status filter">
        {(['open', 'waiting', 'completed'] as const).map(value => <button key={value} type="button" aria-pressed={folder === value} onClick={() => setFolder(value)}>
          {value === 'open' ? 'Active' : value === 'waiting' ? 'Blocked' : 'Completed'}
        </button>)}
      </div> : null}
      {view === 'board' ? (
        <KanbanBoard
          columns={kanbanColumns}
          onMove={moveTask}
          onTaskClick={(id) => setSelectedId(id)}
        />
      ) : (
        <section className="folio-record-surface">
          <ul className="folio-task-list">
            {filteredTasks
              .filter((t) =>
                folder === 'open'
                  ? ['not-started', 'in-progress'].includes(
                      laneForStatus(t.status),
                    )
                  : folder === 'waiting'
                    ? t.status === 'blocked'
                    : laneForStatus(t.status) === 'completed',
              )
              .sort(
                (a, b) =>
                  prioritySortKey(a.priority) - prioritySortKey(b.priority),
              )
              .map((task) => (
                <li key={task.id}>
                  <button
                    className="folio-task-open"
                    onClick={() => setSelectedId(task.id)}
                  >
                    <span className="folio-status">
                      {laneForStatus(task.status) === 'in-progress'
                        ? 'In progress'
                        : laneForStatus(task.status) === 'blocked'
                          ? 'Waiting'
                          : laneForStatus(task.status) === 'completed'
                            ? 'Completed'
                            : 'Not started'}
                    </span>
                    <span>
                      <strong>{task.title}</strong>
                      <small>
                        {[
                          task.project_id
                            ? projectsById[task.project_id]?.name
                            : null,
                          dueLabel(task.due),
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No due date set'}
                      </small>
                    </span>
                    <ArrowRight size={16} />
                  </button>
                  <label className="folio-task-move">
                    <span className="sr-only">Move {task.title}</span>
                    <select
                      className="compass-input"
                      value={laneForStatus(task.status)}
                      onChange={(e) =>
                        void moveTask(
                          task.id,
                          laneForStatus(task.status),
                          e.target.value,
                        )
                      }
                    >
                      {LANES.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
          </ul>
          {!filteredTasks.some((t) =>
            folder === 'open'
              ? ['not-started', 'in-progress'].includes(laneForStatus(t.status))
              : folder === 'waiting'
                ? t.status === 'blocked'
                : laneForStatus(t.status) === 'completed',
          ) ? (
            <div className="folio-quiet">
              <p>
                {search.trim() || projectFilter !== 'all'
                  ? 'No tasks match these filters.'
                  : folder === 'open'
                  ? 'No tasks ready to move. Capture a new task or review waiting work.'
                  : folder === 'waiting'
                    ? 'No blocked tasks.'
                    : 'Completed tasks will appear here.'}
              </p>
            </div>
          ) : null}
        </section>
      )}

      {selectedTask ? (
        <TaskDetailPanel
          task={selectedTask}
          projectsById={projectsById}
          businessFunctionsById={businessFunctionsById}
          onClose={() => setSelectedId(null)}
          onChanged={async () => {
            await reload(true)
          }}
        />
      ) : null}
    </div>
  )
}
