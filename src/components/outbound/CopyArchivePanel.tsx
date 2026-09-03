'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive,
  Clock3,
  Copy,
  Layers,
  Save,
  Search,
  Sparkles
} from 'lucide-react'
import {
  formatRelativeUsedAt,
  sequenceEmailBodyText,
  VERTICAL_TAG_HINTS,
  type CopyArchiveEntry,
  type CopyArchiveSortKey,
  type OutboundOffer
} from '@/lib/outbound-copy'
import {
  forkCopyArchiveIntoSequence,
  listCopyArchive,
    overlayArchiveInstantlyPerformance,
    saveCopyArchiveEntry,
    sortCopyArchiveEntries
} from '@/lib/outbound-copy-archive'
import {
  ensureOutboundLibrarySeeded,
  listLibraryItems
} from '@/lib/outbound-library-client'
import { listCampaigns } from '@/lib/campaigns-client'
import {
  enrichOutboundCampaignFactors,
  rollupOutboundByFactor,
  type OutboundFactorKey
} from '@/lib/outbound-factor-performance'
import type { OutboundBoardCampaign } from '@/lib/instantly'
import { computeOutcomeMetrics } from '@/lib/outbound-outcome-metrics'
import { useCachedJson } from '@/lib/use-cached-json'
import { cn } from '@/lib/utils'
import type { CompassCampaign } from '@/lib/campaigns'
import type { OutboundSequence } from '@/lib/outbound-copy'

