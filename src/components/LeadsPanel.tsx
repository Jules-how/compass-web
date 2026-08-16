'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LeadContact, LeadListFilters, LeadSummaryCounts } from '@/lib/types'
import LeadTable from '@/components/LeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { leadFiltersToSearchParams, parseLeadListFilters } from '@/lib/leads-query'
import { prefetchJson, useCachedJson } from '@/lib/use-cached-json'

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

  const list = useCachedJson<ListPayload>(listUrl, listUrl, { staleMs: 45_000 })
  const summary = useCachedJson<SummaryPayload>('leads:summary:global', '/api/leads/summary', {
    staleMs: 5 * 60_000
  })
  const facets = useCachedJson<FacetsPayload>('leads:facets', '/api/leads/facets', {
    staleMs: 60_000
  })

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
  const reload = useCallback(() => {
    void reloadList(true)
    void reloadSummary(true)
    void reloadFacets(true)
  }, [reloadList, reloadSummary, reloadFacets])

  if (list.error && !list.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-soft">
        {list.error}{' '}
        <button type="button" className="underline" onClick={() => void reloadList(true)}>
          Retry
        </button>
      </div>
    )
  }

  if (!list.data) return <LoadingBlock label="Loading leads…" />

  const leads = list.data.leads ?? []
  const total = list.data.total ?? 0
  const from = (page - 1) * LEAD_PAGE_SIZE
  const totalShown = from + leads.length
  const hasMore = totalShown < total
  const summaryCounts = summary.data?.summary
    ? { ...summary.data.summary, filtered: total }
    : null
  const discoveredVerticals = (facets.data?.verticals ?? []).map((v) => v.value)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {total.toLocaleString()} lead{total === 1 ? '' : 's'}
          {summaryCounts && summaryCounts.total !== total
            ? ` matching filters · ${summaryCounts.total.toLocaleString()} total`
            : ' in outbound database'}
        </p>
        {list.loading ? <span className="text-xs text-neutral-400">Updating…</span> : null}
      </div>
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
        onNavigate={navigate}
        onReload={reload}
      />
    </div>
  )
}
