'use client'

import { useState } from 'react'
import type {
  CompassBusinessFunction,
  CompassProject,
  TaskStatus
} from '@/lib/types'
import { TASK_STATUSES } from '@/lib/types'

interface TaskCreateProps {
  projectsById: Record<string, CompassProject>
  businessFunctionsById: Record<string, CompassBusinessFunction>
  onCreated: () => void | Promise<void>
  defaultProjectId?: string
  defaultBusinessFunctionId?: string
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled'
}

export default function TaskCreate({
  projectsById,
  businessFunctionsById,
  onCreated,
  defaultProjectId = '',
  defaultBusinessFunctionId = ''
}: TaskCreateProps) {
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('not-started')
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [businessFunctionId, setBusinessFunctionId] = useState(defaultBusinessFunctionId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          status,
          project_id: projectId || null,
          business_function_id: businessFunctionId || null
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setTitle('')
      setProjectId(defaultProjectId)
      setBusinessFunctionId(defaultBusinessFunctionId)
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const projectOptions = Object.values(projectsById).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const bfOptions = Object.values(businessFunctionsById).sort(
    (a, b) => a.sort_order - b.sort_order
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-sf-orange/40 bg-white p-4"
    >
      <input
        autoFocus
        type="text"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none focus:ring-1 focus:ring-sf-orange"
        disabled={saving}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            disabled={saving}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Project</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            disabled={saving}
          >
            <option value="">—</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-500">Function</span>
          <select
            value={businessFunctionId}
            onChange={(e) => setBusinessFunctionId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            disabled={saving}
          >
            <option value="">—</option>
            {bfOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-sf-orange-dark disabled:opacity-60"
        >
          {saving ? 'Creating…' : 'Create task'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </form>
  )
}
