'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LeadContact, LeadListFilters } from '@/lib/types'
import LeadTable from '@/components/LeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { leadFiltersToSearchParams } from '@/lib/leads-query'

type ListPayload = {
  leads: LeadContact[]
  total: number
  page: number
  pageSize: number
}

export function CampaignLeadsPane({
  pipelineCampaignId,
  instantlyCampaignId,
  waveCap,
  onLeadSelect,
  onLeadsLoaded,
  className
}: {
  pipelineCampaignId?: string | null
  instantlyCampaignId?: string | null
  waveCap?: number | null
  onLeadSelect?: (lead: LeadContact | null) => void
  onLeadsLoaded?: (leads: LeadContact[]) => void
  className?: string
}) {
  const locked = useMemo<LeadListFilters>(
    () => ({
      pipeline_campaign_id: pipelineCampaignId?.trim() || undefined,
      instantly_campaign_id: instantlyCampaignId?.trim() || undefined
    }),
    [pipelineCampaignId, instantlyCampaignId]
  )

  const [filters, setFilters] = useState<LeadListFilters>(locked)
  const [page, setPage] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)
  const [display, setDisplay] = useState<ListPayload | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(true)
  const onLeadsLoadedRef = useRef(onLeadsLoaded)
  onLeadsLoadedRef.current = onLeadsLoaded
  const requestId = useRef(0)

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      pipeline_campaign_id: locked.pipeline_campaign_id,
      instantly_campaign_id: locked.instantly_campaign_id
    }))
    setPage(1)
  }, [locked.pipeline_campaign_id, locked.instantly_campaign_id])

  const listUrl = useMemo(() => {
    const listParams = leadFiltersToSearchParams({
      ...filters,
      pipeline_campaign_id: locked.pipeline_campaign_id,
      instantly_campaign_id: locked.instantly_campaign_id
    })
    listParams.set('page', String(page))
    listParams.set('pageSize', String(LEAD_PAGE_SIZE))
    return `/api/leads/list?${listParams.toString()}`
  }, [filters, locked.instantly_campaign_id, locked.pipeline_campaign_id, page])

  const loadList = useCallback(async () => {
    if (!locked.pipeline_campaign_id && !locked.instantly_campaign_id) {
      setDisplay({ leads: [], total: 0, page: 1, pageSize: LEAD_PAGE_SIZE })
      setListBusy(false)
      return
    }
    const id = ++requestId.current
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
      const next = {
        leads: body.leads ?? [],
        total: body.total ?? 0,
        page: body.page ?? page,
        pageSize: body.pageSize ?? LEAD_PAGE_SIZE
      }
      setDisplay(next)
      onLeadsLoadedRef.current?.(next.leads)
    } catch (err) {
      if (id !== requestId.current) return
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      if (id === requestId.current) setListBusy(false)
    }
  }, [listUrl, locked.instantly_campaign_id, locked.pipeline_campaign_id, page])

  useEffect(() => {
    void loadList()
  }, [loadList, reloadToken])

  const navigate = useCallback((nextFilters: LeadListFilters, nextPage = 1) => {
    setFilters({
      ...nextFilters,
      pipeline_campaign_id: locked.pipeline_campaign_id,
      instantly_campaign_id: locked.instantly_campaign_id
    })
    setPage(nextPage)
  }, [locked.instantly_campaign_id, locked.pipeline_campaign_id])

  if (!locked.pipeline_campaign_id && !locked.instantly_campaign_id) {
    return (
      <div className={className}>
        <p className="px-4 py-6 text-sm text-neutral-500">No campaign membership to list.</p>
      </div>
    )
  }

  if (listError && !display) {
    return (
      <div className={className}>
        <div className="p-4 text-sm text-red-700">
          {listError}{' '}
          <button type="button" className="underline" onClick={() => void loadList()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!display) {
    return (
      <div className={className}>
        <LoadingBlock label="Loading leads…" />
      </div>
    )
  }

  const from = (page - 1) * LEAD_PAGE_SIZE
  const totalShown = from + display.leads.length
  const hasMore = totalShown < display.total

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className ?? ''}`}>
      <div className="flex h-full min-h-0 flex-col px-3 py-2">
        <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2">
          <p className="text-[12px] text-neutral-500">
            {display.total.toLocaleString()} lead{display.total === 1 ? '' : 's'} in this campaign
            {typeof waveCap === 'number' ? ` · wave ${display.total}/${waveCap}` : ''}
            {listBusy ? ' · updating' : ''}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <LeadTable
            variant="embed"
            columnPreset="campaign"
            leads={display.leads}
            filters={filters}
            page={page}
            pageSize={LEAD_PAGE_SIZE}
            totalShown={totalShown}
            hasMore={hasMore}
            total={display.total}
            summary={null}
            onNavigate={navigate}
            onReload={() => setReloadToken((n) => n + 1)}
            onLeadSelect={onLeadSelect}
          />
        </div>
      </div>
    </div>
  )
}
