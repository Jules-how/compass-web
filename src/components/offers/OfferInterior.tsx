'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
  OfferCampaignResult,
  OfferDeskCard,
  OfferLock,
  OfferRelevanceFact,
  OfferTestCell,
  OfferVehicle,
  OfferVerticalVariant,
  VerticalVariantStatus
} from '@/lib/offer-sku'
import { emptyOfferLock, slugifyOfferKey, VERTICAL_VARIANT_STATUSES } from '@/lib/offer-sku'
import { OfferCellRows } from '@/components/offers/TestCellsBoard'
import { testingVariableLabel } from '@/lib/campaigns'

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

function verticalStatusBadge(status: VerticalVariantStatus) {
  switch (status) {
    case 'validated':
      return (
        <Badge variant="success" appearance="light" size="sm">
          Validated
        </Badge>
      )
    case 'testing':
      return (
        <Badge variant="warning" appearance="light" size="sm">
          Testing
        </Badge>
      )
    case 'killed':
      return (
        <Badge variant="destructive" appearance="light" size="sm">
          Killed
        </Badge>
      )
    case 'planned':
    default:
      return (
        <Badge variant="secondary" appearance="light" size="sm">
          Planned
        </Badge>
      )
  }
}

export function EditableOfferTitle({
  name,
  busy,
  onSave
}: {
  name: string
  busy: boolean
  onSave: (name: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  useEffect(() => {
    setDraft(name)
  }, [name])

  async function commit() {
    const next = draft.trim()
    if (!next || next === name) {
      setDraft(name)
      setEditing(false)
      return
    }
    setEditing(false)
    await onSave(next)
  }

  if (editing) {
    return (
      <input
        aria-label="Offer name"
        className="w-full min-w-0 border-0 bg-transparent p-0 outline-none"
        value={draft}
        autoFocus
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            void commit()
          }
          if (e.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button type="button" className="max-w-full text-left" onClick={() => setEditing(true)}>
      {name}
    </button>
  )
}

export function OfferInterior({
  card,
  cells,
  liveCount,
  busy,
  error,
  onBack,
  onPatch
}: {
  card: OfferDeskCard
  cells: OfferTestCell[]
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

      {cells.length > 0 || card.campaigns.length > 0 ? (
        <section className="compass-panel space-y-3 p-5">
          <div className="compass-section-label">Cells</div>
          <OfferCellRows cells={cells} />
        </section>
      ) : null}

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
                {campaign.locationTags?.[0] || 'no city'} · {formatCount(campaign.sent)} sent ·{' '}
                {formatCount(campaign.positive)} positive · {formatCount(campaign.meetings)} meetings
                {campaign.testingVariable && campaign.testingVariable !== 'none'
                  ? ` · ${testingVariableLabel(campaign.testingVariable)}`
                  : ''}
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
  const [verticals, setVerticals] = useState<OfferVerticalVariant[]>(() => {
    if (offer.lock.verticals && offer.lock.verticals.length > 0) {
      return offer.lock.verticals
    }
    if (offer.lock.verticalIn && offer.lock.verticalIn.length > 0) {
      return offer.lock.verticalIn.map((v) => ({
        key: slugifyOfferKey(v),
        name: v.charAt(0).toUpperCase() + v.slice(1),
        status: 'testing' as const,
        hypothesis: '',
        pain_wrapper: '',
        list_spec: '',
        notes: ''
      }))
    }
    return []
  })
  const [activeVerticalKey, setActiveVerticalKey] = useState<string>('overview')
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
      verticals,
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
      verticals,
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

      <VerticalVariantsSection
        verticals={verticals}
        activeKey={activeVerticalKey}
        campaigns={card.campaigns}
        onChangeActiveKey={setActiveVerticalKey}
        onChangeVerticals={setVerticals}
      />

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

function getVerticalCampaigns(campaigns: OfferCampaignResult[], vertical: OfferVerticalVariant) {
  const vk = vertical.key.toLowerCase().trim()
  const vn = vertical.name.toLowerCase().trim()
  return campaigns.filter((c) => {
    const cName = c.name.toLowerCase()
    const matchTag = c.verticalTags?.some((tag: string) => {
      const t = tag.toLowerCase().trim()
      return t === vk || t === vn || vk.includes(t) || t.includes(vk)
    })
    const matchName = cName.includes(vk) || cName.includes(vn)
    return matchTag || matchName
  })
}

function computeVerticalStats(campaigns: OfferCampaignResult[]) {
  let cohort = 0
  let sent = 0
  let positive = 0
  let meetings = 0
  let sentKnown = false

  for (const c of campaigns) {
    cohort += c.cohort
    positive += c.positive
    meetings += c.meetings
    if (typeof c.sent === 'number') {
      sent += c.sent
      sentKnown = true
    }
  }

  const replyRate = sentKnown && sent > 0 ? `${((positive / sent) * 100).toFixed(1)}%` : '—'

  return {
    campaignsCount: campaigns.length,
    cohort,
    sent: sentKnown ? sent : null,
    positive,
    meetings,
    replyRate
  }
}

function VerticalVariantsSection({
  verticals,
  activeKey,
  campaigns,
  onChangeActiveKey,
  onChangeVerticals
}: {
  verticals: OfferVerticalVariant[]
  activeKey: string
  campaigns: OfferCampaignResult[]
  onChangeActiveKey: (key: string) => void
  onChangeVerticals: (next: OfferVerticalVariant[]) => void
}) {
  const [newVerticalName, setNewVerticalName] = useState('')
  const [adding, setAdding] = useState(false)

  const activeVertical = verticals.find((v) => v.key === activeKey)
  const activeIndex = verticals.findIndex((v) => v.key === activeKey)

  function handleAddVertical() {
    const name = newVerticalName.trim()
    if (!name) return
    const key = slugifyOfferKey(name)
    if (verticals.some((v) => v.key === key)) {
      onChangeActiveKey(key)
      setNewVerticalName('')
      setAdding(false)
      return
    }
    const nextVariant: OfferVerticalVariant = {
      key,
      name,
      status: 'planned',
      hypothesis: '',
      pain_wrapper: '',
      list_spec: '',
      notes: ''
    }
    const next = [...verticals, nextVariant]
    onChangeVerticals(next)
    onChangeActiveKey(key)
    setNewVerticalName('')
    setAdding(false)
  }

  function handleUpdateActive(partial: Partial<OfferVerticalVariant>) {
    if (activeIndex === -1) return
    const next = verticals.map((v, i) => (i === activeIndex ? { ...v, ...partial } : v))
    onChangeVerticals(next)
  }

  function handleDeleteActive() {
    if (activeIndex === -1) return
    const next = verticals.filter((_, i) => i !== activeIndex)
    onChangeVerticals(next)
    onChangeActiveKey('overview')
  }

  return (
    <section className="compass-panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="compass-section-label">Vertical Hypotheses &amp; Variants</div>
          <p className="mt-1 text-xs text-neutral-500">
            Compare performance across tested industries and tailor messaging specs for each market.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!adding ? (
            <button
              type="button"
              className="compass-btn-secondary text-xs"
              onClick={() => setAdding(true)}
            >
              + Add vertical
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                className="compass-input h-8 py-1 text-xs"
                placeholder="e.g. Cosmetic Clinics"
                value={newVerticalName}
                autoFocus
                onChange={(e) => setNewVerticalName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddVertical()
                  }
                  if (e.key === 'Escape') setAdding(false)
                }}
              />
              <button
                type="button"
                className="compass-btn-primary text-xs"
                onClick={handleAddVertical}
              >
                Add
              </button>
              <button
                type="button"
                className="compass-btn-ghost text-xs"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2">
        <button
          type="button"
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition',
            activeKey === 'overview'
              ? 'bg-neutral-900 text-white'
              : 'bg-stone-100 text-neutral-600 hover:bg-stone-200'
          )}
          onClick={() => onChangeActiveKey('overview')}
        >
          Overview ({verticals.length})
        </button>
        {verticals.map((v) => (
          <button
            key={v.key}
            type="button"
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
              activeKey === v.key
                ? 'bg-neutral-900 text-white'
                : 'bg-stone-100 text-neutral-600 hover:bg-stone-200'
            )}
            onClick={() => onChangeActiveKey(v.key)}
          >
            <span>{v.name}</span>
            {verticalStatusBadge(v.status)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeKey === 'overview' || !activeVertical ? (
        <div className="space-y-4">
          {verticals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-neutral-400 uppercase tracking-wider">
                    <th className="py-2.5 pr-4 font-semibold">Vertical</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-3 font-semibold">Hypothesis / Hook</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Campaigns</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Cohort</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Sent</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Positive</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Meetings</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">Pos Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-neutral-700">
                  {verticals.map((v) => {
                    const matched = getVerticalCampaigns(campaigns, v)
                    const stats = computeVerticalStats(matched)
                    return (
                      <tr
                        key={v.key}
                        className="cursor-pointer transition hover:bg-stone-50"
                        onClick={() => onChangeActiveKey(v.key)}
                      >
                        <td className="py-3 pr-4 font-medium text-neutral-900">
                          <div>{v.name}</div>
                          <div className="text-[10px] text-neutral-400 font-mono">{v.key}</div>
                        </td>
                        <td className="py-3 px-3">{verticalStatusBadge(v.status)}</td>
                        <td className="py-3 px-3 max-w-xs truncate text-neutral-500">
                          {v.pain_wrapper || v.hypothesis || '—'}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">{stats.campaignsCount}</td>
                        <td className="py-3 px-3 text-right tabular-nums">{formatCount(stats.cohort)}</td>
                        <td className="py-3 px-3 text-right tabular-nums">{formatCount(stats.sent)}</td>
                        <td className="py-3 px-3 text-right tabular-nums font-medium text-neutral-900">
                          {stats.positive}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums font-medium text-neutral-900">
                          {stats.meetings}
                        </td>
                        <td className="py-3 pl-3 text-right tabular-nums font-semibold text-emerald-600">
                          {stats.replyRate}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              No vertical variants planned yet. Click &quot;+ Add vertical&quot; above to create an industry hypothesis.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Vertical Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50 p-3.5 border border-stone-200">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs">
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Vertical Name</span>
                <input
                  className="compass-input mt-0.5 h-8 font-medium text-neutral-900"
                  value={activeVertical.name}
                  onChange={(e) => handleUpdateActive({ name: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Key</span>
                <input
                  className="compass-input mt-0.5 h-8 font-mono text-neutral-500"
                  value={activeVertical.key}
                  onChange={(e) => handleUpdateActive({ key: slugifyOfferKey(e.target.value) })}
                />
              </label>
              <label className="text-xs">
                <span className="block text-[10px] uppercase font-semibold text-neutral-400">Status</span>
                <select
                  className="compass-input mt-0.5 h-8 bg-white text-xs font-medium"
                  value={activeVertical.status}
                  onChange={(e) =>
                    handleUpdateActive({ status: e.target.value as VerticalVariantStatus })
                  }
                >
                  {VERTICAL_VARIANT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="compass-btn-ghost text-xs text-red-700"
              onClick={handleDeleteActive}
            >
              Delete vertical
            </button>
          </div>

          {/* Quick stats for active vertical */}
          {(() => {
            const matched = getVerticalCampaigns(campaigns, activeVertical)
            const stats = computeVerticalStats(matched)
            return (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-stone-100 bg-white p-3.5 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-neutral-400">Campaigns</div>
                  <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-neutral-900">
                    {stats.campaignsCount}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-neutral-400">Cohort</div>
                  <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-neutral-900">
                    {formatCount(stats.cohort)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-neutral-400">Sent</div>
                  <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-neutral-900">
                    {formatCount(stats.sent)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-neutral-400">Positive Replies</div>
                  <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-neutral-900">
                    {stats.positive}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-neutral-400">Meetings</div>
                  <div className="mt-0.5 font-display text-lg font-semibold tabular-nums text-neutral-900">
                    {stats.meetings}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Vertical spec fields */}
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-neutral-600 text-xs font-medium">Industry Hypothesis</span>
              <textarea
                className="compass-input min-h-[96px] text-xs"
                placeholder="Why this industry feels the pain, what happens in the moment, and ticket economics..."
                value={activeVertical.hypothesis}
                onChange={(e) => handleUpdateActive({ hypothesis: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-neutral-600 text-xs font-medium">Tailored 3S &amp; Pain Wrapper</span>
              <textarea
                className="compass-input min-h-[96px] text-xs"
                placeholder="Specific 3S line, dream outcome, and opener hook for this vertical..."
                value={activeVertical.pain_wrapper}
                onChange={(e) => handleUpdateActive({ pain_wrapper: e.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block text-neutral-600 text-xs font-medium">List &amp; Targeting Spec</span>
              <textarea
                className="compass-input min-h-[96px] text-xs"
                placeholder="Maps queries, search terms, required badges, and walk filters..."
                value={activeVertical.list_spec}
                onChange={(e) => handleUpdateActive({ list_spec: e.target.value })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-neutral-600 text-xs font-medium">Field Feedback &amp; Notes</span>
              <textarea
                className="compass-input min-h-[96px] text-xs"
                placeholder="Inbox replies, objections raised on calls, reasons for killing or validating..."
                value={activeVertical.notes}
                onChange={(e) => handleUpdateActive({ notes: e.target.value })}
              />
            </label>
          </div>

          {/* Bound Campaigns for this vertical */}
          {(() => {
            const matched = getVerticalCampaigns(campaigns, activeVertical)
            return (
              <div className="space-y-2 pt-2 border-t border-stone-100">
                <div className="text-xs font-semibold text-neutral-600">
                  Bound Campaigns for {activeVertical.name} ({matched.length})
                </div>
                {matched.length > 0 ? (
                  <div className="space-y-2">
                    {matched.map((campaign) => (
                      <Link
                        key={campaign.id}
                        href={`/sales/outbound/editor/${campaign.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-100 bg-white px-4 py-2.5 text-xs transition hover:shadow-soft"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {campaignStatusBadge(campaign.status)}
                          <span className="truncate font-medium text-neutral-800">{campaign.name}</span>
                        </div>
                        <div className="tabular-nums text-neutral-500">
                          {campaign.locationTags?.[0] || 'no city'} · {formatCount(campaign.sent)} sent ·{' '}
                          {formatCount(campaign.positive)} positive
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-400">
                    No active campaigns tagged with {activeVertical.key} yet.
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </section>
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
