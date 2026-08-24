'use client'

import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CampaignReviewModal } from '@/components/campaigns/CampaignReviewModal'
import { MockShapeShell } from '@/components/outbound/mock/MockShapeShell'
import { placeInventoryCard, QUEUE_QUERY_KEY } from '@/components/campaigns/OutboundInventoryRail'
import { CAMPAIGNS_QUERY_KEY } from '@/lib/campaigns-client'
import { dateOnlyInZone, type CompassCampaign } from '@/lib/campaigns'
import {
  INVENTORY_DRAG_MIME,
  campaignReadiness,
  inventoryCardId,
  inventoryPoolCards,
  mondayOfWeek,
  mondayWeeksAhead,
  parseInventoryDrag,
  type InventoryCard,
  type QueuePayload
} from '@/lib/campaign-queue'
import {
  cassetteBayCount,
  nextOpenWeekdayNineAm,
  rankNextSlotsWithPrefs,
  type CadencePrefs
} from '@/lib/outbound-cadence'
import { cn } from '@/lib/utils'
import { useCachedJson } from '@/lib/use-cached-json'

type CampaignsPayload = { campaigns: CompassCampaign[] }

function todayOnly(): string {
  return dateOnlyInZone(new Date().toISOString())
}

function addDaysUtc(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDay(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  })
}

function campaignDateOnly(campaign: CompassCampaign): string | null {
  if (campaign.go_live_at) {
    try {
      return dateOnlyInZone(campaign.go_live_at)
    } catch {
      return null
    }
  }
  const start = (campaign.start_date || '').trim()
  return start ? start.slice(0, 10) : null
}

function campaignGoLiveSortKey(campaign: CompassCampaign): string {
  return campaign.go_live_at || campaign.start_date || '9999'
}

function tradeLabel(campaign: CompassCampaign): string {
  const tag = (campaign.vertical_tags || []).map((v) => v.trim()).find(Boolean)
  return tag || 'no trade'
}

function writeInventoryDrag(event: DragEvent, card: InventoryCard) {
  const payload = JSON.stringify(card)
  event.dataTransfer.setData(INVENTORY_DRAG_MIME, payload)
  event.dataTransfer.setData('text/plain', payload)
  event.dataTransfer.effectAllowed = 'copy'
}

function inventoryDropHandlers(
  goLiveAt: string,
  onDropInventory: (goLiveAt: string, card: InventoryCard) => void
) {
  return {
    onDragOver: (event: DragEvent) => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const card =
        parseInventoryDrag(event.dataTransfer.getData(INVENTORY_DRAG_MIME)) ||
        parseInventoryDrag(event.dataTransfer.getData('text/plain'))
      if (card) onDropInventory(goLiveAt, card)
    }
  }
}

function freshRunwayCards(runway: QueuePayload['runway'], recs: InventoryCard[]): InventoryCard[] {
  const recIds = new Set(recs.map((card) => card.id))
  const cards: InventoryCard[] = []
  for (const row of runway) {
    if (row.wavesLeft < 1) continue
    const vertical = row.vertical.trim().toLowerCase()
    if (!vertical) continue
    const id = inventoryCardId('fresh', vertical, null)
    if (recIds.has(id)) continue
    cards.push({
      id,
      kind: 'fresh',
      vertical,
      city: null,
      count: row.sendable,
      reason: `${row.sendable} sendable · ≈${row.wavesLeft} waves`
    })
  }
  return cards
}

