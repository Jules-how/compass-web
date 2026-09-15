'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LeadContact, LeadListFilters, LeadSummaryCounts } from '@/lib/types'
import LeadTable from '@/components/LeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { leadFiltersToSearchParams, parseLeadListFilters } from '@/lib/leads-query'
import { prefetchJson, useCachedJson } from '@/lib/use-cached-json'
import { CompanyResearchWorkspace } from './CompanyResearchWorkspace'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import type { CompassLeadList } from '@/lib/lead-lists'

type ListPayload = {
  leads: LeadContact[]
  total: number
  page: number
  pageSize: number
}

type SummaryPayload = {
  summary: LeadSummaryCounts
}

type FacetsPayload = {
  verticals: Array<{ value: string; count: number }>
  cities: Array<{ value: string; count: number }>
}

export function LeadsPanel() {
  const params = useSearchParams()
  if (params.get('view') === 'companies') return <CompanyResearchWorkspace />
  return <><div className="mb-3 text-sm"><Link href="/leads?view=companies">Company research</Link></div><LeadRecordsPanel /></>
}

function LeadRecordsPanel() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const queryString = searchParams.toString()
  const filters: LeadListFilters = useMemo(
    () => parseLeadListFilters(new URLSearchParams(queryString)),
    [queryString]
  )
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1

  const listUrl = useMemo(() => {
    const listParams = leadFiltersToSearchParams(filters)
    listParams.set('page', String(page))
    listParams.set('pageSize', String(LEAD_PAGE_SIZE))
    return `/api/leads/list?${listParams.toString()}`
  }, [filters, page])

  const list = useCachedJson<ListPayload>(listUrl, listUrl, { staleMs: 30_000 })
  const summary = useCachedJson<SummaryPayload>('leads:summary:global', '/api/leads/summary', {
    staleMs: 30_000
  })
  const facets = useCachedJson<FacetsPayload>('leads:facets', '/api/leads/facets', {
    staleMs: 30_000
  })
  const crmLists = useCachedJson<{ lists: CompassLeadList[] }>('leads:crm-lists', '/api/lead-lists', {
    staleMs: 30_000
  })

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!list.data) return
    const shown = (page - 1) * LEAD_PAGE_SIZE + (list.data.leads?.length ?? 0)
    if (shown >= (list.data.total ?? 0)) return
    const nextParams = leadFiltersToSearchParams(filters)
    nextParams.set('page', String(page + 1))
    nextParams.set('pageSize', String(LEAD_PAGE_SIZE))
    const nextUrl = `/api/leads/list?${nextParams.toString()}`
    prefetchJson(nextUrl, nextUrl)
  }, [list.data, page, filters])

  const navigate = useCallback(
    (nextFilters: LeadListFilters, nextPage = 1) => {
      const qs = leadFiltersToSearchParams(nextFilters, nextPage).toString()
      router.push(qs ? `/leads?${qs}` : '/leads')
    },
    [router]
  )

  const reloadList = list.reload
  const reloadSummary = summary.reload
  const reloadFacets = facets.reload
  const reloadLists = crmLists.reload
  const reload = useCallback(() => {
    void reloadList(true)
    void reloadSummary(true)
    void reloadFacets(true)
    void reloadLists(true)
  }, [reloadList, reloadSummary, reloadFacets, reloadLists])

  const handleLocalSync = async () => {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch('/api/leads/local-sync', { credentials: 'same-origin', method: 'POST' })
      if (!res.ok) throw new Error('Sync failed')
      const data = await res.json()
      setSyncMessage(`Synced ${data.total} leads from local files`)
      reload()
      window.setTimeout(() => setSyncMessage(null), 4000)
    } catch {
      setSyncMessage('Failed to sync local files. Try again.')
    } finally {
      setSyncing(false)
    }
  }

  const activeData = list.data

  if (list.error && !activeData) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-soft">
        {list.error}{' '}
        <button type="button" className="underline" onClick={() => void reloadList(true)}>
          Retry leads
        </button>
      </div>
    )
  }

  if (!activeData) return <LoadingBlock label="Loading leads…" />

  const leads = activeData.leads ?? []
  const total = activeData.total ?? 0
  const from = (page - 1) * LEAD_PAGE_SIZE
  const totalShown = from + leads.length
  const hasMore = totalShown < total
  const summaryCounts = summary.data?.summary
    ? { ...summary.data.summary, filtered: total }
    : null
  const discoveredVerticals = (facets.data?.verticals ?? []).map((v) => v.value)

  return (
    <div className="folio-record-surface crm-workspace">
      <div className="crm-record-summary">
        <div className="flex items-center gap-3">
          <p className="text-sm text-neutral-500">
            {total.toLocaleString()} {filters.bucket === 'archived' ? 'archived lead' : 'lead'}{total === 1 ? '' : 's'}
            {summaryCounts && summaryCounts.total !== total && filters.bucket !== 'archived'
              ? ` matching filters · ${summaryCounts.total.toLocaleString()} active total`
              : ''}
          </p>
          {list.refreshing ? <span role="status" className="text-xs text-neutral-500">Updating…</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {syncMessage ? (
            <span role="status" className="text-xs text-neutral-600">{syncMessage}</span>
          ) : null}
          <button
            type="button"
            onClick={handleLocalSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
            {syncing ? 'Syncing…' : 'Sync local files'}
          </button>
        </div>
      </div>
      {list.error ? <p role="alert" className="crm-data-notice">Could not refresh records. Showing the last result for these filters. {list.error} <button type="button" onClick={() => void reloadList(true)}>Retry</button></p> : null}
      {summary.error || facets.error || crmLists.error ? <p role="status" className="crm-data-notice">Some counts or saved lists could not be refreshed. <button type="button" onClick={reload}>Retry</button></p> : null}
      <LeadTable
        leads={leads}
        filters={filters}
        page={page}
        pageSize={LEAD_PAGE_SIZE}
        totalShown={totalShown}
        hasMore={hasMore}
        total={total}
        summary={summaryCounts}
        discoveredVerticals={discoveredVerticals}
        crmLists={crmLists.data?.lists ?? []}
        onListsChange={() => void reloadLists(true)}
        onNavigate={navigate}
        onReload={reload}
      />
    </div>
  )
}
