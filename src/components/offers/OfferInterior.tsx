'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { OfferDeskCard, OfferLock, OfferRelevanceFact, OfferVehicle } from '@/lib/offer-sku'
import { emptyOfferLock, slugifyOfferKey } from '@/lib/offer-sku'
import { cn } from '@/lib/utils'

function linesToList(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function listToLines(value: string[]) {
  return value.join('\n')
}

function formatAud(value: number | null | undefined) {
  if (value == null) return ''
  return String(value)
}

function formatCount(value: number | null | undefined) {
  if (value == null) return '—'
  return value.toLocaleString('en-AU')
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
  return (
    <Badge variant="secondary" appearance="light" size="sm">
      {status || 'Draft'}
    </Badge>
  )
}

export function OfferInterior({
  card,
  liveCount,
  busy,
  error,
  onBack,
  onPatch
}: {
  card: OfferDeskCard
  liveCount: number
  busy: boolean
  error: string | null
  onBack: () => void
  onPatch: (body: Record<string, unknown>) => Promise<void>
}) {
  const offer = card.offer
  const live = offer.gtm_status === 'live'
  const [confirmLive, setConfirmLive] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="compass-btn-ghost" onClick={onBack}>
          All offers
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/sales/outbound/offers" className="compass-btn-ghost">
            Open copy library
          </Link>
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
            <>
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
            </>
          ) : offer.gtm_status === 'testing' ? (
            <button
              type="button"
              className="compass-btn-secondary"
              disabled={busy}
              onClick={() => setConfirmLive(true)}
            >
              Make live
            </button>
          ) : (
            <button
              type="button"
              className="compass-btn-secondary"
              disabled={busy}
              onClick={() => onPatch({ gtm_status: 'testing' })}
            >
              Restore to testing
            </button>
          )}
          {offer.gtm_status !== 'retired' ? (
            <button
              type="button"
              className="compass-btn-ghost text-red-700"
              disabled={busy}
              onClick={() => onPatch({ gtm_status: 'retired' })}
            >
              Retire
            </button>
          ) : null}
        </div>
      </div>

      <ResultsStrip card={card} />

      <OfferLockForm
        key={`${offer.id}-${offer.updated_at}`}
        card={card}
        busy={busy}
        error={error}
        onPatch={onPatch}
      />
    </div>
  )
}

