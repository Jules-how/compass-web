'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { CompassCampaign } from '@/lib/campaigns'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { copyStatusLabel, normalizeCopyStatus } from '@/lib/outbound-copy'
import { isWorkshopCampaign } from '@/lib/outbound-factor-performance'
import { useCachedJson } from '@/lib/use-cached-json'

type CampaignsPayload = { campaigns: CompassCampaign[] }
type OutboundBoardPayload = {
  live: OutboundBoardCampaign[]
}

function copyBadge(status: string) {
  const copy = normalizeCopyStatus(status)
  if (copy === 'ready') {
    return (
      <Badge variant="success" appearance="light" size="sm">
        Ready
      </Badge>
    )
  }
  if (copy === 'draft') {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        Draft
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      {copyStatusLabel(copy)}
    </Badge>
  )
}

export function OutboundWorkshopSection() {
  const campaigns = useCachedJson<CampaignsPayload>(CAMPAIGNS_QUERY_KEY, '/api/campaigns', {
    staleMs: 30_000
  })
  const board = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )

  const liveIds = useMemo(() => {
    return new Set((board.data?.live ?? []).map((row) => row.id))
  }, [board.data?.live])

  const workshop = useMemo(() => {
    return (campaigns.data?.campaigns ?? []).filter((row) => isWorkshopCampaign(row, liveIds))
  }, [campaigns.data?.campaigns, liveIds])

  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    const ids = workshop.map((row) => row.id)
    if (ids.length === 0) {
      setCounts({})
      return
    }
    void Promise.all(
      ids.map(async (id) => {
        const params = new URLSearchParams({
          pipeline_campaign_id: id,
          page: '1',
          pageSize: '1'
        })
        const res = await fetch(`/api/leads/list?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        })
        if (!res.ok) return [id, 0] as const
        const body = (await res.json()) as { total?: number }
        return [id, body.total ?? 0] as const
      })
    ).then((entries) => {
      if (!cancelled) setCounts(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [workshop])

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>In progress</CardTitle>
          <CardDescription>
            Prelaunch Compass campaigns — click to open the sequence editor
          </CardDescription>
        </div>
        <span className="rounded-xl bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
          {workshop.length} workshop
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {campaigns.loading && !campaigns.data ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : null}
        {!campaigns.loading && workshop.length === 0 ? (
          <p className="text-sm text-neutral-500">No campaigns in progress.</p>
        ) : null}
        {workshop.map((campaign) => {
          const leadCount = counts[campaign.id]
          const meta = [
            campaign.offer_key,
            campaign.structure_id,
            (campaign.vertical_tags ?? []).slice(0, 2).join(', ')
          ].filter(Boolean)
          return (
            <Link
              key={campaign.id}
              href={`/sales/outbound/editor/${encodeURIComponent(campaign.id)}`}
              className="block rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition hover:border-[#e85d2a]/35 hover:bg-orange-50/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-neutral-900">{campaign.name}</h3>
                    {copyBadge(String(campaign.copy_status || 'none'))}
                  </div>
                  {meta.length > 0 ? (
                    <p className="mt-1 text-[13px] text-neutral-600">{meta.join(' · ')}</p>
                  ) : (
                    <p className="mt-1 text-[13px] text-neutral-400">No copy yet</p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-semibold tabular-nums tracking-tight text-neutral-900">
                    {leadCount == null ? '—' : leadCount.toLocaleString()}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-neutral-400">leads</div>
                </div>
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
