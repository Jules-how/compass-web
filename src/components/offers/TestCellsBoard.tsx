'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { TESTING_VARIABLES, testingVariableLabel } from '@/lib/campaigns'
import {
  CITY_PLAN_TAGS,
  cellCampaignName,
  missingPlanSlots,
  prettyCampaignTag,
  verticalsForOffer
} from '@/lib/offer-test-cells'
import {
  TEST_CELL_EMPTY,
  testCellKey,
  type OfferDeskModel,
  type OfferTestCell,
  type OfferTestCellFlag
} from '@/lib/offer-sku'
import { listCampaigns } from '@/lib/campaigns-client'
import { cn } from '@/lib/utils'

const FLAG_LABEL: Record<OfferTestCellFlag, string> = {
  unbound: 'No offer',
  no_vertical: 'No vertical',
  no_city: 'No city',
  mixed_variable: 'Mixed variable',
  multi_campaign: 'Multiple campaigns',
  volume_skew: 'Volume skew',
  copy_split: 'Copy differs'
}

function formatCount(value: number | null | undefined) {
  if (value == null) return '—'
  return value.toLocaleString('en-AU')
}

function Chip({
  on,
  onClick,
  children
}: {
  on: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-xl border px-3 py-1.5 text-xs font-medium',
        on
          ? 'border-[#e85d2a]/35 bg-white text-[#c2410c] shadow-soft'
          : 'border-stone-200/80 bg-white text-neutral-600 shadow-soft hover:bg-stone-50'
      )}
      onClick={onClick}
      aria-pressed={on}
    >
      {children}
    </button>
  )
}