function ResultsStrip({ card }: { card: OfferDeskCard }) {
  const r = card.results
  return (
    <section className="compass-panel p-5">
      <div className="compass-section-label">Results</div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="Campaigns" value={`${r.activeCampaigns}/${r.campaigns}`} hint="Active / bound" />
        <MiniStat label="Cohort" value={formatCount(r.cohort)} hint="Leads on bound waves" />
        <MiniStat label="Sent" value={formatCount(r.sent)} hint="Instantly, if bound" />
        <MiniStat label="Meetings" value={formatCount(r.meetings)} />
        <MiniStat label="Positive" value={formatCount(r.positive)} />
      </div>
      {card.campaigns.length > 0 ? (
        <div className="mt-4 space-y-2">
          {card.campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/sales/outbound/editor/${campaign.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 bg-white px-4 py-3 text-sm transition hover:shadow-soft"
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
        <p className="mt-4 text-sm text-neutral-500">No campaigns bound to this SKU yet.</p>
      )}
    </section>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-[11px] text-neutral-400">{hint}</div> : null}
    </div>
  )
}

function OfferLockForm({
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
  const [mechanism, setMechanism] = useState(offer.lock.mechanism)
  const [category, setCategory] = useState(offer.lock.category)
  const [capture, setCapture] = useState(offer.lock.machine.capture)
  const [fill, setFill] = useState(offer.lock.machine.fill)
  const [convert, setConvert] = useState(offer.lock.machine.convert)
  const [vehicles, setVehicles] = useState<OfferVehicle[]>(
    offer.lock.vehicles.length ? offer.lock.vehicles : [{ problem: '', vehicle: '' }]
  )
  const [crowd, setCrowd] = useState(offer.lock.crowd)
  const [verticalIn, setVerticalIn] = useState(listToLines(offer.lock.verticalIn))
  const [verticalOut, setVerticalOut] = useState(listToLines(offer.lock.verticalOut))
  const [verticalTags, setVerticalTags] = useState(offer.vertical_tags.join(', '))
  const [locationTags, setLocationTags] = useState(offer.location_tags.join(', '))
  const [icp, setIcp] = useState(offer.lock.icp)
  const [antiIcp, setAntiIcp] = useState(listToLines(offer.lock.antiIcp))
  const [screen, setScreen] = useState(listToLines(offer.lock.screen))
  const [walk, setWalk] = useState(listToLines(offer.lock.walk))
  const [relevance, setRelevance] = useState<OfferRelevanceFact[]>(
    offer.lock.relevance.length ? offer.lock.relevance : [{ fact: '', required: false, source: '' }]
  )
  const [install, setInstall] = useState(formatAud(offer.install_aud))
  const [low, setLow] = useState(formatAud(offer.retainer_low_aud))
  const [high, setHigh] = useState(formatAud(offer.retainer_high_aud))
  const [term, setTerm] = useState(offer.term_days?.toString() ?? '')
  const [guarantee, setGuarantee] = useState(offer.guarantee ?? '')

  const lock: OfferLock = useMemo(
    () => ({
      ...emptyOfferLock(),
      icp,
      antiIcp: linesToList(antiIcp),
      screen: linesToList(screen),
      walk: linesToList(walk),
      machine: { capture, fill, convert },
      mechanism,
      category,
      crowd,
      verticalIn: linesToList(verticalIn),
      verticalOut: linesToList(verticalOut),
      vehicles: vehicles.filter((row) => row.problem.trim() || row.vehicle.trim()),
      relevance: relevance.filter((row) => row.fact.trim())
    }),
    [
      icp,
      antiIcp,
      screen,
      walk,
      capture,
      fill,
      convert,
      mechanism,
      category,
      crowd,
      verticalIn,
      verticalOut,
      vehicles,
      relevance
    ]
  )

  return (
    <form
      className="space-y-6"
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
          vertical_tags: linesToList(verticalTags.replace(/,/g, '\n')),
          location_tags: linesToList(locationTags.replace(/,/g, '\n')),
          lock
        })
      }}
    >
      <Panel title="Primary copy">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Name</span>
          <input className="compass-input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">One sentence (3S)</span>
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
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Mechanism</span>
          <textarea
            className="compass-input min-h-[88px]"
            value={mechanism}
            onChange={(e) => setMechanism(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Category</span>
          <input className="compass-input" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Pack summary</span>
          <input className="compass-input" value={pack} onChange={(e) => setPack(e.target.value)} />
        </label>
      </Panel>

      <Panel title="Strategy and components">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Capture</span>
            <textarea
              className="compass-input min-h-[88px]"
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Fill</span>
            <textarea className="compass-input min-h-[88px]" value={fill} onChange={(e) => setFill(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Convert</span>
            <textarea
              className="compass-input min-h-[88px]"
              value={convert}
              onChange={(e) => setConvert(e.target.value)}
            />
          </label>
        </div>
        <div className="space-y-3">
          <div className="text-sm text-neutral-600">Vehicles (problem → what you attach)</div>
          {vehicles.map((row, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-2">
              <input
                className="compass-input"
                placeholder="Problem"
                value={row.problem}
                onChange={(e) =>
                  setVehicles((cur) => cur.map((item, i) => (i === index ? { ...item, problem: e.target.value } : item)))
                }
              />
              <input
                className="compass-input"
                placeholder="Vehicle"
                value={row.vehicle}
                onChange={(e) =>
                  setVehicles((cur) => cur.map((item, i) => (i === index ? { ...item, vehicle: e.target.value } : item)))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="compass-btn-ghost"
            onClick={() => setVehicles((cur) => [...cur, { problem: '', vehicle: '' }])}
          >
            Add vehicle
          </button>
        </div>
      </Panel>

      <Panel title="Target market">
        <label className="block text-sm">
          <span className="mb-1.5 block text-neutral-600">Starving crowd</span>
          <textarea className="compass-input min-h-[88px]" value={crowd} onChange={(e) => setCrowd(e.target.value)} />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Verticals in (one per line)</span>
            <textarea
              className="compass-input min-h-[88px]"
              value={verticalIn}
              onChange={(e) => setVerticalIn(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Verticals out (one per line)</span>
            <textarea
              className="compass-input min-h-[88px]"
              value={verticalOut}
              onChange={(e) => setVerticalOut(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Vertical tags</span>
            <input
              className="compass-input"
              value={verticalTags}
              onChange={(e) => setVerticalTags(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Location tags</span>
            <input
              className="compass-input"
              value={locationTags}
              onChange={(e) => setLocationTags(e.target.value)}
            />
          </label>
        </div>
      </Panel>

      <Panel title="ICP">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">ICP</span>
            <textarea className="compass-input min-h-[120px]" value={icp} onChange={(e) => setIcp(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Anti-ICP (one per line)</span>
            <textarea
              className="compass-input min-h-[120px]"
              value={antiIcp}
              onChange={(e) => setAntiIcp(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Screen (one per line)</span>
            <textarea
              className="compass-input min-h-[88px]"
              value={screen}
              onChange={(e) => setScreen(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-neutral-600">Walk (one per line)</span>
            <textarea className="compass-input min-h-[88px]" value={walk} onChange={(e) => setWalk(e.target.value)} />
          </label>
        </div>
      </Panel>

      <Panel title="Targeting">
        <p className="text-sm text-neutral-500">Facts that must be true on a row to send. Not a second ICP paragraph.</p>
        <div className="space-y-3">
          {relevance.map((row, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <input
                className="compass-input"
                placeholder="Fact"
                value={row.fact}
                onChange={(e) =>
                  setRelevance((cur) => cur.map((item, i) => (i === index ? { ...item, fact: e.target.value } : item)))
                }
              />
              <label className="flex items-center gap-2 text-sm text-neutral-600">
                <input
                  type="checkbox"
                  checked={row.required}
                  onChange={(e) =>
                    setRelevance((cur) =>
                      cur.map((item, i) => (i === index ? { ...item, required: e.target.checked } : item))
                    )
                  }
                />
                Required to send
              </label>
              <input
                className="compass-input"
                placeholder="Source"
                value={row.source}
                onChange={(e) =>
                  setRelevance((cur) =>
                    cur.map((item, i) => (i === index ? { ...item, source: e.target.value } : item))
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="compass-btn-ghost"
            onClick={() => setRelevance((cur) => [...cur, { fact: '', required: false, source: '' }])}
          >
            Add fact
          </button>
        </div>
      </Panel>

      <Panel title="Commercial">
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
      </Panel>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button type="submit" className="compass-btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save lock'}
      </button>
    </form>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="compass-panel space-y-4 p-5">
      <div className="compass-section-label">{title}</div>
      {children}
    </section>
  )
}

export function CreateOfferInterior({
  busy,
  error,
  onBack,
  onCreate
}: {
  busy: boolean
  error: string | null
  onBack: () => void
  onCreate: (body: Record<string, unknown>) => Promise<string | null>
}) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [oneSentence, setOneSentence] = useState('')
  const [summary, setSummary] = useState('')

  return (
    <form
      className="space-y-6"
      onSubmit={async (event) => {
        event.preventDefault()
        const offer_key = key.trim() || slugifyOfferKey(name)
        await onCreate({
          name: name.trim(),
          offer_key,
          pack_summary: summary.trim() || oneSentence.trim() || name.trim(),
          one_sentence: oneSentence.trim(),
          gtm_status: 'testing',
          lock: emptyOfferLock()
        })
      }}
    >
      <button type="button" className="compass-btn-ghost" onClick={onBack}>
        All offers
      </button>
      <Panel title="New testing SKU">
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
        <button type="submit" className="compass-btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </Panel>
    </form>
  )
}

export function OfferMissing({ offerKey, onBack }: { offerKey: string; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button type="button" className="compass-btn-ghost" onClick={onBack}>
        All offers
      </button>
      <div className="compass-panel px-5 py-10 text-sm text-neutral-500">
        No SKU with key <span className="font-medium text-neutral-700">{offerKey}</span>.
      </div>
    </div>
  )
}
