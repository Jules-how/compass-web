'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import type { LeadContact, LeadListFilters, LeadSummaryCounts } from '@/lib/types'
import { exportToCsv } from '@/lib/csv'
import { leadFiltersToSearchParams } from '@/lib/leads-query'
import {
  COMPLETENESS_OPTIONS,
  LEAD_SEGMENTS_STORAGE_KEY,
  LEAD_SOURCES,
  LEAD_VERTICALS,
  PIPELINE_STATUSES,
  PRESET_SEGMENTS,
  SYNC_STATES,
  formatLeadLocation,
  humanizeCompleteness,
  humanizeStatus,
  humanizeSyncState,
  humanizeVertical,
  inferSyncState,
  outboundBadgeTone,
  type CompletenessFilter,
  type SavedLeadSegment
} from '@/lib/leads-meta'

interface LeadTableProps {
  leads: LeadContact[]
  filters: LeadListFilters
  page: number
  pageSize: number
  totalShown: number
  hasMore: boolean
  total: number
  summary: LeadSummaryCounts | null
  onReload: () => void
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function badgeClass(status: string | null | undefined): string {
  switch (outboundBadgeTone(status)) {
    case 'positive':
      return 'bg-emerald-100 text-emerald-800'
    case 'negative':
      return 'bg-neutral-200 text-neutral-700'
    case 'active':
      return 'bg-amber-100 text-amber-800'
    case 'sync':
      return 'bg-sky-100 text-sky-800'
    default:
      return 'bg-neutral-100 text-neutral-600'
  }
}

function emailCampaignCount(raw: string | null | undefined, latestId?: string | null): number {
  if (raw) {
    try {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) {
        const seen = new Set<string>()
        for (const item of v) {
          const id = String(item ?? '').trim()
          if (id) seen.add(id)
        }
        if (seen.size > 0) return seen.size
      }
    } catch {
      // fall through
    }
  }
  return latestId?.trim() ? 1 : 0
}

