'use client'

import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { cn } from '@/lib/utils'
import { writeQueryCache } from '@/lib/query-cache'
import { useCachedJson } from '@/lib/use-cached-json'
import {
  INVENTORY_DRAG_MIME,
  QUEUE_WEEK_SLOT_MAX,
  QUEUE_WEEK_SLOT_MIN,
  inventoryPoolCards,
  rankNextSlots,
  weekLoad,
  type InventoryCard,
  type QueuePayload
} from '@/lib/campaign-queue'

export const QUEUE_QUERY_KEY = '/api/campaigns/queue'

type Props = {
  onPlaced: (campaignId: string) => void
}

function writeInventoryDrag(event: DragEvent, card: InventoryCard) {
  const payload = JSON.stringify(card)
  event.dataTransfer.setData(INVENTORY_DRAG_MIME, payload)
  event.dataTransfer.setData('text/plain', payload)
  event.dataTransfer.effectAllowed = 'copy'
}

export async function placeInventoryCard(card: InventoryCard, goLiveAt?: string) {
  const res = await fetch('/api/campaigns/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      action: card.kind === 'recontact' ? 'promote' : 'schedule',
      vertical: card.vertical,
      city: card.city,
      ...(goLiveAt ? { go_live_at: goLiveAt } : {})
    })
  })
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    detail?: string
    campaign?: { id?: string }
  }
  if (!res.ok) throw new Error(body.detail || body.error || 'Could not place campaign')
  const id = body.campaign?.id
  if (!id) throw new Error('Campaign created without an id')
  const queueRes = await fetch('/api/campaigns/queue', { headers: { Accept: 'application/json' } })
  if (queueRes.ok) {
    writeQueryCache(QUEUE_QUERY_KEY, (await queueRes.json()) as QueuePayload)
  }
  return id
}

export function OutboundInventoryRail({ onPlaced }: Props) {
  const queue = useCachedJson<QueuePayload>(QUEUE_QUERY_KEY, '/api/campaigns/queue', {
    staleMs: 30_000
  })
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const thisWeek = useMemo(
    () => queue.data?.queue.filter((row) => row.week === 'this_week') ?? [],
    [queue.data]
  )
  const load = weekLoad(thisWeek)
  const recs = useMemo(() => {
    if (!queue.data) return []
    return rankNextSlots({
      runway: queue.data.runway,
      recontactPool: queue.data.recontactPool,
      thisWeekVerticals: thisWeek.flatMap((row) => row.vertical_tags),
      thisWeekSlots: thisWeek.length
    })
  }, [queue.data, thisWeek])
  const pool = useMemo(
    () => (queue.data ? inventoryPoolCards(queue.data.recontactPool, recs) : []),
    [queue.data, recs]
  )

  const place = useCallback(
    async (card: InventoryCard, goLiveAt?: string) => {
      setBusyId(card.id)
      setError(null)
      try {
        const id = await placeInventoryCard(card, goLiveAt)
        await queue.reload(true)
        onPlaced(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyId(null)
      }
    },
    [onPlaced, queue]
  )

  return (
    <aside className="flex w-[17.5rem] shrink-0 flex-col overflow-hidden border-r border-stone-200/80 bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <p className="text-[13px] font-semibold text-neutral-900">Inventory</p>
        <p
          className={cn(
            'mt-1 text-[11px] font-medium',
            load.overCapacity
              ? 'text-rose-700'
              : load.underCadence
                ? 'text-amber-700'
                : 'text-neutral-500'
          )}
        >
          {load.slots} of {QUEUE_WEEK_SLOT_MIN}–{QUEUE_WEEK_SLOT_MAX} this week
          {load.overCapacity ? ' · overbooked' : load.underCadence ? ' · room to fill' : ''}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
            {error}
          </p>
        ) : null}

        <section>
          <h3 className="compass-section-label mb-2 px-1">Next slots</h3>
          {queue.loading && !queue.data ? (
            <p className="px-1 text-[12px] text-neutral-400">Loading…</p>
          ) : recs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/70 px-3 py-3 text-[12px] text-neutral-500">
              {load.overCapacity
                ? 'This week is full. Drag a card onto a later day if you still want it dated.'
                : 'No ranked slots. Pull a list or wait for a 90-day batch to clear 30 leads.'}
            </p>
          ) : (
            <div className="space-y-2">
              {recs.map((card) => (
                <InventoryCardButton
                  key={card.id}
                  card={card}
                  busy={busyId === card.id}
                  muted={false}
                  onDragStart={writeInventoryDrag}
                  onPlace={() => void place(card)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="compass-section-label mb-2 px-1">Ready to recontact</h3>
          {pool.length === 0 ? (
            <p className="px-1 text-[12px] text-neutral-400">
              {queue.data?.recontactPool.length
                ? 'Batches under 30 stay in CRM until they earn a slot.'
                : 'No 90-day batches yet.'}
            </p>
          ) : (
            <div className="space-y-2">
              {pool.map((card) => (
                <InventoryCardButton
                  key={card.id}
                  card={card}
                  busy={busyId === card.id}
                  muted
                  onDragStart={writeInventoryDrag}
                  onPlace={() => void place(card)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </aside>
  )
}

function InventoryCardButton({
  card,
  busy,
  muted,
  onDragStart,
  onPlace
}: {
  card: InventoryCard
  busy: boolean
  muted: boolean
  onDragStart: (event: DragEvent, card: InventoryCard) => void
  onPlace: () => void
}) {
  const title = card.city ? `${card.vertical} · ${card.city}` : card.vertical
  return (
    <button
      type="button"
      draggable={!busy}
      disabled={busy}
      onDragStart={(event) => onDragStart(event, card)}
      onClick={onPlace}
      className={cn(
        'w-full rounded-xl border px-3 py-2.5 text-left shadow-soft transition',
        muted
          ? 'border-stone-200 bg-stone-100 text-neutral-500'
          : 'border-stone-200/90 bg-white text-neutral-800 hover:border-stone-300',
        busy ? 'opacity-60' : ''
      )}
      title="Drag onto a day, or click to place on the next open weekday"
    >
      <span className="block truncate text-[13px] font-semibold capitalize text-neutral-900">
        {busy ? 'Placing…' : title}
      </span>
      <span className="mt-0.5 block text-[11px] text-neutral-500">{card.reason}</span>
      <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        {card.kind === 'recontact' ? '90 day' : 'Fresh'} · drag onto calendar
      </span>
    </button>
  )
}