export function TestCellsBoard({
  desk,
  onCreated
}: {
  desk: OfferDeskModel
  onCreated: () => Promise<void>
}) {
  const cells = desk.cells ?? []
  const offers = useMemo(
    () => [...desk.testing, ...desk.live].map((card) => card.offer),
    [desk]
  )
  const defaultOffer = offers.find((o) => o.gtm_status === 'testing')?.offer_key || offers[0]?.offer_key || ''
  const [offerKey, setOfferKey] = useState(defaultOffer)
  const selectedOffer = offers.find((o) => o.offer_key === offerKey)
  const offerVerticals = selectedOffer ? verticalsForOffer(selectedOffer) : []
  const [pickedVerticals, setPickedVerticals] = useState<string[]>(offerVerticals)
  const [pickedCities, setPickedCities] = useState<string[]>(selectedOffer?.location_tags?.length ? selectedOffer.location_tags : [])
  const [testingVariable, setTestingVariable] = useState('audience')
  const [cloneId, setCloneId] = useState('')
  const [target, setTarget] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offerFilter, setOfferFilter] = useState('all')
  const [verticalFilter, setVerticalFilter] = useState('all')
  const [cityFilter, setCityFilter] = useState('all')

  const offerCells = useMemo(
    () => cells.filter((cell) => cell.offerKey === offerKey),
    [cells, offerKey]
  )
  const cloneOptions = offerCells.filter((cell) => cell.campaigns[0] && cell.city !== TEST_CELL_EMPTY)
  const existingKeys = offerCells.map((cell) => cell.key)
  const missing = missingPlanSlots(offerKey, pickedVerticals, pickedCities, existingKeys)
  const cellByKey = useMemo(() => new Map(cells.map((cell) => [cell.key, cell])), [cells])

  const rows = useMemo(() => {
    return cells.filter((cell) => {
      if (offerFilter !== 'all' && cell.offerKey !== offerFilter) return false
      if (verticalFilter !== 'all' && cell.vertical !== verticalFilter) return false
      if (cityFilter !== 'all' && cell.city !== cityFilter) return false
      return true
    })
  }, [cells, offerFilter, verticalFilter, cityFilter])

  const verticalFilters = [...new Set(cells.map((c) => c.vertical).filter((v) => v !== TEST_CELL_EMPTY))]
  const cityFilters = [...new Set(cells.map((c) => c.city).filter((c) => c !== TEST_CELL_EMPTY))]

  function selectOffer(next: string) {
    setOfferKey(next)
    const offer = offers.find((o) => o.offer_key === next)
    setPickedVerticals(offer ? verticalsForOffer(offer) : [])
    setCloneId('')
  }

  function toggle(list: string[], value: string, setList: (next: string[]) => void) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  async function createSlots(verticals: string[], cities: string[]) {
    if (!offerKey || verticals.length === 0 || cities.length === 0) {
      setError('Pick an offer, at least one vertical, and at least one city.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/offers/cells', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          offer_key: offerKey,
          verticals,
          cities,
          testing_variable: testingVariable,
          clone_campaign_id: cloneId || null,
          sample_size_target: target.trim() ? Number(target) : null,
          hypothesis: hypothesis.trim() || null
        })
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; created?: unknown[] }
      if (!res.ok) {
        setError(json.error || 'create_failed')
        return
      }
      await listCampaigns({ force: true })
      await onCreated()
    } catch {
      setError('Could not create those cells.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="compass-panel space-y-5 p-5">
      <div>
        <div className="compass-section-label">Test plan</div>
        <p className="mt-1 text-sm text-neutral-500">
          One Instantly campaign per offer × vertical × city. Clone copy from a control so only the
          named variable changes. A campaign with no city tag is reused, not duplicated.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-xs">
          <span className="mb-1.5 block text-neutral-600">Offer</span>
          <select
            className="compass-input h-9 !py-1.5 bg-white"
            value={offerKey}
            onChange={(e) => selectOffer(e.target.value)}
          >
            {offers.map((offer) => (
              <option key={offer.offer_key} value={offer.offer_key}>
                {offer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1.5 block text-neutral-600">Variable under test</span>
          <select
            className="compass-input h-9 !py-1.5 bg-white"
            value={testingVariable}
            onChange={(e) => setTestingVariable(e.target.value)}
          >
            {TESTING_VARIABLES.map((item) => (
              <option key={item} value={item}>
                {testingVariableLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1.5 block text-neutral-600">Clone copy from</span>
          <select
            className="compass-input h-9 !py-1.5 bg-white"
            value={cloneId}
            onChange={(e) => setCloneId(e.target.value)}
          >
            <option value="">None. Empty sequence.</option>
            {cloneOptions.map((cell) => (
              <option key={cell.campaigns[0].id} value={cell.campaigns[0].id}>
                {cell.campaigns[0].name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1.5 block text-neutral-600">Target sends (optional)</span>
          <input
            className="compass-input h-9 !py-1.5 bg-white"
            inputMode="numeric"
            placeholder="Keep volume equal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
      </div>

      <div>
        <div className="mb-2 text-xs text-neutral-600">Verticals</div>
        {offerVerticals.length === 0 ? (
          <p className="text-xs text-neutral-500">Add verticals on the SKU lock first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {offerVerticals.map((vertical) => (
              <Chip
                key={vertical}
                on={pickedVerticals.includes(vertical)}
                onClick={() => toggle(pickedVerticals, vertical, setPickedVerticals)}
              >
                {prettyCampaignTag(vertical)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs text-neutral-600">Cities</div>
        <div className="flex flex-wrap gap-2">
          {CITY_PLAN_TAGS.map((city) => (
            <Chip
              key={city}
              on={pickedCities.includes(city)}
              onClick={() => toggle(pickedCities, city, setPickedCities)}
            >
              {prettyCampaignTag(city)}
            </Chip>
          ))}
        </div>
      </div>

      <label className="block text-xs">
        <span className="mb-1.5 block text-neutral-600">Hypothesis for new cells</span>
        <input
          className="compass-input h-9 !py-1.5"
          placeholder="Optional. Same line on every new cell."
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="compass-btn-primary"
          disabled={busy || missing.length === 0}
          aria-describedby={missing.length === 0 ? 'test-cell-creation-help' : undefined}
          onClick={() => void createSlots(pickedVerticals, pickedCities)}
        >
          {busy ? 'Creating…' : `Create ${missing.length} missing cell${missing.length === 1 ? '' : 's'}`}
        </button>
        {missing.length === 0 ? (
          <p id="test-cell-creation-help" className="text-sm text-neutral-500">
            {!offerKey ? 'Choose an offer to plan cells.' : pickedVerticals.length === 0 || pickedCities.length === 0
              ? 'Select at least one vertical and one city to create cells.'
              : 'Every selected vertical and city combination already has a campaign cell.'}
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      </div>

      {pickedVerticals.length > 0 && pickedCities.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-neutral-400 uppercase tracking-wider">
                <th className="py-2.5 pr-3 font-semibold">Vertical</th>
                {pickedCities.map((city) => (
                  <th key={city} className="py-2.5 px-2 font-semibold">
                    {prettyCampaignTag(city)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pickedVerticals.map((vertical) => (
                <tr key={vertical}>
                  <td className="py-2 pr-3 font-medium text-neutral-900">{prettyCampaignTag(vertical)}</td>
                  {pickedCities.map((city) => {
                    const key = testCellKey(offerKey, vertical, city)
                    const cell = cellByKey.get(key)
                    return (
                      <td key={key} className="py-2 px-2 align-top">
                        <GridCell
                          cell={cell}
                          label={cellCampaignName(city, vertical)}
                          busy={busy}
                          onCreate={() => void createSlots([vertical], [city])}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-stone-100 pt-4">
        <div>
          <div className="compass-section-label">Results</div>
          <p className="mt-1 text-xs text-neutral-500">Every tagged campaign. Flags mean the row is not comparable.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="compass-input h-8 !py-1 min-w-[8rem] px-3 text-xs"
            value={offerFilter}
            onChange={(e) => setOfferFilter(e.target.value)}
            aria-label="Filter offer"
          >
            <option value="all">All offers</option>
            {offers.map((offer) => (
              <option key={offer.offer_key} value={offer.offer_key}>
                {offer.name}
              </option>
            ))}
          </select>
          <select
            className="compass-input h-8 !py-1 min-w-[7rem] px-3 text-xs"
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            aria-label="Filter vertical"
          >
            <option value="all">All verticals</option>
            {verticalFilters.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            className="compass-input h-8 !py-1 min-w-[7rem] px-3 text-xs"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            aria-label="Filter city"
          >
            <option value="all">All cities</option>
            {cityFilters.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{cells.length === 0 ? 'No cells yet. Create missing cells above.' : 'No cells match these filters. Try another offer, vertical or city.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-neutral-400 uppercase tracking-wider">
                <th className="py-2.5 pr-3 font-semibold">Offer</th>
                <th className="py-2.5 px-3 font-semibold">Vertical</th>
                <th className="py-2.5 px-3 font-semibold">City</th>
                <th className="py-2.5 px-3 font-semibold">Variable</th>
                <th className="py-2.5 px-3 font-semibold text-right">Sent</th>
                <th className="py-2.5 px-3 font-semibold text-right">Target</th>
                <th className="py-2.5 px-3 font-semibold text-right">Positive</th>
                <th className="py-2.5 px-3 font-semibold text-right">Meetings</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pos %</th>
                <th className="py-2.5 pl-3 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-neutral-700">
              {rows.map((cell) => (
                <CellRow key={cell.key} cell={cell} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function GridCell({
  cell,
  label,
  busy,
  onCreate
}: {
  cell: OfferTestCell | undefined
  label: string
  busy: boolean
  onCreate: () => void
}) {
  if (!cell) {
    return (
      <button
        type="button"
        className="w-full rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-left text-neutral-400 hover:border-stone-300 hover:bg-white"
        disabled={busy}
        onClick={onCreate}
      >
        <div className="font-medium text-neutral-500">{label}</div>
        <div className="mt-0.5 text-[11px]">Empty</div>
      </button>
    )
  }
  const href = cell.campaigns[0] ? `/sales/outbound/editor/${cell.campaigns[0].id}` : null
  const inner = (
    <>
      <div className="font-medium text-neutral-800">{cell.campaigns[0]?.name || label}</div>
      <div className="mt-0.5 tabular-nums text-neutral-500">
        {formatCount(cell.sent)} sent · {cell.positive} pos
      </div>
    </>
  )
  const className = cn(
    'block w-full rounded-xl border border-stone-200 bg-white px-3 py-3 shadow-soft',
    cell.flags.length > 0 && 'border-amber-200 bg-amber-50/50'
  )
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }
  return <div className={className}>{inner}</div>
}

function CellRow({ cell }: { cell: OfferTestCell }) {
  const href = cell.campaigns[0] ? `/sales/outbound/editor/${cell.campaigns[0].id}` : null
  const flagged = cell.flags.length > 0
  return (
    <tr className={cn(flagged && 'bg-amber-50/40')}>
      <td className="py-3 pr-3 font-medium text-neutral-900">
        {href ? (
          <Link href={href} className="hover:underline">
            {cell.offerName}
          </Link>
        ) : (
          cell.offerName
        )}
      </td>
      <td className="py-3 px-3">{cell.vertical}</td>
      <td className="py-3 px-3">{cell.city}</td>
      <td className="py-3 px-3">{testingVariableLabel(cell.testingVariable)}</td>
      <td className="py-3 px-3 text-right tabular-nums">{formatCount(cell.sent)}</td>
      <td className="py-3 px-3 text-right tabular-nums">{formatCount(cell.sampleSizeTarget)}</td>
      <td className="py-3 px-3 text-right tabular-nums">{cell.positive}</td>
      <td className="py-3 px-3 text-right tabular-nums">{cell.meetings}</td>
      <td className="py-3 px-3 text-right tabular-nums font-semibold text-emerald-700">
        {cell.positiveRate == null ? '—' : `${cell.positiveRate}%`}
      </td>
      <td className="py-3 pl-3">
        {flagged ? (
          <div className="flex flex-wrap gap-1">
            {cell.flags.map((flag) => (
              <Badge key={flag} variant="warning" appearance="light" size="sm">
                {FLAG_LABEL[flag]}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
    </tr>
  )
}

export function OfferCellRows({ cells }: { cells: OfferTestCell[] }) {
  if (cells.length === 0) {
    return <p className="text-xs text-neutral-500">No tagged cells on this SKU yet. Plan them from the offers gallery.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-stone-200 text-neutral-400 uppercase tracking-wider">
            <th className="py-2.5 pr-3 font-semibold">Vertical</th>
            <th className="py-2.5 px-3 font-semibold">City</th>
            <th className="py-2.5 px-3 font-semibold">Variable</th>
            <th className="py-2.5 px-3 font-semibold text-right">Sent</th>
            <th className="py-2.5 px-3 font-semibold text-right">Positive</th>
            <th className="py-2.5 px-3 font-semibold text-right">Meetings</th>
            <th className="py-2.5 pl-3 font-semibold text-right">Pos %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {cells.map((cell) => {
            const href = cell.campaigns[0] ? `/sales/outbound/editor/${cell.campaigns[0].id}` : '/sales/offers'
            return (
              <tr key={cell.key} className="text-neutral-700">
                <td className="py-2.5 pr-3 font-medium text-neutral-900">
                  <Link href={href} className="hover:underline">
                    {cell.vertical}
                  </Link>
                </td>
                <td className="py-2.5 px-3">{cell.city}</td>
                <td className="py-2.5 px-3">{testingVariableLabel(cell.testingVariable)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{formatCount(cell.sent)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{cell.positive}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{cell.meetings}</td>
                <td className="py-2.5 pl-3 text-right tabular-nums">
                  {cell.positiveRate == null ? '—' : `${cell.positiveRate}%`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
