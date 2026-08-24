'use client'

import { useMemo, useState } from 'react'
import { MockShapeShell } from '@/components/outbound/mock/MockShapeShell'
import { placeInventoryCard, QUEUE_QUERY_KEY } from '@/components/campaigns/OutboundInventoryRail'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import {
  mondayOfWeek,
  mondayWeeksAhead,
  RECONTACT_PROMOTE_MIN,
  inventoryCardId,
  type InventoryCard,
  type QueuePayload,
  type QueueRecontactGroup,
  type QueueRunwayRow
} from '@/lib/campaign-queue'
import { nextOpenWeekdayNineAm, type CadencePrefs } from '@/lib/outbound-cadence'
import { dateOnlyInZone, formatGoLiveAt, type CompassCampaign } from '@/lib/campaigns'
import { useCachedJson } from '@/lib/use-cached-json'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type CampaignsPayload = { campaigns: CompassCampaign[] }

type VerticalRow = {
  vertical: string
  sendable: number
  wavesLeft: number
  readyCount: number
  readyCity: string | null
  lastGoLive: string | null
  thisWeek: boolean
  stampCard: InventoryCard | null
}

function campaignDateOnly(campaign: CompassCampaign): string | null {
  if (campaign.go_live_at) return dateOnlyInZone(campaign.go_live_at)
  const start = (campaign.start_date || '').trim()
  return start ? start.slice(0, 10) : null
}

function hasVertical(campaign: CompassCampaign, vertical: string): boolean {
  const needle = vertical.trim().toLowerCase()
  return (campaign.vertical_tags ?? []).some((tag) => tag.trim().toLowerCase() === needle)
}

function dominatingCity(groups: QueueRecontactGroup[]): string | null {
  if (groups.length === 0) return null
  const ranked = [...groups].sort((a, b) => b.count - a.count)
  const top = ranked[0]!
  if (!top.city) return null
  if (ranked.length === 1) return top.city
  const total = groups.reduce((sum, g) => sum + g.count, 0)
  if (top.count > (ranked[1]?.count ?? 0) && top.count * 2 >= total) return top.city
  return null
}

function lastGoLiveForVertical(campaigns: CompassCampaign[], vertical: string): string | null {
  let bestIso: string | null = null
  let bestMs = -Infinity
  for (const campaign of campaigns) {
    if (!hasVertical(campaign, vertical)) continue
    const iso = campaign.go_live_at || (campaign.start_date ? `${campaign.start_date.slice(0, 10)}T00:00:00Z` : null)
    if (!iso) continue
    const ms = new Date(iso).getTime()
    if (Number.isNaN(ms) || ms < bestMs) continue
    bestMs = ms
    bestIso = campaign.go_live_at || iso
  }
  return bestIso
}

function stampCardForRow(
  vertical: string,
  groups: QueueRecontactGroup[],
  wavesLeft: number,
  sendable: number
): InventoryCard | null {
  const promotable = [...groups]
    .filter((g) => g.promotable || g.count >= RECONTACT_PROMOTE_MIN)
    .sort((a, b) => b.count - a.count)[0]
  if (promotable) {
    return {
      id: inventoryCardId('recontact', vertical, promotable.city),
      kind: 'recontact',
      vertical,
      city: promotable.city,
      count: promotable.count,
      reason: `${promotable.count} past 90-day cooldown`
    }
  }
  if (wavesLeft >= 1) {
    return {
      id: inventoryCardId('fresh', vertical, null),
      kind: 'fresh',
      vertical,
      city: null,
      count: sendable,
      reason: `${sendable} sendable`
    }
  }
  return null
}

function mergeRows(
  runway: QueueRunwayRow[],
  recontactPool: QueueRecontactGroup[],
  campaigns: CompassCampaign[],
  thisWeekMonday: string
): VerticalRow[] {
  const groupsByVertical = new Map<string, QueueRecontactGroup[]>()
  for (const group of recontactPool) {
    const key = group.vertical.trim().toLowerCase() || 'other'
    const list = groupsByVertical.get(key) ?? []
    list.push(group)
    groupsByVertical.set(key, list)
  }

  const keys = new Set<string>()
  for (const row of runway) keys.add(row.vertical.trim().toLowerCase() || 'other')
  for (const key of groupsByVertical.keys()) keys.add(key)

  const runwayByVertical = new Map(
    runway.map((row) => [row.vertical.trim().toLowerCase() || 'other', row])
  )

  const thisWeekCampaigns = campaigns.filter((c) => {
    const dateOnly = campaignDateOnly(c)
    return dateOnly != null && mondayOfWeek(dateOnly) === thisWeekMonday
  })

  const rows: VerticalRow[] = []
  for (const vertical of keys) {
    const runwayRow = runwayByVertical.get(vertical)
    const groups = groupsByVertical.get(vertical) ?? []
    const readyCount = groups.reduce((sum, g) => sum + g.count, 0) || runwayRow?.recontactReady || 0
    const sendable = runwayRow?.sendable ?? 0
    const wavesLeft = runwayRow?.wavesLeft ?? 0
    rows.push({
      vertical,
      sendable,
      wavesLeft,
      readyCount,
      readyCity: dominatingCity(groups),
      lastGoLive: lastGoLiveForVertical(campaigns, vertical),
      thisWeek: thisWeekCampaigns.some((c) => hasVertical(c, vertical)),
      stampCard: stampCardForRow(vertical, groups, wavesLeft, sendable)
    })
  }

  rows.sort((a, b) => {
    const aSink = a.sendable === 0 && a.readyCount === 0 ? 1 : 0
    const bSink = b.sendable === 0 && b.readyCount === 0 ? 1 : 0
    if (aSink !== bSink) return aSink - bSink
    const aReady = a.stampCard?.kind === 'recontact' ? a.stampCard.count : a.readyCount
    const bReady = b.stampCard?.kind === 'recontact' ? b.stampCard.count : b.readyCount
    if (bReady !== aReady) return bReady - aReady
    return b.sendable - a.sendable
  })
  return rows
}

