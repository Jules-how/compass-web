'use client'

import { useCallback, useMemo, useState } from 'react'
import { CampaignReviewModal } from '@/components/campaigns/CampaignReviewModal'
import { placeInventoryCard, QUEUE_QUERY_KEY } from '@/components/campaigns/OutboundInventoryRail'
import { MockShapeShell } from '@/components/outbound/mock/MockShapeShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  campaignReadiness,
  inventoryCardId,
  mondayOfWeek,
  mondayWeeksAhead,
  type QueuePayload
} from '@/lib/campaign-queue'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import {
  dateOnlyInZone,
  formatGoLiveAt,
  type CompassCampaign
} from '@/lib/campaigns'
import { nextOpenWeekdayNineAm, type CadencePrefs } from '@/lib/outbound-cadence'
import { useCachedJson } from '@/lib/use-cached-json'

type CampaignsPayload = { campaigns: CompassCampaign[] }

type ColumnId = 'cooling' | 'live' | 'list' | 'openers' | 'copy' | 'bind' | 'signed'

const COLUMNS: Array<{ id: ColumnId; title: string; hideIfEmpty?: boolean }> = [
  { id: 'cooling', title: 'Cooling', hideIfEmpty: true },
  { id: 'live', title: 'Live' },
  { id: 'list', title: 'Needs list' },
  { id: 'openers', title: 'Needs openers' },
  { id: 'copy', title: 'Needs copy' },
  { id: 'bind', title: 'Needs bind' },
  { id: 'signed', title: 'Signed off' }
]

function campaignDateOnly(campaign: CompassCampaign): string | null {
  if (campaign.go_live_at) return dateOnlyInZone(campaign.go_live_at)
  const start = (campaign.start_date || '').trim()
  return start || null
}

function isThisCalendarWeek(dateOnly: string, thisMonday: string, nextMonday: string): boolean {
  return dateOnly >= thisMonday && dateOnly < nextMonday
}

function isBound(campaign: CompassCampaign): boolean {
  return Boolean((campaign.instantly_campaign_id || '').trim())
}

function columnFor(campaign: CompassCampaign): ColumnId {
  if (campaign.status === 'completed') return 'cooling'

  const bound = isBound(campaign)
  const copyLive = (campaign.copy_status || '') === 'live'
  if (campaign.status === 'active' || (copyLive && bound)) return 'live'

  const cohort = campaign.wave_cohort_count ?? 0
  const openers = campaign.wave_opener_count ?? 0
  const readiness = campaignReadiness({
    cohort,
    copy_status: campaign.copy_status || 'none',
    bound
  })
  const needsList = readiness.blockers.some(
    (blocker) => blocker === 'no leads' || blocker.startsWith('thin cohort')
  )
  if (needsList) return 'list'
  if (cohort > 0 && openers < cohort) return 'openers'
  if (readiness.blockers.includes('no copy') || readiness.blockers.includes('copy in draft')) {
    return 'copy'
  }
  if (readiness.blockers.includes('not bound')) return 'bind'
  return 'signed'
}

function blockerLine(campaign: CompassCampaign, column: ColumnId): string {
  const cohort = campaign.wave_cohort_count ?? 0
  const openers = campaign.wave_opener_count ?? 0
  const readiness = campaignReadiness({
    cohort,
    copy_status: campaign.copy_status || 'none',
    bound: isBound(campaign)
  })
  if (column === 'cooling') return 'Cooling'
  if (column === 'live') return 'Live'
  if (column === 'list') {
    return readiness.blockers.find((b) => b === 'no leads' || b.startsWith('thin cohort')) || 'No leads'
  }
  if (column === 'openers') return `First lines ${openers} of ${cohort}`
  if (column === 'copy') {
    return (
      readiness.blockers.find((b) => b === 'no copy' || b === 'copy in draft') || 'Needs copy'
    )
  }
  if (column === 'bind') return 'Not bound'
  return 'Signed off'
}

