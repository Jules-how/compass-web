'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'
import { formatPercentComplete } from '@/lib/project-stats'

const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const

function statusTone(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'paused':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 'archived':
      return 'bg-neutral-100 text-neutral-500 ring-neutral-200'
    default:
      return 'bg-neutral-100 text-neutral-600 ring-neutral-200'
  }
}

export function ProjectManager({
  projects,
  functions,
  onRefresh
}: {
  projects: CompassProjectWithStats[]
  functions: CompassBusinessFunction[]
  onRefresh?: () => void | Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<(typeof PROJECT_STATUSES)[number]>('active')
  const [businessFunctionId, setBusinessFunctionId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | (typeof PROJECT_STATUSES)[number]>('all')

  const functionById = useMemo(
    () => Object.fromEntries(functions.map((row) => [row.id, row])),
    [functions]
  )

  const sortedFunctions = useMemo(
    () => [...functions].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [functions]
  )

  const visibleProjects = useMemo(() => {
    const filtered =
      statusFilter === 'all' ? projects : projects.filter((project) => project.status === statusFilter)
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }, [projects, statusFilter])

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
          status,
          business_function_id: businessFunctionId || null,
          notes: notes.trim() || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setName('')
      setStatus('active')
      setBusinessFunctionId('')
      setNotes('')
      setCreating(false)
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-neutral-500">
            {visibleProjects.length} project{visibleProjects.length === 1 ? '' : 's'}
          </p>
          <div className="flex rounded-lg border border-stone-200 bg-white p-0.5 text-xs">
            {(['all', ...PROJECT_STATUSES] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                  statusFilter === value
                    ? 'bg-neutral-900 text-white'
                    : 'text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="rounded-lg bg-sf-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-sf-orange-dark"
        >
          {creating ? 'Cancel' : 'New project'}
        </button>
      </div>

      {creating ? (
        <form onSubmit={createProject} className="compass-panel space-y-3 p-4">
          <input
            autoFocus
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            disabled={saving}
          />
          <textarea
            placeholder="Short description / notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            disabled={saving}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Function</span>
              <select
                value={businessFunctionId}
                onChange={(e) => setBusinessFunctionId(e.target.value)}
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
              <span className="mb-1 block text-xs text-neutral-500">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as (typeof PROJECT_STATUSES)[number])}
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
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create project'}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="compass-panel overflow-hidden">
        <div className="hidden gap-3 border-b border-stone-200 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto]">
          <div>Name</div>
          <div>Function</div>
          <div>Health</div>
          <div>Issues</div>
          <div>Progress</div>
          <div className="text-right">Actions</div>
        </div>

        {visibleProjects.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-neutral-500">
            No projects yet. Create one to get started.
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {visibleProjects.map((project) => {
              const fnName = project.business_function_id
                ? (functionById[project.business_function_id]?.name ?? project.business_function_id)
                : '—'
              const stats = project.stats
              return (
                <li
                  key={project.id}
                  className="flex flex-col gap-3 px-4 py-3 transition hover:bg-stone-50/80 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate text-sm font-medium text-neutral-900 hover:text-sf-orange-dark"
                    >
                      {project.name}
                    </Link>
                    {project.notes ? (
                      <p className="mt-0.5 truncate text-xs text-neutral-500">{project.notes}</p>
                    ) : null}
                  </div>
                  <div className="truncate text-sm text-neutral-600">
                    <span className="mr-2 text-[11px] uppercase tracking-wide text-neutral-400 lg:hidden">
                      Function
                    </span>
                    {fnName}
                  </div>
                  <div>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${statusTone(
                        project.status
                      )}`}
                    >
                      {project.status}
                    </span>
                  </div>
                  <div className="text-sm tabular-nums text-neutral-700">
                    <span className="mr-2 text-[11px] uppercase tracking-wide text-neutral-400 lg:hidden">
                      Issues
                    </span>
                    {stats.issueCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-sf-orange"
                        style={{ width: `${stats.percentComplete}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-neutral-500">
                      {formatPercentComplete(stats.percentComplete)}
                    </span>
                  </div>
                  <div className="flex justify-start gap-2 lg:justify-end">
                    <Link
                      href={`/projects/${project.id}`}
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:bg-white"
                    >
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeProject(project)}
                      disabled={saving}
                      className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-red-600 hover:bg-white"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
