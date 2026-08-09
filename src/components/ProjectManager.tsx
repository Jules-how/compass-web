'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompassBusinessFunction, CompassProjectWithStats } from '@/lib/types'
import { formatPercentComplete } from '@/lib/project-stats'
import {
  DEFAULT_PROJECT_ICON_COLOR,
  PROJECT_BOARD_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_PRIORITIES,
  formatProjectDate,
  normalizeProjectStatus,
  projectColorForFunction,
  projectHealthLabel,
  projectPriorityLabel,
  projectStatusLabel,
  type ProjectBoardStatus
} from '@/lib/project-pm'
import type { TimelineZoom } from '@/lib/campaign-timeline'
import { ProjectTimeline, TimelineZoomControls, type ProjectTimelineHandle } from '@/components/ProjectTimeline'
import { ProjectDetailPanel } from '@/components/ProjectDetailPanel'
import { cn } from '@/lib/utils'

type ViewMode = 'list' | 'board' | 'timeline'
type GroupBy = 'none' | 'status' | 'function' | 'health'
type OrderBy = 'name' | 'priority' | 'target_date' | 'updated_at'
type InsightsTab = 'health' | 'leads'

const PROJECTS_VIEW_STORAGE_KEY = 'compass.projects.view'

function isViewMode(value: string | null): value is ViewMode {
  return value === 'list' || value === 'board' || value === 'timeline'
}

function readStoredProjectsView(): ViewMode {
  if (typeof window === 'undefined') return 'board'
  try {
    const raw = window.localStorage.getItem(PROJECTS_VIEW_STORAGE_KEY)
    return isViewMode(raw) ? raw : 'board'
  } catch {
    return 'board'
  }
}

function writeStoredProjectsView(view: ViewMode) {
  try {
    window.localStorage.setItem(PROJECTS_VIEW_STORAGE_KEY, view)
  } catch {
    /* ignore quota / private mode */
  }
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

function initialsFromLabel(label: string | null | undefined): string {
  const parts = (label || '?').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function StatusGlyph({ status, className }: { status: string; className?: string }) {
  const normalized = normalizeProjectStatus(status)
  if (normalized === 'backlog') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-orange-400', className)} aria-hidden>
        <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2" />
      </svg>
    )
  }
  if (normalized === 'planned') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-neutral-400', className)} aria-hidden>
        <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    )
  }
  if (normalized === 'in_progress') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-amber-400', className)} aria-hidden>
        <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    )
  }
  if (normalized === 'completed') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-sky-500', className)} aria-hidden>
        <circle cx="8" cy="8" r="6" fill="currentColor" />
        <path d="M5.2 8.1 7.1 10l3.7-4" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-neutral-400', className)} aria-hidden>
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 5.5 10.5 10.5M10.5 5.5 5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function HealthGlyph({ health, className }: { health: string; className?: string }) {
  if (health === 'on_track') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-emerald-500', className)} aria-hidden>
        <path
          d="M2.5 9.5c1.2-2 2.2-3 3.5-3s2.2 2 3.5 2 2.3-2 4-2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (health === 'at_risk') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-amber-500', className)} aria-hidden>
        <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 1.8" />
      </svg>
    )
  }
  if (health === 'off_track') {
    return (
      <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-red-500', className)} aria-hidden>
        <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 5v4.2M8 11.2h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={cn('h-3.5 w-3.5 text-orange-400', className)} aria-hidden>
      <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.2 2" />
    </svg>
  )
}

function ProjectGlyph({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold text-white',
        className
      )}
      style={{ background: color || DEFAULT_PROJECT_ICON_COLOR }}
      aria-hidden
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="currentColor">
        <path d="M2 3.2 6 1.4 10 3.2v5.6L6 10.6 2 8.8V3.2Z" opacity="0.95" />
      </svg>
    </span>
  )
}

function LeadAvatar({ label }: { label: string | null | undefined }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600"
      title={label || 'No lead'}
    >
      {initialsFromLabel(label)}
    </span>
  )
}

function ToolbarIconButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800',
        active && 'bg-neutral-100 text-neutral-900'
      )}
    >
      {children}
    </button>
  )
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 3.5h11l-4 5v3.5l-3 1.5v-5l-4-5Z" />
    </svg>
  )
}

function DisplayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 5h10" />
      <path d="M3 8h10" />
      <path d="M3 11h10" />
      <circle cx="6" cy="5" r="1" fill="currentColor" />
      <circle cx="10" cy="8" r="1" fill="currentColor" />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
    </svg>
  )
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="3.5" height="10" rx="1" />
      <rect x="6.25" y="3" width="3.5" height="7" rx="1" />
      <rect x="10.5" y="3" width="3.5" height="9" rx="1" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" />
    </svg>
  )
}

function TimelineIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 8h11" />
      <circle cx="5" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" />
    </svg>
  )
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
  const [view, setView] = useState<ViewMode>(readStoredProjectsView)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectBoardStatus>('all')
  const [clientFilter, setClientFilter] = useState<'all' | 'unassigned' | string>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [orderBy, setOrderBy] = useState<OrderBy>('name')
  const [insightsTab, setInsightsTab] = useState<InsightsTab>('health')
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [timelineZoom, setTimelineZoom] = useState<TimelineZoom>('year')
  const [filterOpen, setFilterOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [cardMenuId, setCardMenuId] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<ProjectTimelineHandle>(null)
  const createTitleRef = useRef<HTMLInputElement>(null)

  function openProject(projectId: string) {
    setCardMenuId(null)
    setFilterOpen(false)
    setDisplayOpen(false)
    setCreating(false)
    setSelectedProjectId(projectId)
  }

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

  const createIconColor = useMemo(
    () => projectColorForFunction(businessFunctionId ? functionById[businessFunctionId] : null),
    [businessFunctionId, functionById]
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

  useEffect(() => {
    writeStoredProjectsView(view)
  }, [view])

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (filterOpen && filterRef.current && !filterRef.current.contains(target)) {
        setFilterOpen(false)
      }
      if (displayOpen && displayRef.current && !displayRef.current.contains(target)) {
        setDisplayOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFilterOpen(false)
        setDisplayOpen(false)
        setCardMenuId(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filterOpen, displayOpen])

  function openCreate(nextStatus: ProjectBoardStatus = 'backlog') {
    setStatus(nextStatus)
    setCreating(true)
    setFilterOpen(false)
    setDisplayOpen(false)
    setCardMenuId(null)
  }

  useEffect(() => {
    if (!creating) return
    const frame = window.requestAnimationFrame(() => createTitleRef.current?.focus())
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCreating(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [creating])

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

  async function patchProjectDates(projectId: string, start: string, end: string) {
    setError(null)
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_date: start, target_date: end })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const message = body.error ?? `Request failed (${res.status})`
      setError(message)
      throw new Error(message)
    }
    await onRefresh?.()
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
    <div className="space-y-2">
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setFilterOpen((value) => !value)
              setDisplayOpen(false)
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-medium text-neutral-700 hover:bg-neutral-100"
          >
            All projects
            <span className="text-[10px] text-neutral-400">▾</span>
          </button>
          {(statusFilter !== 'all' || clientFilter !== 'all') && (
            <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] tabular-nums text-neutral-500">
              Filtered
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {view === 'timeline' ? (
            <div className="mr-1">
              <TimelineZoomControls
                zoom={timelineZoom}
                onZoomChange={setTimelineZoom}
                onToday={() => timelineRef.current?.scrollToToday('smooth')}
              />
            </div>
          ) : null}

          <div className="relative" ref={filterRef}>
            <ToolbarIconButton
              label="Filter"
              active={filterOpen || statusFilter !== 'all' || clientFilter !== 'all'}
              onClick={() => {
                setFilterOpen((value) => !value)
                setDisplayOpen(false)
              }}
            >
              <FilterIcon />
            </ToolbarIconButton>
            {filterOpen ? (
              <div className="absolute right-0 top-9 z-40 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Filter
                </div>
                <label className="mb-2 block text-xs text-neutral-500">
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                  >
                    <option value="all">All statuses</option>
                    {PROJECT_BOARD_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {projectStatusLabel(value)}
                      </option>
                    ))}
                  </select>
                </label>
                {sortedClients.length > 0 ? (
                  <label className="mb-2 block text-xs text-neutral-500">
                    Client
                    <select
                      value={clientFilter}
                      onChange={(e) => setClientFilter(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                    >
                      <option value="all">All clients</option>
                      <option value="unassigned">No client</option>
                      {sortedClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
                  onClick={() => {
                    setStatusFilter('all')
                    setClientFilter('all')
                  }}
                >
                  Reset filters
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={displayRef}>
            <ToolbarIconButton
              label="Display options"
              active={displayOpen}
              onClick={() => {
                setDisplayOpen((value) => !value)
                setFilterOpen(false)
              }}
            >
              <DisplayIcon />
            </ToolbarIconButton>
            {displayOpen ? (
              <div className="absolute right-0 top-9 z-40 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                  Display
                </div>
                <div className="mb-3 flex rounded-lg border border-neutral-200 p-0.5 text-xs">
                  {(
                    [
                      ['list', 'List', <ListIcon key="list" />],
                      ['board', 'Board', <BoardIcon key="board" />],
                      ['timeline', 'Timeline', <TimelineIcon key="timeline" />]
                    ] as const
                  ).map(([mode, label, icon]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setView(mode)}
                      className={cn(
                        'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 font-medium',
                        view === mode ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-800'
                      )}
                      title={label}
                    >
                      {icon}
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
                <label className="mb-2 block text-xs text-neutral-500">
                  Grouping
                  <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                    className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                  >
                    <option value="none">No grouping</option>
                    <option value="status">Group by status</option>
                    <option value="function">Group by function</option>
                    <option value="health">Group by health</option>
                  </select>
                </label>
                <label className="block text-xs text-neutral-500">
                  Ordering
                  <select
                    value={orderBy}
                    onChange={(e) => setOrderBy(e.target.value as OrderBy)}
                    className="mt-1 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                  >
                    <option value="name">Order by name</option>
                    <option value="priority">Order by priority</option>
                    <option value="target_date">Order by target</option>
                    <option value="updated_at">Order by updated</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          <ToolbarIconButton
            label={insightsOpen ? 'Hide insights' : 'Show insights'}
            active={insightsOpen}
            onClick={() => setInsightsOpen((value) => !value)}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
              <path d="M10 3v10" />
            </svg>
          </ToolbarIconButton>

          <button
            type="button"
            onClick={() => openCreate(status)}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
            aria-label="New project"
            title="New project"
          >
            +
          </button>
        </div>
      </div>

      {creating ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/40 px-4 py-10 sm:py-16"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setCreating(false)
          }}
        >
          <form
            onSubmit={createProject}
            className="relative w-full max-w-[720px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-500">
                <ProjectGlyph color={createIconColor} />
                <span className="truncate font-medium text-neutral-700">Switchflow</span>
                <span className="text-neutral-300">›</span>
                <span className="font-medium text-neutral-800">New project</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!saving) setCreating(false)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex items-start gap-3">
                <ProjectGlyph color={createIconColor} className="mt-1.5 h-6 w-6 rounded-md text-[11px]" />
                <div className="min-w-0 flex-1">
                  <input
                    ref={createTitleRef}
                    type="text"
                    placeholder="Project name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border-0 bg-transparent p-0 text-[22px] font-semibold tracking-tight text-neutral-900 outline-none placeholder:text-neutral-300"
                    disabled={saving}
                  />
                  <input
                    type="text"
                    placeholder="Add a short summary…"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="mt-1 w-full border-0 bg-transparent p-0 text-[13px] text-neutral-600 outline-none placeholder:text-neutral-400"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectBoardStatus)}
                  className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700"
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
                  className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700"
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
                  className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700"
                  disabled={saving}
                >
                  <option value="">Lead / Function</option>
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
                    className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700"
                    disabled={saving}
                  >
                    <option value="">Members / Client</option>
                    {sortedClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <label className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700">
                  Start
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-[12px] outline-none"
                    disabled={saving}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700">
                  Target
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="bg-transparent text-[12px] outline-none"
                    disabled={saving}
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[12px] text-neutral-700">
                  Labels
                  <input
                    type="text"
                    value={labels}
                    onChange={(e) => setLabels(e.target.value)}
                    placeholder="comma separated"
                    className="w-28 bg-transparent text-[12px] outline-none placeholder:text-neutral-400"
                    disabled={saving}
                  />
                </label>
              </div>

              <textarea
                placeholder="Write a description, a project brief, or collect ideas…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                className="w-full resize-y border-0 bg-transparent p-0 text-[13px] leading-relaxed text-neutral-700 outline-none placeholder:text-neutral-400"
                disabled={saving}
              />

              <div className="rounded-lg border border-neutral-200/80">
                <div className="flex items-center justify-between px-3 py-2">
                  <h3 className="text-[13px] font-medium text-neutral-800">Milestones</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setMilestones((rows) => [...rows, { title: '', description: '', target_date: '' }])
                    }
                    className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                    aria-label="Add milestone"
                  >
                    +
                  </button>
                </div>
                {milestones.length === 0 ? (
                  <p className="border-t border-neutral-100 px-3 py-3 text-[12px] text-neutral-400">
                    No milestones yet.
                  </p>
                ) : (
                  <div className="space-y-2 border-t border-neutral-100 px-3 py-3">
                    {milestones.map((milestone, index) => (
                      <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
                        <input
                          type="text"
                          placeholder="Milestone title"
                          value={milestone.title}
                          onChange={(e) =>
                            setMilestones((rows) =>
                              rows.map((row, i) => (i === index ? { ...row, title: e.target.value } : row))
                            )
                          }
                          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
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
                          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                        />
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
                          className="rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setMilestones((rows) => rows.filter((_, i) => i !== index))}
                          className="text-xs text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <details className="text-[12px] text-neutral-500">
                <summary className="cursor-pointer select-none font-medium text-neutral-600 hover:text-neutral-800">
                  Dependencies
                </summary>
                <select
                  multiple
                  value={dependsOn}
                  onChange={(e) =>
                    setDependsOn([...e.target.selectedOptions].map((option) => option.value))
                  }
                  className="mt-2 h-24 w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm"
                  disabled={saving}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </details>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  if (!saving) {
                    resetCreateForm()
                    setCreating(false)
                  }
                }}
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="rounded-md bg-[#5e6ad2] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#5058c1] disabled:opacity-50"
              >
                {saving ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className={`grid gap-3 ${insightsOpen ? 'xl:grid-cols-[minmax(0,1fr)_240px]' : ''}`}>
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
                          className="flex flex-col gap-3 px-4 py-5 transition hover:bg-stone-50/80 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto] lg:items-center"
                        >
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openProject(project.id)}
                              className="block w-full truncate text-left text-sm font-medium text-neutral-900 hover:text-sf-orange-dark"
                            >
                              {project.name}
                            </button>
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
                            <button
                              type="button"
                              onClick={() => openProject(project.id)}
                              className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600"
                            >
                              Open
                            </button>
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
            <div className="-mx-1 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-3 px-1">
                {PROJECT_BOARD_STATUSES.map((column) => {
                  const items = visibleProjects.filter(
                    (project) => normalizeProjectStatus(project.status) === column
                  )
                  return (
                    <section
                      key={column}
                      className="flex w-[260px] shrink-0 flex-col rounded-xl bg-[#f4f5f7]/80"
                    >
                      <header className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2.5">
                        <StatusGlyph status={column} />
                        <h3 className="text-[13px] font-medium text-neutral-700">
                          {projectStatusLabel(column)}
                        </h3>
                        <span className="text-[12px] tabular-nums text-neutral-400">{items.length}</span>
                        <div className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-neutral-700"
                            aria-label={`${projectStatusLabel(column)} options`}
                            title="Column options"
                          >
                            ···
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreate(column)}
                            className="flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-neutral-700"
                            aria-label={`New project in ${projectStatusLabel(column)}`}
                            title="New project"
                          >
                            +
                          </button>
                        </div>
                      </header>
                      <ul className="flex flex-1 flex-col gap-2.5 px-2 pb-2">
                        {items.length === 0 ? (
                          <li className="rounded-lg border border-dashed border-neutral-200/80 px-3 py-6 text-center text-[12px] text-neutral-400">
                            No projects
                          </li>
                        ) : (
                          items.map((project) => {
                            const clientLabel =
                              project.client_name ||
                              (project.client_id ? clientById[project.client_id]?.name : null)
                            const teamLabel = project.business_function_id
                              ? functionById[project.business_function_id]?.name
                              : null
                            const menuOpen = cardMenuId === project.id
                            return (
                              <li
                                key={project.id}
                                className="group relative rounded-[8px] border border-neutral-200/90 bg-white p-2.5 shadow-[0_1px_1px_rgba(16,24,40,0.04)] transition hover:border-neutral-300"
                              >
                                <div className="mb-1.5 flex items-center gap-1.5">
                                  <ProjectGlyph
                                    color={projectColorForFunction(
                                      project.business_function_id
                                        ? functionById[project.business_function_id]
                                        : null
                                    )}
                                  />
                                  <div className="ml-auto flex items-center gap-1">
                                    <span title={projectHealthLabel(project.health)}>
                                      <HealthGlyph health={project.health || 'no_updates'} />
                                    </span>
                                    <LeadAvatar label={teamLabel || clientLabel} />
                                    <button
                                      type="button"
                                      className={cn(
                                        'flex h-5 w-5 items-center justify-center rounded text-[11px] text-neutral-400 opacity-0 transition hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100',
                                        menuOpen && 'opacity-100'
                                      )}
                                      aria-label="Project actions"
                                      onClick={() =>
                                        setCardMenuId((id) => (id === project.id ? null : project.id))
                                      }
                                    >
                                      ···
                                    </button>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => openProject(project.id)}
                                  className="block w-full text-left text-[13px] font-medium leading-snug text-neutral-900 hover:text-neutral-700"
                                >
                                  {project.name}
                                </button>

                                {(project.summary || clientLabel) && (
                                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-500">
                                    {project.summary || clientLabel}
                                  </p>
                                )}

                                <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-500">
                                  {project.target_date ? (
                                    <span className="inline-flex items-center gap-1">
                                      <CalendarIcon />
                                      {formatProjectDate(project.target_date)}
                                    </span>
                                  ) : null}
                                  {clientLabel && project.summary ? (
                                    <span className="truncate">{clientLabel}</span>
                                  ) : null}
                                </div>

                                <div className="mt-2 text-[11px] tabular-nums text-neutral-400">
                                  {project.stats.issueCount}{' '}
                                  {project.stats.issueCount === 1 ? 'issue' : 'issues'}
                                </div>

                                {menuOpen ? (
                                  <div className="absolute right-2 top-8 z-30 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 text-[13px] shadow-lg">
                                    <button
                                      type="button"
                                      className="block w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50"
                                      onClick={() => openProject(project.id)}
                                    >
                                      Open project
                                    </button>
                                    <div className="my-1 border-t border-neutral-100" />
                                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                      Move to
                                    </div>
                                    {PROJECT_BOARD_STATUSES.map((value) => (
                                      <button
                                        key={value}
                                        type="button"
                                        disabled={saving || normalizeProjectStatus(project.status) === value}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                                        onClick={() => {
                                          setCardMenuId(null)
                                          void patchProjectStatus(project.id, value)
                                        }}
                                      >
                                        <StatusGlyph status={value} />
                                        {projectStatusLabel(value)}
                                      </button>
                                    ))}
                                    <div className="my-1 border-t border-neutral-100" />
                                    <button
                                      type="button"
                                      disabled={saving}
                                      className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                                      onClick={() => {
                                        setCardMenuId(null)
                                        void removeProject(project)
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </li>
                            )
                          })
                        )}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </div>
          ) : null}

          {view === 'timeline' ? (
            <ProjectTimeline
              ref={timelineRef}
              projects={visibleProjects}
              clientById={clientById}
              functionById={functionById}
              zoom={timelineZoom}
              onZoomChange={setTimelineZoom}
              onDatesChange={patchProjectDates}
              onOpenProject={openProject}
              showToolbar={false}
            />
          ) : null}
        </div>

        {insightsOpen ? (
          <aside className="h-fit rounded-xl border border-neutral-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="mb-3 flex rounded-full bg-neutral-100 p-0.5 text-[12px]">
              {(['health', 'leads'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInsightsTab(tab)}
                  className={cn(
                    'flex-1 rounded-full px-2.5 py-1 font-medium capitalize transition',
                    insightsTab === tab
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            {insightsTab === 'health' ? (
              <ul className="space-y-1.5">
                {PROJECT_HEALTHS.map((health) => (
                  <li
                    key={health}
                    className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] text-neutral-700"
                  >
                    <HealthGlyph health={health} />
                    <span className="min-w-0 flex-1 truncate">
                      {health === 'no_updates' ? 'Update missing' : projectHealthLabel(health)}
                    </span>
                    <span className="tabular-nums text-neutral-400">{healthCounts[health] ?? 0}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="space-y-2 px-1.5 py-1 text-[13px] text-neutral-600">
                <p>
                  <span className="font-medium text-neutral-900">{noLeadCount}</span> project
                  {noLeadCount === 1 ? '' : 's'} with no dedicated lead field yet.
                </p>
                <p className="text-[12px] text-neutral-500">
                  Function is used as the current team signal. A first-class lead assignee can land next.
                </p>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {selectedProjectId ? (
        <ProjectDetailPanel
          projectId={selectedProjectId}
          variant="modal"
          projects={projects}
          onClose={() => setSelectedProjectId(null)}
          onChanged={async () => {
            await onRefresh?.()
          }}
        />
      ) : null}
    </div>
  )
}
