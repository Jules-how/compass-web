'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { CompassBusinessFunctionWithStats, SystemMapMeta } from '@/lib/types'
import { emptyFunctionStats } from '@/lib/function-stats'
import {
  functionAccentColor,
  resolveFunctionKind,
  withAlpha
} from '@/lib/function-identity'
import { FunctionMark } from '@/components/FunctionGlyph'
import { cn } from '@/lib/utils'

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

function MetricChip({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div
      className="relative min-w-[5.5rem] overflow-hidden rounded-xl px-3.5 pb-2.5 pt-3 text-center"
      style={{
        backgroundColor: withAlpha(color, 0.08),
        boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.2)}`
      }}
    >
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <p className="font-display text-lg font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
    </div>
  )
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
      const recent = (row.recentProjects ?? []).map((project) => project.name).join(' ')
      const haystack = `${row.name} ${row.slug} ${recent}`.toLowerCase()
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
            type="search"
            aria-label="Search functions"
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
            aria-label="Function name"
            required
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
        <div className="space-y-3">
          {filtered.map((row) => {
            const stats = row.stats ?? emptyFunctionStats()
            const identity = { id: row.id, slug: row.slug, name: row.name }
            const color = functionAccentColor(identity)
            const kind = resolveFunctionKind(identity)
            const recent = row.recentProjects ?? []
            const map = (row.system_map ?? {}) as SystemMapMeta
            return (
              <Link
                key={row.id}
                href={`/functions/${row.id}`}
                className={cn(
                  'compass-panel group relative block overflow-hidden transition',
                  'hover:-translate-y-0.5 hover:shadow-lift'
                )}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(105deg, ${withAlpha(color, 0.14)} 0%, ${withAlpha(color, 0.04)} 42%, transparent 68%), radial-gradient(420px 180px at 100% 0%, ${withAlpha(color, 0.1)}, transparent 60%)`
                  }}
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-1.5"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className="relative flex flex-col gap-4 p-5 pl-6 lg:flex-row lg:items-center lg:gap-6">
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <FunctionMark kind={kind} color={color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="font-display text-xl font-semibold tracking-tight text-neutral-900">
                          {row.name}
                        </h3>
                        <span
                          className="rounded-lg px-2 py-0.5 text-xs font-medium tabular-nums"
                          style={{
                            backgroundColor: withAlpha(color, 0.14),
                            color
                          }}
                        >
                          /{row.slug}
                        </span>
                      </div>
                      {map.why ? (
                        <p className="mt-2 text-sm text-neutral-600">{map.why}</p>
                      ) : null}
                      {map.influences && map.influences.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {map.influences.slice(0, 3).map((edge) => (
                            <span
                              key={`${edge.route}-${edge.table}`}
                              className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] text-neutral-500 ring-1 ring-stone-200/80"
                            >
                              {edge.name}
                            </span>
                          ))}
                        </div>
                      ) : recent.length > 0 ? (
                        <p className="mt-2 truncate text-sm text-neutral-600">
                          <span className="text-neutral-400">Projects · </span>
                          {recent.map((project) => project.name).join(' · ')}
                          {stats.projectCount > recent.length
                            ? ` · +${stats.projectCount - recent.length} more`
                            : ''}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-neutral-400">
                          No projects yet — open to add or assign work
                        </p>
                      )}
                      <p className="mt-2 text-xs text-neutral-400">
                        Updated {formatUpdated(row.updated_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:gap-3">
                    <MetricChip label="Projects" value={stats.projectCount} color={color} />
                    <MetricChip label="Open" value={stats.openTaskCount} color={color} />
                    <MetricChip label="Done" value={stats.completedTaskCount} color={color} />
                    <span
                      className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-xl transition group-hover:bg-white/80"
                      style={{ color: withAlpha(color, 0.7) }}
                    >
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
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
