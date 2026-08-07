'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'
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
  type ProjectBoardStatus
} from '@/lib/project-pm'

type ViewMode = 'list' | 'board' | 'timeline'
type GroupBy = 'none' | 'status' | 'function' | 'health'
type OrderBy = 'name' | 'priority' | 'target_date' | 'updated_at'
type InsightsTab = 'health' | 'leads'

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

interface MilestoneDraft {
  title: string
  description: string
  target_date: string
}

export function ProjectManager({
  projects,
  functions,
  clients = [],
  onRefresh
}: {
  projects: CompassProjectWithStats[]
  functions: CompassBusinessFunction[]
  clients?: Array<{ id: string; name: string }>
  onRefresh?: () => void | Promise<void>
}) {
  const [view, setView] = useState<ViewMode>('list')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectBoardStatus>('all')
  const [clientFilter, setClientFilter] = useState<'all' | 'unassigned' | string>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [orderBy, setOrderBy] = useState<OrderBy>('name')
  const [insightsTab, setInsightsTab] = useState<InsightsTab>('health')
  const [insightsOpen, setInsightsOpen] = useState(true)

  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<ProjectBoardStatus>('backlog')
  const [priority, setPriority] = useState(0)
  const [businessFunctionId, setBusinessFunctionId] = useState('')
  const [clientId, setClientId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [labels, setLabels] = useState('')
  const [dependsOn, setDependsOn] = useState<string[]>([])
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([])

  const functionById = useMemo(
    () => Object.fromEntries(functions.map((row) => [row.id, row])),
    [functions]
  )

  const clientById = useMemo(
    () => Object.fromEntries(clients.map((row) => [row.id, row])),
    [clients]
  )

  const sortedFunctions = useMemo(
    () => [...functions].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [functions]
  )

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  )

  const visibleProjects = useMemo(() => {
    const filtered = projects.filter((project) => {
      if (statusFilter !== 'all' && normalizeProjectStatus(project.status) !== statusFilter) {
        return false
      }
      if (clientFilter === 'unassigned') return !project.client_id
      if (clientFilter !== 'all') return project.client_id === clientFilter
      return true
    })

    const sorted = [...filtered].sort((a, b) => {
      if (orderBy === 'priority') return (a.priority ?? 0) - (b.priority ?? 0) || a.name.localeCompare(b.name)
      if (orderBy === 'target_date') {
        return (a.target_date || '9999').localeCompare(b.target_date || '9999') || a.name.localeCompare(b.name)
      }
      if (orderBy === 'updated_at') return b.updated_at.localeCompare(a.updated_at)
      return a.name.localeCompare(b.name)
    })
    return sorted
  }, [projects, statusFilter, clientFilter, orderBy])

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: 'All projects', items: visibleProjects }]
    const buckets = new Map<string, { label: string; items: CompassProjectWithStats[] }>()
    for (const project of visibleProjects) {
      let key = 'none'
      let label = 'Ungrouped'
      if (groupBy === 'status') {
        key = normalizeProjectStatus(project.status)
        label = projectStatusLabel(project.status)
      } else if (groupBy === 'health') {
        key = project.health || 'no_updates'
        label = projectHealthLabel(project.health)
      } else if (groupBy === 'function') {
        key = project.business_function_id || 'none'
        label = project.business_function_id
          ? (functionById[project.business_function_id]?.name ?? project.business_function_id)
          : 'No function'
      }
      const bucket = buckets.get(key) ?? { label, items: [] }
      bucket.items.push(project)
      buckets.set(key, bucket)
    }
    return [...buckets.entries()].map(([key, value]) => ({ key, ...value }))
  }, [visibleProjects, groupBy, functionById])

  const healthCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const project of projects) {
      const key = project.health || 'no_updates'
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [projects])

  const noLeadCount = projects.length

  function resetCreateForm() {
    setName('')
    setSummary('')
    setNotes('')
    setStatus('backlog')
    setPriority(0)
    setBusinessFunctionId('')
    setClientId('')
    setStartDate('')
    setTargetDate('')
    setLabels('')
    setDependsOn([])
    setMilestones([])
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          summary: summary.trim() || null,
          notes: notes.trim() || null,
          status,
          priority,
          business_function_id: businessFunctionId || null,
          client_id: clientId || null,
          start_date: startDate || null,
          target_date: targetDate || null,
          labels: labels
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          depends_on_project_ids: dependsOn,
          milestones: milestones
            .filter((milestone) => milestone.title.trim())
            .map((milestone) => ({
              title: milestone.title.trim(),
              description: milestone.description.trim() || null,
              target_date: milestone.target_date || null
            }))
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      resetCreateForm()
      setCreating(false)
      await onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function patchProjectStatus(projectId: string, nextStatus: ProjectBoardStatus) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeProject(project: CompassProjectWithStats) {
    if (!confirm(`Delete project “${project.name}”?`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      await onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const timelineBounds = useMemo(() => {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const end = new Date(today.getFullYear() + 1, today.getMonth() + 2, 1)
    for (const project of visibleProjects) {
      for (const value of [project.start_date, project.target_date]) {
        if (!value) continue
        const date = new Date(`${value}T00:00:00`)
        if (date < start) start.setTime(date.getTime())
        if (date > end) end.setTime(date.getTime())
      }
    }
    return { start, end, today }
  }, [visibleProjects])

  function dateToPercent(value: string | null | undefined): number | null {
    if (!value) return null
    const date = new Date(`${value}T00:00:00`).getTime()
    const start = timelineBounds.start.getTime()
    const end = timelineBounds.end.getTime()
    if (end <= start) return 0
    return Math.min(100, Math.max(0, ((date - start) / (end - start)) * 100))
  }

  const todayPercent = dateToPercent(timelineBounds.today.toISOString().slice(0, 10)) ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-xs">
            {(['list', 'board', 'timeline'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                  view === mode ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="all">All statuses</option>
            {PROJECT_BOARD_STATUSES.map((value) => (
              <option key={value} value={value}>
                {projectStatusLabel(value)}
              </option>
            ))}
          </select>
          {sortedClients.length > 0 ? (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
            >
              <option value="all">All clients</option>
              <option value="unassigned">No client</option>
              {sortedClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="none">No grouping</option>
            <option value="status">Group by status</option>
            <option value="function">Group by function</option>
            <option value="health">Group by health</option>
          </select>
          <select
            value={orderBy}
            onChange={(e) => setOrderBy(e.target.value as OrderBy)}
            className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs"
          >
            <option value="name">Order by name</option>
            <option value="priority">Order by priority</option>
            <option value="target_date">Order by target</option>
            <option value="updated_at">Order by updated</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInsightsOpen((value) => !value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-neutral-600"
          >
            {insightsOpen ? 'Hide insights' : 'Insights'}
          </button>
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            className="compass-btn-primary"
          >
            {creating ? 'Cancel' : 'New project'}
          </button>
        </div>
      </div>

      {creating ? (
        <form onSubmit={createProject} className="compass-panel space-y-4 p-5">
          <div>
            <input
              autoFocus
              type="text"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-display text-lg"
              disabled={saving}
            />
            <input
              type="text"
              placeholder="Add a short summary…"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              disabled={saving}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectBoardStatus)}
              className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs"
              disabled={saving}
            >
              {PROJECT_BOARD_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {projectStatusLabel(value)}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs"
              disabled={saving}
            >
              {PROJECT_PRIORITIES.map((row) => (
                <option key={row.value} value={row.value}>
                  {row.label}
                </option>
              ))}
            </select>
            <select
              value={businessFunctionId}
              onChange={(e) => setBusinessFunctionId(e.target.value)}
              className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs"
              disabled={saving}
            >
              <option value="">Team / Function</option>
              {sortedFunctions.map((fn) => (
                <option key={fn.id} value={fn.id}>
                  {fn.name}
                </option>
              ))}
            </select>
            {sortedClients.length > 0 ? (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs"
                disabled={saving}
              >
                <option value="">Client (optional)</option>
                {sortedClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs">
              Start
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent"
                disabled={saving}
              />
            </label>
            <label className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs">
              Target
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-transparent"
                disabled={saving}
              />
            </label>
          </div>

          <textarea
            placeholder="Write a description, a project brief, or collect ideas…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="compass-input"
            disabled={saving}
          />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Labels (comma separated)</span>
              <input
                type="text"
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Dependencies</span>
              <select
                multiple
                value={dependsOn}
                onChange={(e) =>
                  setDependsOn([...e.target.selectedOptions].map((option) => option.value))
                }
                className="h-24 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                disabled={saving}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-neutral-800">Milestones</h3>
              <button
                type="button"
                onClick={() =>
                  setMilestones((rows) => [...rows, { title: '', description: '', target_date: '' }])
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
                <div key={index} className="grid gap-2 rounded-lg border border-stone-200 p-3 md:grid-cols-3">
                  <input
                    type="text"
                    placeholder="Milestone title"
                    value={milestone.title}
                    onChange={(e) =>
                      setMilestones((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, title: e.target.value } : row))
                      )
                    }
                    className="rounded border border-neutral-300 px-2 py-1.5 text-sm md:col-span-1"
                  />
                  <input
                    type="text"
                    placeholder="Description"
                    value={milestone.description}
                    onChange={(e) =>
                      setMilestones((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, description: e.target.value } : row
                        )
                      )
                    }
                    className="rounded border border-neutral-300 px-2 py-1.5 text-sm md:col-span-1"
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
                      onClick={() => setMilestones((rows) => rows.filter((_, i) => i !== index))}
                      className="text-xs text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="compass-btn-primary"
          >
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className={`grid gap-4 ${insightsOpen ? 'xl:grid-cols-[minmax(0,1fr)_260px]' : ''}`}>
        <div className="min-w-0 space-y-4">
          {view === 'list'
            ? grouped.map((group) => (
                <div key={group.key} className="compass-panel overflow-hidden">
                  {groupBy !== 'none' ? (
                    <div className="border-b border-stone-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {group.label} · {group.items.length}
                    </div>
                  ) : null}
                  <div className="hidden gap-3 border-b border-stone-200 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto]">
                    <div>Name</div>
                    <div>Health</div>
                    <div>Priority</div>
                    <div>Target</div>
                    <div>Issues</div>
                    <div>Progress</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {group.items.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-neutral-500">No projects.</div>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {group.items.map((project) => (
                        <li
                          key={project.id}
                          className="flex flex-col gap-3 px-4 py-3 transition hover:bg-stone-50/80 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto] lg:items-center"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/projects/${project.id}`}
                              className="block truncate text-sm font-medium text-neutral-900 hover:text-sf-orange-dark"
                            >
                              {project.name}
                            </Link>
                            <p className="mt-0.5 truncate text-xs text-neutral-500">
                              {(project.client_name ||
                                (project.client_id ? clientById[project.client_id]?.name : null)) && (
                                <span className="mr-1.5 font-medium text-neutral-700">
                                  {project.client_name || clientById[project.client_id!]?.name}
                                  {' · '}
                                </span>
                              )}
                              {project.summary || project.notes || projectStatusLabel(project.status)}
                            </p>
                          </div>
                          <div>
                            <span
                              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${healthTone(
                                project.health
                              )}`}
                            >
                              {projectHealthLabel(project.health)}
                            </span>
                          </div>
                          <div className="text-sm text-neutral-600">
                            {projectPriorityLabel(project.priority)}
                          </div>
                          <div className="text-sm text-neutral-600">
                            {formatProjectDate(project.target_date)}
                          </div>
                          <div className="text-sm tabular-nums text-neutral-700">
                            {project.stats.issueCount}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-sf-orange"
                                style={{ width: `${project.stats.percentComplete}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-neutral-500">
                              {formatPercentComplete(project.stats.percentComplete)}
                            </span>
                          </div>
                          <div className="flex justify-start gap-2 lg:justify-end">
                            <Link
                              href={`/projects/${project.id}`}
                              className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600"
                            >
                              Open
                            </Link>
                            <button
                              type="button"
                              onClick={() => removeProject(project)}
                              disabled={saving}
                              className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            : null}

          {view === 'board' ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {PROJECT_BOARD_STATUSES.map((column) => {
                const items = visibleProjects.filter(
                  (project) => normalizeProjectStatus(project.status) === column
                )
                return (
                  <section key={column} className="compass-panel min-h-[280px] p-3">
                    <header className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        {projectStatusLabel(column)}
                      </h3>
                      <span className="text-xs tabular-nums text-neutral-400">{items.length}</span>
                    </header>
                    <ul className="space-y-2">
                      {items.map((project) => (
                        <li key={project.id} className="rounded-lg border border-stone-200 bg-stone-50/70 p-3">
                          <Link
                            href={`/projects/${project.id}`}
                            className="block text-sm font-medium text-neutral-900 hover:text-sf-orange-dark"
                          >
                            {project.name}
                          </Link>
                          {(project.client_name ||
                            (project.client_id ? clientById[project.client_id]?.name : null)) && (
                            <div className="mt-1 text-[11px] font-medium text-neutral-600">
                              {project.client_name || clientById[project.client_id!]?.name}
                            </div>
                          )}
                          {project.summary ? (
                            <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{project.summary}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                            <span>{formatProjectDate(project.target_date)}</span>
                            <span>{project.stats.issueCount} issues</span>
                            <span
                              className={`rounded px-1.5 py-0.5 ring-1 ring-inset ${healthTone(
                                project.health
                              )}`}
                            >
                              {projectHealthLabel(project.health)}
                            </span>
                          </div>
                          <select
                            value={normalizeProjectStatus(project.status)}
                            onChange={(e) =>
                              void patchProjectStatus(
                                project.id,
                                e.target.value as ProjectBoardStatus
                              )
                            }
                            disabled={saving}
                            className="mt-2 w-full rounded border border-stone-200 bg-white px-2 py-1 text-xs"
                          >
                            {PROJECT_BOARD_STATUSES.map((value) => (
                              <option key={value} value={value}>
                                Move to {projectStatusLabel(value)}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          ) : null}

          {view === 'timeline' ? (
            <div className="compass-panel overflow-x-auto p-4">
              <div className="mb-3 flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {formatProjectDate(timelineBounds.start.toISOString().slice(0, 10))} →{' '}
                  {formatProjectDate(timelineBounds.end.toISOString().slice(0, 10))}
                </span>
                <span>Today</span>
              </div>
              <div className="relative min-w-[720px] space-y-3">
                <div
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-sky-500"
                  style={{ left: `${todayPercent}%` }}
                />
                {visibleProjects.length === 0 ? (
                  <p className="py-10 text-center text-sm text-neutral-500">No projects on the timeline.</p>
                ) : (
                  visibleProjects.map((project) => {
                    const startPct = dateToPercent(project.start_date) ?? todayPercent
                    const endPct = dateToPercent(project.target_date) ?? startPct + 4
                    const left = Math.min(startPct, endPct)
                    const width = Math.max(3, Math.abs(endPct - startPct))
                    return (
                      <div key={project.id} className="grid grid-cols-[180px_minmax(0,1fr)] items-center gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${project.id}`}
                            className="block truncate text-sm font-medium text-neutral-800 hover:text-sf-orange-dark"
                          >
                            {project.name}
                          </Link>
                          {(project.client_name ||
                            (project.client_id ? clientById[project.client_id]?.name : null)) && (
                            <div className="truncate text-[11px] text-neutral-500">
                              {project.client_name || clientById[project.client_id!]?.name}
                            </div>
                          )}
                        </div>
                        <div className="relative h-8 rounded-md bg-stone-100">
                          <Link
                            href={`/projects/${project.id}`}
                            className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full bg-sf-orange/80 px-2 text-[10px] font-medium leading-5 text-white"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${formatProjectDate(project.start_date)} – ${formatProjectDate(project.target_date)}`}
                          >
                            <span className="truncate">{project.name}</span>
                          </Link>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>

        {insightsOpen ? (
          <aside className="compass-panel h-fit p-4">
            <div className="mb-3 flex rounded-lg border border-stone-200 p-0.5 text-xs">
              {(['health', 'leads'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInsightsTab(tab)}
                  className={`flex-1 rounded-md px-2 py-1.5 font-medium capitalize ${
                    insightsTab === tab ? 'bg-neutral-900 text-white' : 'text-neutral-500'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            {insightsTab === 'health' ? (
              <ul className="space-y-2 text-sm">
                {PROJECT_HEALTHS.map((health) => (
                  <li key={health} className="flex items-center justify-between gap-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${healthTone(
                        health
                      )}`}
                    >
                      {projectHealthLabel(health)}
                    </span>
                    <span className="tabular-nums text-neutral-600">{healthCounts[health] ?? 0}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2 text-sm text-neutral-600">
                <p>
                  <span className="font-medium text-neutral-900">{noLeadCount}</span> project
                  {noLeadCount === 1 ? '' : 's'} with no dedicated lead field yet.
                </p>
                <p className="text-xs text-neutral-500">
                  Function is used as the current team signal. A first-class lead assignee can land next.
                </p>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