export function CassettePreview({
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
  const queue = useCachedJson<QueuePayload>(QUEUE_QUERY_KEY, '/api/campaigns/queue', {
    staleMs: 30_000
  })

  const [weekMonday, setWeekMonday] = useState(() => mondayOfWeek(todayOnly()))
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const thisMonday = mondayOfWeek(todayOnly())
  const weekSunday = addDaysUtc(weekMonday, 6)
  const isThisWeek = weekMonday === thisMonday

  const weekCampaigns = useMemo(() => {
    const rows = campaignsQuery.data?.campaigns ?? []
    return rows
      .filter((campaign) => {
        const date = campaignDateOnly(campaign)
        if (!date) return false
        return date >= weekMonday && date <= weekSunday
      })
      .sort((a, b) => campaignGoLiveSortKey(a).localeCompare(campaignGoLiveSortKey(b)))
  }, [campaignsQuery.data, weekMonday, weekSunday])

  const occupiedDateOnly = useMemo(() => {
    const set = new Set<string>()
    for (const campaign of weekCampaigns) {
      const date = campaignDateOnly(campaign)
      if (date) set.add(date)
    }
    return set
  }, [weekCampaigns])

  const thisWeekVerticals = useMemo(
    () => weekCampaigns.flatMap((campaign) => campaign.vertical_tags ?? []),
    [weekCampaigns]
  )

  const reloadAfterPlace = useCallback(async () => {
    await Promise.all([campaignsQuery.reload(true), queue.reload(true)])
  }, [campaignsQuery, queue])

  const place = useCallback(
    async (card: InventoryCard, goLiveAt: string) => {
      setBusyId(card.id)
      setNote(null)
      try {
        await placeInventoryCard(card, goLiveAt)
        await reloadAfterPlace()
      } catch (err) {
        setNote(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyId(null)
      }
    },
    [reloadAfterPlace]
  )

  const reviewCampaign = useMemo(
    () => (reviewId ? (campaignsQuery.data?.campaigns ?? []).find((row) => row.id === reviewId) ?? null : null),
    [campaignsQuery.data, reviewId]
  )

  return (
    <>
      <MockShapeShell
        title="Cassette"
        slots={weekCampaigns.length}
        embedded={embedded}
        prefs={prefsProp}
        onPrefs={onPrefs}
        actions={
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <p className="mr-1 text-[12px] font-medium text-neutral-500">
              {formatDay(weekMonday)} to {formatDay(weekSunday)}
            </p>
            <button
              type="button"
              className="compass-btn-secondary !px-2.5 !py-1.5 text-[12px]"
              onClick={() => setWeekMonday(mondayWeeksAhead(weekMonday, -1))}
            >
              Prev
            </button>
            <button
              type="button"
              className={cn(
                '!px-2.5 !py-1.5 text-[12px]',
                isThisWeek ? 'compass-btn-primary' : 'compass-btn-secondary'
              )}
              onClick={() => setWeekMonday(mondayOfWeek(todayOnly()))}
            >
              Today
            </button>
            <button
              type="button"
              className="compass-btn-secondary !px-2.5 !py-1.5 text-[12px]"
              onClick={() => setWeekMonday(mondayWeeksAhead(weekMonday, 1))}
            >
              Next
            </button>
          </div>
        }
      >
        {({ prefs }) => (
          <CassetteWeek
            prefs={prefs}
            weekMonday={weekMonday}
            weekCampaigns={weekCampaigns}
            occupiedDateOnly={occupiedDateOnly}
            thisWeekVerticals={thisWeekVerticals}
            queue={queue.data}
            loading={Boolean((campaignsQuery.loading && !campaignsQuery.data) || (queue.loading && !queue.data))}
            note={note}
            busyId={busyId}
            onOpen={(id) => setReviewId(id)}
            onPlace={(card, goLiveAt) => void place(card, goLiveAt)}
            onNote={setNote}
          />
        )}
      </MockShapeShell>
      {reviewId ? (
        <CampaignReviewModal
          campaignId={reviewId}
          campaign={reviewCampaign}
          onClose={() => setReviewId(null)}
          onUpdated={() => void campaignsQuery.reload(true)}
        />
      ) : null}
    </>
  )
}

function CassetteWeek({
  prefs,
  weekMonday,
  weekCampaigns,
  occupiedDateOnly,
  thisWeekVerticals,
  queue,
  loading,
  note,
  busyId,
  onOpen,
  onPlace,
  onNote
}: {
  prefs: CadencePrefs
  weekMonday: string
  weekCampaigns: CompassCampaign[]
  occupiedDateOnly: ReadonlySet<string>
  thisWeekVerticals: string[]
  queue: QueuePayload | undefined
  loading: boolean
  note: string | null
  busyId: string | null
  onOpen: (id: string) => void
  onPlace: (card: InventoryCard, goLiveAt: string) => void
  onNote: (value: string | null) => void
}) {
  const filled = weekCampaigns.length
  const n = cassetteBayCount(filled, prefs)
  const bayCampaigns = weekCampaigns.slice(0, n)
  const overflow = weekCampaigns.slice(n)
  const emptyCount = Math.max(0, n - bayCampaigns.length)
  const goLiveAt = nextOpenWeekdayNineAm(weekMonday, occupiedDateOnly)

  const recs = useMemo(() => {
    if (!queue) return []
    return rankNextSlotsWithPrefs({
      runway: queue.runway,
      recontactPool: queue.recontactPool,
      thisWeekVerticals,
      thisWeekSlots: filled,
      prefs
    })
  }, [queue, thisWeekVerticals, filled, prefs])

  const pool90 = useMemo(
    () => (queue ? inventoryPoolCards(queue.recontactPool, recs) : []),
    [queue, recs]
  )

  const freshLeft = useMemo(
    () => (queue ? freshRunwayCards(queue.runway, recs) : []),
    [queue, recs]
  )

  const dropOntoEmpty = (_iso: string, card: InventoryCard) => onPlace(card, goLiveAt)

  return (
    <div className="space-y-5">
      {note ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
          {note}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Launches</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-[12px] text-neutral-400">Loading…</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {bayCampaigns.map((campaign, index) => (
                <FilledBay
                  key={campaign.id}
                  index={index + 1}
                  campaign={campaign}
                  onOpen={() => onOpen(campaign.id)}
                />
              ))}
              {Array.from({ length: emptyCount }, (_, i) => (
                <EmptyBay
                  key={`empty-${i}`}
                  index={bayCampaigns.length + i + 1}
                  dropHandlers={inventoryDropHandlers(goLiveAt, dropOntoEmpty)}
                  onClick={() => {
                    const rec = recs[0]
                    if (!rec) {
                      onNote('No ranked rec to place on this bay.')
                      return
                    }
                    onPlace(rec, goLiveAt)
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {overflow.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Overflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overflow.map((campaign) => (
              <button
                key={campaign.id}
                type="button"
                onClick={() => onOpen(campaign.id)}
                className="block w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-left shadow-soft"
              >
                <span className="block truncate text-[13px] font-semibold text-neutral-900">
                  {campaign.name}
                </span>
                <span className="mt-0.5 block text-[11px] text-neutral-500">
                  {tradeLabel(campaign)} · {campaign.offer_key || 'no offer'} ·{' '}
                  {campaign.wave_cohort_count ?? 0} cohort
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[12px] text-neutral-500">
            Drag onto an empty bay. Time defaults to Sydney 9:00 on the next open weekday.
          </p>
          {loading ? (
            <p className="text-[12px] text-neutral-400">Loading…</p>
          ) : recs.length + pool90.length + freshLeft.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/70 px-3 py-3 text-[12px] text-neutral-500">
              No inventory cards. Pull a list or wait for a 90 day batch to clear 30 leads.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recs.map((card) => (
                <PoolCard
                  key={card.id}
                  card={card}
                  muted={false}
                  busy={busyId === card.id}
                />
              ))}
              {pool90.map((card) => (
                <PoolCard
                  key={card.id}
                  card={card}
                  muted
                  busy={busyId === card.id}
                />
              ))}
              {freshLeft.map((card) => (
                <PoolCard
                  key={card.id}
                  card={card}
                  muted={false}
                  busy={busyId === card.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function FilledBay({
  index,
  campaign,
  onOpen
}: {
  index: number
  campaign: CompassCampaign
  onOpen: () => void
}) {
  const readiness = campaignReadiness({
    cohort: campaign.wave_cohort_count ?? 0,
    copy_status: campaign.copy_status || 'none',
    bound: Boolean((campaign.instantly_campaign_id || '').trim())
  })
  const blocked = campaign.status !== 'active' && campaign.status !== 'completed' && campaign.status !== 'cancelled'
    ? !readiness.ready
    : false

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'min-w-[11.5rem] flex-1 rounded-2xl border px-3.5 py-3 text-left shadow-soft',
        blocked
          ? 'border-stone-200 bg-stone-100 text-neutral-500'
          : 'border-stone-200/90 bg-white text-neutral-800 hover:border-stone-300'
      )}
    >
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        Launch {index}
      </span>
      <span className="mt-1 block truncate text-[13px] font-semibold text-neutral-900">
        {campaign.name}
      </span>
      <span className="mt-1 block text-[11px] capitalize text-neutral-600">{tradeLabel(campaign)}</span>
      <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
        {campaign.offer_key || 'no offer'}
      </span>
      <span className="mt-0.5 block text-[11px] text-neutral-500">
        {campaign.wave_cohort_count ?? 0} cohort
      </span>
      <span
        className={cn(
          'mt-2 block text-[10px] font-medium',
          blocked ? 'text-neutral-400' : 'text-neutral-500'
        )}
      >
        {blocked ? readiness.blockers.join(' · ') || 'not ready' : 'ready'}
      </span>
    </button>
  )
}

function EmptyBay({
  index,
  dropHandlers,
  onClick
}: {
  index: number
  dropHandlers: {
    onDragOver: (event: DragEvent) => void
    onDrop: (event: DragEvent) => void
  }
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...dropHandlers}
      className="compass-panel min-w-[11.5rem] flex-1 border-dashed px-3.5 py-3 text-left"
    >
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
        Launch {index}
      </span>
      <span className="mt-2 block text-[12px] text-neutral-400">Empty. Drop inventory or click to place the top rec.</span>
    </button>
  )
}

function PoolCard({
  card,
  muted,
  busy
}: {
  card: InventoryCard
  muted: boolean
  busy: boolean
}) {
  const title = card.city ? `${card.vertical} · ${card.city}` : card.vertical
  return (
    <div
      draggable={!busy}
      onDragStart={(event) => writeInventoryDrag(event, card)}
      className={cn(
        'w-[13.5rem] cursor-grab rounded-xl border px-3 py-2.5 text-left shadow-soft',
        muted
          ? 'border-stone-200 bg-stone-100 text-neutral-500'
          : 'border-stone-200/90 bg-white text-neutral-800',
        busy ? 'opacity-60' : ''
      )}
    >
      <span className="block truncate text-[13px] font-semibold capitalize text-neutral-900">
        {busy ? 'Placing…' : title}
      </span>
      <span className="mt-0.5 block text-[11px] text-neutral-500">{card.reason}</span>
      <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {card.kind === 'recontact' ? '90 day' : 'Fresh'} · drag onto a bay
      </span>
    </div>
  )
}
