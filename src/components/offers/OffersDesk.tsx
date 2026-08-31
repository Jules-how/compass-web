'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useConsoleNav, useConsoleViewPath } from '@/components/ConsoleNav'
import { LoadingBlock } from '@/components/LoadingBlock'
import { OperatorShell } from '@/components/OperatorShell'
import { CreateOfferInterior, EditableOfferTitle, OfferInterior, OfferMissing } from '@/components/offers/OfferInterior'
import type { GtmStatus, OfferDeskCard, OfferDeskModel } from '@/lib/offer-sku'
import {
  commercialLocked,
  flattenOfferGallery,
  offerKeyFromPath
} from '@/lib/offer-sku'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type DeskPayload = OfferDeskModel & {
  instantlySyncedAt?: string | null
  error?: string
}

function formatCount(value: number | null | undefined) {
  if (value == null) return '—'
  return value.toLocaleString('en-AU')
}

export function OffersDesk() {
  const viewPath = useConsoleViewPath()
  const nav = useConsoleNav()
  const router = useRouter()
  const offerKey = offerKeyFromPath(viewPath)
  const { data, error, loading, reload } = useCachedJson<DeskPayload>(
    '/api/offers/desk',
    '/api/offers/desk',
    { staleMs: 30_000 }
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const desk = data
  const cards = useMemo(
    () => (desk ? flattenOfferGallery(desk) : []),
    [desk]
  )
  const interiorCard = offerKey && offerKey !== 'new' ? cards.find((c) => c.offer.offer_key === offerKey) : null
  const liveCount = desk?.totals.live ?? 0

  function go(href: string) {
    if (nav) nav.navigate(href)
    else router.push(href)
  }

  async function patchOffer(id: string, body: Record<string, unknown>) {
    setBusyId(id)
    setFormError(null)
    try {
      const res = await fetch(`/api/outbound/offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFormError(json.error || 'update_failed')
        return
      }
      await reload(true)
    } finally {
      setBusyId(null)
    }
  }

  async function createOffer(body: Record<string, unknown>) {
    setCreating(true)
    setFormError(null)
    try {
      const res = await fetch('/api/outbound/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = (await res.json()) as { error?: string; offer_key?: string }
      if (!res.ok) {
        setFormError(json.error || 'create_failed')
        return null
      }
      await reload(true)
      const key = typeof body.offer_key === 'string' ? body.offer_key : json.offer_key
      if (key) go(`/sales/offers/${key}`)
      return key ?? null
    } finally {
      setCreating(false)
    }
  }

  const title =
    offerKey === 'new'
      ? 'New testing SKU'
      : interiorCard
        ? (
            <EditableOfferTitle
              name={interiorCard.offer.name}
              busy={busyId === interiorCard.offer.id}
              onSave={(name) => patchOffer(interiorCard.offer.id, { name })}
            />
          )
        : 'Offers'

  if (loading && !data) {
    return (
      <OperatorShell title="Offers" width="full">
        <LoadingBlock label="Loading offers…" />
      </OperatorShell>
    )
  }

  return (
    <OperatorShell title={title} width="full">
      {offerKey === 'new' ? (
        <CreateOfferInterior
          busy={creating}
          error={formError}
          onBack={() => go('/sales/offers')}
          onCreate={createOffer}
        />
      ) : offerKey && !interiorCard && data ? (
        <OfferMissing offerKey={offerKey} onBack={() => go('/sales/offers')} />
      ) : interiorCard ? (
        <OfferInterior
          card={interiorCard}
          liveCount={liveCount}
          busy={busyId === interiorCard.offer.id}
          error={formError}
          onBack={() => go('/sales/offers')}
          onPatch={(body) => patchOffer(interiorCard.offer.id, body)}
        />
      ) : (
        <OfferGallery
          desk={desk}
          cards={cards}
          error={error || desk?.error}
          onOpen={(key) => go(`/sales/offers/${key}`)}
          onCreate={() => go('/sales/offers/new')}
        />
      )}
    </OperatorShell>
  )
}

function OfferGallery({
  desk,
  cards,
  error,
  onOpen,
  onCreate
}: {
  desk: DeskPayload | undefined
  cards: OfferDeskCard[]
  error?: string | null
  onOpen: (offerKey: string) => void
  onCreate: () => void
}) {
  return (
    <div className="space-y-7">
      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Could not refresh the desk. {error}
        </div>
      ) : null}

      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Score label="Live" value={String(desk?.totals.live ?? 0)} hint="Outbound SKUs" tone="live" />
          <Score
            label="Testing"
            value={String(desk?.totals.testing ?? 0)}
            hint="Not live outbound"
            tone="test"
          />
          <Score label="Meetings" value={formatCount(desk?.totals.meetings)} hint="Booked on live SKUs" />
          <Score
            label="Positive replies"
            value={formatCount(desk?.totals.positive)}
            hint="Interested, meeting, converted"
          />
        </CardContent>
      </Card>

      {typeof desk?.unboundCampaigns === 'number' && desk.unboundCampaigns > 0 ? (
        <p className="text-xs text-neutral-500">
          {desk.unboundCampaigns} campaign{desk.unboundCampaigns === 1 ? '' : 's'} have no offer bound.
        </p>
      ) : null}

      <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <SkuCard key={card.offer.id} card={card} onOpen={() => onOpen(card.offer.offer_key)} />
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="compass-panel flex min-h-[220px] flex-col items-center justify-center gap-2 border-dashed px-5 py-8 text-center transition hover:shadow-soft"
        >
          <span className="font-display text-lg font-semibold text-neutral-800">New testing SKU</span>
          <span className="text-sm text-neutral-500">Starts testing. Not live outbound.</span>
        </button>
      </div>
    </div>
  )
}

function SkuCard({ card, onOpen }: { card: OfferDeskCard; onOpen: () => void }) {
  const status: GtmStatus = card.offer.gtm_status
  const live = status === 'live'
  const retired = status === 'retired'
  const r = card.results

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'compass-panel relative overflow-hidden px-5 py-5 pl-6 text-left transition hover:shadow-soft',
        retired && 'opacity-70',
        live && 'shadow-soft ring-1 ring-[#e85d2a]/15'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-1.5',
          live && 'bg-[#e85d2a]',
          status === 'testing' && 'bg-amber-400',
          retired && 'bg-stone-300'
        )}
        aria-hidden
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={live ? 'primary' : retired ? 'secondary' : 'warning'} appearance="light" size="sm">
          {live ? 'Live' : retired ? 'Retired' : 'Testing'}
        </Badge>
        {r.activeCampaigns > 0 ? (
          <span className="text-[11px] text-neutral-400">{r.activeCampaigns} active</span>
        ) : null}
      </div>
      <h3 className="mt-3 font-display text-lg font-semibold tracking-tight text-neutral-900">
        {card.offer.name}
      </h3>
      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-neutral-600">
        {card.offer.one_sentence || card.offer.pack_summary}
      </p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Meetings</div>
          <div className="font-display text-2xl font-semibold tabular-nums text-neutral-900">
            {formatCount(r.meetings)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Positive</div>
          <div className="font-display text-2xl font-semibold tabular-nums text-neutral-900">
            {formatCount(r.positive)}
          </div>
        </div>
      </div>
      {!commercialLocked(card.offer) ? (
        <p className="mt-3 text-[11px] text-neutral-400">Price not locked</p>
      ) : null}
    </button>
  )
}

function Score({
  label,
  value,
  hint,
  tone
}: {
  label: string
  value: string
  hint?: string
  tone?: 'live' | 'test'
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        {tone === 'live' ? <Pulse /> : null}
        {tone === 'test' ? <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> : null}
        <div className="compass-section-label">{label}</div>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 tabular-nums">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </div>
  )
}

function Pulse() {
  return (
    <span className="relative flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e85d2a] opacity-40" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e85d2a]" />
    </span>
  )
}
