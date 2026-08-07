'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { LeadContact, LeadListFilters, LeadSummaryCounts } from '@/lib/types'
import LeadTable from '@/components/LeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import { LEAD_PAGE_SIZE } from '@/lib/list-columns'
import { leadFiltersToSearchParams, parseLeadListFilters } from '@/lib/leads-query'

export function LeadsPanel() {
  const searchParams = useSearchParams()
  const [leads, setLeads] = useState<LeadContact[] | null>(null)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<LeadSummaryCounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const queryString = searchParams.toString()
  const filters: LeadListFilters = parseLeadListFilters(new URLSearchParams(queryString))
  const pageParam = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1

  const load = useCallback(async () => {
    setError(null)
    try {
      const currentFilters = parseLeadListFilters(new URLSearchParams(queryString))
      const listParams = leadFiltersToSearchParams(currentFilters)
      listParams.set('page', String(page))
      listParams.set('pageSize', String(LEAD_PAGE_SIZE))

      const summaryParams = leadFiltersToSearchParams(currentFilters)

      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/leads/list?${listParams.toString()}`, {
          headers: { Accept: 'application/json' }
        }),
        fetch(`/api/leads/summary?${summaryParams.toString()}`, {
          headers: { Accept: 'application/json' }
        })
      ])

      if (!listRes.ok) throw new Error(`Failed to load leads (${listRes.status})`)
      const body = (await listRes.json()) as {
        leads: LeadContact[]
        total: number
        page: number
        pageSize: number
      }
      setLeads(body.leads ?? [])
      setTotal(body.total ?? 0)

      if (summaryRes.ok) {
        const summaryBody = (await summaryRes.json()) as { summary: LeadSummaryCounts }
        setSummary(summaryBody.summary ?? null)
      } else {
        setSummary(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [page, queryString])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  if (!leads) return <LoadingBlock label="Loading leads…" />

  const from = (page - 1) * LEAD_PAGE_SIZE
  const totalShown = from + leads.length
  const hasMore = totalShown < total

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        {(summary?.filtered ?? total).toLocaleString()} lead
        {(summary?.filtered ?? total) === 1 ? '' : 's'}
        {summary && summary.filtered !== summary.total
          ? ` matching filters · ${summary.total.toLocaleString()} total`
          : ' in outbound database'}
      </p>
      <LeadTable
        leads={leads}
        filters={filters}
        page={page}
        pageSize={LEAD_PAGE_SIZE}
        totalShown={totalShown}
        hasMore={hasMore}
        total={total}
        summary={summary}
        onReload={() => setReloadToken((n) => n + 1)}
      />
    </div>
  )
}
