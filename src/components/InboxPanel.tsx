'use client'

import { useSearchParams } from 'next/navigation'
import { InboundLeadTable } from '@/components/InboundLeadTable'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { PortalInboundLead } from '@/lib/inbound-leads-ui'
import { useCachedJson } from '@/lib/use-cached-json'

export function InboxPanel({ basePath = '/inbox' }: { basePath?: string }) {
  const searchParams = useSearchParams()
  const sourceFilter = searchParams.get('source') ?? undefined
  const params = new URLSearchParams()
  if (sourceFilter) params.set('source', sourceFilter)
  const qs = params.toString()
  const url = `/api/inbox${qs ? `?${qs}` : ''}`

  const { data, error, loading, reload } = useCachedJson<{
    leads: PortalInboundLead[]
    total: number
  }>(url, url)

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void reload(true)}>
          Retry
        </button>
      </div>
    )
  }

  if (loading || !data) return <LoadingBlock label="Loading inbox…" />

  const leads = data.leads ?? []
  const total = data.total ?? 0

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-500">
        {total} lead{total === 1 ? '' : 's'}
      </p>
      <InboundLeadTable leads={leads} sourceFilter={sourceFilter} basePath={basePath} />
    </div>
  )
}