export function FactoryPreview({
  embedded = false,
  prefs: prefsProp,
  onPrefs
}: {
  embedded?: boolean
  prefs?: CadencePrefs
  onPrefs?: (next: CadencePrefs) => void
}) {
  const campaignsQuery = useCachedJson<CampaignsPayload>(CAMPAIGNS_QUERY_KEY, '/api/campaigns', {
    staleMs: 30_000
  })
  const queueQuery = useCachedJson<QueuePayload>(QUEUE_QUERY_KEY, '/api/campaigns/queue', {
    staleMs: 30_000
  })
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  const todayOnly = dateOnlyInZone(new Date().toISOString())
  const thisMonday = mondayOfWeek(todayOnly)
  const nextMonday = mondayWeeksAhead(todayOnly, 1)

  const allCampaigns = campaignsQuery.data?.campaigns ?? []
  const boardCampaigns = useMemo(
    () => allCampaigns.filter((campaign) => campaign.status !== 'cancelled'),
    [allCampaigns]
  )

  const weekCampaigns = useMemo(() => {
    return allCampaigns.filter((campaign) => {
      const dateOnly = campaignDateOnly(campaign)
      return dateOnly ? isThisCalendarWeek(dateOnly, thisMonday, nextMonday) : false
    })
  }, [allCampaigns, thisMonday, nextMonday])

  const byColumn = useMemo(() => {
    const buckets: Record<ColumnId, CompassCampaign[]> = {
      cooling: [],
      live: [],
      list: [],
      openers: [],
      copy: [],
      bind: [],
      signed: []
    }
    for (const campaign of boardCampaigns) {
      buckets[columnFor(campaign)].push(campaign)
    }
    return buckets
  }, [boardCampaigns])

  const promotable = useMemo(
    () => (queueQuery.data?.recontactPool ?? []).filter((group) => group.promotable),
    [queueQuery.data?.recontactPool]
  )

  const occupiedDateOnly = useMemo(() => {
    const set = new Set<string>()
    for (const campaign of weekCampaigns) {
      const dateOnly = campaignDateOnly(campaign)
      if (dateOnly) set.add(dateOnly)
    }
    return set
  }, [weekCampaigns])

  const reviewCampaign = allCampaigns.find((c) => c.id === reviewId) ?? null

  const reloadBoard = useCallback(async () => {
    await Promise.all([campaignsQuery.reload(true), queueQuery.reload(true)])
  }, [campaignsQuery, queueQuery])

  const promote = useCallback(
    async (vertical: string, city: string | null, count: number) => {
      const id = inventoryCardId('recontact', vertical, city)
      setBusyId(id)
      setPromoteError(null)
      try {
        await placeInventoryCard(
          {
            id,
            kind: 'recontact',
            vertical,
            city,
            count,
            reason: `${count} past 90-day cooldown`
          },
          nextOpenWeekdayNineAm(thisMonday, occupiedDateOnly)
        )
        await reloadBoard()
      } catch (err) {
        setPromoteError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyId(null)
      }
    },
    [occupiedDateOnly, reloadBoard, thisMonday]
  )

  return (
    <MockShapeShell
      title="Factory"
      slots={weekCampaigns.length}
      embedded={embedded}
      prefs={prefsProp}
      onPrefs={onPrefs}
    >
      {() => (
        <div className="space-y-4">
          <section className="compass-panel rounded-2xl p-4 shadow-soft">
            <p className="compass-section-label mb-3">90-day inventory</p>
            {promoteError ? (
              <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                {promoteError}
              </p>
            ) : null}
            {queueQuery.loading && !queueQuery.data ? (
              <p className="text-[12px] text-neutral-400">Loading inventory…</p>
            ) : promotable.length === 0 ? (
              <p className="text-[12px] text-neutral-500">No promotable 90-day groups yet.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {promotable.map((group) => {
                  const id = inventoryCardId('recontact', group.vertical, group.city)
                  const label = group.city
                    ? `${group.vertical} · ${group.city}`
                    : group.vertical
                  const busy = busyId === id
                  return (
                    <div
                      key={id}
                      className="flex min-w-[13rem] items-center justify-between gap-3 rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 shadow-soft"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold capitalize text-neutral-900">
                          {label}
                        </p>
                        <p className="text-[11px] text-neutral-500">{group.count} ready</p>
                      </div>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void promote(group.vertical, group.city, group.count)}
                        className="shrink-0 rounded-xl bg-[#c2410c] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
                      >
                        {busy ? 'Promoting…' : 'Promote'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {campaignsQuery.error ? (
            <p className="text-sm text-rose-700">Could not load campaigns.</p>
          ) : campaignsQuery.loading && !campaignsQuery.data ? (
            <p className="text-sm text-neutral-500">Loading waves…</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {COLUMNS.map((column) => {
                const cards = byColumn[column.id]
                if (column.hideIfEmpty && cards.length === 0) return null
                return (
                  <Card
                    key={column.id}
                    className="w-[17.5rem] shrink-0"
                  >
                    <CardHeader className="items-start">
                      <div>
                        <CardTitle>{column.title}</CardTitle>
                        <p className="mt-1 text-[11px] text-neutral-400">
                          {cards.length} {cards.length === 1 ? 'wave' : 'waves'}
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {cards.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/70 px-3 py-3 text-[12px] text-neutral-400">
                          Empty
                        </p>
                      ) : (
                        cards.map((campaign) => {
                          const trade = campaign.vertical_tags?.[0] || 'No trade'
                          const offer = campaign.offer_key || 'No offer'
                          return (
                            <button
                              key={campaign.id}
                              type="button"
                              onClick={() => setReviewId(campaign.id)}
                              className="w-full rounded-xl border border-stone-200/80 bg-white px-3 py-3 text-left shadow-soft transition hover:border-stone-300"
                            >
                              <p className="truncate text-[13px] font-semibold text-neutral-900">
                                {campaign.name}
                              </p>
                              <p className="mt-1 text-[11px] capitalize text-neutral-500">
                                {trade}
                                {' · '}
                                {offer}
                              </p>
                              <p className="mt-1 text-[11px] text-neutral-500">
                                {formatGoLiveAt(campaign.go_live_at)}
                              </p>
                              <p className="mt-1 text-[11px] text-neutral-500">
                                Cohort {campaign.wave_cohort_count ?? 0}
                              </p>
                              <p className="mt-1 text-[11px] text-neutral-600">
                                {blockerLine(campaign, column.id)}
                              </p>
                            </button>
                          )
                        })
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}

          {reviewId ? (
            <CampaignReviewModal
              campaignId={reviewId}
              campaign={reviewCampaign}
              onClose={() => setReviewId(null)}
              onUpdated={() => {
                void reloadBoard()
              }}
            />
          ) : null}
        </div>
      )}
    </MockShapeShell>
  )
}
