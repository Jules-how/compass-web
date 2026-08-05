'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { InboundLeadTable } from '@/components/InboundLeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { PortalInboundLead } from '@/lib/inbound-leads-ui'

export function InboxPanel({ basePath = '/inbox' }: { basePath?: string }) {
  const searchParams = useSearchParams()
  const sourceFilter = searchParams.get('source') ?? undefined
  const [leads, setLeads] = useState<PortalInboundLead[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams()
      if (sourceFilter) params.set('source', sourceFilter)
      const qs = params.toString()
      const res = await fetch(`/api/inbox${qs ? `?${qs}` : ''}`, {
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) throw new Error(`Failed to load inbox (${res.status})`)
      const body = (await res.json()) as { leads: PortalInboundLead[]; total: number }
      setLeads(body.leads ?? [])
      setTotal(body.total ?? 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [sourceFilter])

  useEffect(() => {
    void load()
  }, [load])

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

  if (!leads) return <LoadingBlock label="Loading inbox…" />

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        {total} lead{total === 1 ? '' : 's'}
      </p>
      <InboundLeadTable leads={leads} sourceFilter={sourceFilter} basePath={basePath} />
    </div>
  )
}
