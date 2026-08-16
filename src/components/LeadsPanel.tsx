'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LeadContact, LeadListFilters, LeadSummaryCounts } from '@/lib/types'
import LeadTable from '@/components/LeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { leadFiltersToSearchParams, parseLeadListFilters } from '@/lib/leads-query'
import { useCachedJson } from '@/lib/use-cached-json'
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
  const router = useRouter()
  const searchParams = useSearchParams()
  const [reloadToken, setReloadToken] = useState(0)
  // Keep last good rows on screen while the next filter/page fetch is in flight.
  const [display, setDisplay] = useState<ListPayload | null>(null)
  const [displayKey, setDisplayKey] = useState('')
  const requestId = useRef(0)

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

  // Global lane counts — independent of filters; long stale window so chip bar
  // doesn't re-hit eight head-count queries on every filter click.
  const summary = useCachedJson<SummaryPayload>('leads:summary:global', '/api/leads/summary', {
    staleMs: 5 * 60_000
  })

  const facets = useCachedJson<FacetsPayload>('leads:facets', '/api/leads/facets', {
    staleMs: 60_000
  })
  const crmLists = useCachedJson<{ lists: CompassLeadList[] }>('leads:crm-lists', '/api/lead-lists', {
    staleMs: 30_000
  })

  const [listError, setListError] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(true)

  const loadList = useCallback(async () => {
    const id = ++requestId.current
    const key = listUrl
    setListBusy(true)
    setListError(null)
    try {
      const res = await fetch(listUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) throw new Error(`Failed to load leads (${res.status})`)
      const body = (await res.json()) as ListPayload
      if (id !== requestId.current) return
      setDisplay({
        leads: body.leads ?? [],
        total: body.total ?? 0,
        page: body.page ?? page,
        pageSize: body.pageSize ?? LEAD_PAGE_SIZE
      })
      setDisplayKey(key)
    } catch (err) {
      if (id !== requestId.current) return
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      if (id === requestId.current) setListBusy(false)
    }
  }, [listUrl, page])

  useEffect(() => {
    void loadList()
  }, [loadList, reloadToken])

  // Warm the next page so pagination feels instant.
  useEffect(() => {
    if (!display || displayKey !== listUrl) return
    const shown = (page - 1) * LEAD_PAGE_SIZE + display.leads.length
    if (shown >= display.total) return
    const nextParams = leadFiltersToSearchParams(filters)
    nextParams.set('page', String(page + 1))
    nextParams.set('pageSize', String(LEAD_PAGE_SIZE))
    void fetch(`/api/leads/list?${nextParams.toString()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).catch(() => {})
  }, [display, displayKey, listUrl, page, filters])

  const navigate = useCallback(
    (nextFilters: LeadListFilters, nextPage = 1) => {
      const qs = leadFiltersToSearchParams(nextFilters, nextPage).toString()
      router.push(qs ? `/leads?${qs}` : '/leads')
    },
    [router]
  )

  const reloadSummary = summary.reload
  const reloadFacets = facets.reload
  const reloadLists = crmLists.reload
  const reload = useCallback(() => {
    setReloadToken((n) => n + 1)
    void reloadSummary(true)
    void reloadFacets(true)
    void reloadLists(true)
  }, [reloadSummary, reloadFacets, reloadLists])

  if (listError && !display) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-soft">
        {listError}{' '}
        <button type="button" className="underline" onClick={() => void loadList()}>
          Retry
        </button>
      </div>
    )
  }

  if (!display) return <LoadingBlock label="Loading leads…" />

  // While filters change, keep prior rows only if they still match the active URL —
  // otherwise show empty/updating so operators don't think Trades returned agencies.
  const rowsAreCurrent = displayKey === listUrl
  const leads = rowsAreCurrent ? display.leads : []
  const total = rowsAreCurrent ? display.total : display.total
  const from = (page - 1) * LEAD_PAGE_SIZE
  const totalShown = rowsAreCurrent ? from + leads.length : from
  const hasMore = rowsAreCurrent ? totalShown < total : false
  const summaryCounts = summary.data?.summary
    ? { ...summary.data.summary, filtered: rowsAreCurrent ? total : summary.data.summary.filtered }
    : null

  const discoveredVerticals = (facets.data?.verticals ?? []).map((v) => v.value)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-neutral-500">
          {(rowsAreCurrent ? total : display.total).toLocaleString()} lead
          {(rowsAreCurrent ? total : display.total) === 1 ? '' : 's'}
          {summaryCounts && summaryCounts.total !== (rowsAreCurrent ? total : display.total)
            ? ` matching filters · ${summaryCounts.total.toLocaleString()} total`
            : ' in outbound database'}
        </p>
        {listBusy || !rowsAreCurrent ? (
          <span className="text-xs text-neutral-400">Updating…</span>
        ) : null}
      </div>
      <LeadTable
        leads={leads}
        filters={filters}
        page={page}
        pageSize={LEAD_PAGE_SIZE}
        totalShown={totalShown}
        hasMore={hasMore}
        total={rowsAreCurrent ? total : 0}
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
