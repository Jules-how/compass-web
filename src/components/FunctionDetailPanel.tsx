'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CompassBusinessFunctionWithStats,
  CompassProjectWithStats,
  CompassTask,
  SystemMapMeta,
  TaskStatus
} from '@/lib/types'
import { TASK_STATUSES } from '@/lib/types'
import { emptyFunctionStats } from '@/lib/function-stats'
import { functionAccentColor, resolveFunctionKind, withAlpha } from '@/lib/function-identity'
import {
  formatProjectDate,
  projectHealthLabel,
  projectPriorityLabel,
  projectStatusLabel
} from '@/lib/project-pm'
import { formatPercentComplete } from '@/lib/project-stats'
import { taskPriorityLabel } from '@/lib/task-priority'
import { FunctionMark } from '@/components/FunctionGlyph'
import { LoadingBlock } from '@/components/LoadingBlock'
import { cn } from '@/lib/utils'

type TabKey = 'overview' | 'projects' | 'tasks' | 'settings'

type FunctionDetailPayload = {
  function: CompassBusinessFunctionWithStats
  projects: CompassProjectWithStats[]
  tasks: CompassTask[]
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function taskStatusLabel(status: string): string {
  switch (status) {
    case 'not-started':
      return 'Not started'
    case 'in-progress':
      return 'In progress'
    case 'completed':
      return 'Completed'
    case 'blocked':
      return 'Blocked'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

function StatusDot({ status }: { status: string }) {
  const tone =
    status === 'in-progress' || status === 'in_progress'
      ? 'border-amber-400 bg-amber-100'
      : status === 'completed'
        ? 'border-sky-500 bg-sky-500'
        : status === 'blocked'
          ? 'border-red-400 bg-red-100'
          : status === 'cancelled' || status === 'canceled'
            ? 'border-neutral-400 bg-neutral-300'
            : 'border-neutral-300 bg-white'
  return <span className={`inline-block h-3 w-3 rounded-full border ${tone}`} />
}

function healthTone(health: string): string {
  switch (health) {
    case 'on_track':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'at_risk':
      return 'bg-amber-50 text-amber-800 ring-amber-200'
    case 'off_track':
      return 'bg-red-50 text-red-700 ring-red-200'
    default:
      return 'bg-neutral-100 text-neutral-500 ring-neutral-200'
  }
}

export function FunctionDetailPanel({ functionId }: { functionId: string }) {
  const [data, setData] = useState<FunctionDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('overview')
  const [saving, setSaving] = useState(false)

  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('0')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/functions/${functionId}`, {
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to load (${res.status})`)
      }
      const body = (await res.json()) as FunctionDetailPayload
      setData(body)
      setEditName(body.function.name)
      setEditSlug(body.function.slug)
      setEditSortOrder(String(body.function.sort_order))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [functionId])

  useEffect(() => {
    void load()
  }, [load])

  const stats = data?.function.stats ?? emptyFunctionStats()

  const openTasks = useMemo(
    () => (data?.tasks ?? []).filter((task) => task.status !== 'completed' && task.status !== 'cancelled'),
    [data?.tasks]
  )

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of data?.projects ?? []) map.set(project.id, project.name)
    return map
  }, [data?.projects])

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    if (!editName.trim() || !editSlug.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/functions/${functionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim() || slugify(editName),
          sort_order: Number(editSortOrder) || 0
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeFunction() {
    if (!data) return
    if (!confirm(`Delete function “${data.function.name}”? Projects and tasks are not deleted.`)) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/functions/${functionId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      window.location.href = '/functions'
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  if (loading && !data) return <LoadingBlock label="Loading function…" />

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const fn = data.function
  const identity = { id: fn.id, slug: fn.slug, name: fn.name }
  const accent = functionAccentColor(identity)
  const kind = resolveFunctionKind(identity)
  const tabs: Array<[TabKey, string]> = [
    ['overview', 'Overview'],
    ['projects', `Projects (${data.projects.length})`],
    ['tasks', `Tasks (${data.tasks.length})`],
    ['settings', 'Settings']
  ]

  return (
    <div className="space-y-5">
      <div className="compass-panel relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(480px 180px at 0% 0%, ${withAlpha(accent, 0.16)}, transparent 65%)`
          }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <FunctionMark kind={kind} color={accent} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-500">
                <Link href="/functions" className="hover:text-neutral-800">
                  Functions
                </Link>
                <span>/</span>
                <span className="font-medium text-neutral-800">{fn.name}</span>
              </div>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-neutral-900">
                {fn.name}
              </h1>
              <p className="mt-2 text-sm text-neutral-500">
                <span
                  className="rounded-lg px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: withAlpha(accent, 0.12), color: accent }}
                >
                  /{fn.slug}
                </span>
                <span className="mx-1.5 text-neutral-300">·</span>
                Order {fn.sort_order}
                <span className="mx-1.5 text-neutral-300">·</span>
                {stats.projectCount} projects
                <span className="mx-1.5 text-neutral-300">·</span>
                {stats.openTaskCount} open tasks
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/projects" className="compass-btn-secondary">
              All projects
            </Link>
            <Link href="/tasks" className="compass-btn-secondary">
              All tasks
            </Link>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-1.5 border-b border-stone-200/80 pb-px">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded-t-xl px-3.5 py-2 text-sm font-medium transition',
              tab === key
                ? 'bg-white text-neutral-900 shadow-soft ring-1 ring-stone-200/70'
                : 'text-neutral-500 hover:bg-white/60 hover:text-neutral-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="space-y-5">
          {(() => {
            const map = (fn.system_map ?? {}) as SystemMapMeta
            if (!map.why && !(map.influences?.length)) return null
            return (
              <section className="compass-panel p-5">
                <h3 className="font-display text-base font-semibold text-neutral-900">System map</h3>
                {map.why ? <p className="mt-2 text-sm leading-relaxed text-neutral-600">{map.why}</p> : null}
                {map.influences && map.influences.length > 0 ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {map.influences.map((edge) => (
                      <li key={`${edge.route}-${edge.table}`}>
                        <Link
                          href={edge.route}
                          className="block rounded-xl border border-stone-200/80 bg-stone-50/50 px-3.5 py-2.5 transition hover:bg-white"
                        >
                          <div className="text-sm font-medium text-neutral-900">{edge.name}</div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">
                            {edge.route} · {edge.table}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(map.inputs?.length || map.outputs?.length) ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-neutral-600">
                    {map.inputs?.length ? (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Inputs</div>
                        <p className="mt-1">{map.inputs.join(', ')}</p>
                      </div>
                    ) : null}
                    {map.outputs?.length ? (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Outputs</div>
                        <p className="mt-1">{map.outputs.join(', ')}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            )
          })()}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Projects', value: stats.projectCount, hint: `${stats.activeProjectCount} active` },
              { label: 'Open tasks', value: stats.openTaskCount, hint: 'still in flight' },
              { label: 'Completed', value: stats.completedTaskCount, hint: 'finished tasks' },
              { label: 'All tasks', value: stats.taskCount, hint: 'in this function' }
            ].map((card) => (
              <div key={card.label} className="compass-panel p-5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  {card.label}
                </p>
                <p className="mt-2 font-display text-3xl font-semibold tabular-nums text-neutral-900">
                  {card.value}
                </p>
                <p className="mt-1 text-sm text-neutral-500">{card.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="compass-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
                <h3 className="font-display text-base font-semibold text-neutral-900">Projects</h3>
                <button
                  type="button"
                  onClick={() => setTab('projects')}
                  className="text-sm text-neutral-500 hover:text-neutral-800"
                >
                  View all
                </button>
              </div>
              {data.projects.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-neutral-500">
                  No projects in this function yet.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {data.projects.slice(0, 6).map((project) => (
                    <li key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-stone-50/80"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-neutral-900">{project.name}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {projectStatusLabel(project.status)}
                            {project.client_name ? ` · ${project.client_name}` : ''}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                            healthTone(project.health)
                          )}
                        >
                          {projectHealthLabel(project.health)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                          {formatPercentComplete(project.stats.percentComplete)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="compass-panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3.5">
                <h3 className="font-display text-base font-semibold text-neutral-900">Open tasks</h3>
                <button
                  type="button"
                  onClick={() => setTab('tasks')}
                  className="text-sm text-neutral-500 hover:text-neutral-800"
                >
                  View all
                </button>
              </div>
              {openTasks.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-neutral-500">
                  No open tasks for this function.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {openTasks.slice(0, 8).map((task) => (
                    <li key={task.id}>
                      <Link
                        href={task.project_id ? `/projects/${task.project_id}` : '/tasks'}
                        className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-stone-50/80"
                      >
                        <StatusDot status={task.status} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-neutral-900">{task.title}</p>
                          <p className="mt-0.5 text-xs text-neutral-500">
                            {taskStatusLabel(task.status)}
                            {task.project_id && projectNameById.get(task.project_id)
                              ? ` · ${projectNameById.get(task.project_id)}`
                              : ''}
                          </p>
                        </div>
                        {task.priority > 0 ? (
                          <span className="shrink-0 text-[11px] font-medium text-neutral-500">
                            {taskPriorityLabel(task.priority)}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {tab === 'projects' ? (
        <section className="compass-panel overflow-hidden">
          <div className="hidden gap-3 border-b border-stone-100 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.5fr)]">
            <span>Name</span>
            <span>Status</span>
            <span>Health</span>
            <span>Target</span>
            <span>Progress</span>
          </div>
          {data.projects.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-neutral-500">
              No projects linked to this function. Assign a function on a project to see it here.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex flex-col gap-2 px-5 py-4 transition hover:bg-stone-50/80 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.5fr)] lg:items-center lg:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{project.name}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {project.client_name || 'Internal'}
                        <span className="mx-1 text-neutral-300">·</span>
                        {projectPriorityLabel(project.priority)}
                      </p>
                    </div>
                    <span className="text-sm text-neutral-700">{projectStatusLabel(project.status)}</span>
                    <span
                      className={cn(
                        'inline-flex w-fit rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                        healthTone(project.health)
                      )}
                    >
                      {projectHealthLabel(project.health)}
                    </span>
                    <span className="text-sm text-neutral-600">
                      {formatProjectDate(project.target_date)}
                    </span>
                    <span className="text-sm tabular-nums text-neutral-600">
                      {formatPercentComplete(project.stats.percentComplete)}
                      <span className="ml-1 text-xs text-neutral-400">
                        ({project.stats.completedCount}/{project.stats.issueCount})
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'tasks' ? (
        <section className="compass-panel overflow-hidden">
          {data.tasks.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-neutral-500">
              No tasks for this function yet. Tag a task with this function, or add tasks under its
              projects.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {TASK_STATUSES.map((status) => {
                const items = data.tasks.filter((task) => task.status === status)
                if (items.length === 0) return null
                return (
                  <li key={status}>
                    <div className="flex items-center gap-2 bg-stone-50/80 px-5 py-2.5 text-sm font-medium text-neutral-700">
                      <StatusDot status={status} />
                      <span>{taskStatusLabel(status)}</span>
                      <span className="text-neutral-400">{items.length}</span>
                    </div>
                    <ul>
                      {items.map((task) => (
                        <li key={task.id}>
                          <Link
                            href={task.project_id ? `/projects/${task.project_id}` : '/tasks'}
                            className="flex flex-wrap items-center gap-3 border-t border-stone-50 px-5 py-3 text-sm transition hover:bg-sky-50/40"
                          >
                            <StatusDot status={task.status as TaskStatus} />
                            <span className="min-w-0 flex-1 font-medium text-neutral-900">
                              {task.title}
                            </span>
                            {task.project_id && projectNameById.get(task.project_id) ? (
                              <span className="text-xs text-neutral-500">
                                {projectNameById.get(task.project_id)}
                              </span>
                            ) : null}
                            {task.due ? (
                              <span className="text-xs tabular-nums text-neutral-400">
                                Due {formatProjectDate(task.due)}
                              </span>
                            ) : null}
                            {task.priority > 0 ? (
                              <span className="text-[11px] font-medium text-neutral-500">
                                {taskPriorityLabel(task.priority)}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'settings' ? (
        <form onSubmit={saveSettings} className="compass-panel max-w-xl space-y-4 p-6">
          <div>
            <h3 className="font-display text-lg font-semibold text-neutral-900">Function settings</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Rename or reorder this module. Deleting only removes the function — work stays intact.
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Name</span>
            <input
              value={editName}
              onChange={(e) => {
                const next = e.target.value
                setEditName(next)
                if (!editSlug || editSlug === slugify(editName)) setEditSlug(slugify(next))
              }}
              className="compass-input"
              disabled={saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Slug</span>
            <input
              value={editSlug}
              onChange={(e) => setEditSlug(e.target.value)}
              className="compass-input"
              disabled={saving}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Sort order</span>
            <input
              type="number"
              value={editSortOrder}
              onChange={(e) => setEditSortOrder(e.target.value)}
              className="compass-input"
              disabled={saving}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !editName.trim() || !editSlug.trim()}
              className="compass-btn-primary"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => void removeFunction()}
              disabled={saving}
              className="compass-btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Delete function
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
