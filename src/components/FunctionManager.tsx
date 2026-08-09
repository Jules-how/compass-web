'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CompassBusinessFunctionWithStats } from '@/lib/types'
import { emptyFunctionStats } from '@/lib/function-stats'
import { cn } from '@/lib/utils'

const FUNCTION_ICON_COLORS = [
  '#F2994A',
  '#5E6AD2',
  '#26B5CE',
  '#4CB782',
  '#EB5757',
  '#BB87FC',
  '#F2C94C',
  '#95A2B3'
] as const

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function functionIconColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return FUNCTION_ICON_COLORS[hash % FUNCTION_ICON_COLORS.length]
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

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

export function FunctionManager({
  functions,
  onRefresh
}: {
  functions: CompassBusinessFunctionWithStats[]
  onRefresh?: () => void | Promise<void>
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...functions].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    if (!q) return sorted
    return sorted.filter((row) => {
      const haystack = `${row.name} ${row.slug}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [functions, query])

  const totals = useMemo(() => {
    return functions.reduce(
      (acc, row) => {
        const stats = row.stats ?? emptyFunctionStats()
        acc.projects += stats.projectCount
        acc.openTasks += stats.openTaskCount
        return acc
      },
      { projects: 0, openTasks: 0 }
    )
  }, [functions])

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search functions…"
            className="compass-input max-w-sm"
          />
          <p className="text-sm text-neutral-500">
            <span className="tabular-nums text-neutral-700">{filtered.length}</span> modules
            <span className="mx-1.5 text-neutral-300">·</span>
            <span className="tabular-nums">{totals.projects}</span> projects
            <span className="mx-1.5 text-neutral-300">·</span>
            <span className="tabular-nums">{totals.openTasks}</span> open tasks
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((value) => !value)}
          className={creating ? 'compass-btn-secondary' : 'compass-btn-primary'}
        >
          {creating ? 'Cancel' : 'New function'}
        </button>
      </div>

      {creating ? (
        <form onSubmit={createFunction} className="compass-panel space-y-4 p-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">New function</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Create a module for a business area — then open it to manage projects and tasks.
            </p>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Function name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value))
            }}
            className="compass-input"
            disabled={saving}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Slug</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="compass-input"
                disabled={saving}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Order</span>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="compass-input"
                disabled={saving}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="compass-btn-primary"
          >
            {saving ? 'Creating…' : 'Create function'}
          </button>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {filtered.length === 0 ? (
        <div className="compass-panel px-8 py-16 text-center">
          <p className="font-display text-lg font-semibold text-neutral-900">
            {functions.length === 0 ? 'No functions yet' : 'No matches'}
          </p>
          <p className="mt-2 text-sm text-neutral-500">
            {functions.length === 0
              ? 'Create your first business function to organize projects and tasks by module.'
              : 'Try a different search.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((row) => {
            const stats = row.stats ?? emptyFunctionStats()
            const color = functionIconColor(row.id || row.slug || row.name)
            return (
              <Link
                key={row.id}
                href={`/functions/${row.id}`}
                className={cn(
                  'compass-panel group relative block overflow-hidden p-5 transition',
                  'hover:-translate-y-0.5 hover:shadow-lift'
                )}
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-1 opacity-90"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className="flex items-start gap-4 pl-1">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-soft"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  >
                    {initialsFromLabel(row.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display truncate text-lg font-semibold tracking-tight text-neutral-900">
                          {row.name}
                        </h3>
                        <p className="mt-0.5 truncate text-sm text-neutral-500">/{row.slug}</p>
                      </div>
                      <span className="mt-1 inline-flex shrink-0 items-center text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500">
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
                          <path
                            d="M6 3.5 10.5 8 6 12.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-inset ring-stone-200/70">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Projects
                        </p>
                        <p className="mt-1 font-display text-xl font-semibold tabular-nums text-neutral-900">
                          {stats.projectCount}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {stats.activeProjectCount} active
                        </p>
                      </div>
                      <div className="rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-inset ring-stone-200/70">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Open
                        </p>
                        <p className="mt-1 font-display text-xl font-semibold tabular-nums text-neutral-900">
                          {stats.openTaskCount}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">tasks</p>
                      </div>
                      <div className="rounded-xl bg-stone-50 px-3 py-2.5 ring-1 ring-inset ring-stone-200/70">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                          Done
                        </p>
                        <p className="mt-1 font-display text-xl font-semibold tabular-nums text-neutral-900">
                          {stats.completedTaskCount}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">completed</p>
                      </div>
                    </div>

                    <p className="mt-4 text-xs text-neutral-400">
                      Updated {formatUpdated(row.updated_at)}
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
