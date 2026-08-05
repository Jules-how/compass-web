'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProjectWithStats,
  CompassTask,
  TaskStatus
} from '@/lib/types'
import { formatPercentComplete } from '@/lib/project-stats'
import { LoadingBlock } from '@/components/LoadingBlock'
import TaskCreate from '@/components/TaskCreate'

type TabKey = 'overview' | 'issues'

const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const

const STATUS_LABEL: Record<TaskStatus, string> = {
  'not-started': 'Backlog',
  'in-progress': 'In progress',
  completed: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

interface ProjectDetailPayload {
  project: CompassProjectWithStats
  tasks: CompassTask[]
  businessFunction: CompassBusinessFunction | null
  functions: CompassBusinessFunction[]
}

export function ProjectDetailPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [saving, setSaving] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState<(typeof PROJECT_STATUSES)[number]>('active')
  const [editFunctionId, setEditFunctionId] = useState('')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { Accept: 'application/json' }
      })
      if (res.status === 404) throw new Error('Project not found')
      if (!res.ok) throw new Error(`Failed to load project (${res.status})`)
      const body = (await res.json()) as ProjectDetailPayload
      setData(body)
      setEditNotes(body.project.notes ?? '')
      setEditStatus(
        (PROJECT_STATUSES.includes(body.project.status as (typeof PROJECT_STATUSES)[number])
          ? body.project.status
          : 'active') as (typeof PROJECT_STATUSES)[number]
      )
      setEditFunctionId(body.project.business_function_id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const projectsById = useMemo(() => {
    if (!data) return {}
    return { [data.project.id]: data.project }
  }, [data])

  const businessFunctionsById = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(data.functions.map((fn) => [fn.id, fn]))
  }, [data])

  const sortedFunctions = useMemo(() => {
    if (!data) return []
    return [...data.functions].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    )
  }, [data])

  async function saveOverview(event: React.FormEvent) {
    event.preventDefault()
    if (!data) return
    setSaving(true)
    setSaveMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          business_function_id: editFunctionId || null,
          notes: editNotes.trim() || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setSaveMessage('Saved')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <Link href="/projects" className="underline">
          Back to projects
        </Link>
      </div>
    )
  }

  if (!data) return <LoadingBlock label="Loading project…" />

  const { project, tasks, businessFunction } = data
  const topTasks = tasks.filter((task) => !task.parent_task_id)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Link href="/projects" className="hover:text-neutral-800">
            Projects
          </Link>
          <span>/</span>
          <span className="font-medium text-neutral-800">{project.name}</span>
        </div>
        <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-sm">
          {(
            [
              ['overview', 'Overview'],
              ['issues', `Issues (${tasks.length})`]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                tab === key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="compass-panel space-y-5 p-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-neutral-900">{project.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {businessFunction?.name ?? 'No function'} · {project.status}
              </p>
            </div>

            <form onSubmit={saveOverview} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Description
                </span>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={6}
                  placeholder="Add a project description…"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  disabled={saving}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Status</span>
                  <select
                    value={editStatus}
                    onChange={(e) =>
                      setEditStatus(e.target.value as (typeof PROJECT_STATUSES)[number])
                    }
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    disabled={saving}
                  >
                    {PROJECT_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-neutral-500">Function</span>
                  <select
                    value={editFunctionId}
                    onChange={(e) => setEditFunctionId(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    disabled={saving}
                  >
                    <option value="">—</option>
                    {sortedFunctions.map((fn) => (
                      <option key={fn.id} value={fn.id}>
                        {fn.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveMessage ? <span className="text-sm text-emerald-600">{saveMessage}</span> : null}
              </div>
            </form>
          </section>

          <aside className="compass-panel space-y-4 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Progress
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-sf-orange"
                    style={{ width: `${project.stats.percentComplete}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums text-neutral-700">
                  {formatPercentComplete(project.stats.percentComplete)}
                </span>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                {project.stats.completedCount} of {project.stats.issueCount} issues complete
              </p>
            </div>

            <div className="border-t border-stone-100 pt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Properties
              </div>
              <dl className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Status</dt>
                  <dd className="capitalize text-neutral-800">{project.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Function</dt>
                  <dd className="text-neutral-800">{businessFunction?.name ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-500">Issues</dt>
                  <dd className="tabular-nums text-neutral-800">{project.stats.issueCount}</dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              onClick={() => {
                setTab('issues')
                setCreatingTask(true)
              }}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-stone-50"
            >
              + New issue
            </button>
          </aside>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {topTasks.length} top-level issue{topTasks.length === 1 ? '' : 's'} in this project
            </p>
            <button
              type="button"
              onClick={() => setCreatingTask((value) => !value)}
              className="rounded-lg bg-sf-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-sf-orange-dark"
            >
              {creatingTask ? 'Cancel' : 'New issue'}
            </button>
          </div>

          {creatingTask ? (
            <TaskCreate
              projectsById={projectsById}
              businessFunctionsById={businessFunctionsById}
              defaultProjectId={project.id}
              defaultBusinessFunctionId={project.business_function_id ?? ''}
              onCreated={async () => {
                setCreatingTask(false)
                await load()
              }}
            />
          ) : null}

          <ul className="compass-panel divide-y divide-stone-100 overflow-hidden">
            {tasks.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-neutral-500">
                No issues in this project yet.
              </li>
            ) : (
              tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-neutral-900">{task.title}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {STATUS_LABEL[task.status] ?? task.status}
                      {task.task_type ? ` · ${task.task_type}` : ''}
                      {task.parent_task_id ? ' · subtask' : ''}
                    </div>
                  </div>
                  <Link
                    href="/tasks"
                    className="shrink-0 text-xs font-medium text-sf-orange-dark hover:underline"
                  >
                    Open in Tasks
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      )}
    </div>
  )
}