function loadSavedSegments(): SavedLeadSegment[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LEAD_SEGMENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedLeadSegment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistSegments(segments: SavedLeadSegment[]) {
  window.localStorage.setItem(LEAD_SEGMENTS_STORAGE_KEY, JSON.stringify(segments))
}

export default function LeadTable({
  leads,
  filters,
  page,
  pageSize,
  totalShown,
  hasMore,
  total,
  summary,
  onReload
}: LeadTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<LeadListFilters>(filters)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkNote, setBulkNote] = useState<string | null>(null)
  const [bulkStatus, setBulkStatus] = useState<string>('contacted')
  const [bulkTag, setBulkTag] = useState('')
  const [savedSegments, setSavedSegments] = useState<SavedLeadSegment[]>([])
  const [segmentName, setSegmentName] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    setDraftFilters(filters)
    setSelected(new Set())
  }, [filters])

  useEffect(() => {
    setSavedSegments(loadSavedSegments())
  }, [])

  const phoneSparse = useMemo(() => {
    if (!leads.length) return true
    const withPhone = leads.filter((l) => l.phone?.trim()).length
    return withPhone / leads.length < 0.15
  }, [leads])

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id))

  function navigate(nextFilters: LeadListFilters, nextPage = 1) {
    const qs = leadFiltersToSearchParams(nextFilters, nextPage).toString()
    window.location.href = qs ? `/leads?${qs}` : '/leads'
  }

  function applyFilters() {
    navigate(draftFilters, 1)
  }

  function resetFilters() {
    window.location.href = '/leads'
  }

  function goToPage(next: number) {
    if (next < 1) return
    navigate(filters, next)
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(leads.map((l) => l.id)))
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {
      // ignore
    }
  }

  async function handleExport(selectedOnly = false) {
    setExporting(true)
    setExportNote(null)
    try {
      let rows: LeadContact[] = []
      if (selectedOnly) {
        rows = leads.filter((l) => selected.has(l.id))
        if (rows.length === 0) throw new Error('Select at least one lead')
      } else {
        const params = leadFiltersToSearchParams(filters)
        params.set('limit', '5000')
        const res = await fetch(`/api/leads/list?${params.toString()}`, { cache: 'no-store' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `export failed (${res.status})`)
        }
        const data = (await res.json()) as { leads: LeadContact[] }
        rows = data.leads
      }

      const csvRows = rows.map((l) => ({
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
        instantly_campaign: l.instantly_campaign_name || l.instantly_campaign || '',
        created_at: l.created_at ?? '',
        mirrored_at: l.mirrored_at ?? ''
      }))
      const stamp = new Date().toISOString().slice(0, 10)
      const prefix = selectedOnly ? 'leads-selected' : 'leads'
      exportToCsv(csvRows, `${prefix}-${stamp}.csv`)
      setExportNote(`Exported ${csvRows.length} row${csvRows.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setExportNote(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  async function runBulk(
    action: 'suppress' | 'unsuppress' | 'set_status' | 'add_tag' | 'clear_tag',
    extra: Record<string, string> = {}
  ) {
    const ids = Array.from(selected)
    if (ids.length === 0) {
      setBulkNote('Select at least one lead')
      return
    }
    setBulkBusy(true)
    setBulkNote(null)
    try {
      const res = await fetch('/api/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ action, ids, ...extra })
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        updated?: number
      }
      if (!res.ok) throw new Error(body.error ?? `bulk failed (${res.status})`)
      setBulkNote(`Updated ${body.updated ?? ids.length} lead(s).`)
      setSelected(new Set())
      onReload()
    } catch (err) {
      setBulkNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBulkBusy(false)
    }
  }

  function saveCurrentSegment() {
    const name = segmentName.trim()
    if (!name) {
      setBulkNote('Enter a segment name')
      return
    }
    const next: SavedLeadSegment = {
      id: `seg-${crypto.randomUUID()}`,
      name,
      filters: { ...draftFilters },
      createdAt: new Date().toISOString()
    }
    const merged = [next, ...savedSegments].slice(0, 20)
    persistSegments(merged)
    setSavedSegments(merged)
    setSegmentName('')
    setBulkNote(`Saved segment “${name}”.`)
  }

  function deleteSegment(id: string) {
    const merged = savedSegments.filter((s) => s.id !== id)
    persistSegments(merged)
    setSavedSegments(merged)
  }

  const summaryChips: Array<{
    key: string
    label: string
    count: number
    filters: LeadListFilters
  }> = summary
    ? [
        { key: 'all', label: 'All', count: summary.total, filters: {} },
        {
          key: 'uncontacted',
          label: 'Uncontacted',
          count: summary.uncontacted,
          filters: { outbound_status: 'uncontacted' }
        },
        {
          key: 'in_instantly',
          label: 'In Instantly',
          count: summary.in_instantly,
          filters: { sync_state: 'in_instantly' }
        },
        {
          key: 'replied',
          label: 'Replied',
          count: summary.replied,
          filters: { outbound_status: 'replied' }
        },
        {
          key: 'interested',
          label: 'Interested',
          count: summary.interested,
          filters: { outbound_status: 'interested' }
        },
        {
          key: 'no_phone',
          label: 'Missing phone',
          count: summary.no_phone,
          filters: { completeness: 'no_phone' }
        },
        {
          key: 'suppressed',
          label: 'Suppressed',
          count: summary.suppressed,
          filters: { suppressed: '1' }
        },
        {
          key: 'needs_review',
          label: 'Needs review',
          count: summary.needs_review,
          filters: { sync_state: 'needs_review' }
        }
      ]
    : []

  function chipActive(chipFilters: LeadListFilters): boolean {
    const keys: (keyof LeadListFilters)[] = [
      'vertical',
      'source',
      'outbound_status',
      'sync_state',
      'completeness',
      'city',
      'q',
      'recontact_ok',
      'suppressed'
    ]
    const chipSet = keys.filter((k) => chipFilters[k])
    if (chipSet.length === 0) {
      return keys.every((k) => !filters[k])
    }
    return chipSet.every((k) => filters[k] === chipFilters[k]) &&
      keys.every((k) => chipFilters[k] || !filters[k])
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          {summaryChips.map((chip) => {
            const active = chipActive(chip.filters)
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => navigate(chip.filters, 1)}
                className={`rounded-lg border px-3 py-1.5 text-left text-sm transition ${
                  active
                    ? 'border-sf-orange bg-orange-50 text-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50'
                }`}
              >
                <span className="block text-[11px] uppercase tracking-wide text-neutral-400">
                  {chip.label}
                </span>
                <span className="font-semibold tabular-nums text-neutral-900">
                  {chip.count.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Segments */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Segments
          </span>
          {PRESET_SEGMENTS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => navigate(preset.filters, 1)}
              className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-50"
            >
              {preset.name}
            </button>
          ))}
          {savedSegments.map((seg) => (
            <span
              key={seg.id}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-700"
            >
              <button type="button" onClick={() => navigate(seg.filters, 1)} className="hover:underline">
                {seg.name}
              </button>
              <button
                type="button"
                aria-label={`Delete ${seg.name}`}
                onClick={() => deleteSegment(seg.id)}
                className="text-neutral-400 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Save current filters as…"
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
            className="min-w-[180px] flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
          />
          <button
            type="button"
            onClick={saveCurrentSegment}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-100"
          >
            Save segment
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="mb-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Search</span>
            <input
              type="search"
              placeholder="Name, email, company, or phone"
              value={draftFilters.q ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({ ...f, q: e.target.value || undefined }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters()
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
            />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect
            label="Vertical"
            value={draftFilters.vertical ?? ''}
            onChange={(v) => setDraftFilters((f) => ({ ...f, vertical: v || undefined }))}
            options={LEAD_VERTICALS.map((v) => ({ value: v, label: humanizeVertical(v) }))}
          />
          <FilterSelect
            label="Source"
            value={draftFilters.source ?? ''}
            onChange={(v) => setDraftFilters((f) => ({ ...f, source: v || undefined }))}
            options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
          />
          <FilterSelect
            label="Pipeline stage"
            value={draftFilters.outbound_status ?? ''}
            onChange={(v) =>
              setDraftFilters((f) => ({ ...f, outbound_status: v || undefined }))
            }
            options={PIPELINE_STATUSES.map((s) => ({ value: s, label: humanizeStatus(s) }))}
          />
          <FilterSelect
            label="Sync state"
            value={draftFilters.sync_state ?? ''}
            onChange={(v) => setDraftFilters((f) => ({ ...f, sync_state: v || undefined }))}
            options={SYNC_STATES.map((s) => ({ value: s, label: humanizeSyncState(s) }))}
          />
          <FilterSelect
            label="Completeness"
            value={draftFilters.completeness ?? ''}
            onChange={(v) =>
              setDraftFilters((f) => ({
                ...f,
                completeness: (v || undefined) as CompletenessFilter | undefined
              }))
            }
            options={COMPLETENESS_OPTIONS.filter((c) => c !== 'any').map((c) => ({
              value: c,
              label: humanizeCompleteness(c)
            }))}
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
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterSelect
            label=""
            hideLabel
            value={draftFilters.suppressed ?? ''}
            onChange={(v) =>
              setDraftFilters((f) => ({
                ...f,
                suppressed: v === '1' || v === '0' ? v : undefined
              }))
            }
            options={[
              { value: '1', label: 'Suppressed only' },
              { value: '0', label: 'Exclude suppressed' }
            ]}
            className="w-auto min-w-[160px]"
          />
          <FilterSelect
            label=""
            hideLabel
            value={draftFilters.recontact_ok ?? ''}
            onChange={(v) =>
              setDraftFilters((f) => ({
                ...f,
                recontact_ok: v === '1' || v === '0' ? v : undefined
              }))
            }
            options={[
              { value: '1', label: 'Recontact OK' },
              { value: '0', label: 'Do not recontact' }
            ]}
            className="w-auto min-w-[160px]"
          />
          <button
            type="button"
            onClick={applyFilters}
            className="rounded-lg bg-sf-orange px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sf-orange-dark"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100"
          >
            Reset
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {exportNote && <span className="text-xs text-neutral-500">{exportNote}</span>}
            <button
              type="button"
              onClick={() => void handleExport(false)}
              disabled={exporting || total === 0}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <span className="font-medium text-neutral-800">{selected.size} selected</span>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void runBulk('suppress')}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
          >
            Suppress
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void runBulk('unsuppress')}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
          >
            Unsuppress
          </button>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
          >
            {PIPELINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanizeStatus(s)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void runBulk('set_status', { status: bulkStatus })}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
          >
            Set stage
          </button>
          <input
            type="text"
            placeholder="Tag"
            value={bulkTag}
            onChange={(e) => setBulkTag(e.target.value)}
            className="w-28 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs"
          />
          <button
            type="button"
            disabled={bulkBusy || !bulkTag.trim()}
            onClick={() => void runBulk('add_tag', { tag: bulkTag.trim() })}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
          >
            Add tag
          </button>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => void handleExport(true)}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50 disabled:opacity-60"
          >
            Export for Instantly
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-neutral-500 hover:text-neutral-800"
          >
            Clear
          </button>
          {bulkNote && <span className="w-full text-xs text-neutral-600">{bulkNote}</span>}
        </div>
      )}
      {bulkNote && selected.size === 0 && (
        <p className="text-xs text-neutral-500">{bulkNote}</p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all on page"
                />
              </th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              {!phoneSparse && <th className="px-3 py-2 font-medium">Phone</th>}
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Campaign</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Last touch</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {leads.length === 0 && (
              <tr>
                <td
                  colSpan={phoneSparse ? 8 : 9}
                  className="px-3 py-8 text-center text-neutral-500"
                >
                  No leads match these filters.
                </td>
              </tr>
            )}
            {leads.map((lead) => {
              const expanded = expandedId === lead.id
              const sync = inferSyncState(lead)
              const campaign =
                lead.instantly_campaign_name || lead.instantly_campaign || null
              return (
                <Fragment key={lead.id}>
                  <tr
                    className={`transition hover:bg-neutral-50 ${
                      selected.has(lead.id) ? 'bg-orange-50/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${lead.name || lead.email || lead.id}`}
                      />
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2 font-medium text-neutral-900"
                      onClick={() => setExpandedId(expanded ? null : lead.id)}
                    >
                      <div className="flex items-center gap-2">
                        <span>{lead.name || '—'}</span>
                        {lead.interest_label && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                            {lead.interest_label}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs font-normal text-neutral-400">
                        {humanizeVertical(lead.vertical)}
                        {lead.source ? ` · ${lead.source}` : ''}
                      </div>
                    </td>
                    <td
                      className="cursor-pointer px-3 py-2 text-neutral-700"
                      onClick={() => setExpandedId(expanded ? null : lead.id)}
                    >
                      {lead.email || '—'}
                    </td>
                    {!phoneSparse && (
                      <td className="px-3 py-2 text-neutral-700">{lead.phone || '—'}</td>
                    )}
                    <td
                      className="cursor-pointer px-3 py-2 text-neutral-700"
                      onClick={() => setExpandedId(expanded ? null : lead.id)}
                    >
                      {lead.company || '—'}
                    </td>
                    <td className="px-3 py-2 text-neutral-600">
                      {formatLeadLocation(lead.city, lead.state)}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-neutral-600" title={campaign ?? ''}>
                      {campaign || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(
                            lead.outbound_status
                          )}`}
                        >
                          {humanizeStatus(lead.outbound_status)}
                        </span>
                        {sync && sync !== 'in_instantly' && lead.outbound_status !== sync && (
                          <span className="text-[10px] text-neutral-400">
                            {humanizeSyncState(sync)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {formatDate(lead.last_outbound_at)}
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${lead.id}-detail`} className="bg-neutral-50/80">
                      <td colSpan={phoneSparse ? 8 : 9} className="px-4 py-4">
                        <LeadDetail
                          lead={lead}
                          sync={sync}
                          copiedId={copiedId}
                          onCopyId={() => void copyId(lead.id)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          Showing {totalShown === 0 ? 0 : (page - 1) * pageSize + 1}–{totalShown} of{' '}
          {total.toLocaleString()} leads
          {summary && summary.filtered !== summary.total
            ? ` (${summary.filtered.toLocaleString()} match filters)`
            : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-2">Page {page}</span>
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={!hasMore}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  hideLabel,
  className
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  hideLabel?: boolean
  className?: string
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      {!hideLabel && (
        <span className="mb-1 block text-xs font-medium text-neutral-500">{label}</span>
      )}
      {hideLabel && <span className="sr-only">{label || 'Filter'}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function LeadDetail({
  lead,
  sync,
  copiedId,
  onCopyId
}: {
  lead: LeadContact
  sync: ReturnType<typeof inferSyncState>
  copiedId: string | null
  onCopyId: () => void
}) {
  const nextAction = suggestNextAction(lead, sync)

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Identity
        </h3>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <DetailRow label="Role" value={lead.role} />
          <DetailRow label="Company" value={lead.company} />
          <DetailRow label="Location" value={formatLeadLocation(lead.city, lead.state)} />
          <DetailRow label="Phone" value={lead.phone} />
          <DetailRow
            label="LinkedIn"
            value={lead.linkedin}
            href={lead.linkedin?.startsWith('http') ? lead.linkedin : undefined}
          />
          <DetailRow label="Vertical" value={humanizeVertical(lead.vertical)} />
          <DetailRow label="Source" value={lead.source} />
          <DetailRow label="Tags" value={lead.tags} />
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          <button
            type="button"
            onClick={onCopyId}
            className="rounded border border-neutral-200 bg-white px-2 py-1 hover:bg-neutral-50"
          >
            {copiedId === lead.id ? 'Copied ID' : 'Copy lead ID'}
          </button>
          <span className="font-mono text-[11px] text-neutral-400">{lead.id}</span>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Outreach
        </h3>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <DetailRow label="Stage" value={humanizeStatus(lead.outbound_status)} />
          <DetailRow label="Sync" value={sync ? humanizeSyncState(sync) : '—'} />
          <DetailRow label="Interest" value={lead.interest_label} />
          <DetailRow
            label="Campaign"
            value={lead.instantly_campaign_name || lead.instantly_campaign}
          />
          <DetailRow
            label="Email campaigns"
            value={String(
              emailCampaignCount(lead.instantly_campaign_ids, lead.instantly_campaign_id)
            )}
          />
          <DetailRow label="Last touch" value={formatDate(lead.last_outbound_at)} />
          <DetailRow label="Status source" value={lead.lead_status_source} />
          <DetailRow
            label="Recontact"
            value={
              lead.recontact_ok == null ? '—' : lead.recontact_ok ? 'Allowed' : 'Blocked'
            }
          />
          <DetailRow label="Suppression" value={lead.suppression_reason} />
        </dl>
        <p className="mt-3 rounded-lg border border-sf-orange/30 bg-orange-50 px-3 py-2 text-sm text-neutral-800">
          <span className="font-medium text-sf-orange">Next: </span>
          {nextAction}
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Sync & import
        </h3>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <DetailRow label="Instantly lead" value={lead.instantly_lead_id} />
          <DetailRow label="Uploaded" value={formatDate(lead.instantly_uploaded_at)} />
          <DetailRow label="Synced" value={formatDate(lead.instantly_synced_at)} />
          <DetailRow label="Mirrored" value={formatDate(lead.mirrored_at)} />
          <DetailRow label="Context" value={lead.lead_context_status} />
          <DetailRow label="Context updated" value={formatDate(lead.lead_context_updated_at)} />
          <DetailRow label="Import batch" value={lead.import_batch_id} />
          <DetailRow label="Created" value={formatDate(lead.created_at)} />
          <DetailRow label="Updated" value={formatDate(lead.updated_at)} />
        </dl>
      </section>
    </div>
  )
}

function suggestNextAction(
  lead: LeadContact,
  sync: ReturnType<typeof inferSyncState>
): string {
  if (lead.outbound_status === 'suppressed' || lead.suppression_reason) {
    return 'Keep suppressed unless recontact is explicitly allowed.'
  }
  if (lead.outbound_status === 'interested' || lead.outbound_status === 'replied') {
    return 'Follow up personally — book a call or move to pipeline.'
  }
  if (lead.outbound_status === 'booked') return 'Confirm the meeting and prep the brief.'
  if (lead.outbound_status === 'converted') return 'Hand off to delivery / CRM win path.'
  if (!lead.email) return 'Enrich email before any outbound.'
  if (sync === 'not_uploaded') {
    return lead.phone
      ? 'Export to Instantly or start a call/SMS sequence.'
      : 'Upload to Instantly (email-only) or enrich phone first.'
  }
  if (sync === 'stale_sync') return 'Refresh Instantly sync — status may be outdated.'
  if (sync === 'missing_context') return 'Add lead context / category before scaling send.'
  if (sync === 'needs_review') return 'Review category fit, then approve or suppress.'
  if (lead.outbound_status === 'contacted' || sync === 'in_instantly') {
    return 'Wait for reply or check Instantly campaign analytics.'
  }
  return 'Apply a segment and push the next outbound batch.'
}

function DetailRow({
  label,
  value,
  href
}: {
  label: string
  value: string | null | undefined
  href?: string
}) {
  const display = value?.trim() ? value : '—'
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-neutral-800">
        {href && display !== '—' ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-sf-orange hover:underline"
          >
            {display}
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  )
}
