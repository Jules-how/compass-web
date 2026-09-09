'use client'

import { workFetch } from '@/lib/workspace-change'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProjectDependency,
  CompassProjectMilestone,
  CompassProjectUpdate,
  CompassProjectWithStats,
  CompassTask,
  TaskStatus
} from '@/lib/types'
import { formatPercentComplete } from '@/lib/project-stats'
import {
  PROJECT_BOARD_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_PRIORITIES,
  formatProjectDate,
  normalizeProjectStatus,
  projectHealthLabel,
  projectPriorityLabel,
  projectStatusLabel,
  type ProjectBoardStatus,
  type ProjectHealth
} from '@/lib/project-pm'
import { LoadingBlock } from '@/components/LoadingBlock'
import TaskCreate from '@/components/TaskCreate'

type TabKey = 'overview' | 'activity' | 'issues'

const STATUS_LABEL: Record<TaskStatus, string> = {
  'not-started': 'Todo',
  'in-progress': 'In progress',
  completed: 'Done',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

const ISSUE_GROUPS: TaskStatus[] = [
  'not-started',
  'in-progress',
  'blocked',
  'completed',
  'cancelled'
]

interface ProjectDetailPayload {
  project: CompassProjectWithStats
  tasks: CompassTask[]
  businessFunction: CompassBusinessFunction | null
  functions: CompassBusinessFunction[]
  milestones: CompassProjectMilestone[]
  updates: CompassProjectUpdate[]
  dependencies: CompassProjectDependency[]
}

interface MilestoneDraft {
  id?: string
  title: string
  description: string
  target_date: string
  completed: boolean
}

export interface ProjectDetailPanelProps {
  projectId: string
  /** `modal` opens as a responsive overlay; `page` is the full-route layout. */
  variant?: 'page' | 'modal'
  onClose?: () => void
  onChanged?: () => void | Promise<void>
  /** When provided, skips a second `/api/projects` fetch for the dependency picker. */
  projects?: CompassProjectWithStats[]
}

export function ProjectDetailPanel({
  projectId,
  variant = 'page',
  onClose,
  onChanged,
  projects: projectsProp
}: ProjectDetailPanelProps) {
  const isModal = variant === 'modal'
  const [data, setData] = useState<ProjectDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')
  const [saving, setSaving] = useState(false)
  const [creatingTask, setCreatingTask] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState<ProjectBoardStatus>('backlog')
  const [editPriority, setEditPriority] = useState(0)
  const [editHealth, setEditHealth] = useState<ProjectHealth>('no_updates')
  const [editFunctionId, setEditFunctionId] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editTargetDate, setEditTargetDate] = useState('')
  const [editLabels, setEditLabels] = useState('')
  const [editDependsOn, setEditDependsOn] = useState<string[]>([])
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([])
  const [updateBody, setUpdateBody] = useState('')
  const [updateHealth, setUpdateHealth] = useState<ProjectHealth>('on_track')
  const [allProjects, setAllProjects] = useState<CompassProjectWithStats[]>(projectsProp ?? [])

  const applyDetail = useCallback((body: ProjectDetailPayload) => {
    setData(body)
    setEditName(body.project.name)
    setEditSummary(body.project.summary ?? '')
    setEditNotes(body.project.notes ?? '')
    setEditStatus(normalizeProjectStatus(body.project.status))
    setEditPriority(body.project.priority ?? 0)
    setEditHealth((body.project.health as ProjectHealth) || 'no_updates')
    setEditFunctionId(body.project.business_function_id ?? '')
    setEditStartDate(body.project.start_date ?? '')
    setEditTargetDate(body.project.target_date ?? '')
    setEditLabels((body.project.labels ?? []).join(', '))
    setEditDependsOn(body.dependencies.map((dep) => dep.depends_on_project_id))
    setMilestones(
      body.milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        description: milestone.description ?? '',
        target_date: milestone.target_date ?? '',
        completed: milestone.completed
      }))
    )
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const detailPromise = workFetch(`/api/projects/${projectId}`, {
        headers: { Accept: 'application/json' }
      })
      const listPromise = projectsProp
        ? null
        : workFetch('/api/projects', { headers: { Accept: 'application/json' } })

      const detailRes = await detailPromise
      if (detailRes.status === 404) throw new Error('Project not found')
      if (!detailRes.ok) throw new Error(`Failed to load project (${detailRes.status})`)
      const body = (await detailRes.json()) as ProjectDetailPayload
      applyDetail(body)

      if (projectsProp) {
        setAllProjects(projectsProp)
      } else if (listPromise) {
        const listRes = await listPromise
        if (listRes.ok) {
          const listBody = (await listRes.json()) as { projects: CompassProjectWithStats[] }
          setAllProjects(listBody.projects ?? [])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [applyDetail, projectId, projectsProp])

  useEffect(() => {
    setData(null)
    setTab('overview')
    setCreatingTask(false)
    setSaveMessage(null)
    setUpdateBody('')
    void load()
  }, [load])

  useEffect(() => {
    if (projectsProp) setAllProjects(projectsProp)
  }, [projectsProp])

  useEffect(() => {
    if (!isModal || !onClose) return
    const close = onClose
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [isModal, onClose])

  async function notifyChanged() {
    await onChanged?.()
  }

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

  const issuesByStatus = useMemo(() => {
    if (!data) return []
    return ISSUE_GROUPS.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      items: data.tasks.filter((task) => task.status === status)
    })).filter((group) => group.items.length > 0)
  }, [data])

  async function saveOverview(event: React.FormEvent) {
    event.preventDefault()
    if (!data) return
    setSaving(true)
    setSaveMessage(null)
    setError(null)
    try {
      const res = await workFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          summary: editSummary.trim() || null,
          notes: editNotes.trim() || null,
          status: editStatus,
          priority: editPriority,
          health: editHealth,
          business_function_id: editFunctionId || null,
          start_date: editStartDate || null,
          target_date: editTargetDate || null,
          labels: editLabels
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          depends_on_project_ids: editDependsOn,
          milestones: milestones
            .filter((milestone) => milestone.title.trim())
            .map((milestone, index) => ({
              id: milestone.id,
              title: milestone.title.trim(),
              description: milestone.description.trim() || null,
              target_date: milestone.target_date || null,
              completed: milestone.completed,
              sort_order: index
            }))
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setSaveMessage('Saved')
      await load()
      await notifyChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function postUpdate(event: React.FormEvent) {
    event.preventDefault()
    if (!updateBody.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await workFetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          health: updateHealth,
          update: { body: updateBody.trim(), health: updateHealth }
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setUpdateBody('')
      setTab('activity')
      await load()
      await notifyChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  function wrap(content: React.ReactNode) {
    if (!isModal) return content
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/40 px-3 py-6 sm:px-4 sm:py-10">
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          aria-label="Close project"
          onClick={onClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="project-detail-title"
          className="relative z-10 mb-10 w-full max-w-5xl rounded-2xl border border-stone-200/80 bg-white shadow-soft"
        >
          {content}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return wrap(
      <div className="space-y-3 p-5">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
        <div className="flex justify-end gap-2">
          {isModal && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-3 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
            >
              Close
            </button>
          ) : (
            <Link href="/projects" className="text-sm text-sf-orange-dark underline">
              Back to projects
            </Link>
          )}
          <button type="button" onClick={() => void load()} className="text-sm underline">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return wrap(
      <div className="p-8">
        <LoadingBlock label="Loading project…" />
      </div>
    )
  }

  const { project, businessFunction, updates } = data
  const dependencyNames = editDependsOn
    .map((id) => allProjects.find((row) => row.id === id)?.name ?? id)
    .filter(Boolean)

  const tabs = (
    <div className="compass-seg text-sm">
      {(
        [
          ['overview', 'Overview'],
          ['activity', `Activity (${updates.length})`],
          ['issues', `Issues (${data.tasks.length})`]
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={`compass-seg-btn ${tab === key ? 'compass-seg-btn-active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return wrap(
    <div className={isModal ? 'max-h-[min(92vh,920px)] overflow-y-auto p-5' : 'space-y-5'}>
      <div className={`flex flex-wrap items-center justify-between gap-3 ${isModal ? 'mb-5' : ''}`}>
        {isModal ? (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Project
            </p>
            <h2
              id="project-detail-title"
              className="truncate font-display text-lg font-semibold text-neutral-900"
            >
              {project.name}
            </h2>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Link href="/projects" className="hover:text-neutral-800">
              Projects
            </Link>
            <span>/</span>
            <span className="font-medium text-neutral-800">{project.name}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {tabs}
          {isModal && onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="space-y-5">
      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="compass-panel space-y-5 p-5">
            <form onSubmit={saveOverview} className="space-y-4">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-display text-xl font-semibold"
                disabled={saving}
              />
              <input
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="Short summary"
                className="compass-input"
                disabled={saving}
              />
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={7}
                placeholder="Project overview, brief, and notes…"
                className="compass-input"
                disabled={saving}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-neutral-800">Milestones</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setMilestones((rows) => [
                        ...rows,
                        { title: '', description: '', target_date: '', completed: false }
                      ])
                    }
                    className="text-xs font-medium text-sf-orange-dark"
                  >
                    + Milestone
                  </button>
                </div>
                {milestones.length === 0 ? (
                  <p className="text-xs text-neutral-500">No milestones yet.</p>
                ) : (
                  milestones.map((milestone, index) => (
                    <div
                      key={milestone.id ?? index}
                      className="rounded-lg border border-stone-200 p-3"
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={milestone.completed}
                          onChange={(e) =>
                            setMilestones((rows) =>
                              rows.map((row, i) =>
                                i === index ? { ...row, completed: e.target.checked } : row
                              )
                            )
                          }
                          className="mt-2"
                        />
                        <div className="grid flex-1 gap-2 md:grid-cols-3">
                          <input
                            type="text"
                            value={milestone.title}
                            onChange={(e) =>
                              setMilestones((rows) =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, title: e.target.value } : row
                                )
                              )
                            }
                            placeholder="Milestone title"
                            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
                          />
                          <input
                            type="text"
                            value={milestone.description}
                            onChange={(e) =>
                              setMilestones((rows) =>
                                rows.map((row, i) =>
                                  i === index ? { ...row, description: e.target.value } : row
                                )
                              )
                            }
                            placeholder="Description"
                            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
                          />
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={milestone.target_date}
                              onChange={(e) =>
                                setMilestones((rows) =>
                                  rows.map((row, i) =>
                                    i === index ? { ...row, target_date: e.target.value } : row
                                  )
                                )
                              }
                              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setMilestones((rows) => rows.filter((_, i) => i !== index))
                              }
                              className="text-xs text-red-600"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || !editName.trim()}
                  className="compass-btn-primary"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                {saveMessage ? <span className="text-sm text-emerald-600">{saveMessage}</span> : null}
              </div>
            </form>

            <form onSubmit={postUpdate} className="border-t border-stone-100 pt-4">
              <h3 className="mb-2 text-sm font-medium text-neutral-800">Project update</h3>
              <textarea
                value={updateBody}
                onChange={(e) => setUpdateBody(e.target.value)}
                rows={3}
                placeholder="Write a project update…"
                className="compass-input"
                disabled={saving}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={updateHealth}
                  onChange={(e) => setUpdateHealth(e.target.value as ProjectHealth)}
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {PROJECT_HEALTHS.map((health) => (
                    <option key={health} value={health}>
                      {projectHealthLabel(health)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={saving || !updateBody.trim()}
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  Post update
                </button>
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

            <div className="space-y-2 border-t border-stone-100 pt-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Properties
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Status</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ProjectBoardStatus)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {PROJECT_BOARD_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {projectStatusLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Priority</span>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(Number(e.target.value))}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
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
                <span className="mb-1 block text-xs text-neutral-500">Health</span>
                <select
                  value={editHealth}
                  onChange={(e) => setEditHealth(e.target.value as ProjectHealth)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {PROJECT_HEALTHS.map((health) => (
                    <option key={health} value={health}>
                      {projectHealthLabel(health)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Function / Team</span>
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
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Start</span>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Expected finish</span>
                <input
                  type="date"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Labels</span>
                <input
                  type="text"
                  value={editLabels}
                  onChange={(e) => setEditLabels(e.target.value)}
                  placeholder="comma separated"
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-neutral-500">Dependencies</span>
                <select
                  multiple
                  value={editDependsOn}
                  onChange={(e) =>
                    setEditDependsOn([...e.target.selectedOptions].map((option) => option.value))
                  }
                  className="h-28 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {allProjects
                    .filter((row) => row.id !== project.id)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>

            <dl className="space-y-2 border-t border-stone-100 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Current</dt>
                <dd className="text-neutral-800">{projectStatusLabel(project.status)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Priority</dt>
                <dd className="text-neutral-800">{projectPriorityLabel(project.priority)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Health</dt>
                <dd className="text-neutral-800">{projectHealthLabel(project.health)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Team</dt>
                <dd className="text-neutral-800">{businessFunction?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-500">Dates</dt>
                <dd className="text-neutral-800">
                  {formatProjectDate(project.start_date)} – {formatProjectDate(project.target_date)}
                </dd>
              </div>
              {dependencyNames.length > 0 ? (
                <div>
                  <dt className="text-neutral-500">Depends on</dt>
                  <dd className="mt-1 text-neutral-800">{dependencyNames.join(', ')}</dd>
                </div>
              ) : null}
            </dl>

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
      ) : null}

      {tab === 'activity' ? (
        <section className="compass-panel divide-y divide-stone-100 overflow-hidden">
          {updates.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">
              No project updates yet. Post one from Overview.
            </div>
          ) : (
            updates.map((update) => (
              <article key={update.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-neutral-700">
                    {projectHealthLabel(update.health)}
                  </span>
                  <time dateTime={update.created_at}>
                    {new Intl.DateTimeFormat('en-AU', {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    }).format(new Date(update.created_at))}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{update.body}</p>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === 'issues' ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {data.tasks.length} issue{data.tasks.length === 1 ? '' : 's'} in this project
            </p>
            <button
              type="button"
              onClick={() => setCreatingTask((value) => !value)}
              className="compass-btn-primary"
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
                await notifyChanged()
              }}
            />
          ) : null}

          {issuesByStatus.length === 0 ? (
            <div className="compass-panel px-4 py-10 text-center text-sm text-neutral-500">
              No issues in this project yet.
            </div>
          ) : (
            issuesByStatus.map((group) => (
              <div key={group.status} className="compass-panel overflow-hidden">
                <div className="border-b border-stone-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                  {group.label} · {group.items.length}
                </div>
                <ul className="divide-y divide-stone-100">
                  {group.items.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-neutral-900">
                          {task.title}
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {STATUS_LABEL[task.status] ?? task.status}
                          {task.task_type ? ` · ${task.task_type}` : ''}
                          {typeof task.priority === 'number' ? ` · P${task.priority}` : ''}
                          {task.due ? ` · ${formatProjectDate(task.due)}` : ''}
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
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      ) : null}
      </div>
    </div>
  )
}
