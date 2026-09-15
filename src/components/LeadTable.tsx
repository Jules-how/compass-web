'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  LeadContact,
  LeadListFilters,
  LeadSummaryCounts,
} from '@/lib/types'
import type { CompassLeadList } from '@/lib/lead-lists'
import { exportToCsv } from '@/lib/csv'
import { LEAD_EXPORT_MAX } from '@/lib/list-columns'
import {
  leadFiltersNeedExactCount,
  leadFiltersToSearchParams,
} from '@/lib/leads-query'
import {
  COMPLETENESS_OPTIONS,
  LEAD_SEGMENTS_STORAGE_KEY,
  LEAD_SOURCES,
  PIPELINE_STATUSES,
  PRESET_SEGMENTS,
  SYNC_STATES,
  humanizeCompleteness,
  humanizeStatus,
  humanizeSyncState,
  humanizeVertical,
  mergeVerticalOptions,
  type CompletenessFilter,
  type SavedLeadSegment,
} from '@/lib/leads-meta'
import { computeRecontactEligibility } from '@/lib/recontact-eligibility'
import { parseLeadBucket, type LeadBucket } from '@/lib/lead-buckets'
import { LeadSidecar } from '@/components/LeadSidecar'
import { LeadColumnPicker, useLeadGridColumns } from '@/components/LeadColumnPicker'
import { ModalFrame } from '@/components/ui/ModalFrame'
import { Search, SlidersHorizontal, Download, X } from 'lucide-react'
import RecordsTable from '@/components/ui/records-table'
import { LEAD_GRID_SORTS } from '@/lib/lead-sort'
import type { LeadColumnId as SortableLeadColumnId } from '@/lib/lead-columns'
import { useUndo } from '@/components/UndoProvider'
import type { LeadColumnPreset } from '@/lib/lead-columns'

