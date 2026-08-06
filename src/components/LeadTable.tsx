'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { LeadContact, LeadListFilters } from '@/lib/types'
import { exportToCsv } from '@/lib/csv'

interface LeadTableProps {
  leads: LeadContact[]
  filters: LeadListFilters
  page: number
  pageSize: number
  total: number
  totalShown: number
  hasMore: boolean
}

const OUTBOUND_STATUSES = [
  'uncontacted',
  'contacted',
  'replied',
  'interested',
  'not_interested',
  'suppressed',
  'booked',
  'converted'
]

const VERTICALS = ['hvac', 'electrician', 'broker', 'recruitment', 'trades', 'agency', 'other']
const SOURCES = ['prospeo', 'origami', 'vibe', 'manual', 'instantly', 'csv', 'sheets', 'hubspot']

const VIEW_COLUMNS = [
  { id: 'connection', label: 'Connection strength' },
  { id: 'last_email', label: 'Last email interaction' },
  { id: 'last_calendar', label: 'Last calendar interaction' },
  { id: 'email', label: 'Email addresses' },
  { id: 'description', label: 'Description' },
  { id: 'job_title', label: 'Job title' },
  { id: 'phone', label: 'Phone numbers' },
  { id: 'company', label: 'Company' },
  { id: 'city', label: 'Primary location › City' }
] as const

type ViewColumnId = (typeof VIEW_COLUMNS)[number]['id']

const DEFAULT_VISIBLE: ViewColumnId[] = [
  'connection',
  'last_email',
  'last_calendar',
  'email',
  'description',
  'job_title'
]

function buildQuery(filters: LeadListFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.vertical) params.set('vertical', filters.vertical)
  if (filters.source) params.set('source', filters.source)
  if (filters.outbound_status) params.set('outbound_status', filters.outbound_status)
  if (filters.city) params.set('city', filters.city)
  params.set('page', String(page))
  return params.toString()
}

/** Attio-style relative timestamps. */
function formatRelative(value: string | null | undefined): string {
  if (!value) return 'No contact'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'No contact'
  const seconds = Math.round((Date.now() - d.getTime()) / 1000)
  if (seconds < 0) return 'just now'
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) {
    if (hours === 1) return 'about 1 hour ago'
    return `about ${hours} hours ago`
  }
  const days = Math.round(hours / 24)
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  if (months === 1) return 'about 1 month ago'
  if (months < 12) return `about ${months} months ago`
  const years = Math.round(months / 12)
  return years === 1 ? 'about 1 year ago' : `about ${years} years ago`
}

