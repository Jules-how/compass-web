'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingBlock } from '@/components/LoadingBlock'
import type { GtmStatus, OfferDeskCard, OfferDeskModel, OfferLock } from '@/lib/offer-sku'
import { emptyOfferLock, slugifyOfferKey } from '@/lib/offer-sku'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'

type DeskPayload = OfferDeskModel & {
  instantlySyncedAt?: string | null
  error?: string
}

function formatAud(value: number | null | undefined) {
  if (value == null) return null
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(value)
}

function formatCount(value: number | null | undefined) {
  if (value == null) return '—'
  return value.toLocaleString('en-AU')
}

function formatRate(value: number | null | undefined) {
  if (value == null) return null
  return `${value}%`
}

function campaignStatusBadge(status: string) {
  const s = status.trim().toLowerCase()
  if (s === 'active' || s === 'live') {
    return (
      <Badge variant="success" appearance="light" size="sm">
        Active
      </Badge>
    )
  }
  if (s === 'paused') {
    return (
      <Badge variant="warning" appearance="light" size="sm">
        Paused
      </Badge>
    )
  }
  if (s === 'completed') {
    return (
      <Badge variant="secondary" appearance="light" size="sm">
        Completed
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      {status || 'Draft'}
    </Badge>
  )
}

function linesToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function listToLines(value: string[]) {
  return value.join('\n')
}

function commercialLine(card: OfferDeskCard) {
  const install = formatAud(card.offer.install_aud)
  const low = formatAud(card.offer.retainer_low_aud)
  const high = formatAud(card.offer.retainer_high_aud)
  const term = card.offer.term_days
  const bits: string[] = []
  if (install) bits.push(`${install} install`)
  if (low && high && low !== high) bits.push(`${low} to ${high} / mo`)
  else if (low || high) bits.push(`${low || high} / mo`)
  if (term) bits.push(`${term} day term`)
  return bits.length ? bits.join(' · ') : 'Price not locked'
}

function machineBits(card: OfferDeskCard) {
  const m = card.offer.lock.machine
  return [
    m.capture ? { label: 'Capture', text: m.capture } : null,
    m.fill ? { label: 'Fill', text: m.fill } : null,
    m.convert ? { label: 'Convert', text: m.convert } : null
  ].filter((row): row is { label: string; text: string } => Boolean(row))
}

export function OffersDesk() {
  const { data, error, loading, reload } = useCachedJson<DeskPayload>(
    '/api/offers/desk',
    '/api/offers/desk',
    { staleMs: 30_000 }
  )
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const desk = data
  const liveCount = desk?.totals.live ?? 0

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

  if (loading && !data) {
    return <LoadingBlock label="Loading offers…" />
  }

  const laneProps = {
    liveCount,
    openId,
    busyId,
    formError,
    onToggle: (id: string) => setOpenId((cur) => (cur === id ? null : id)),
    onPatch: patchOffer
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-neutral-500">
          Scoreboard is booked jobs and positive replies on the ledger. Not CPL. Copy library stays
          under Outbound.
        </p>
        <button type="button" className="compass-btn-primary" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Close' : 'New testing SKU'}
        </button>
      </div>

      {error || desk?.error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Could not refresh the desk. {error || desk?.error}
        </div>
      ) : null}

      {creating ? (
        <CreateOfferForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await reload(true)
          }}
        />
      ) : null}

      <Card>
        <CardContent className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <Score
            label="Live"
            value={String(desk?.totals.live ?? 0)}
            hint="Outbound SKUs"
            tone="live"
          />
          <Score
            label="Testing"
            value={String(desk?.totals.testing ?? 0)}
            hint="Not live outbound"
            tone="test"
          />
          <Score
            label="Meetings"
            value={formatCount(desk?.totals.meetings)}
            hint="Booked on live SKUs"
          />
          <Score
            label="Positive replies"
            value={formatCount(desk?.totals.positive)}
            hint="Interested, meeting, converted"
          />
        </CardContent>
      </Card>

      {typeof desk?.unboundCampaigns === 'number' && desk.unboundCampaigns > 0 ? (
        <p className="text-xs text-neutral-500">
          {desk.unboundCampaigns} campaign{desk.unboundCampaigns === 1 ? '' : 's'} have no offer
          bound.
        </p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Lane
          label="Live"
          empty="Nothing live. Promote a testing SKU when you are ready to outbound it."
          cards={desk?.live ?? []}
          tone="live"
          {...laneProps}
        />
        <Lane
          label="Testing"
          empty="No testing SKUs."
          cards={desk?.testing ?? []}
          tone="test"
          {...laneProps}
        />
      </div>

      {(desk?.retired.length ?? 0) > 0 ? (
        <details className="compass-panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
            <span className="flex items-center gap-3">
              <span className="compass-section-label">Retired</span>
              <span className="text-sm text-neutral-500">{desk?.retired.length} SKUs</span>
            </span>
            <span className="text-xs text-neutral-400">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="space-y-3 border-t border-stone-100 px-5 py-4">
            {(desk?.retired ?? []).map((card) => (
              <div
                key={card.offer.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-800">{card.offer.name}</div>
                  <div className="truncate text-xs text-neutral-500">{card.offer.offer_key}</div>
                </div>
                <div className="text-xs tabular-nums text-neutral-500">
                  {formatCount(card.results.meetings)} meetings · {formatCount(card.results.positive)}{' '}
                  positive
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
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
        {tone === 'test' ? (
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
        ) : null}
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

function Lane({
  label,
  empty,
  cards,
  tone,
  liveCount,
  openId,
  busyId,
  formError,
  onToggle,
  onPatch
}: {
  label: string
  empty: string
  cards: OfferDeskCard[]
  tone: 'live' | 'test'
  liveCount: number
  openId: string | null
  busyId: string | null
  formError: string | null
  onToggle: (id: string) => void
  onPatch: (id: string, body: Record<string, unknown>) => Promise<void>
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5">
          {tone === 'live' ? <Pulse /> : <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />}
          <h2 className="compass-section-label">{label}</h2>
        </div>
        <span className="font-display text-xl font-semibold tabular-nums tracking-tight text-neutral-900">
          {cards.length}
        </span>
      </div>
      {cards.length === 0 ? (
        <div
          className={cn(
            'compass-panel px-5 py-10 text-sm leading-relaxed text-neutral-500',
            tone === 'live' && 'border-dashed'
          )}
        >
          {empty}
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <OfferCard
              key={card.offer.id}
              card={card}
              liveCount={liveCount}
              open={openId === card.offer.id}
              busy={busyId === card.offer.id}
              formError={openId === card.offer.id ? formError : null}
              onToggle={() => onToggle(card.offer.id)}
              onPatch={(body) => onPatch(card.offer.id, body)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function OfferCard({
  card,
  liveCount,
  open,
  busy,
  formError,
  onToggle,
  onPatch
}: {
  card: OfferDeskCard
  liveCount: number
  open: boolean
  busy: boolean
  formError: string | null
  onToggle: () => void
  onPatch: (body: Record<string, unknown>) => Promise<void>
}) {
  const live = card.offer.gtm_status === 'live'
  const [confirmLive, setConfirmLive] = useState(false)
  const r = card.results
  const machine = machineBits(card)
  const rate = r.outcomes ? formatRate(r.outcomes.positiveRate) : null

  return (
    <article
      className={cn(
        'compass-panel relative overflow-hidden',
        live && 'shadow-soft ring-1 ring-[#e85d2a]/15'
      )}
    >
      {live ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, rgba(232, 93, 42, 0.12) 0%, rgba(232, 93, 42, 0.04) 42%, transparent 68%), radial-gradient(420px 180px at 100% 0%, rgba(232, 93, 42, 0.08), transparent 60%)'
          }}
          aria-hidden
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(105deg, rgba(217, 119, 6, 0.08) 0%, rgba(217, 119, 6, 0.03) 38%, transparent 70%)'
          }}
          aria-hidden
        />
      )}
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-1.5',
          live ? 'bg-[#e85d2a]' : 'bg-amber-400'
        )}
        aria-hidden
      />

      <div className="relative">
        <div className="flex flex-col gap-5 p-5 pl-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 max-w-xl flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={live ? 'primary' : 'warning'} appearance="light" size="sm">
                  {live ? 'Live' : 'Testing'}
                </Badge>
                <span className="text-xs text-neutral-400">{card.offer.offer_key}</span>
              </div>
              <h3 className="mt-2 font-display text-xl font-semibold tracking-tight text-neutral-900">
                {card.offer.name}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                {card.offer.one_sentence || card.offer.pack_summary}
              </p>
              <p className="mt-2 text-xs text-neutral-500">{commercialLine(card)}</p>
            </div>
            <div className="flex shrink-0 items-end gap-6">
              <HeroStat label="Meetings" value={formatCount(r.meetings)} />
              <HeroStat
                label="Positive"
                value={formatCount(r.positive)}
                hint={rate ? `${rate} of sent` : undefined}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {live ? (
              <button
                type="button"
                className="compass-btn-secondary"
                disabled={busy}
                onClick={() => onPatch({ gtm_status: 'testing' })}
              >
                Move to testing
              </button>
            ) : confirmLive ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500">
                  {liveCount > 0 ? `${liveCount} already live. ` : ''}Make this live outbound?
                </span>
                <button
                  type="button"
                  className="compass-btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    await onPatch({ gtm_status: 'live' })
                    setConfirmLive(false)
                  }}
                >
                  Confirm live
                </button>
                <button type="button" className="compass-btn-ghost" onClick={() => setConfirmLive(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="compass-btn-secondary"
                disabled={busy}
                onClick={() => setConfirmLive(true)}
              >
                Make live
              </button>
            )}
            <button type="button" className="compass-btn-ghost" onClick={onToggle}>
              {open ? 'Close' : 'Lock and edit'}
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <Stat label="Campaigns" value={`${r.activeCampaigns}/${r.campaigns}`} hint="Active / bound" />
            <Stat label="Cohort" value={formatCount(r.cohort)} hint="Leads on bound waves" />
            <Stat label="Sent" value={formatCount(r.sent)} hint="Instantly, if bound" />
          </div>

          {machine.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {machine.map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-white/80 bg-white/70 px-3.5 py-3"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
                    {row.label}
                  </div>
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-neutral-600">{row.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          {card.campaigns.length > 0 ? (
            <div className="space-y-2">
              {card.campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/sales/outbound/editor/${campaign.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 bg-white/80 px-4 py-3 text-sm transition hover:bg-white hover:shadow-soft"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {campaignStatusBadge(campaign.status)}
                    <span className="truncate font-medium text-neutral-800">{campaign.name}</span>
                  </div>
                  <div className="text-xs tabular-nums text-neutral-500">
                    {formatCount(campaign.cohort)} cohort · {formatCount(campaign.positive)} positive ·{' '}
                    {formatCount(campaign.meetings)} meetings
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No campaigns bound to this SKU yet.</p>
          )}
        </div>

        {open ? <OfferEditor card={card} busy={busy} error={formError} onPatch={onPatch} /> : null}
      </div>
    </article>
  )
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="text-right">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 font-display text-3xl font-semibold tabular-nums tracking-tight text-neutral-900">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-neutral-400">{hint}</div> : null}
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-white/80 px-3.5 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-neutral-900">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-neutral-400">{hint}</div> : null}
    </div>
  )
}

function OfferEditor({
  card,
  busy,
  error,
  onPatch
}: {
  card: OfferDeskCard
  busy: boolean
  error: string | null
  onPatch: (body: Record<string, unknown>) => Promise<void>
}) {
  const offer = card.offer
  const [name, setName] = useState(offer.name)
  const [oneSentence, setOneSentence] = useState(offer.one_sentence ?? '')
  const [dream, setDream] = useState(offer.dream_outcome ?? '')
  const [pack, setPack] = useState(offer.pack_summary)
  const [install, setInstall] = useState(offer.install_aud?.toString() ?? '')
  const [low, setLow] = useState(offer.retainer_low_aud?.toString() ?? '')
  const [high, setHigh] = useState(offer.retainer_high_aud?.toString() ?? '')
  const [term, setTerm] = useState(offer.term_days?.toString() ?? '')
  const [guarantee, setGuarantee] = useState(offer.guarantee ?? '')
  const [icp, setIcp] = useState(offer.lock.icp)
  const [antiIcp, setAntiIcp] = useState(listToLines(offer.lock.antiIcp))
  const [screen, setScreen] = useState(listToLines(offer.lock.screen))
  const [walk, setWalk] = useState(listToLines(offer.lock.walk))
  const [capture, setCapture] = useState(offer.lock.machine.capture)
  const [fill, setFill] = useState(offer.lock.machine.fill)
  const [convert, setConvert] = useState(offer.lock.machine.convert)

  const lock: OfferLock = useMemo(
    () => ({
      icp,
      antiIcp: linesToList(antiIcp),
      screen: linesToList(screen),
      walk: linesToList(walk),
      machine: { capture, fill, convert }
    }),
    [icp, antiIcp, screen, walk, capture, fill, convert]
  )

  return (
    <form
      className="space-y-5 border-t border-stone-100 bg-white/70 p-5 pl-6"
      onSubmit={async (event) => {
        event.preventDefault()
        await onPatch({
          name,
          pack_summary: pack,
          one_sentence: oneSentence,
          dream_outcome: dream,
          install_aud: install,
          retainer_low_aud: low,
          retainer_high_aud: high,
          term_days: term,
          guarantee,
          lock
        })
      }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Name</span>
          <input className="compass-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Pack summary</span>
          <input className="compass-input" value={pack} onChange={(e) => setPack(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block text-neutral-600">One sentence</span>
        <textarea
          className="compass-input min-h-[88px]"
          value={oneSentence}
          onChange={(e) => setOneSentence(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-neutral-600">Dream outcome</span>
        <input className="compass-input" value={dream} onChange={(e) => setDream(e.target.value)} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Install AUD</span>
          <input className="compass-input" inputMode="decimal" value={install} onChange={(e) => setInstall(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Retainer low</span>
          <input className="compass-input" inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Retainer high</span>
          <input className="compass-input" inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Term days</span>
          <input className="compass-input" inputMode="numeric" value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block text-neutral-600">Guarantee</span>
        <textarea
          className="compass-input min-h-[88px]"
          value={guarantee}
          onChange={(e) => setGuarantee(e.target.value)}
        />
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">ICP</span>
          <textarea className="compass-input min-h-[88px]" value={icp} onChange={(e) => setIcp(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Not this crowd (one per line)</span>
          <textarea className="compass-input min-h-[88px]" value={antiIcp} onChange={(e) => setAntiIcp(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Screen (one per line)</span>
          <textarea className="compass-input min-h-[88px]" value={screen} onChange={(e) => setScreen(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Walk (one per line)</span>
          <textarea className="compass-input min-h-[88px]" value={walk} onChange={(e) => setWalk(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Capture</span>
          <textarea className="compass-input min-h-[88px]" value={capture} onChange={(e) => setCapture(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Fill</span>
          <textarea className="compass-input min-h-[88px]" value={fill} onChange={(e) => setFill(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Convert</span>
          <textarea className="compass-input min-h-[88px]" value={convert} onChange={(e) => setConvert(e.target.value)} />
        </label>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="compass-btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save lock'}
        </button>
        <Link href="/sales/outbound/offers" className="compass-btn-ghost">
          Open copy library
        </Link>
        <button
          type="button"
          className="compass-btn-ghost text-red-700"
          disabled={busy}
          onClick={() => onPatch({ gtm_status: 'retired' })}
        >
          Retire
        </button>
      </div>
    </form>
  )
}

function CreateOfferForm({
  onCancel,
  onCreated
}: {
  onCancel: () => void
  onCreated: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [summary, setSummary] = useState('')
  const [oneSentence, setOneSentence] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="compass-panel space-y-4 p-5"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        setError(null)
        try {
          const offer_key = key.trim() || slugifyOfferKey(name)
          const res = await fetch('/api/outbound/offers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              offer_key,
              pack_summary: summary.trim() || oneSentence.trim() || name.trim(),
              one_sentence: oneSentence.trim(),
              gtm_status: 'testing' satisfies GtmStatus,
              lock: emptyOfferLock()
            })
          })
          const json = (await res.json()) as { error?: string }
          if (!res.ok) {
            setError(json.error || 'create_failed')
            return
          }
          await onCreated()
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="compass-section-label">New testing SKU</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Name</span>
          <input
            className="compass-input"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!key) setKey(slugifyOfferKey(e.target.value))
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Key</span>
          <input className="compass-input" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block text-neutral-600">One sentence</span>
        <textarea
          className="compass-input min-h-[80px]"
          value={oneSentence}
          onChange={(e) => setOneSentence(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1.5 block text-neutral-600">Pack summary</span>
        <input className="compass-input" value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="compass-btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="compass-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