interface LeadTableProps {
  leads: LeadContact[]
  filters: LeadListFilters
  page: number
  pageSize: number
  totalShown: number
  hasMore: boolean
  total: number
  summary: LeadSummaryCounts | null
  discoveredVerticals?: string[]
  crmLists?: CompassLeadList[]
  onListsChange?: () => void
  onNavigate: (filters: LeadListFilters, page?: number) => void
  onReload: () => void
  variant?: 'page' | 'embed'
  columnPreset?: LeadColumnPreset
  onLeadSelect?: (lead: LeadContact | null) => void
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
  window.localStorage.setItem(
    LEAD_SEGMENTS_STORAGE_KEY,
    JSON.stringify(segments),
  )
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
  discoveredVerticals = [],
  crmLists = [],
  onListsChange,
  onNavigate,
  onReload,
  variant = 'page',
  columnPreset = 'crm',
  onLeadSelect,
}: LeadTableProps) {
  const [mobileGrid, setMobileGrid] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<LeadListFilters>(filters)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkNote, setBulkNote] = useState<string | null>(null)
  const [bulkStatus, setBulkStatus] = useState<string>('contacted')
  const [bulkTag, setBulkTag] = useState('')
  const [bulkListId, setBulkListId] = useState('')
  const [newListName, setNewListName] = useState('')
  const [savedSegments, setSavedSegments] = useState<SavedLeadSegment[]>([])
  const [segmentName, setSegmentName] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterPanelId = useId()
  const grid = useLeadGridColumns(columnPreset, leads)
  const undo = useUndo()

  const embed = variant === 'embed'
  const activeFilters = Object.entries(filters).filter(([key, value]) => key !== 'bucket' && value != null && value !== '')
  const filterLabels: Record<string, string> = { q: 'Search', outbound_status: 'Status', sync_state: 'Sync', completeness: 'Contact details', list_id: 'List', pipeline_campaign_id: 'Campaign', cohort_campaign_id: 'Campaign cohort', instantly_campaign_id: 'Instantly campaign', icp_status: 'Fit', recontact_ok: 'Recontact allowed', recontact_ready: 'Recontact ready', suppressed: 'Suppressed', unverified_only: 'Unverified only', after_hours: 'After hours', min_reviews: 'Min. reviews' }
  function removeFilter(key: string) {
    const next = { ...filters }
    delete next[key as keyof LeadListFilters]
    onNavigate(next, 1)
  }
  const bucket: LeadBucket = parseLeadBucket(filters.bucket) ?? 'leads'
  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  )

  // A new callback identity must not clear a record selection. The reset is
  // driven by filters, while its notification uses the latest committed callback.
  const onLeadSelectRef = useRef(onLeadSelect)
  useEffect(() => { onLeadSelectRef.current = onLeadSelect }, [onLeadSelect])
  useEffect(() => {
    setDraftFilters(filters)
    setSelected(new Set())
    setSelectedId(null)
    onLeadSelectRef.current?.(null)
  }, [filters])

  useEffect(() => {
    setSavedSegments(loadSavedSegments())
  }, [])

  function switchBucket(next: LeadBucket) {
    if (next === bucket) return
    onNavigate({ ...filters, bucket: next }, 1)
  }

  function withBucket(next: LeadListFilters): LeadListFilters {
    return { ...next, bucket }
  }

  const verticalOptions = useMemo(
    () => mergeVerticalOptions(discoveredVerticals),
    [discoveredVerticals],
  )

  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id))

  function applyFilters(next: LeadListFilters = draftFilters) {
    onNavigate(withBucket(next), 1)
  }

  function patchFilters(patch: Partial<LeadListFilters>) {
    const next = withBucket({ ...draftFilters, ...patch })
    setDraftFilters(next)
    onNavigate(next, 1)
  }

  function resetFilters() {
    onNavigate({ bucket }, 1)
  }

  function goToPage(next: number) {
    if (next < 1) return
    onNavigate(withBucket(filters), next)
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
        params.set('limit', String(LEAD_EXPORT_MAX))
        const res = await fetch(`/api/leads/list?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `export failed (${res.status})`)
        }
        const data = (await res.json()) as { leads: LeadContact[] }
        rows = data.leads
      }

      const csvRows = rows.map((l) => {
        const rc = computeRecontactEligibility(l)
        return {
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
          recontact_lane: rc.lane,
          recontact_progress_pct: rc.progressPercent ?? '',
          recontact_days_remaining: rc.daysRemaining ?? '',
          recontact_ready: rc.recommendNewCampaign ? '1' : '0',
          instantly_campaign:
            l.instantly_campaign_name || l.instantly_campaign || '',
          opener: l.opener ?? '',
          icp_status: l.icp_status ?? '',
          review_count: l.review_count ?? '',
          hours_label: l.hours_label ?? '',
          after_hours: l.after_hours == null ? '' : l.after_hours ? '1' : '0',
          capture_crack: l.capture_crack ?? '',
          email_origin: l.email_origin ?? '',
          lead_facts:
            l.lead_facts == null
              ? ''
              : typeof l.lead_facts === 'string'
                ? l.lead_facts
                : JSON.stringify(l.lead_facts),
          created_at: l.created_at ?? '',
          mirrored_at: l.mirrored_at ?? '',
        }
      })
      const stamp = new Date().toISOString().slice(0, 10)
      const prefix = selectedOnly ? 'leads-selected' : 'leads'
      exportToCsv(csvRows, `${prefix}-${stamp}.csv`)
      setExportNote(
        `Exported ${csvRows.length} row${csvRows.length === 1 ? '' : 's'}.`,
      )
    } catch (err) {
      setExportNote(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  async function postBulk(
    action:
      | 'suppress'
      | 'unsuppress'
      | 'set_status'
      | 'add_tag'
      | 'clear_tag'
      | 'archive'
      | 'unarchive',
    ids: string[],
    extra: Record<string, string> = {},
  ) {
    const res = await fetch('/api/leads/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ action, ids, ...extra }),
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      updated?: number
    }
    if (!res.ok) throw new Error(body.error ?? `bulk failed (${res.status})`)
    return body
  }

  async function restoreStatuses(
    rows: Array<{ id: string; outbound_status: string | null }>,
  ) {
    const groups = new Map<string, string[]>()
    for (const row of rows) {
      const status = row.outbound_status?.trim() || 'uncontacted'
      const list = groups.get(status) ?? []
      list.push(row.id)
      groups.set(status, list)
    }
    for (const [status, ids] of groups) {
      await postBulk('set_status', ids, { status })
    }
  }

  async function runBulk(
    action:
      | 'suppress'
      | 'unsuppress'
      | 'set_status'
      | 'add_tag'
      | 'clear_tag'
      | 'archive'
      | 'unarchive',
    extra: Record<string, string> = {},
  ) {
    const ids = Array.from(selected)
    if (ids.length === 0) {
      setBulkNote('Select at least one lead')
      return
    }
    const previous = leads
      .filter((lead) => selected.has(lead.id))
      .map((lead) => ({ id: lead.id, outbound_status: lead.outbound_status }))
    setBulkBusy(true)
    setBulkNote(null)
    try {
      const body = await postBulk(action, ids, extra)
      setBulkNote(`Updated ${body.updated ?? ids.length} lead(s).`)
      setSelected(new Set())
      onReload()
      undo.push({
        label: 'Lead update',
        undo: async () => {
          if (action === 'add_tag' && extra.tag) {
            await postBulk('clear_tag', ids, { tag: extra.tag })
          } else if (action === 'clear_tag' && extra.tag) {
            await postBulk('add_tag', ids, { tag: extra.tag })
          } else if (action === 'archive') {
            await postBulk('unarchive', ids)
          } else if (action === 'unarchive') {
            await postBulk('archive', ids)
          } else {
            await restoreStatuses(previous)
          }
          onReload()
        },
        redo: async () => {
          await postBulk(action, ids, extra)
          onReload()
        },
      })
    } catch (err) {
      setBulkNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBulkBusy(false)
    }
  }

  async function runListMembers(action: 'add' | 'remove') {
    const ids = Array.from(selected)
    const listId = bulkListId.trim() || filters.list_id || ''
    if (ids.length === 0) {
      setBulkNote('Select at least one lead')
      return
    }
    if (!listId) {
      setBulkNote('Pick a list first')
      return
    }
    setBulkBusy(true)
    setBulkNote(null)
    try {
      const res = await fetch(
        `/api/lead-lists/${encodeURIComponent(listId)}/members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(
            action === 'add' ? { add: ids } : { remove: ids },
          ),
        },
      )
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        added?: number
        removed?: number
      }
      if (!res.ok)
        throw new Error(body.error ?? `list update failed (${res.status})`)
      setBulkNote(
        action === 'add'
          ? `Added ${body.added ?? ids.length} to list.`
          : `Removed ${body.removed ?? ids.length} from list.`,
      )
      setSelected(new Set())
      onListsChange?.()
      onReload()
    } catch (err) {
      setBulkNote(err instanceof Error ? err.message : String(err))
    } finally {
      setBulkBusy(false)
    }
  }

  async function createCrmList() {
    const name = newListName.trim()
    if (!name) {
      setBulkNote('Enter a list name')
      return
    }
    setBulkBusy(true)
    setBulkNote(null)
    try {
      const res = await fetch('/api/lead-lists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        list?: { id: string }
      }
      if (!res.ok)
        throw new Error(body.error ?? `create failed (${res.status})`)
      setNewListName('')
      setBulkNote(`Created list “${name}”.`)
      onListsChange?.()
      if (body.list?.id) onNavigate({ ...filters, list_id: body.list.id }, 1)
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
      createdAt: new Date().toISOString(),
    }
    const merged = [next, ...savedSegments].slice(0, 20)
    try {
      persistSegments(merged)
      setSavedSegments(merged)
      setSegmentName('')
      setBulkNote(`Saved segment “${name}” in this browser.`)
    } catch {
      setBulkNote('This browser could not save the segment. Your filters are still applied.')
    }
  }

  function deleteSegment(id: string) {
    const merged = savedSegments.filter((s) => s.id !== id)
    try { persistSegments(merged); setSavedSegments(merged) }
    catch { setBulkNote('This browser could not remove the saved segment. Try again.') }
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
          filters: { outbound_status: 'uncontacted' },
        },
        {
          key: 'in_instantly',
          label: 'Synced',
          count: summary.in_instantly,
          filters: { sync_state: 'in_instantly' },
        },
        {
          key: 'replied',
          label: 'Replied',
          count: summary.replied,
          filters: { outbound_status: 'replied' },
        },
        {
          key: 'interested',
          label: 'Interested',
          count: summary.interested,
          filters: { outbound_status: 'interested' },
        },
        {
          key: 'no_phone',
          label: 'Missing phone',
          count: summary.no_phone,
          filters: { completeness: 'no_phone' },
        },
        {
          key: 'suppressed',
          label: 'Suppressed',
          count: summary.suppressed,
          filters: { suppressed: '1' },
        },
        {
          key: 'needs_review',
          label: 'Needs review',
          count: summary.needs_review,
          filters: { sync_state: 'needs_review' },
        },
        {
          key: 'recontact_ready',
          label: 'Recontact ready',
          count: summary.recontact_ready ?? 0,
          filters: { recontact_ready: '1' },
        },
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
      'suppressed',
      'recontact_ready',
    ]
    const chipSet = keys.filter((k) => chipFilters[k])
    if (chipSet.length === 0) {
      return keys.every((k) => !filters[k])
    }
    return (
      chipSet.every((k) => filters[k] === chipFilters[k]) &&
      keys.every((k) => chipFilters[k] || !filters[k])
    )
  }

  return (
    <div className={embed ? 'crm-records-layout crm-records-embed flex h-full min-h-0 gap-3' : 'crm-records-layout'}>
      <div
        className={
          embed
            ? 'flex min-h-0 min-w-0 flex-1 flex-col gap-2'
            : 'min-w-0 flex-1 space-y-3'
        }
      >
        <div className="crm-operating-toolbar flex flex-wrap items-center gap-2">
          <div className="crm-bucket-tabs" role="group" aria-label="Record collection">
            <button
              type="button"
              onClick={() => switchBucket('leads')}
              aria-pressed={bucket === 'leads'}
              className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${
                bucket === 'leads'
                  ? 'bg-white text-neutral-900 shadow-soft'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Leads
            </button>
            <button
              type="button"
              onClick={() => switchBucket('prospects')}
              aria-pressed={bucket === 'prospects'}
              className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${
                bucket === 'prospects'
                  ? 'bg-white text-neutral-900 shadow-soft'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Prospects
            </button>
            <button
              type="button"
              onClick={() => switchBucket('archived')}
              aria-pressed={bucket === 'archived'}
              className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${
                bucket === 'archived'
                  ? 'bg-white text-neutral-900 shadow-soft'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Archived
              {summary?.archived ? (
                <span className="rounded-full bg-stone-200/90 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                  {summary.archived.toLocaleString()}
                </span>
              ) : null}
            </button>
          </div>
          {columnPreset === 'crm' ? (
            <select className="compass-input crm-view-select" aria-label="CRM column view" value={grid.view}
              onChange={(event) => grid.setView(event.target.value as 'operating' | 'legacy')}>
              <option value="operating">Contact overview</option>
              <option value="legacy">Research & outreach</option>
            </select>
          ) : null}
          <div className="crm-record-search"><Search size={16} aria-hidden="true" /><input
            aria-label="Search records"
            type="search"
            placeholder="Name, email, company, or phone"
            value={draftFilters.q ?? ''}
            onChange={(e) =>
              setDraftFilters((f) => ({ ...f, q: e.target.value || undefined }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilters()
            }}
            className="crm-search-input"
          /><button type="button" onClick={() => applyFilters()} aria-label="Run record search">Search</button></div>
          {embed ? (
            <>
              <FilterSelect
                label="ICP"
                hideLabel
                value={draftFilters.icp_status ?? ''}
                onChange={(v) => patchFilters({ icp_status: v || undefined })}
                options={[
                  { value: 'none', label: 'ICP none' },
                  { value: 'pass', label: 'Pass' },
                  { value: 'thin', label: 'Thin' },
                  { value: 'skip', label: 'Skip' },
                ]}
                className="w-32"
              />
              <FilterSelect
                label="After hours"
                hideLabel
                value={draftFilters.after_hours ?? ''}
                onChange={(v) =>
                  patchFilters({
                    after_hours: (v || undefined) as '1' | '0' | undefined,
                  })
                }
                options={[
                  { value: '1', label: 'After hours' },
                  { value: '0', label: 'No after hours' },
                ]}
                className="w-36"
              />
              <FilterSelect
                label="Min reviews"
                hideLabel
                value={draftFilters.min_reviews ?? ''}
                onChange={(v) => patchFilters({ min_reviews: v || undefined })}
                options={[{ value: '25', label: '25+ reviews' }]}
                className="w-32"
              />
              <FilterSelect
                label="Enrich"
                hideLabel
                value={draftFilters.enrich_status ?? ''}
                onChange={(v) =>
                  patchFilters({ enrich_status: v || undefined })
                }
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'queued', label: 'Queued' },
                  { value: 'enriched', label: 'Enriched' },
                  { value: 'thin', label: 'Thin' },
                  { value: 'opener_ready', label: 'Opener ready' },
                  { value: 'uploaded', label: 'Uploaded' },
                ]}
                className="w-40"
              />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
                aria-controls={filterPanelId}
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                  filtersOpen || leadFiltersNeedExactCount(filters)
                    ? 'border-sf-orange/40 bg-orange-50 text-neutral-900'
                    : 'border-stone-200 bg-white text-neutral-700 hover:bg-stone-50'
                }`}
              >
                <SlidersHorizontal size={14} aria-hidden="true" /> Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
              </button>
              <LeadColumnPicker phoneSparse={false} visible={grid.visible} onChange={grid.setVisible} preset={columnPreset} occupied={grid.occupied} />
              <button
                type="button"
                onClick={() => void handleExport(false)}
                disabled={exporting || total === 0}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-stone-50 disabled:opacity-60"
              >
                <Download size={14} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            </>
          )}
        </div>

        {!embed && activeFilters.length > 0 ? (
          <div className="crm-active-filters" aria-label="Current filters">
            {activeFilters.map(([key, value]) => {
              const label = filterLabels[key] || key.replaceAll('_', ' ')
              const displayValue = key === 'list_id' ? crmLists.find((list) => list.id === value)?.name || value : String(value).replaceAll('_', ' ')
              return <button key={key} type="button" onClick={() => removeFilter(key)} aria-label={`Remove ${label}: ${displayValue}`}>
                <span>{label}: <strong>{displayValue}</strong></span><X size={12} aria-hidden="true" />
              </button>
            })}
            <button type="button" onClick={resetFilters}>Clear all</button>
          </div>
        ) : null}
        {exportNote ? <p role="status" className="crm-data-notice">{exportNote}</p> : null}

        {/* CRM lists */}
        {!embed ? (
          <details className="folio-crm-lists">
            <summary>Lists & saved views</summary>
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                  Lists
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onNavigate({ ...filters, list_id: undefined }, 1)
                  }
                  className={`rounded-xl border px-2.5 py-1 text-xs transition ${
                    !filters.list_id
                      ? 'border-sf-orange/40 bg-orange-50 text-neutral-900'
                      : 'border-stone-200/80 text-neutral-600 hover:bg-stone-50'
                  }`}
                >
                  All leads
                </button>
                {crmLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() =>
                      onNavigate({ ...filters, list_id: list.id }, 1)
                    }
                    className={`rounded-xl border px-2.5 py-1 text-xs transition ${
                      filters.list_id === list.id
                        ? 'border-sf-orange/40 bg-orange-50 text-neutral-900'
                        : 'border-stone-200/80 text-neutral-600 hover:bg-stone-50'
                    }`}
                  >
                    {list.name}
                    <span className="ml-1 text-neutral-400">
                      {list.member_count ?? 0}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  aria-label="New list name"
                  placeholder="New list name"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
                />
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void createCrmList()}
                  className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-neutral-700 transition hover:bg-stone-50 disabled:opacity-60"
                >
                  Create list
                </button>
              </div>
            </div>
          </details>
        ) : null}

        {!embed && filtersOpen ? (
          <div id={filterPanelId} className="crm-filter-panel">
            {summary ? <div className="crm-quick-filters" aria-label="Quick filters">{summaryChips.map((chip) => <button key={chip.key} type="button" aria-pressed={chipActive(chip.filters)} onClick={() => onNavigate(withBucket(chip.filters), 1)}>{chip.label} <span>{chip.count.toLocaleString()}</span></button>)}<p>Counts cover all active records. Selecting a quick filter replaces other filters.</p></div> : null}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                Segments
              </span>
              {PRESET_SEGMENTS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => onNavigate(withBucket(preset.filters), 1)}
                  className="rounded-xl border border-stone-200/80 px-2.5 py-1 text-xs text-neutral-600 transition hover:bg-stone-50"
                >
                  {preset.name}
                </button>
              ))}
              {savedSegments.map((seg) => (
                <span
                  key={seg.id}
                  className="inline-flex items-center gap-1 rounded-xl border border-stone-200/80 bg-stone-50 px-2.5 py-1 text-xs text-neutral-700"
                >
                  <button
                    type="button"
                    onClick={() => onNavigate(withBucket(seg.filters), 1)}
                    className="hover:underline"
                  >
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
              <input
                type="text"
                placeholder="Save current filters as…"
                value={segmentName}
                onChange={(e) => setSegmentName(e.target.value)}
                className="min-w-[160px] flex-1 rounded-xl border border-stone-200 px-3 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
              />
              <button
                type="button"
                onClick={saveCurrentSegment}
                className="rounded-xl border border-stone-200 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-stone-50"
              >
                Save segment
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <FilterSelect
                label="List"
                value={draftFilters.list_id ?? ''}
                onChange={(v) => patchFilters({ list_id: v || undefined })}
                options={crmLists.map((list) => ({
                  value: list.id,
                  label: `${list.name} (${list.member_count ?? 0})`,
                }))}
              />
              <FilterSelect
                label="Vertical"
                value={draftFilters.vertical ?? ''}
                onChange={(v) => patchFilters({ vertical: v || undefined })}
                options={verticalOptions.map((v) => ({
                  value: v,
                  label: humanizeVertical(v),
                }))}
              />
              <FilterSelect
                label="Source"
                value={draftFilters.source ?? ''}
                onChange={(v) => patchFilters({ source: v || undefined })}
                options={LEAD_SOURCES.map((s) => ({ value: s, label: s }))}
              />
              <FilterSelect
                label="Pipeline stage"
                value={draftFilters.outbound_status ?? ''}
                onChange={(v) =>
                  patchFilters({ outbound_status: v || undefined })
                }
                options={PIPELINE_STATUSES.map((s) => ({
                  value: s,
                  label: humanizeStatus(s),
                }))}
              />
              <FilterSelect
                label="Sync state"
                value={draftFilters.sync_state ?? ''}
                onChange={(v) => patchFilters({ sync_state: v || undefined })}
                options={SYNC_STATES.map((s) => ({
                  value: s,
                  label: humanizeSyncState(s),
                }))}
              />
              <FilterSelect
                label="Completeness"
                value={draftFilters.completeness ?? ''}
                onChange={(v) =>
                  patchFilters({
                    completeness: (v || undefined) as
                      CompletenessFilter | undefined,
                  })
                }
                options={COMPLETENESS_OPTIONS.filter((c) => c !== 'any').map(
                  (c) => ({
                    value: c,
                    label: humanizeCompleteness(c),
                  }),
                )}
              />
              <FilterSelect
                label="Enrich status"
                value={draftFilters.enrich_status ?? ''}
                onChange={(v) =>
                  patchFilters({ enrich_status: v || undefined })
                }
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'queued', label: 'Queued' },
                  { value: 'enriched', label: 'Enriched' },
                  { value: 'thin', label: 'Thin' },
                  { value: 'opener_ready', label: 'Opener ready' },
                  { value: 'uploaded', label: 'Uploaded' },
                ]}
              />
              <FilterSelect
                label="ICP"
                value={draftFilters.icp_status ?? ''}
                onChange={(v) => patchFilters({ icp_status: v || undefined })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'pass', label: 'Pass' },
                  { value: 'thin', label: 'Thin' },
                  { value: 'skip', label: 'Skip' },
                ]}
              />
              <FilterSelect
                label="After hours"
                value={draftFilters.after_hours ?? ''}
                onChange={(v) =>
                  patchFilters({
                    after_hours: (v || undefined) as '1' | '0' | undefined,
                  })
                }
                options={[
                  { value: '1', label: 'Yes' },
                  { value: '0', label: 'No' },
                ]}
              />
              <FilterSelect
                label="Min reviews"
                value={draftFilters.min_reviews ?? ''}
                onChange={(v) => patchFilters({ min_reviews: v || undefined })}
                options={[{ value: '25', label: '25+' }]}
              />
              <FilterSelect
                label="Email origin"
                value={draftFilters.email_origin ?? ''}
                onChange={(v) => patchFilters({ email_origin: v || undefined })}
                options={[
                  { value: 'published', label: 'Published' },
                  { value: 'guessed', label: 'Guessed' },
                  { value: 'unknown', label: 'Unknown' },
                ]}
              />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  City
                </span>
                <input
                  type="text"
                  placeholder="e.g. Sydney"
                  value={draftFilters.city ?? ''}
                  onChange={(e) =>
                    setDraftFilters((f) => ({
                      ...f,
                      city: e.target.value || undefined,
                    }))
                  }
                  onBlur={() => applyFilters()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyFilters()
                  }}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Cohort tag
                </span>
                <input
                  type="text"
                  placeholder="wave-1-nsw"
                  value={draftFilters.cohort_tag ?? ''}
                  onChange={(e) =>
                    setDraftFilters((f) => ({
                      ...f,
                      cohort_tag: e.target.value || undefined,
                    }))
                  }
                  onBlur={() => applyFilters()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyFilters()
                  }}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-neutral-500">
                  Pipeline campaign id
                </span>
                <input
                  type="text"
                  placeholder="campaign-…"
                  value={draftFilters.pipeline_campaign_id ?? ''}
                  onChange={(e) =>
                    setDraftFilters((f) => ({
                      ...f,
                      pipeline_campaign_id: e.target.value || undefined,
                    }))
                  }
                  onBlur={() => applyFilters()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyFilters()
                  }}
                  className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Suppression"
                hideLabel
                value={draftFilters.suppressed ?? ''}
                onChange={(v) =>
                  patchFilters({
                    suppressed: v === '1' || v === '0' ? v : undefined,
                  })
                }
                options={[
                  { value: '1', label: 'Suppressed only' },
                  { value: '0', label: 'Exclude suppressed' },
                ]}
                className="w-auto min-w-[160px]"
              />
              <FilterSelect
                label="Recontact permission"
                hideLabel
                value={draftFilters.recontact_ok ?? ''}
                onChange={(v) =>
                  patchFilters({
                    recontact_ok: v === '1' || v === '0' ? v : undefined,
                  })
                }
                options={[
                  { value: '1', label: 'Recontact OK' },
                  { value: '0', label: 'Do not recontact' },
                ]}
                className="w-auto min-w-[160px]"
              />
              <FilterSelect
                label="Recontact readiness"
                hideLabel
                value={draftFilters.recontact_ready ?? ''}
                onChange={(v) =>
                  patchFilters({
                    recontact_ready: v === '1' || v === '0' ? v : undefined,
                  })
                }
                options={[
                  { value: '1', label: 'Ready (90d+)' },
                  { value: '0', label: 'Not ready yet' },
                ]}
                className="w-auto min-w-[160px]"
              />
              <button
                type="button"
                onClick={() => applyFilters()}
                className="compass-btn-primary"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-xl border border-stone-200 px-3 py-2 text-sm text-neutral-600 transition hover:bg-stone-50"
              >
                Reset
              </button>
              {exportNote ? (
                <span className="ml-auto text-xs text-neutral-500">
                  {exportNote}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm shadow-soft">
            <span className="font-medium text-neutral-800">
              {selected.size} selected
            </span>
            {bucket === 'archived' ? (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulk('unarchive')}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
              >
                Restore to Leads
              </button>
            ) : (
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void runBulk('archive')}
                className="rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                Archive
              </button>
            )}
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulk('suppress')}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
            >
              Suppress
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void runBulk('unsuppress')}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
            >
              Unsuppress
            </button>
            <select
              aria-label="Stage for selected records"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs"
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
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
            >
              Set stage
            </button>
            <input
              type="text"
              aria-label="Tag for selected records"
              placeholder="Tag"
              value={bulkTag}
              onChange={(e) => setBulkTag(e.target.value)}
              className="w-28 rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs"
            />
            <button
              type="button"
              disabled={bulkBusy || !bulkTag.trim()}
              onClick={() => void runBulk('add_tag', { tag: bulkTag.trim() })}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
            >
              Add tag
            </button>
            <select
              aria-label="List for selected records"
              value={bulkListId || filters.list_id || ''}
              onChange={(e) => setBulkListId(e.target.value)}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs"
            >
              <option value="">List…</option>
              {crmLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={bulkBusy || !(bulkListId || filters.list_id)}
              onClick={() => void runListMembers('add')}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
            >
              Add to list
            </button>
            <button
              type="button"
              disabled={bulkBusy || !(bulkListId || filters.list_id)}
              onClick={() => void runListMembers('remove')}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
            >
              Remove from list
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={() => void handleExport(true)}
              className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs hover:bg-stone-50 disabled:opacity-60"
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
            {bulkNote && (
              <span role="status" className="w-full text-xs text-neutral-600">
                {bulkNote}
              </span>
            )}
          </div>
        )}
        {bulkNote && selected.size === 0 && (
          <p role="status" className="text-xs text-neutral-500">{bulkNote}</p>
        )}

        {!embed ? (
          <div className="folio-mobile-record-toolbar">
            <button
              className="compass-btn-secondary"
              aria-pressed={mobileGrid}
              onClick={() => setMobileGrid(!mobileGrid)}
            >
              {mobileGrid ? 'Read as records' : 'Open full table'}
            </button>
          </div>
        ) : null}
        {!embed && !mobileGrid ? (
          <ul className="folio-mobile-records">
            {leads.map((lead) => (
              <li key={lead.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleSelect(lead.id)}
                    aria-label={`Select ${lead.company || lead.name || lead.email || 'unnamed lead'}`}
                  />
                </label>
                <button
                  onClick={() => {
                    onLeadSelect?.(lead)
                    setSelectedId(selectedId === lead.id ? null : lead.id)
                  }}
                >
                  <strong>
                    {lead.company || lead.name || lead.email || 'Unnamed lead'}
                  </strong>
                  <span>
                    {lead.name && lead.company
                      ? lead.name
                      : lead.email || lead.phone || 'No contact details'}
                  </span>
                  <small>
                    {[
                      lead.outbound_status
                        ? humanizeStatus(lead.outbound_status)
                        : null,
                      lead.city,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'No outreach status recorded'}
                  </small>
                </button>
              </li>
            ))}
            {!leads.length ? <li>No records match these filters.</li> : null}
          </ul>
        ) : null}
        {/* Table */}
        <div
          className={
            embed
              ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
              : `folio-crm-table ${mobileGrid ? 'is-open' : ''}`
          }
        >
          <RecordsTable
            serverSort={{key:(Object.entries(LEAD_GRID_SORTS).find(([,value])=>value===filters.sort)?.[0] || 'index') as SortableLeadColumnId|'index',dir:filters.sort_dir==='desc' ? -1 : 1}}
            sortableColumns={Object.keys(LEAD_GRID_SORTS) as SortableLeadColumnId[]}
            onServerSort={(key,dir)=>onNavigate({...filters,sort:LEAD_GRID_SORTS[key],sort_dir:dir===1 ? 'asc' : 'desc'},1)}
            leads={leads}
            columns={grid.visible}
            widths={grid.widths}
            onResizeColumn={grid.resizeColumn}
            occupied={grid.occupied}
            preset={columnPreset}
            selected={selected}
            onToggleRow={toggleSelect}
            onToggleAll={toggleSelectAll}
            onColumnsChange={grid.setVisible}
            onRowActivate={(id) => {
              const lead = leads.find((row) => row.id === id) ?? null
              onLeadSelect?.(lead)
              setSelectedId(selectedId === id ? null : id)
            }}
            activeId={selectedId}
            rowStart={(page - 1) * pageSize + 1}
            fill={embed}
            emptyMessage={`No ${bucket === 'archived' ? 'archived leads' : bucket === 'prospects' ? 'prospects' : 'leads'} match these filters.`}
            entityLabel={
              bucket === 'archived'
                ? 'archived leads'
                : bucket === 'prospects'
                  ? 'prospects'
                  : 'leads'
            }
          />
        </div>

        {/* Pagination */}
        <div className="crm-pagination">
          <span>
            Showing {totalShown === 0 ? 0 : (page - 1) * pageSize + 1}–
            {totalShown} of {total.toLocaleString()}{' '}
            {bucket === 'archived'
              ? 'archived leads'
              : bucket === 'prospects'
                ? 'prospects'
                : 'leads'}
            {summary && summary.filtered !== summary.total
              ? ` (${summary.filtered.toLocaleString()} match filters)`
              : ''}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="rounded-xl border border-stone-200 px-2.5 py-1 text-neutral-600 transition hover:bg-stone-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-1.5">Page {page}</span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={!hasMore}
              className="rounded-xl border border-stone-200 px-2.5 py-1 text-neutral-600 transition hover:bg-stone-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedLead ? embed ? (
        <div className="crm-embedded-detail">
          <LeadSidecar key={selectedLead.id} lead={selectedLead} onClose={() => { setSelectedId(null); onLeadSelect?.(null) }} />
        </div>
      ) : (
        <ModalFrame open label="Contact record" onClose={() => { setSelectedId(null); onLeadSelect?.(null) }} overlayClassName="crm-detail-overlay" contentClassName="crm-detail-sheet" motion="sheet">
          <LeadSidecar key={selectedLead.id} lead={selectedLead} onClose={() => { setSelectedId(null); onLeadSelect?.(null) }} />
        </ModalFrame>
      ) : null}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  hideLabel,
  className,
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
        <span className="mb-1 block text-xs font-medium text-neutral-500">
          {label}
        </span>
      )}
      {hideLabel && <span className="sr-only">{label || 'Filter'}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-sf-orange focus:outline-none"
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
