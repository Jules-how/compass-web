'use client'

import { Fragment, useState } from 'react'
import type { LeadContact, LeadListFilters } from '@/lib/types'
import { exportToCsv } from '@/lib/csv'

interface LeadTableProps {
  leads: LeadContact[]
  filters: LeadListFilters
  page: number
  pageSize: number
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

function emailCampaignCount(
  raw: string | null | undefined,
  latestId?: string | null
): number {
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

function buildQuery(filters: LeadListFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.vertical) params.set('vertical', filters.vertical)
  if (filters.source) params.set('source', filters.source)
  if (filters.outbound_status) params.set('outbound_status', filters.outbound_status)
  if (filters.city) params.set('city', filters.city)
  params.set('page', String(page))
  return params.toString()
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

function outboundBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case 'interested':
    case 'replied':
    case 'booked':
    case 'converted':
      return 'bg-emerald-100 text-emerald-800'
    case 'not_interested':
    case 'suppressed':
      return 'bg-neutral-200 text-neutral-700'
    case 'contacted':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-neutral-100 text-neutral-600'
  }
}

export default function LeadTable({
  leads,
  filters,
  page,
  pageSize,
  totalShown,
  hasMore
}: LeadTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [draftFilters, setDraftFilters] = useState<LeadListFilters>(filters)
  const [exporting, setExporting] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)

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

  async function handleExport() {
    setExporting(true)
    setExportNote(null)
    try {
      // Fetch the full filtered set (up to a sane cap) for export.
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

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Vertical</span>
            <select
              value={draftFilters.vertical ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({ ...f, vertical: e.target.value || undefined }))
              }
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            >
              <option value="">All</option>
              {VERTICALS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Source</span>
            <select
              value={draftFilters.source ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({ ...f, source: e.target.value || undefined }))
              }
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            >
              <option value="">All</option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">Outbound status</span>
            <select
              value={draftFilters.outbound_status ?? ''}
              onChange={(e) =>
                setDraftFilters((f) => ({
                  ...f,
                  outbound_status: e.target.value || undefined
                }))
              }
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
            >
              <option value="">All</option>
              {OUTBOUND_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
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
        <div className="mt-3 flex items-center gap-2">
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
          <div className="ml-auto flex items-center gap-3">
            {exportNote && <span className="text-xs text-neutral-500">{exportNote}</span>}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || leads.length === 0}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Vertical</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Outbound</th>
              <th className="px-3 py-2 font-medium">Last outbound</th>
              <th className="px-3 py-2 font-medium">Mirrored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
                  No leads match these filters.
                </td>
              </tr>
            )}
            {leads.map((lead) => {
              const expanded = expandedId === lead.id
              return (
                <Fragment key={lead.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : lead.id)}
                    className="cursor-pointer transition hover:bg-neutral-50"
                  >
                    <td className="px-3 py-2 font-medium text-neutral-900">
                      {lead.name || '—'}
                      <div className="text-xs font-normal text-neutral-400">{lead.id}</div>
                    </td>
                    <td className="px-3 py-2 text-neutral-700">{lead.email || '—'}</td>
                    <td className="px-3 py-2 text-neutral-700">{lead.phone || '—'}</td>
                    <td className="px-3 py-2 text-neutral-700">{lead.company || '—'}</td>
                    <td className="px-3 py-2 text-neutral-700">{lead.vertical || '—'}</td>
                    <td className="px-3 py-2 text-neutral-700">{lead.source || '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${outboundBadgeClass(
                          lead.outbound_status
                        )}`}
                      >
                        {lead.outbound_status || 'uncontacted'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-500">
                      {formatDate(lead.last_outbound_at)}
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{formatDate(lead.mirrored_at)}</td>
                  </tr>
                  {expanded && (
                    <tr key={`${lead.id}-detail`} className="bg-neutral-50/60">
                      <td colSpan={9} className="px-3 py-3">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <DetailRow label="Role" value={lead.role} />
                          <DetailRow label="City" value={lead.city} />
                          <DetailRow label="State" value={lead.state} />
                          <DetailRow label="LinkedIn" value={lead.linkedin} />
                          <DetailRow label="Interest" value={lead.interest_label} />
                          <DetailRow label="Lead status source" value={lead.lead_status_source} />
                          <DetailRow label="Instantly campaign" value={lead.instantly_campaign} />
                          <DetailRow
                            label="Instantly campaign name"
                            value={lead.instantly_campaign_name}
                          />
                          <DetailRow
                            label="Email campaigns"
                            value={String(
                              emailCampaignCount(
                                lead.instantly_campaign_ids,
                                lead.instantly_campaign_id
                              )
                            )}
                          />
                          <DetailRow label="Instantly lead id" value={lead.instantly_lead_id} />
                          <DetailRow
                            label="Instantly uploaded at"
                            value={formatDate(lead.instantly_uploaded_at)}
                          />
                          <DetailRow
                            label="Instantly synced at"
                            value={formatDate(lead.instantly_synced_at)}
                          />
                          <DetailRow
                            label="Lead context status"
                            value={lead.lead_context_status}
                          />
                          <DetailRow
                            label="Lead context updated at"
                            value={formatDate(lead.lead_context_updated_at)}
                          />
                          <DetailRow label="Suppression reason" value={lead.suppression_reason} />
                          <DetailRow
                            label="Recontact ok"
                            value={lead.recontact_ok == null ? '—' : String(lead.recontact_ok)}
                          />
                          <DetailRow label="Tags" value={lead.tags} />
                          <DetailRow label="List ids" value={lead.list_ids} />
                          <DetailRow label="Import batch" value={lead.import_batch_id} />
                          <DetailRow label="Created at" value={formatDate(lead.created_at)} />
                          <DetailRow label="Updated at" value={formatDate(lead.updated_at)} />
                        </dl>
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
          Showing {totalShown === 0 ? 0 : (page - 1) * pageSize + 1}–{totalShown} leads
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
            Load more
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-neutral-800">{value || '—'}</dd>
    </div>
  )
}
