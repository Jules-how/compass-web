'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { LeadContact, LeadListFilters } from '@/lib/types'
import LeadTable from '@/components/LeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'

export function LeadsPanel() {
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<LeadContact[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const filters: LeadListFilters = {
    vertical: searchParams.get('vertical') ?? undefined,
    source: searchParams.get('source') ?? undefined,
    outbound_status: searchParams.get('outbound_status') ?? undefined,
    city: searchParams.get('city') ?? undefined
  }
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.vertical) params.set('vertical', filters.vertical)
      if (filters.source) params.set('source', filters.source)
      if (filters.outbound_status) params.set('outbound_status', filters.outbound_status)
      if (filters.city) params.set('city', filters.city)
      params.set('page', String(page))
      params.set('pageSize', String(LEAD_PAGE_SIZE))
      const res = await fetch(`/api/leads/list?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) throw new Error(`Failed to load leads (${res.status})`)
      const body = (await res.json()) as {
        leads: LeadContact[]
        total: number
        page: number
        pageSize: number
      }
      setLeads(body.leads ?? [])
      setTotal(body.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [filters.city, filters.outbound_status, filters.source, filters.vertical, page])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  if (!leads) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <LoadingBlock label="Loading leads…" />
      </div>
    )
  }

  const from = (page - 1) * LEAD_PAGE_SIZE
  const totalShown = from + leads.length
  const hasMore = totalShown < total

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LeadTable
        leads={leads}
        filters={filters}
        page={page}
        pageSize={LEAD_PAGE_SIZE}
        total={total}
        totalShown={totalShown}
        hasMore={hasMore}
      />
    </div>
  )
}
