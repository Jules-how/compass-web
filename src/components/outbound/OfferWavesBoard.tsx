'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WaveAddCampaign } from '@/components/outbound/WaveAddCampaign'
import { WaveCampaignCard, WaveEmptyColumn } from '@/components/outbound/WaveCampaignCard'
import {
  CAMPAIGNS_QUERY_KEY,
  updateCampaign
} from '@/lib/campaigns-client'
import {
  OFFER_WAVE_COLUMN_LABELS,
  OFFER_WAVE_COLUMNS,
  evaluateOfferWaveDecision,
  type CompassCampaign,
  type OfferWaveColumnId
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { useCachedJson } from '@/lib/use-cached-json'
import { groupCampaignsByWave } from '@/lib/wave-desk'
import { cn } from '@/lib/utils'

type CampaignsPayload = { campaigns: CompassCampaign[] }
type OutboundBoardPayload = { live: OutboundBoardCampaign[]; history?: OutboundBoardCampaign[] }
type WaveDeskPayload = {
  recontactReady: number
  emailsRemaining: number
  liveCampaigns: number
  thisWeekStart: string
  actions: Array<{
    id: string
    title: string
    kind: string
    detail: string | null
    source: string
    status: string
    week_start: string | null
  }>
  briefs: Array<{
    id: string
    generated_at: string
    recommendation: string | null
  }>
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
  const deskQuery = useCachedJson<WaveDeskPayload>(
    '/api/outbound/wave-desk',
    '/api/outbound/wave-desk',
    { staleMs: 30_000 }
  )
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const instantlyById = useMemo(() => {
    const map = new Map<string, OutboundBoardCampaign>()
    for (const row of [...(boardQuery.data?.live ?? []), ...(boardQuery.data?.history ?? [])]) {
      map.set(row.id, row)
    }
    return map
  }, [boardQuery.data])

  const grouped = useMemo(
    () => groupCampaignsByWave(campaignsQuery.data?.campaigns ?? [], instantlyById),
    [campaignsQuery.data, instantlyById]
  )

  async function promote(campaign: CompassCampaign) {
    setError(null)
    try {
      await updateCampaign(campaign.id, { wave_lane: 'next' })
      setNote(`${campaign.name} moved to next.`)
      void campaignsQuery.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed')
    }
  }

  const latestBrief = deskQuery.data?.briefs?.[0]

  return (
    <div className={cn('space-y-8', className)}>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900">Offer waves</h2>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              Recommended lists on the left. Live stays Instantly. Activate stays in Instantly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {note ? <p className="text-[12px] text-emerald-800">{note}</p> : null}
            {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
            <WaveAddCampaign
              onCreated={() => {
                setNote('Campaign saved to next.')
                void campaignsQuery.reload()
              }}
            />
          </div>
        </div>
        {latestBrief?.recommendation ? (
          <p className="rounded-2xl border border-stone-200/80 bg-white px-3 py-2 text-[12px] text-neutral-600 shadow-soft">
            <span className="font-semibold text-neutral-800">This morning. </span>
            {latestBrief.recommendation}
          </p>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-3">
          {OFFER_WAVE_COLUMNS.map((column) => (
            <div key={column} className="min-w-0 space-y-2">
              <div className="flex items-baseline justify-between gap-2 px-0.5">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
                  {OFFER_WAVE_COLUMN_LABELS[column]}
                </h3>
                <span className="text-[11px] text-neutral-400">{grouped[column].length}</span>
              </div>
              {grouped[column].length === 0 ? (
                <WaveEmptyColumn
                  label={
                    column === 'recommended'
                      ? 'Empty. Morning scan writes the next list here.'
                      : 'Empty'
                  }
                />
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
                  return (
                    <WaveCampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      column={column as OfferWaveColumnId}
                      instantly={instantly}
                      sends={sends}
                      replies={replies}
                      decisionLabel={column === 'live' ? decision.label : undefined}
                      onPromote={column === 'recommended' ? promote : undefined}
                    />
                  )
                })
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Outlook</h2>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            What can be retargeted, what is still queued to send, and what we plan to do next.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card className="border-stone-200/80 shadow-soft">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-[13px]">90-day retarget</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[13px] text-neutral-600">
              <p className="text-2xl font-semibold text-neutral-900">
                {deskQuery.data?.recontactReady ?? '—'}
              </p>
              <p className="mt-1 text-[12px] text-neutral-500">
                Leads past cooldown, safe for a new offer and new copy.
              </p>
              <Link href="/leads?recontact_ready=1" className="mt-2 inline-block text-[12px] text-[#c2410c] hover:underline">
                Open ready leads
              </Link>
            </CardContent>
          </Card>
          <Card className="border-stone-200/80 shadow-soft">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-[13px]">Emails still to send</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[13px] text-neutral-600">
              <p className="text-2xl font-semibold text-neutral-900">
                {deskQuery.data?.emailsRemaining ?? '—'}
              </p>
              <p className="mt-1 text-[12px] text-neutral-500">
                Remaining Instantly contacts across live and paused waves.
              </p>
            </CardContent>
          </Card>
          <Card className="border-stone-200/80 shadow-soft">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-[13px]">Live now</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 text-[13px] text-neutral-600">
              <p className="text-2xl font-semibold text-neutral-900">
                {deskQuery.data?.liveCampaigns ?? '—'}
              </p>
              <p className="mt-1 text-[12px] text-neutral-500">Instantly campaigns currently sending.</p>
            </CardContent>
          </Card>
        </div>
        <Card className="border-stone-200/80 shadow-soft">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[13px]">Pipeline actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            {(deskQuery.data?.actions ?? []).length === 0 ? (
              <p className="text-[12px] text-neutral-400">
                Nothing queued. Morning scan or Add campaign writes the next move here.
              </p>
            ) : (
              (deskQuery.data?.actions ?? []).map((action) => (
                <div
                  key={action.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2"
                >
                  <div>
                    <p className="text-[13px] font-medium text-neutral-800">{action.title}</p>
                    {action.detail ? (
                      <p className="mt-0.5 text-[12px] text-neutral-500">{action.detail}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" size="sm">
                      {action.kind}
                    </Badge>
                    <Badge variant="outline" size="sm">
                      {action.status}
                    </Badge>
                    <span className="text-[11px] text-neutral-400">
                      {action.week_start || 'unscheduled'} · {action.source}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