function occupiedDatesInWeek(campaigns: CompassCampaign[], weekMonday: string): Set<string> {
  const occupied = new Set<string>()
  for (const campaign of campaigns) {
    const dateOnly = campaignDateOnly(campaign)
    if (!dateOnly) continue
    if (mondayOfWeek(dateOnly) === weekMonday) occupied.add(dateOnly)
  }
  return occupied
}

function tradeLabel(vertical: string): string {
  return vertical
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

export function RunwayPreview({
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
  const [busyVertical, setBusyVertical] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const campaigns = campaignsQuery.data?.campaigns ?? []
  const today = dateOnlyInZone(new Date().toISOString())
  const thisMonday = mondayOfWeek(today)

  const thisWeekCampaigns = useMemo(() => {
    return campaigns
      .filter((c) => {
        const dateOnly = campaignDateOnly(c)
        return dateOnly != null && mondayOfWeek(dateOnly) === thisMonday
      })
      .sort((a, b) => {
        const da = campaignDateOnly(a) || ''
        const db = campaignDateOnly(b) || ''
        return da.localeCompare(db) || a.name.localeCompare(b.name)
      })
  }, [campaigns, thisMonday])

  const slots = thisWeekCampaigns.length

  const rows = useMemo(() => {
    const runway = queueQuery.data?.runway ?? []
    const pool = queueQuery.data?.recontactPool ?? []
    return mergeRows(runway, pool, campaigns, thisMonday)
  }, [queueQuery.data, campaigns, thisMonday])

  async function stamp(row: VerticalRow, prefs: CadencePrefs) {
    if (!row.stampCard || row.thisWeek) return
    const overflow = prefs.cap != null && slots >= prefs.cap
    const weekMonday = overflow ? mondayWeeksAhead(today, 1) : thisMonday
    const goLiveAt = nextOpenWeekdayNineAm(weekMonday, occupiedDatesInWeek(campaigns, weekMonday))
    setBusyVertical(row.vertical)
    setError(null)
    try {
      await placeInventoryCard(row.stampCard, goLiveAt)
      await Promise.all([campaignsQuery.reload(), queueQuery.reload()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stamp a wave')
    } finally {
      setBusyVertical(null)
    }
  }

  const loading = campaignsQuery.loading || queueQuery.loading

  return (
    <MockShapeShell
      title="Runway"
      slots={slots}
      embedded={embedded}
      prefs={prefsProp}
      onPrefs={onPrefs}
    >
      {({ prefs }) => (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-3">
            {error ? (
              <p className="text-sm text-rose-700">{error}</p>
            ) : null}
            {loading && rows.length === 0 ? (
              <p className="text-sm text-neutral-500">Loading runway…</p>
            ) : null}
            {rows.map((row) => {
              const canStamp = Boolean(row.stampCard) && !row.thisWeek
              const readyHot = row.readyCount >= RECONTACT_PROMOTE_MIN
              return (
                <Card key={row.vertical}>
                  <CardHeader className="gap-3">
                    <CardTitle>{tradeLabel(row.vertical)}</CardTitle>
                    <button
                      type="button"
                      disabled={!canStamp || busyVertical === row.vertical}
                      onClick={() => void stamp(row, prefs)}
                      className="compass-btn-primary rounded-xl text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busyVertical === row.vertical ? 'Stamping…' : 'Stamp a wave'}
                    </button>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-5">
                    <Metric label="Sendable" value={String(row.sendable)} />
                    <Metric label="Waves left" value={String(row.wavesLeft)} />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Ready 90-day
                      </p>
                      <p
                        className={cn(
                          'mt-0.5 text-sm font-medium',
                          readyHot ? 'text-neutral-900' : 'text-neutral-400'
                        )}
                      >
                        {row.readyCount}
                        {row.readyCity ? ` ${row.readyCity}` : ''}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Last go live
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-neutral-900">
                        {row.lastGoLive ? formatGoLiveAt(row.lastGoLive) : 'none'}
                      </p>
                    </div>
                    <Metric label="This week?" value={row.thisWeek ? 'yes' : 'no'} />
                  </CardContent>
                </Card>
              )
            })}
            {!loading && rows.length === 0 ? (
              <p className="text-sm text-neutral-500">No verticals in runway or 90-day pool.</p>
            ) : null}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>This week</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {thisWeekCampaigns.length === 0 ? (
                <p className="text-sm text-neutral-500">No dated campaigns this week.</p>
              ) : (
                thisWeekCampaigns.map((campaign) => {
                  const dateOnly = campaignDateOnly(campaign)
                  const when = campaign.go_live_at
                    ? formatGoLiveAt(campaign.go_live_at)
                    : dateOnly || 'undated'
                  const trades = (campaign.vertical_tags ?? []).map(tradeLabel).join(', ')
                  return (
                    <div key={campaign.id} className="rounded-xl border border-stone-100 px-3 py-2">
                      <p className="text-sm font-medium text-neutral-900">{campaign.name}</p>
                      <p className="text-[12px] text-neutral-500">
                        {when}
                        {trades ? ` · ${trades}` : ''}
                      </p>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </MockShapeShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-neutral-900">{value}</p>
    </div>
  )
}
