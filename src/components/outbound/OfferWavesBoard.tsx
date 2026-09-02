'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CAMPAIGNS_QUERY_KEY,
  duplicateInstantlyTemplate
} from '@/lib/campaigns-client'
import {
  OFFER_WAVE_COLUMN_LABELS,
  OFFER_WAVE_COLUMNS,
  evaluateOfferWaveDecision,
  offerWaveColumn,
  type CompassCampaign,
  type OfferWaveColumnId
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type CampaignsPayload = { campaigns: CompassCampaign[] }
type OutboundBoardPayload = { live: OutboundBoardCampaign[]; history?: OutboundBoardCampaign[] }

const DAILY_CAP = 30

function tradeFrom(campaign: CompassCampaign): string {
  return (campaign.vertical_tags ?? []).filter(Boolean)[0] || 'Trade'
}

function cityFrom(campaign: CompassCampaign): string {
  return (campaign.location_tags ?? []).filter(Boolean)[0] || 'City'
}

function decisionBadge(id: string) {
  if (id === 'kill') {
    return (
      <Badge variant="destructive" appearance="light" size="sm">
        Kill / Overhaul
      </Badge>
    )
  }
  if (id === 'validated') {
    return (
      <Badge variant="success" appearance="light" size="sm">
        Validated
      </Badge>
    )
  }
  if (id === 'deliverability') {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        Deliverability
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      Waiting
    </Badge>
  )
}

export function OfferWavesBoard({ className }: { className?: string }) {
  const campaignsQuery = useCachedJson<CampaignsPayload>(CAMPAIGNS_QUERY_KEY, '/api/campaigns', {
    staleMs: 30_000
  })
  const boardQuery = useCachedJson<OutboundBoardPayload>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 30_000 }
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const instantlyById = useMemo(() => {
    const map = new Map<string, OutboundBoardCampaign>()
    for (const row of [...(boardQuery.data?.live ?? []), ...(boardQuery.data?.history ?? [])]) {
      map.set(row.id, row)
    }
    return map
  }, [boardQuery.data])

  const grouped = useMemo(() => {
    const buckets: Record<OfferWaveColumnId, CompassCampaign[]> = {
      sourcing: [],
      prep: [],
      live: [],
      decision: []
    }
    for (const campaign of campaignsQuery.data?.campaigns ?? []) {
      const instantly = campaign.instantly_campaign_id
        ? instantlyById.get(campaign.instantly_campaign_id)
        : undefined
      const column = offerWaveColumn(campaign, {
        sends: instantly?.sendCount ?? 0,
        replies: instantly?.replyCount ?? 0,
        positiveReplies: instantly?.positiveReplies ?? campaign.wave_positive_count ?? 0,
        instantlyStatus: instantly?.status
      })
      buckets[column].push(campaign)
    }
    return buckets
  }, [campaignsQuery.data, instantlyById])

  async function duplicate(campaign: CompassCampaign) {
    setBusyId(campaign.id)
    setError(null)
    setNote(null)
    try {
      const result = await duplicateInstantlyTemplate({
        campaignId: campaign.id,
        name: campaign.name
      })
      setNote(`Draft Instantly campaign ${result.instantlyCampaignId} (paused).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duplicate failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Offer waves</h2>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            Rolling 3-week Fill and Capture pipeline. Activate stays in Instantly.
          </p>
        </div>
        {note ? <p className="text-[12px] text-emerald-800">{note}</p> : null}
        {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {OFFER_WAVE_COLUMNS.map((column) => (
          <div key={column} className="min-w-0 space-y-2">
            <div className="flex items-baseline justify-between gap-2 px-0.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
                {OFFER_WAVE_COLUMN_LABELS[column]}
              </h3>
              <span className="text-[11px] text-neutral-400">{grouped[column].length}</span>
            </div>
            {grouped[column].length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-200 px-3 py-6 text-[12px] text-neutral-400">
                Empty
              </p>
            ) : (
              grouped[column].map((campaign) => {
                const instantly = campaign.instantly_campaign_id
                  ? instantlyById.get(campaign.instantly_campaign_id)
                  : undefined
                const sends = instantly?.sendCount ?? 0
                const replies = instantly?.replyCount ?? 0
                const positive = instantly?.positiveReplies ?? campaign.wave_positive_count ?? 0
                const decision = evaluateOfferWaveDecision({
                  sends,
                  replies,
                  positiveReplies: positive,
                  instantlyStatus: instantly?.status
                })
                const cohort = campaign.wave_cohort_count ?? 0
                const openers = campaign.wave_opener_count ?? 0
                return (
                  <Card key={campaign.id} className="border-stone-200/80 shadow-soft">
                    <CardHeader className="space-y-1 p-3 pb-2">
                      <CardTitle className="text-[13px] font-semibold leading-snug text-neutral-900">
                        <Link
                          href={`/sales/outbound/editor/${encodeURIComponent(campaign.id)}`}
                          className="hover:text-[#c2410c]"
                        >
                          {campaign.name}
                        </Link>
                      </CardTitle>
                      <p className="text-[11px] text-neutral-500">
                        {tradeFrom(campaign)} · {cityFrom(campaign)}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-2 p-3 pt-0 text-[12px] text-neutral-600">
                      {column === 'sourcing' ? (
                        <p>
                          {cohort} leads · target 150
                          {cohort < 150 ? ' (scrape still short)' : ''}
                        </p>
                      ) : null}
                      {column === 'prep' ? (
                        <p>
                          Openers {openers}/{cohort} · review{' '}
                          {campaign.opener_reviewed_at ? 'ticked' : 'open'}
                        </p>
                      ) : null}
                      {column === 'live' ? (
                        <p>
                          {instantly?.status || campaign.status} · {DAILY_CAP}/day · {sends} sent ·{' '}
                          {replies} replies
                        </p>
                      ) : null}
                      {column === 'decision' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {decisionBadge(decision.id)}
                          <span>
                            {sends} sends · {replies} replies
                          </span>
                        </div>
                      ) : null}
                      {column === 'prep' || column === 'sourcing' ? (
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => void duplicate(campaign)}
                          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-800 shadow-soft disabled:opacity-50"
                        >
                          {busyId === campaign.id ? 'Duplicating…' : 'Duplicate Fill & Capture'}
                        </button>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