function humanizeStatus(status: string | null | undefined): string {
  if (!status) return 'Uncontacted'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/** Map outbound status → Attio connection-strength color language. */
function connectionTone(status: string | null | undefined): {
  dot: string
  label: string
} {
  switch (status) {
    case 'converted':
    case 'booked':
    case 'interested':
      return { dot: 'bg-[#22c55e]', label: humanizeStatus(status) }
    case 'replied':
      return { dot: 'bg-[#06b6d4]', label: humanizeStatus(status) }
    case 'contacted':
      return { dot: 'bg-[#3b82f6]', label: humanizeStatus(status) }
    case 'not_interested':
    case 'suppressed':
      return { dot: 'bg-[#ef4444]', label: humanizeStatus(status) }
    default:
      return { dot: 'bg-[#f97316]', label: humanizeStatus(status) }
  }
}

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function descriptionFor(lead: LeadContact): string {
  return (lead.interest_label || lead.tags || '').trim()
}

export default function LeadTable({
  leads,
  filters,
  page,
  pageSize,
  total,
  totalShown,
  hasMore
}: LeadTableProps) {
  const [draftFilters, setDraftFilters] = useState<LeadListFilters>(filters)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [visible, setVisible] = useState<ViewColumnId[]>(DEFAULT_VISIBLE)
  const filterRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)

  const activeFilterCount = useMemo(() => {
    return [filters.vertical, filters.source, filters.outbound_status, filters.city].filter(Boolean)
      .length
  }, [filters])

  function applyFilters() {
    const qs = buildQuery(draftFilters, 1)
    window.location.href = `/leads?${qs}`
  }

  function resetFilters() {
    window.location.href = '/leads'
  }

  function goToPage(next: number) {
    if (next < 1) return
    const qs = buildQuery(filters, next)
    window.location.href = `/leads?${qs}`
  }

  function toggleColumn(id: ViewColumnId) {
    setVisible((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev
        return prev.filter((c) => c !== id)
      }
      return [...prev, id]
    })
  }

  async function handleExport() {
    setExporting(true)
    setExportNote(null)
    try {
      const params = new URLSearchParams()
      if (filters.vertical) params.set('vertical', filters.vertical)
      if (filters.source) params.set('source', filters.source)
      if (filters.outbound_status) params.set('outbound_status', filters.outbound_status)
      if (filters.city) params.set('city', filters.city)
      params.set('limit', '5000')
      const res = await fetch(`/api/leads/list?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `export failed (${res.status})`)
      }
      const data = (await res.json()) as { leads: LeadContact[] }
      const rows = data.leads.map((l) => ({
        id: l.id,
        name: l.name ?? '',
        email: l.email ?? '',
        phone: l.phone ?? '',
        company: l.company ?? '',
        role: l.role ?? '',
        vertical: l.vertical ?? '',
        source: l.source ?? '',
        city: l.city ?? '',
        state: l.state ?? '',
        linkedin: l.linkedin ?? '',
        outbound_status: l.outbound_status ?? '',
        interest_label: l.interest_label ?? '',
        last_outbound_at: l.last_outbound_at ?? '',
        instantly_campaign: l.instantly_campaign ?? '',
        created_at: l.created_at ?? '',
        mirrored_at: l.mirrored_at ?? ''
      }))
      const stamp = new Date().toISOString().slice(0, 10)
      exportToCsv(rows, `leads-${stamp}.csv`)
      setExportNote(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setExportNote(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  function renderCell(lead: LeadContact, id: ViewColumnId): ReactNode {
    switch (id) {
      case 'connection': {
        const tone = connectionTone(lead.outbound_status)
        return (
          <span className="inline-flex items-center gap-2 text-[13px] text-neutral-800">
            <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
        )
      }
      case 'last_email':
        return (
          <span
            className={
              lead.last_outbound_at ? 'text-[13px] text-neutral-800' : 'text-[13px] text-neutral-400'
            }
          >
            {formatRelative(lead.last_outbound_at)}
          </span>
        )
      case 'last_calendar':
        return <span className="text-[13px] text-neutral-400">No contact</span>
      case 'email':
        return lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            onClick={(e) => e.stopPropagation()}
            className="block max-w-[200px] truncate text-[13px] text-[#3b6ef5] hover:underline"
            title={lead.email}
          >
            {lead.email}
          </a>
        ) : (
          <span className="text-[13px] text-neutral-300"> </span>
        )
      case 'description': {
        const text = descriptionFor(lead)
        return text ? (
          <span className="block max-w-[180px] truncate text-[13px] text-neutral-700" title={text}>
            {text}
          </span>
        ) : (
          <span className="text-[13px] text-neutral-300"> </span>
        )
      }
      case 'job_title':
        return lead.role ? (
          <span className="block max-w-[140px] truncate text-[13px] text-neutral-800" title={lead.role}>
            {lead.role}
          </span>
        ) : (
          <span className="text-[13px] text-neutral-300"> </span>
        )
      case 'phone':
        return (
          <span className="text-[13px] text-neutral-800">{lead.phone || ''}</span>
        )
      case 'company':
        return (
          <span className="block max-w-[160px] truncate text-[13px] text-neutral-800">
            {lead.company || ''}
          </span>
        )
      case 'city':
        return <span className="text-[13px] text-neutral-800">{lead.city || ''}</span>
      default:
        return null
    }
  }

  function columnIcon(id: ViewColumnId): ReactNode {
    switch (id) {
      case 'connection':
        return (
          <svg className="h-3.5 w-3.5 text-neutral-400" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="3" />
          </svg>
        )
      case 'last_email':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        )
      case 'last_calendar':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M8 3v4M16 3v4M3 11h18" />
          </svg>
        )
      case 'email':
        return <span className="text-[11px] font-semibold text-neutral-400">@</span>
      case 'description':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M4 7h16M4 12h10M4 17h14" />
          </svg>
        )
      case 'job_title':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
          </svg>
        )
      case 'phone':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M8 3.5h2.5l1 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1V18a2 2 0 0 1-2 2A14 14 0 0 1 6 7.5a2 2 0 0 1 2-2Z" />
          </svg>
        )
      case 'company':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M4 20V7.5L12 4l8 3.5V20" />
            <path d="M9 20v-5h6v5" />
          </svg>
        )
      case 'city':
        return (
          <svg
            className="h-3.5 w-3.5 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
            <circle cx="12" cy="11" r="2" />
          </svg>
        )
      default:
        return null
    }
  }

  const orderedVisible = VIEW_COLUMNS.filter((c) => visible.includes(c.id))

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* Attio-style object header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200/90 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#e8f0ff] text-[#3b6ef5]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="8" r="3.25" />
              <path d="M5.5 18.5c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5" />
            </svg>
          </span>
          <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">Leads</h1>

          <div className="relative" ref={viewRef}>
            <button
              type="button"
              onClick={() => {
                setViewOpen((v) => !v)
                setSettingsOpen(false)
                setFilterOpen(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-neutral-800 hover:bg-neutral-100"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-emerald-100 text-emerald-700">
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 2h3v3H2V2Zm5 0h3v3H7V2ZM2 7h3v3H2V7Zm5 0h3v3H7V7Z" />
                </svg>
              </span>
              Recently contacted
              <ChevronDown />
            </button>
            {viewOpen ? (
              <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Views
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md bg-neutral-50 px-2 py-1.5 text-left text-[13px] font-medium text-neutral-900"
                  onClick={() => setViewOpen(false)}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-emerald-100 text-emerald-700">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M2 2h3v3H2V2Zm5 0h3v3H7V2ZM2 7h3v3H2V7Zm5 0h3v3H7V7Z" />
                    </svg>
                  </span>
                  Recently contacted
                </button>
              </div>
            ) : null}
          </div>

          <div className="relative" ref={settingsRef}>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((v) => !v)
                setViewOpen(false)
                setFilterOpen(false)
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] text-neutral-600 hover:bg-neutral-100"
            >
              <GearIcon />
              View settings
              <ChevronDown />
            </button>
            {settingsOpen ? (
              <div className="absolute left-0 z-30 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Attributes in view
                </div>
                {VIEW_COLUMNS.map((col) => {
                  const on = visible.includes(col.id)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => toggleColumn(col.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-neutral-800 hover:bg-neutral-50"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          on
                            ? 'border-[#3b6ef5] bg-[#3b6ef5] text-white'
                            : 'border-neutral-300 bg-white text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="flex items-center gap-1.5">
                        {columnIcon(col.id)}
                        {col.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {exportNote ? <span className="text-xs text-neutral-500">{exportNote}</span> : null}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            <DownloadIcon />
            {exporting ? 'Exporting…' : 'Import / Export'}
          </button>
          <Link
            href="/leads/upload"
            className="inline-flex items-center gap-1 rounded-md bg-[#3b6ef5] px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#2f5de0]"
          >
            <span className="text-base leading-none">+</span>
            New lead
          </Link>
        </div>
      </div>

      {/* Sort + filter toolbar */}
      <div className="relative flex flex-wrap items-center gap-3 border-b border-neutral-200/90 px-4 py-2">
        <div className="inline-flex items-center gap-1.5 text-[13px] text-neutral-600">
          <SortIcon />
          Sorted by Last email interaction
        </div>
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => {
              setFilterOpen((v) => !v)
              setViewOpen(false)
              setSettingsOpen(false)
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium hover:bg-neutral-100 ${
              activeFilterCount > 0 ? 'text-[#3b6ef5]' : 'text-neutral-700'
            }`}
          >
            <FilterIcon />
            Filter
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-[#e8f0ff] px-1.5 text-[11px] text-[#3b6ef5]">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
          {filterOpen ? (
            <div className="absolute left-0 z-30 mt-1 w-[320px] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Filter leads
              </div>
              <div className="space-y-2.5">
                <FilterSelect
                  label="Vertical"
                  value={draftFilters.vertical ?? ''}
                  options={VERTICALS}
                  onChange={(v) => setDraftFilters((f) => ({ ...f, vertical: v || undefined }))}
                />
                <FilterSelect
                  label="Source"
                  value={draftFilters.source ?? ''}
                  options={SOURCES}
                  onChange={(v) => setDraftFilters((f) => ({ ...f, source: v || undefined }))}
                />
                <FilterSelect
                  label="Outbound status"
                  value={draftFilters.outbound_status ?? ''}
                  options={OUTBOUND_STATUSES}
                  onChange={(v) =>
                    setDraftFilters((f) => ({ ...f, outbound_status: v || undefined }))
                  }
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-neutral-500">City</span>
                  <input
                    type="text"
                    placeholder="e.g. Sydney"
                    value={draftFilters.city ?? ''}
                    onChange={(e) =>
                      setDraftFilters((f) => ({ ...f, city: e.target.value || undefined }))
                    }
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-[#3b6ef5] focus:outline-none"
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyFilters}
                  className="rounded-md bg-[#3b6ef5] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f5de0]"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
                >
                  Reset
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="sticky left-0 z-20 border-b border-neutral-200 bg-white px-4 py-2.5 text-[12px] font-medium text-neutral-500">
                <span className="inline-flex items-center gap-1.5">
                  <svg
                    className="h-3.5 w-3.5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                  >
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M5.5 18.5c1.6-3 4-4.5 6.5-4.5s4.9 1.5 6.5 4.5" />
                  </svg>
                  Person
                </span>
              </th>
              {orderedVisible.map((col) => (
                <th
                  key={col.id}
                  className="border-b border-neutral-200 px-3 py-2.5 text-[12px] font-medium text-neutral-500"
                >
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    {columnIcon(col.id)}
                    {col.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td
                  colSpan={1 + orderedVisible.length}
                  className="px-4 py-16 text-center text-sm text-neutral-500"
                >
                  No leads match these filters.
                </td>
              </tr>
            ) : (
              leads.map((lead) => {
                const selected = selectedId === lead.id
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedId(selected ? null : lead.id)}
                    className={`group cursor-pointer ${
                      selected ? 'bg-[#f3f7ff]' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-[1] border-b border-neutral-100 px-4 py-2 ${
                        selected ? 'bg-[#f3f7ff]' : 'bg-white group-hover:bg-neutral-50'
                      }`}
                    >
                      <div className="flex min-w-[180px] items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-600">
                          {initials(lead.name, lead.email)}
                        </span>
                        <span className="truncate text-[13px] font-medium text-neutral-900">
                          {lead.name || lead.email || 'Untitled'}
                        </span>
                      </div>
                    </td>
                    {orderedVisible.map((col) => (
                      <td key={col.id} className="border-b border-neutral-100 px-3 py-2">
                        {renderCell(lead, col.id)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 bg-white px-4 py-2.5 text-[12px] text-neutral-500">
                {total.toLocaleString()} count
              </td>
              {orderedVisible.map((col) => (
                <td key={col.id} className="px-3 py-2.5 text-[12px] text-neutral-400">
                  <button type="button" className="hover:text-neutral-600">
                    + Add calculation
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between border-t border-neutral-200/90 px-4 py-2 text-[13px] text-neutral-500">
        <span>
          Showing {totalShown === 0 ? 0 : (page - 1) * pageSize + 1}–{totalShown}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-1">Page {page}</span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={!hasMore}
            className="rounded-md border border-neutral-200 px-2.5 py-1 text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
          >
            Load more
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-[#3b6ef5] focus:outline-none"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

function ChevronDown() {
  return (
    <svg className="h-3.5 w-3.5 text-neutral-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="m4 6 4 4 4-4" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.75v2.1M12 18.15v2.1M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M3.75 12h2.1M18.15 12h2.1M5.9 18.1l1.5-1.5M16.6 7.4l1.5-1.5" />
    </svg>
  )
}

function SortIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M8 5v14M5.5 16.5 8 19l2.5-2.5M16 19V5M13.5 7.5 16 5l2.5 2.5" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 4v10M8.5 11.5 12 15l3.5-3.5M5 19h14" />
    </svg>
  )
}
