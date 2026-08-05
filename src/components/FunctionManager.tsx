'use client'

import { useState } from 'react'
import type { CompassBusinessFunction } from '@/lib/types'
import { ShellTable } from '@/components/ShellTable'

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

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function FunctionManager({
  functions,
  onRefresh
}: {
  functions: CompassBusinessFunction[]
  onRefresh?: () => void | Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editSortOrder, setEditSortOrder] = useState('0')

  async function createFunction(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/functions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: (slug || slugify(name)).trim(),
          sort_order: Number(sortOrder) || 0
        })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      setName('')
      setSlug('')
      setSortOrder('0')
      setCreating(false)
      await onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(functionId: string) {
    if (!editName.trim() || !editSlug.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/functions/${functionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          slug: editSlug.trim(),
          sort_order: Number(editSortOrder) || 0
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

  async function removeFunction(row: CompassBusinessFunction) {
    if (!confirm(`Delete function “${row.name}”?`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/functions/${row.id}`, { method: 'DELETE' })
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

  const rows = functions.map((row) => {
    if (editingId === row.id) {
      return [
        <input
          key="name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          disabled={saving}
        />,
        <input
          key="slug"
          value={editSlug}
          onChange={(e) => setEditSlug(e.target.value)}
          className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
          disabled={saving}
        />,
        <input
          key="order"
          type="number"
          value={editSortOrder}
          onChange={(e) => setEditSortOrder(e.target.value)}
          className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm"
          disabled={saving}
        />,
        <div key="actions" className="flex gap-2">
          <button
            type="button"
            onClick={() => saveEdit(row.id)}
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
      row.name,
      row.slug,
      String(row.sort_order),
      <div key="actions" className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-400">{formatUpdated(row.updated_at)}</span>
        <button
          type="button"
          onClick={() => {
            setEditingId(row.id)
            setEditName(row.name)
            setEditSlug(row.slug)
            setEditSortOrder(String(row.sort_order))
          }}
          className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => removeFunction(row)}
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
          {functions.length} function{functions.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className="rounded-lg bg-sf-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-sf-orange-dark"
        >
          {creating ? 'Cancel' : 'New function'}
        </button>
      </div>

      {creating ? (
        <form
          onSubmit={createFunction}
          className="space-y-3 rounded-lg border border-sf-orange/40 bg-white p-4"
        >
          <input
            autoFocus
            type="text"
            placeholder="Function name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value))
            }}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            disabled={saving}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Slug</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-neutral-500">Order</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                disabled={saving}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-sf-orange px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create function'}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ShellTable
        columns={['Name', 'Slug', 'Order', 'Updated']}
        rows={rows}
        emptyMessage="No business functions yet. Create one to get started."
      />
    </div>
  )
}