function Select({
  value,
  onChange,
  options,
  label
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  label: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-neutral-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[12px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function TagChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-xl border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
      {children}
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-neutral-900">
        {value}
      </div>
    </div>
  )
}

function ComponentRow({ entry }: { entry: CopyArchiveEntry }) {
  const bits = [
    entry.components.offer_label || entry.components.offer_key,
    entry.components.structure_label,
    entry.opener_mode,
    entry.components.cta_preview ? 'CTA' : null
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
      <Layers className="size-3 shrink-0 text-neutral-400" />
      <span className="truncate">{bits.join(' · ') || 'No components tagged'}</span>
    </div>
  )
}

function ArchiveCard({
  entry,
  selected,
  onSelect
}: {
  entry: CopyArchiveEntry
  selected: boolean
  onSelect: () => void
}) {
  const perf = entry.performance
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border bg-white p-4 text-left shadow-soft transition',
        selected
          ? 'border-[#e85d2a]/40 ring-2 ring-[#e85d2a]/10'
          : 'border-stone-200/80 hover:border-stone-300'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-neutral-900">{entry.name}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {entry.vertical_tags.length ? (
              entry.vertical_tags.map((t) => <TagChip key={t}>{t}</TagChip>)
            ) : (
              <TagChip>unscoped</TagChip>
            )}
            {entry.location_tags.slice(0, 2).map((t) => (
              <TagChip key={t}>{t}</TagChip>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[15px] font-semibold tabular-nums text-[#c2410c]">
            {perf.sendCount && perf.positiveReplies
              ? `${Math.round((1000 * perf.positiveReplies) / Math.max(1, perf.sendCount)) / 10}%`
              : '—'}
          </div>
          <div className="text-[10px] font-semibold text-neutral-400">
            Positive / sent
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-stone-100 pt-3">
        <Metric label="Sent" value={perf.sendCount ? perf.sendCount.toLocaleString() : '—'} />
        <Metric
          label="Positive"
          value={perf.positiveReplies ? perf.positiveReplies.toLocaleString() : '—'}
        />
        <Metric label="Meetings" value={perf.meetings ? perf.meetings.toLocaleString() : '—'} />
      </div>

      <div className="mt-3">
        <ComponentRow entry={entry} />
      </div>
    </button>
  )
}

function StepPreview({ entry }: { entry: CopyArchiveEntry }) {
  return (
    <div className="space-y-4">
      {entry.sequence.steps.map((step, index) => (
        <div
          key={step.id}
          className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-neutral-400">
              {step.label}
              {index > 0 && step.delay_days ? ` · +${step.delay_days}d` : ''}
            </span>
            <span className="flex size-6 items-center justify-center rounded-lg bg-stone-100 text-[11px] font-semibold text-neutral-500">
              {index + 1}
            </span>
          </div>
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2 text-[13px] font-medium text-neutral-800">
            {step.subject.trim() || (
              <span className="font-normal text-neutral-400">No subject</span>
            )}
          </div>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-neutral-700">
            {sequenceEmailBodyText(entry.sequence, index) || 'Empty body'}
          </pre>
        </div>
      ))}
    </div>
  )
}

export function CopyArchivePanel({
  campaign,
  sequence,
  onForkSequence,
  onInsertIntoStep,
  onSaved
}: {
  campaign: CompassCampaign
  sequence: OutboundSequence
  onForkSequence: (next: OutboundSequence, meta?: Partial<CompassCampaign>) => void
  onInsertIntoStep: (subject: string, body: string) => void
  onSaved?: () => void
}) {
  const [offers, setOffers] = useState<OutboundOffer[]>([])
  const [q, setQ] = useState('')
  const [vertical, setVertical] = useState('all')
  const [offer, setOffer] = useState('all')
  const [sort, setSort] = useState<CopyArchiveSortKey>('positive')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [pipeline, setPipeline] = useState<CompassCampaign[]>([])
  const [pieceFactor, setPieceFactor] = useState<OutboundFactorKey>('cta')

  const board = useCachedJson<{ live?: OutboundBoardCampaign[]; history?: OutboundBoardCampaign[] }>(
    '/api/instantly/outbound-campaigns',
    '/api/instantly/outbound-campaigns',
    { staleMs: 60_000 }
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await ensureOutboundLibrarySeeded()
        const [cams, offerRows] = await Promise.all([
          listCampaigns().catch(() => [] as CompassCampaign[]),
          listLibraryItems<OutboundOffer>('offers')
        ])
        if (!cancelled) {
          setPipeline(cams)
          setOffers(offerRows)
        }
      } catch {
        if (!cancelled) setOffers([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const entries = useMemo(() => {
    void tick
    const listed = listCopyArchive({
      q: q.trim() || undefined,
      vertical: vertical === 'all' ? undefined : vertical,
      offer_key: offer === 'all' ? undefined : offer,
      sort,
      pipelineCampaigns: pipeline
    })
    const boardRows = [...(board.data?.live ?? []), ...(board.data?.history ?? [])]
    const overlaid = overlayArchiveInstantlyPerformance(listed, pipeline, boardRows)
    return sortCopyArchiveEntries(overlaid, sort)
  }, [q, vertical, offer, sort, tick, pipeline, board.data])

  const selected = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null

  const pieceRows = useMemo(() => {
    const offerNames = Object.fromEntries(offers.map((o) => [o.offer_key, o.name]))
    const boardRows = [...(board.data?.live ?? []), ...(board.data?.history ?? [])]
    const enriched = boardRows.map((c) => enrichOutboundCampaignFactors(c, pipeline, offerNames))
    return rollupOutboundByFactor(enriched, pieceFactor).slice(0, 8)
  }, [board.data, pipeline, offers, pieceFactor])

  function refresh() {
    setTick((n) => n + 1)
  }

  function handleFork(entry: CopyArchiveEntry) {
    const forked = forkCopyArchiveIntoSequence(entry.id)
    if (!forked) return
    const ok = window.confirm(`Fork “${entry.name}” into this campaign draft?`)
    if (!ok) return
    onForkSequence(forked, {
      offer_key: entry.offer_key ?? campaign.offer_key,
      structure_id: entry.structure_id,
      opener_mode: entry.opener_mode ?? campaign.opener_mode,
      vertical_tags: Array.from(
        new Set([...(campaign.vertical_tags ?? []), ...entry.vertical_tags])
      ),
      location_tags: Array.from(
        new Set([...(campaign.location_tags ?? []), ...entry.location_tags])
      ),
      cold_expression:
        entry.sequence.steps[0]?.slots.find((s) => s.key === 'cold_expression')?.body ??
        campaign.cold_expression,
      copy_status: 'draft'
    })
    refresh()
  }

  function handleInsert(entry: CopyArchiveEntry) {
    const subject = entry.sequence.steps[0]?.subject ?? ''
    const body = sequenceEmailBodyText(entry.sequence, 0)
    onInsertIntoStep(subject, body)
    forkCopyArchiveIntoSequence(entry.id)
    refresh()
  }

  function handleSaveCurrent() {
    const defaultName = campaign.name?.trim() || 'Untitled copy'
    const name = window.prompt('Save current sequence to Archive as', defaultName)
    if (!name?.trim()) return
    const saved = saveCopyArchiveEntry({
      name: name.trim(),
      source: 'saved',
      source_id: campaign.id === 'unbound-draft' ? null : campaign.id,
      vertical_tags: campaign.vertical_tags ?? [],
      location_tags: campaign.location_tags ?? [],
      offer_key: campaign.offer_key ?? sequence.offer_key ?? null,
      structure_id: sequence.structure_id,
      opener_mode: campaign.opener_mode ?? null,
      sequence,
      notes: campaign.cold_expression || null,
      last_used_at: new Date().toISOString(),
      first_used_at: new Date().toISOString()
    })
    setSelectedId(saved.id)
    refresh()
    onSaved?.()
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:px-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Archive className="size-4 text-[#e85d2a]" />
              <h2 className="text-[15px] font-semibold text-neutral-900">Copy archive</h2>
            </div>
            <p className="mt-1 max-w-xl text-[13px] text-neutral-500">
              Saved cold emails and sequences — filter by vertical, scan performance, reuse into
              this draft.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSaveCurrent}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft transition hover:border-[#e85d2a]/35 hover:text-[#c2410c]"
          >
            <Save className="size-3.5" />
            Save current
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Search
            </span>
            <span className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, subject, expression…"
                className="w-full rounded-xl border border-stone-200 bg-white py-1.5 pl-8 pr-3 text-[12px]"
              />
            </span>
          </label>
          <Select
            label="Vertical"
            value={vertical}
            onChange={setVertical}
            options={[
              { value: 'all', label: 'All verticals' },
              ...VERTICAL_TAG_HINTS.map((t) => ({ value: t, label: t })),
              { value: 'vic', label: 'vic' }
            ]}
          />
          <Select
            label="Offer"
            value={offer}
            onChange={setOffer}
            options={[
              { value: 'all', label: 'All offers' },
              ...offers.map((o) => ({ value: o.offer_key, label: o.name }))
            ]}
          />
          <Select
            label="Sort"
            value={sort}
            onChange={(v) => setSort(v as CopyArchiveSortKey)}
            options={[
              { value: 'positive', label: 'Positive rate' },
              { value: 'reply', label: 'Reply rate' },
              { value: 'last_used', label: 'Last used' },
              { value: 'sent', label: 'Sent volume' },
              { value: 'name', label: 'Name' }
            ]}
          />
        </div>

        {pieceRows.length ? (
          <div className="mb-5 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-neutral-800">Named pieces</p>
              <select
                value={pieceFactor}
                onChange={(e) => setPieceFactor(e.target.value as OutboundFactorKey)}
                className="rounded-xl border border-stone-200 bg-white px-2 py-1 text-[11px]"
              >
                <option value="cta">CTA</option>
                <option value="expression">Expression</option>
                <option value="structure">Structure</option>
                <option value="offer">Offer</option>
                <option value="audience">Audience</option>
              </select>
            </div>
            <p className="mb-2 text-[11px] text-pretty text-neutral-500">
              Instantly volume plus Compass positives. Ignore opens. One factor at a time.
            </p>
            <ul className="divide-y divide-stone-100">
              {pieceRows.map((row) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-2 py-2 text-[12px]"
                >
                  <span className="min-w-0 truncate font-medium text-neutral-800">{row.key}</span>
                  <span className="shrink-0 tabular-nums text-neutral-500">
                    {row.delivered} del · {row.positiveRate}% pos · {row.meetingsPer100} mtg/100
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-5 py-12 text-center shadow-soft">
            <Sparkles className="mx-auto size-5 text-neutral-300" />
            <p className="mt-3 text-[14px] font-semibold text-neutral-800">No archived copy yet</p>
            <p className="mt-1 text-[13px] text-neutral-500">
              Save the current sequence, or fork a template from the Editor library.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {entries.map((entry) => (
              <ArchiveCard
                key={entry.id}
                entry={entry}
                selected={selected?.id === entry.id}
                onSelect={() => setSelectedId(entry.id)}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t border-stone-200/80 bg-white lg:w-[420px] lg:border-l lg:border-t-0">
        {selected ? (
          <>
            <div className="shrink-0 border-b border-stone-100 px-5 py-4">
              <div className="text-[15px] font-semibold text-neutral-900">{selected.name}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selected.vertical_tags.map((t) => (
                  <TagChip key={t}>{t}</TagChip>
                ))}
                {selected.location_tags.map((t) => (
                  <TagChip key={t}>{t}</TagChip>
                ))}
                <TagChip>{selected.source}</TagChip>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-stone-200/70 bg-stone-50/50 p-3">
                <Metric
                  label="Positive / delivered"
                  value={
                    selected.performance.sendCount
                      ? `${computeOutcomeMetrics(
                          { sent: selected.performance.sendCount, bounced: 0 },
                          {
                            positive: selected.performance.positiveReplies,
                            meetings: selected.performance.meetings
                          }
                        ).positiveRate}%`
                      : '—'
                  }
                />
                <Metric
                  label="Sent"
                  value={
                    selected.performance.sendCount
                      ? selected.performance.sendCount.toLocaleString()
                      : '—'
                  }
                />
                <Metric
                  label="Meetings / 100"
                  value={
                    selected.performance.sendCount
                      ? String(
                          computeOutcomeMetrics(
                            { sent: selected.performance.sendCount, bounced: 0 },
                            {
                              positive: selected.performance.positiveReplies,
                              meetings: selected.performance.meetings
                            }
                          ).meetingsPer100
                        )
                      : '—'
                  }
                />
                <Metric
                  label="Last used"
                  value={formatRelativeUsedAt(selected.last_used_at)}
                />
              </div>
              <div className="mt-3 space-y-1.5 text-[12px] text-neutral-600">
                <div className="flex items-center gap-1.5">
                  <Layers className="size-3.5 text-neutral-400" />
                  <span>
                    {selected.components.structure_label}
                    {selected.components.offer_label
                      ? ` · ${selected.components.offer_label}`
                      : ''}
                    {selected.opener_mode ? ` · ${selected.opener_mode}` : ''}
                  </span>
                </div>
                {selected.components.slot_keys.length ? (
                  <div className="flex flex-wrap gap-1 pl-5">
                    {selected.components.slot_keys.map((k) => (
                      <TagChip key={k}>{k.replace(/_/g, ' ')}</TagChip>
                    ))}
                  </div>
                ) : null}
                {selected.notes ? (
                  <p className="pl-5 text-neutral-500">{selected.notes}</p>
                ) : null}
                <div className="flex items-center gap-1.5 pl-5 text-neutral-400">
                  <Clock3 className="size-3" />
                  {selected.components.step_count} step
                  {selected.components.step_count === 1 ? '' : 's'}
                  {selected.first_used_at
                    ? ` · first used ${selected.first_used_at.slice(0, 10)}`
                    : ''}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleFork(selected)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#e85d2a] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-soft"
                >
                  <Copy className="size-3.5" />
                  Fork sequence
                </button>
                <button
                  type="button"
                  onClick={() => handleInsert(selected)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-neutral-800 shadow-soft"
                >
                  Use in step
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-3 text-[11px] font-semibold text-neutral-400">
                Preview
              </div>
              <StepPreview entry={selected} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 py-16 text-center">
            <div>
              <Archive className="mx-auto size-5 text-neutral-300" />
              <p className="mt-3 text-[13px] text-neutral-500">
                Select a card to preview copy and components.
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
