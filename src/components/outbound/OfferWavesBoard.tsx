'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { WaveAddCampaign } from '@/components/outbound/WaveAddCampaign'
import { WaveCampaignCard, WaveEmptyColumn } from '@/components/outbound/WaveCampaignCard'
import { CAMPAIGNS_QUERY_KEY, updateCampaign } from '@/lib/campaigns-client'
import {
  OFFER_WAVE_COLUMN_LABELS,
  evaluateOfferWaveDecision,
  type CompassCampaign
} from '@/lib/campaigns'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { useCachedJson } from '@/lib/use-cached-json'
import {
  buildLiveDesk,
  glanceLabel,
  groupCampaignsByWave,
  splitMorningBrief,
  splitNextQueue,
  sydneyDateOnly
} from '@/lib/wave-desk'
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

function WaveSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading waves">
      <div className="h-24 animate-pulse rounded-2xl bg-stone-100" />
      <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
      <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
    </div>
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
  const deskQuery = useCachedJson<WaveDeskPayload>(
    '/api/outbound/wave-desk',
    '/api/outbound/wave-desk',
    { staleMs: 30_000 }
  )
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

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

  const liveDesk = useMemo(
    () =>
      buildLiveDesk({
        liveCampaigns: grouped.live,
        allCampaigns: campaignsQuery.data?.campaigns ?? [],
        instantlyById,
        instantlyRows: boardQuery.data?.live ?? []
      }),
    [grouped.live, campaignsQuery.data, instantlyById, boardQuery.data]
  )

  const nextSplit = useMemo(
    () => splitNextQueue(grouped.next, sydneyDateOnly()),
    [grouped.next]
  )

  const latestBrief = deskQuery.data?.briefs?.[0]
  const brief = splitMorningBrief(latestBrief?.recommendation)
  const glance = glanceLabel(boardQuery.updatedAt)
  const loading = Boolean(
    campaignsQuery.loading || boardQuery.loading || deskQuery.loading
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

  async function markAction(id: string, status: 'done' | 'queued') {
    setActionBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/outbound/wave-desk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id, status })
      })
      if (!res.ok) throw new Error('Could not update action')
      void deskQuery.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action update failed')
    } finally {
      setActionBusy(null)
    }
  }

  const openActions = (deskQuery.data?.actions ?? []).filter((action) => action.status !== 'done')
  const doneActions = (deskQuery.data?.actions ?? []).filter((action) => action.status === 'done')

  return (
    <div className={cn('space-y-6', className)}>
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Offer waves</h2>
          <p className="mt-0.5 text-[12px] text-neutral-500">
            {glance || 'Activate stays in Instantly.'}
          </p>
        </div>
        <div className="relative flex flex-wrap items-center justify-end gap-2">
          {note ? <p className="text-[12px] text-emerald-800">{note}</p> : null}
          {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
          <WaveAddCampaign
            onCreated={() => {
              setNote('Campaign saved to next.')
              void campaignsQuery.reload()
            }}
          />
        </div>
      </section>

      {brief.headline ? (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              This morning · {latestBrief?.id}
            </p>
            <h3 className="text-[16px] font-semibold leading-snug text-neutral-900">{brief.headline}</h3>
            {brief.watches.length ? (
              <ul className="space-y-2 text-[13px] leading-relaxed text-neutral-600">
                {brief.watches.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#e85d2a]" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {loading && !campaignsQuery.data ? (
        <WaveSkeleton />
      ) : (
        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <div className="order-1 space-y-8">
            <WaveColumn
              title={OFFER_WAVE_COLUMN_LABELS.live}
              count={liveDesk.sending.length}
              empty="Nothing sending. Instantly live campaigns land here even without a Compass row."
            >
              {liveDesk.sending.map((item) => {
                const instantly = item.instantly ?? undefined
                const sends = instantly?.sendCount ?? 0
                const replies = instantly?.replyCount ?? 0
                const positive = instantly?.positiveReplies ?? item.campaign?.wave_positive_count ?? 0
                const decision = evaluateOfferWaveDecision({
                  sends,
                  replies,
                  positiveReplies: positive,
                  instantlyStatus: instantly?.status
                })
                return (
                  <WaveCampaignCard
                    key={item.key}
                    campaign={item.campaign}
                    column="live"
                    instantly={instantly}
                    sends={sends}
                    replies={replies}
                    remaining={instantly?.remaining}
                    decisionLabel={decision.label}
                  />
                )
              })}
            </WaveColumn>

            {liveDesk.parked.length ? (
              <WaveColumn
                title="Parked"
                count={liveDesk.parked.length}
                hint="Paused or finished Instantly. Still on the live lane until you move them."
              >
                {liveDesk.parked.map((campaign) => {
                  const instantly = campaign.instantly_campaign_id
                    ? instantlyById.get(campaign.instantly_campaign_id)
                    : undefined
                  return (
                    <WaveCampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      column="parked"
                      instantly={instantly}
                      sends={instantly?.sendCount ?? 0}
                      replies={instantly?.replyCount ?? 0}
                      remaining={instantly?.remaining}
                    />
                  )
                })}
              </WaveColumn>
            ) : null}
          </div>

          <aside className="order-2 space-y-3 xl:sticky xl:top-4">
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-900">Outlook</h2>
              <p className="mt-0.5 text-[12px] text-neutral-500">
                What can be retargeted, what is still queued, and the next moves.
              </p>
            </div>
            <Card>
              <CardHeader className="border-b-0 pb-0">
                <CardTitle className="text-[13px] font-medium text-neutral-500">90-day retarget</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-2xl font-semibold text-neutral-900">
                  {deskQuery.data?.recontactReady ?? '—'}
                </p>
                <p className="mt-1 text-[12px] text-neutral-500">Past cooldown. New offer, new copy.</p>
                <Link href="/leads?recontact_ready=1" className="mt-2 inline-block text-[12px] text-[#c2410c] hover:underline">
                  Open ready leads
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="border-b-0 pb-0">
                <CardTitle className="text-[13px] font-medium text-neutral-500">Emails still to send</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-2xl font-semibold text-neutral-900">
                  {deskQuery.data?.emailsRemaining ?? '—'}
                </p>
                <p className="mt-1 text-[12px] text-neutral-500">Remaining Instantly contacts on live and paused waves.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="border-b-0 pb-0">
                <CardTitle className="text-[13px] font-medium text-neutral-500">Live now</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <p className="text-2xl font-semibold text-neutral-900">
                  {deskQuery.data?.liveCampaigns ?? '—'}
                </p>
                <p className="mt-1 text-[12px] text-neutral-500">Instantly campaigns currently sending.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-[13px]">Pipeline actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-4">
                {openActions.length === 0 && doneActions.length === 0 ? (
                  <p className="text-[12px] text-neutral-400">
                    Nothing queued. Morning scan or Add campaign writes the next move here.
                  </p>
                ) : (
                  openActions.map((action) => (
                    <div
                      key={action.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-neutral-800">{action.title}</p>
                        {action.detail ? (
                          <p className="mt-0.5 text-[12px] text-neutral-500">{action.detail}</p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" size="sm">
                            {action.kind}
                          </Badge>
                          <span className="text-[11px] text-neutral-400">{action.source}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={actionBusy === action.id}
                        onClick={() => void markAction(action.id, 'done')}
                        className="min-h-8 shrink-0 rounded-xl px-2 text-[12px] font-semibold text-[#c2410c] hover:bg-orange-50"
                        aria-label={`Mark ${action.title} done`}
                      >
                        {actionBusy === action.id ? 'Saving…' : 'Mark done'}
                      </button>
                    </div>
                  ))
                )}
                {doneActions.length ? (
                  <p className="pt-1 text-[11px] text-neutral-400">{doneActions.length} done this week.</p>
                ) : null}
              </CardContent>
            </Card>
          </aside>

          <div className="order-3 space-y-8 xl:col-start-1">
            {grouped.recommended.length ? (
              <WaveColumn
                title={OFFER_WAVE_COLUMN_LABELS.recommended}
                count={grouped.recommended.length}
                hint="Agent-only until you move it to next."
              >
                {grouped.recommended.map((campaign) => {
                  const instantly = campaign.instantly_campaign_id
                    ? instantlyById.get(campaign.instantly_campaign_id)
                    : undefined
                  return (
                    <WaveCampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      column="recommended"
                      instantly={instantly}
                      sends={instantly?.sendCount ?? 0}
                      replies={instantly?.replyCount ?? 0}
                      onPromote={promote}
                    />
                  )
                })}
              </WaveColumn>
            ) : null}

            <WaveColumn
              title={OFFER_WAVE_COLUMN_LABELS.next}
              count={nextSplit.upcoming.length}
              empty="No upcoming campaigns. Add one when you have a list ready."
            >
              {nextSplit.upcoming.map((campaign) => {
                const instantly = campaign.instantly_campaign_id
                  ? instantlyById.get(campaign.instantly_campaign_id)
                  : undefined
                return (
                  <WaveCampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    column="next"
                    instantly={instantly}
                    sends={instantly?.sendCount ?? 0}
                    replies={instantly?.replyCount ?? 0}
                  />
                )
              })}
            </WaveColumn>

            {nextSplit.leftover.length ? (
              <Accordion type="single" collapsible className="rounded-2xl border border-stone-200/70 bg-white px-5 shadow-soft">
                <AccordionItem value="leftovers" className="border-b-0">
                  <AccordionTrigger className="text-[13px] font-semibold text-neutral-700 hover:no-underline">
                    {nextSplit.leftover.length} leftover campaigns
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-5">
                    <p className="text-[12px] text-neutral-500">
                      Go-live date has passed and Instantly was never bound. They stay here until you open or drop them.
                    </p>
                    {nextSplit.leftover.map((campaign) => {
                      const instantly = campaign.instantly_campaign_id
                        ? instantlyById.get(campaign.instantly_campaign_id)
                        : undefined
                      return (
                        <WaveCampaignCard
                          key={campaign.id}
                          campaign={campaign}
                          column="next"
                          instantly={instantly}
                          sends={instantly?.sendCount ?? 0}
                          replies={instantly?.replyCount ?? 0}
                        />
                      )
                    })}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function WaveColumn({
  title,
  count,
  hint,
  empty,
  children
}: {
  title: string
  count: number
  hint?: string
  empty?: string
  children: ReactNode
}) {
  const childCount = Array.isArray(children) ? children.length : children ? 1 : 0
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
          {hint ? <p className="mt-0.5 text-[11px] text-neutral-400">{hint}</p> : null}
        </div>
        <span className="text-[11px] text-neutral-400">{count}</span>
      </div>
      {childCount === 0 && empty ? <WaveEmptyColumn label={empty} /> : <div className="grid gap-3 md:grid-cols-2">{children}</div>}
    </section>
  )
}
