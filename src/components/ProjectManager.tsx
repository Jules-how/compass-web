'use client'

import { useMemo, useState } from 'react'
import type { CompassBusinessFunction, CompassProject } from '@/lib/types'
import { ShellTable } from '@/components/ShellTable'

const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const

function formatUpdated(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function ProjectManager({
  projects,
  functions,
  onRefresh
}: {
  projects: CompassProject[]
  functions: CompassBusinessFunction[]
  onRefresh?: () => void | Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<(typeof PROJECT_STATUSES)[number]>('active')
  const [businessFunctionId, setBusinessFunctionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState<(typeof PROJECT_STATUSES)[number]>('active')
  const [editFunctionId, setEditFunctionId] = useState('')

  const functionById = useMemo(
    () => Object.fromEntries(functions.map((row) => [row.id, row])),
    [functions]
  )

  const sortedFunctions = useMemo(
    () => [...functions].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [functions]
  )

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
          business_function_id: businessFunctionId || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setName('')
      setStatus('active')
      setBusinessFunctionId('')
      setCreating(false)
      await onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(projectId: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          status: editStatus,
          business_function_id: editFunctionId || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setEditingId(null)
      await onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeProject(project: CompassProject) {
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

  const rows = projects.map((project) => {
    if (editingId === project.id) {
      return [
        <input
          key="name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          disabled={saving}
        />,
        <select
          key="fn"
          value={editFunctionId}
          onChange={(e) => setEditFunctionId(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          disabled={saving}
        >
          <option value="">—</option>
          {sortedFunctions.map((fn) => (
            <option key={fn.id} value={fn.id}>
              {fn.name}
            </option>
          ))}
        </select>,
        <select
          key="status"
          value={editStatus}
          onChange={(e) => setEditStatus(e.target.value as (typeof PROJECT_STATUSES)[number])}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          disabled={saving}
        >
          {PROJECT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>,
        <div key="actions" className="flex gap-2">
          <button
            type="button"
            onClick={() => saveEdit(project.id)}
            disabled={saving}
            className="rounded bg-sf-orange px-2 py-1 text-xs font-medium text-white"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditingId(null)}
            disabled={saving}
            className="rounded border border-neutral-300 px-2 py-1 text-xs"
          >
            Cancel
          </button>
        </div>
      ]
    }

    return [
      project.name,
      project.business_function_id
        ? (functionById[project.business_function_id]?.name ?? project.business_function_id)
        : '—',
      project.status,
      <div key="actions" className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-400">{formatUpdated(project.updated_at)}</span>
        <button
          type="button"
          onClick={() => {
            setEditingId(project.id)
            setEditName(project.name)
            setEditStatus(
              (PROJECT_STATUSES.includes(project.status as (typeof PROJECT_STATUSES)[number])
                ? project.status
                : 'active') as (typeof PROJECT_STATUSES)[number]
            )
            setEditFunctionId(project.business_function_id ?? '')
          }}
          className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => removeProject(project)}
          className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-red-600"
        >
          Delete
        </button>
      </div>
    ]
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="rounded-lg bg-sf-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-sf-orange-dark"
        >
          {creating ? 'Cancel' : 'New project'}
        </button>
      </div>

      {creating ? (
        <form
          onSubmit={createProject}
          className="space-y-3 rounded-lg border border-sf-orange/40 bg-white p-4"
        >
          <input
            autoFocus
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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

      <ShellTable
        columns={['Name', 'Function', 'Status', 'Updated']}
        rows={rows}
        emptyMessage="No projects yet. Create one to get started."
      />
    </div>
  )
}
