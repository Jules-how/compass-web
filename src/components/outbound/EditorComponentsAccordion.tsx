'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  FileText,
  Layers,
  LayoutTemplate,
  MessageSquareText,
  MousePointerClick,
  Package,
  Sparkles,
  Type
} from 'lucide-react'
import {
  type LibraryDragPayload,
  parseLibraryDrag
} from '@/components/outbound/LibraryPane'
import { LibraryItemDetailSheet } from '@/components/outbound/LibraryItemDetailSheet'
import { offerKeysForPicker } from '@/lib/lead-icp'
import {
  LOCATION_TAG_HINTS,
  OUTBOUND_CTA_TYPES,
  VERTICAL_TAG_HINTS,
  normalizeProvenance,
  provenanceBadgeLabel,
  type OutboundProvenance,
  type OutboundProvenanceFields
} from '@/lib/outbound-copy'
import type {
  OutboundCta,
  OutboundExpression,
  OutboundOffer,
  OutboundOpener,
  OutboundStructure,
  OutboundSubject,
  OutboundTemplate
} from '@/lib/outbound-copy'
import {
  applyLibraryBench,
  isDoctrineOpener,
  matchesCampaignLibrary,
  passCampaignScope,
  sortLibraryRows
} from '@/lib/outbound-library-filter'
import {
  ensureOutboundLibrarySeeded,
  listLibraryBundle,
  type LibraryKind
} from '@/lib/outbound-library-client'
import { cn } from '@/lib/utils'

export { parseLibraryDrag }
export type { LibraryDragPayload }

export type CampaignLibraryContext = {
  offer_key?: string | null
  vertical_tags?: string[]
  location_tags?: string[]
  structure_id?: string | null
}

type LibraryBundle = {
  offers: OutboundOffer[]
  expressions: OutboundExpression[]
  structures: OutboundStructure[]
  ctas: OutboundCta[]
  subjects: OutboundSubject[]
  openers: OutboundOpener[]
  templates: OutboundTemplate[]
}

type SectionKey = keyof LibraryBundle

const SECTIONS: {
  key: SectionKey
  title: string
  subtitle: string
  icon: LucideIcon
  textColor: string
  bgColor: string
}[] = [
  {
    key: 'structures',
    title: 'Structures',
    subtitle: 'Slot-order skeletons',
    icon: Layers,
    textColor: 'text-stone-600',
    bgColor: 'bg-stone-500/10'
  },
  {
    key: 'subjects',
    title: 'Subjects',
    subtitle: 'Subject patterns',
    icon: Type,
    textColor: 'text-sky-700',
    bgColor: 'bg-sky-500/10'
  },
  {
    key: 'openers',
    title: 'Openers',
    subtitle: 'Insertable first lines',
    icon: Sparkles,
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-500/10'
  },
  {
    key: 'expressions',
    title: 'Expressions',
    subtitle: 'Cold X-in-Y-or-Z lines',
    icon: MessageSquareText,
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-500/10'
  },
  {
    key: 'ctas',
    title: 'CTAs',
    subtitle: 'One ask per email',
    icon: MousePointerClick,
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-500/10'
  },
  {
    key: 'templates',
    title: 'Templates',
    subtitle: 'Multi-step sequence forks',
    icon: LayoutTemplate,
    textColor: 'text-rose-700',
    bgColor: 'bg-rose-500/10'
  },
  {
    key: 'offers',
    title: 'Offers',
    subtitle: 'Pack offer keys + summaries',
    icon: Package,
    textColor: 'text-[#e85d2a]',
    bgColor: 'bg-[#e85d2a]/10'
  }
]

const EMPTY_BUNDLE: LibraryBundle = {
  offers: [],
  expressions: [],
  structures: [],
  ctas: [],
  subjects: [],
  openers: [],
  templates: []
}

function uniqueTags(values: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const tag = (value || '').trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

function haystack(...parts: Array<string | null | undefined | string[]>): string {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-2 py-0.5 text-[11px] font-medium transition',
        active
          ? 'border-[#e85d2a]/40 bg-[#e85d2a]/10 text-[#c2410c]'
          : 'border-stone-200/80 bg-white text-neutral-600 hover:bg-stone-50'
      )}
    >
      {label}
    </button>
  )
}

function ApplicabilityChips({ tags, accent }: { tags: string[]; accent?: boolean }) {
  if (tags.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            'rounded-lg border px-1.5 py-0.5 text-[10px] font-medium',
            accent
              ? 'border-[#e85d2a]/30 bg-[#e85d2a]/10 text-[#c2410c]'
              : 'border-stone-200/80 bg-white text-neutral-500'
          )}
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

function LibraryRow({
  title,
  body,
  chips,
  matchCampaign,
  provenance,
  payload,
  insertable = true,
  onOpen,
  onInsert
}: {
  title: string
  body?: string
  chips: string[]
  matchCampaign?: boolean
  provenance?: Partial<OutboundProvenanceFields>
  payload: LibraryDragPayload
  insertable?: boolean
  onOpen: () => void
  onInsert: (payload: LibraryDragPayload) => void
}) {
  const draggedRef = useRef(false)
  const provenanceLabel = provenance ? provenanceBadgeLabel(provenance) : null
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={insertable}
      onDragStart={
        insertable
          ? (e) => {
              draggedRef.current = true
              const raw = JSON.stringify(payload)
              e.dataTransfer.setData('application/x-outbound-library', raw)
              e.dataTransfer.setData('text/plain', raw)
              e.dataTransfer.effectAllowed = 'copy'
            }
          : undefined
      }
      onDragEnd={() => {
        window.setTimeout(() => {
          draggedRef.current = false
        }, 0)
      }}
      onClick={() => {
        if (draggedRef.current) return
        onOpen()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        'flex h-full w-full cursor-pointer flex-col rounded-2xl border p-3.5 text-left shadow-soft transition active:cursor-grabbing',
        matchCampaign
          ? 'border-[#e85d2a]/35 bg-[#e85d2a]/5 hover:border-[#e85d2a]/50 hover:bg-white'
          : 'border-stone-200/80 bg-white hover:border-stone-300 hover:bg-stone-50/80'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[14px] font-semibold leading-snug text-neutral-900">{title}</div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {matchCampaign ? (
            <span className="rounded-lg bg-[#e85d2a]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#c2410c]">
              Fits campaign
            </span>
          ) : null}
          {provenanceLabel ? (
            <span
              className={cn(
                'rounded-lg px-1.5 py-0.5 text-[10px] font-semibold',
                provenanceLabel.startsWith('Source')
                  ? 'bg-stone-900/90 text-white'
                  : 'bg-stone-100 text-neutral-600'
              )}
            >
              {provenanceLabel}
            </span>
          ) : null}
        </div>
      </div>
      <ApplicabilityChips tags={chips} accent={matchCampaign} />
      {body ? (
        <p className="mt-2 flex-1 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-600 line-clamp-6">
          {body}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpen()
          }}
          className="rounded-lg border border-[#e85d2a]/30 bg-[#e85d2a]/10 px-2 py-0.5 text-[11px] font-medium text-[#c2410c] hover:bg-[#e85d2a]/15"
        >
          Open
        </button>
        {insertable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onInsert(payload)
            }}
            className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:border-stone-300 hover:bg-stone-50"
          >
            Use
          </button>
        ) : (
          <span className="rounded-lg px-2 py-0.5 text-[11px] text-neutral-400">Playbook</span>
        )}
      </div>
    </div>
  )
}

export function EditorComponentsAccordion({
  onInsert,
  className,
  campaignContext
}: {
  onInsert: (payload: LibraryDragPayload) => void
  className?: string
  campaignContext?: CampaignLibraryContext
}) {
  const [bundle, setBundle] = useState<LibraryBundle>(EMPTY_BUNDLE)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [offerFilter, setOfferFilter] = useState<string>('')
  const [verticalFilter, setVerticalFilter] = useState<string>('')
  const [locationFilter, setLocationFilter] = useState<string>('')
  const [ctaTypeFilter, setCtaTypeFilter] = useState<string>('')
  const [campaignOnly, setCampaignOnly] = useState(false)
  const [provenanceFilter, setProvenanceFilter] = useState<'all' | OutboundProvenance>('all')
  const [benchOn, setBenchOn] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionKey>('structures')
  const [detail, setDetail] = useState<{ kind: LibraryKind; id: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const campaignDefaultsApplied = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        // Seed check is cheap once rows exist; session cache skips repeat POSTs.
        await ensureOutboundLibrarySeeded()
        const next = await listLibraryBundle<{
          offers: OutboundOffer[]
          expressions: OutboundExpression[]
          structures: OutboundStructure[]
          ctas: OutboundCta[]
          subjects: OutboundSubject[]
          openers: OutboundOpener[]
          templates: OutboundTemplate[]
        }>()
        if (cancelled) return
        setLoadError(null)
        setBundle(next)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load library')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  useEffect(() => {
    if (campaignDefaultsApplied.current) return
    if (!campaignContext?.offer_key) return
    campaignDefaultsApplied.current = true
    setCampaignOnly(true)
    setProvenanceFilter('yours')
  }, [campaignContext?.offer_key])

  const ctx: CampaignLibraryContext = campaignContext ?? {}
  const query = q.trim().toLowerCase()

  const offerOptions = useMemo(() => {
    const fromRows = bundle.offers.map((row) => row.offer_key)
    return uniqueTags([...offerKeysForPicker(ctx.offer_key), ...fromRows])
  }, [bundle.offers, ctx.offer_key])

  const verticalOptions = useMemo(() => {
    const fromRows = [
      ...bundle.offers,
      ...bundle.expressions,
      ...bundle.ctas,
      ...bundle.subjects,
      ...bundle.openers,
      ...bundle.templates
    ].flatMap((row) => row.vertical_tags ?? [])
    return uniqueTags([...VERTICAL_TAG_HINTS, ...fromRows, ...(ctx.vertical_tags ?? [])])
  }, [bundle, ctx.vertical_tags])

  const locationOptions = useMemo(() => {
    const fromRows = [
      ...bundle.offers,
      ...bundle.expressions,
      ...bundle.ctas,
      ...bundle.templates
    ].flatMap((row) => ('location_tags' in row ? row.location_tags ?? [] : []))
    return uniqueTags([...LOCATION_TAG_HINTS, ...fromRows, ...(ctx.location_tags ?? [])])
  }, [bundle, ctx.location_tags])

  const filtered = useMemo(() => {
    type Scoped = {
      offer_key?: string | null
      vertical_tags?: string[]
      location_tags?: string[]
      structure_id?: string | null
      provenance?: OutboundProvenance | string | null
    }

    function passProvenance(row: Scoped, kind?: string) {
      if (kind === 'structures') return true
      if (provenanceFilter === 'all') return true
      return normalizeProvenance(row.provenance) === provenanceFilter
    }

    function passScope(row: Scoped, kind: string, opts?: { requireOffer?: boolean }) {
      if (!passProvenance(row, kind)) return false
      if (opts?.requireOffer && offerFilter && row.offer_key !== offerFilter) return false
      if (!opts?.requireOffer && offerFilter && row.offer_key && row.offer_key !== offerFilter) {
        return false
      }
      if (verticalFilter && (row.vertical_tags ?? []).length > 0 && !(row.vertical_tags ?? []).includes(verticalFilter)) {
        return false
      }
      if (locationFilter && (row.location_tags ?? []).length > 0 && !(row.location_tags ?? []).includes(locationFilter)) {
        return false
      }
      return passCampaignScope(row, ctx, campaignOnly, kind)
    }

    const sortRows = <T extends Scoped>(rows: T[], kind: string) => sortLibraryRows(rows, ctx, kind)

    return {
      offers: sortRows(
        bundle.offers.filter(
          (row) =>
            passScope(row, 'offers', { requireOffer: true }) &&
            (!query ||
              haystack(row.name, row.offer_key, row.pack_summary, row.vertical_tags, row.location_tags).includes(
                query
              ))
        ),
        'offers'
      ),
      expressions: sortRows(
        bundle.expressions.filter(
          (row) =>
            passScope(row, 'expressions', { requireOffer: true }) &&
            (!query ||
              haystack(
                row.label,
                row.offer_key,
                row.status,
                row.body,
                row.vertical_tags,
                row.location_tags
              ).includes(query))
        ),
        'expressions'
      ),
      structures: sortRows(
        bundle.structures.filter(
          (row) =>
            passScope(row, 'structures') &&
            (!query || haystack(row.name, row.structure_id, row.description).includes(query))
        ),
        'structures'
      ),
      ctas: sortRows(
        bundle.ctas.filter(
          (row) =>
            (!ctaTypeFilter || row.cta_type === ctaTypeFilter) &&
            passScope(row, 'ctas') &&
            (!query ||
              haystack(row.label, row.cta_type, row.body, row.vertical_tags, row.location_tags).includes(
                query
              ))
        ),
        'ctas'
      ),
      subjects: sortRows(
        bundle.subjects.filter(
          (row) =>
            passScope(row, 'subjects') &&
            (!query || haystack(row.label, row.pattern, row.notes, row.vertical_tags).includes(query))
        ),
        'subjects'
      ),
      openers: sortRows(
        bundle.openers.filter(
          (row) =>
            passScope(row, 'openers') &&
            (!query ||
              haystack(row.label, row.opener_mode, row.body, row.notes, row.vertical_tags).includes(query))
        ),
        'openers'
      ),
      templates: sortRows(
        bundle.templates.filter(
          (row) =>
            passScope(row, 'templates') &&
            (!query ||
              haystack(row.name, row.offer_key, row.structure_id, row.vertical_tags, row.location_tags).includes(
                query
              ))
        ),
        'templates'
      )
    }
  }, [
    bundle,
    campaignOnly,
    ctaTypeFilter,
    ctx,
    locationFilter,
    offerFilter,
    provenanceFilter,
    query,
    verticalFilter
  ])

  const activeFilterCount = [offerFilter, verticalFilter, locationFilter, ctaTypeFilter, q.trim()].filter(
    Boolean
  ).length

  function clearFilters() {
    setQ('')
    setOfferFilter('')
    setVerticalFilter('')
    setLocationFilter('')
    setCtaTypeFilter('')
    setCampaignOnly(Boolean(ctx.offer_key))
    setProvenanceFilter(ctx.offer_key ? 'yours' : 'all')
    setBenchOn(true)
  }

  const benchActive = campaignOnly && provenanceFilter === 'yours' && benchOn
  const visible = {
    ...filtered,
    expressions: applyLibraryBench('expressions', filtered.expressions, benchActive),
    ctas: applyLibraryBench('ctas', filtered.ctas, benchActive),
    subjects: applyLibraryBench('subjects', filtered.subjects, benchActive),
    openers: applyLibraryBench('openers', filtered.openers, benchActive)
  }

  function openDetail(kind: LibraryKind, id: string) {
    setDetail({ kind, id })
  }

  function renderRows(key: SectionKey) {
    if (key === 'offers') {
      return visible.offers.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.name}
          body={row.pack_summary || row.positioning_line || undefined}
          chips={uniqueTags([row.offer_key, ...(row.vertical_tags ?? []), ...(row.location_tags ?? [])])}
          matchCampaign={matchesCampaignLibrary(row, ctx)}
          provenance={row}
          payload={{ kind: 'offer', id: row.id, offer_key: row.offer_key, name: row.name }}
          onOpen={() => openDetail('offers', row.id)}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'expressions') {
      return visible.expressions.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.body}
          chips={uniqueTags([
            row.offer_key ?? 'pattern',
            row.status,
            ...(row.vertical_tags ?? []),
            ...(row.location_tags ?? [])
          ])}
          matchCampaign={matchesCampaignLibrary(row, ctx)}
          provenance={row}
          payload={{
            kind: 'expression',
            id: row.id,
            offer_key: row.offer_key,
            body: row.body,
            label: row.label
          }}
          onOpen={() => openDetail('expressions', row.id)}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'structures') {
      return visible.structures.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.name}
          body={row.description ?? undefined}
          chips={uniqueTags([row.structure_id])}
          matchCampaign={matchesCampaignLibrary(row, ctx)}
          provenance={row}
          payload={{
            kind: 'structure',
            id: row.id,
            structure_id: row.structure_id,
            name: row.name
          }}
          onOpen={() => openDetail('structures', row.id)}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'ctas') {
      return visible.ctas.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.body}
          chips={uniqueTags([
            row.cta_type,
            ...(row.vertical_tags ?? []),
            ...(row.location_tags ?? [])
          ])}
          matchCampaign={matchesCampaignLibrary(row, ctx)}
          provenance={row}
          payload={{
            kind: 'cta',
            id: row.id,
            body: row.body,
            label: row.label,
            cta_type: row.cta_type
          }}
          onOpen={() => openDetail('ctas', row.id)}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'subjects') {
      return visible.subjects.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.pattern}
          chips={uniqueTags([...(row.vertical_tags ?? [])])}
          matchCampaign={matchesCampaignLibrary(row, ctx)}
          provenance={row}
          payload={{
            kind: 'subject',
            id: row.id,
            pattern: row.pattern,
            label: row.label
          }}
          onOpen={() => openDetail('subjects', row.id)}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'openers') {
      return visible.openers.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.body}
          chips={uniqueTags([row.opener_mode, ...(row.vertical_tags ?? [])])}
          matchCampaign={matchesCampaignLibrary(row, ctx)}
          provenance={row}
          payload={{
            kind: 'opener',
            id: row.id,
            body: row.body,
            label: row.label,
            opener_mode: row.opener_mode
          }}
          insertable={!isDoctrineOpener(row)}
          onOpen={() => openDetail('openers', row.id)}
          onInsert={onInsert}
        />
      ))
    }
    return visible.templates.map((row) => (
      <LibraryRow
        key={row.id}
        title={row.name}
        body={undefined}
        chips={uniqueTags([
          row.structure_id,
          row.offer_key,
          ...(row.vertical_tags ?? []),
          ...(row.location_tags ?? [])
        ])}
        matchCampaign={matchesCampaignLibrary(row, ctx)}
        provenance={row}
        payload={{ kind: 'template', id: row.id, name: row.name }}
        onOpen={() => openDetail('templates', row.id)}
        onInsert={onInsert}
      />
    ))
  }

  const activeMeta = SECTIONS.find((s) => s.key === activeSection) ?? SECTIONS[0]
  const activeRows = renderRows(activeSection)
  const libraryEmpty =
    bundle.offers.length +
      bundle.expressions.length +
      bundle.structures.length +
      bundle.ctas.length +
      bundle.subjects.length +
      bundle.openers.length +
      bundle.templates.length ===
    0

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-2 border-b border-stone-100 px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Components</h2>
          <p className="text-[12px] text-neutral-500">
            Yours is sendable. Source is playbooks. Default is this campaign + Yours.
          </p>
        </div>
        {loadError ? <p className="text-[11px] text-red-600">{loadError}</p> : null}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search components…"
          className="w-full rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-1.5 text-[12px] outline-none focus:border-[#e85d2a]/40"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-xl border border-stone-200 bg-white p-0.5">
            {(
              [
                ['all', 'Playbooks'],
                ['source', 'Source'],
                ['yours', 'Yours']
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setProvenanceFilter(value)}
                className={cn(
                  'rounded-[10px] px-2 py-0.5 text-[11px] font-medium transition',
                  provenanceFilter === value
                    ? 'bg-stone-900 text-white'
                    : 'text-neutral-600 hover:bg-stone-50'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <FilterChip
            label={ctx.offer_key ? 'This campaign' : 'Campaign match'}
            active={campaignOnly}
            onClick={() => setCampaignOnly((v) => !v)}
          />
          {campaignOnly && provenanceFilter === 'yours' ? (
            <FilterChip label="Bench" active={benchOn} onClick={() => setBenchOn((v) => !v)} />
          ) : null}
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              'rounded-lg border px-2 py-0.5 text-[11px] font-medium transition',
              filtersOpen || offerFilter || verticalFilter || locationFilter || ctaTypeFilter
                ? 'border-[#e85d2a]/35 bg-[#e85d2a]/10 text-[#c2410c]'
                : 'border-stone-200 bg-white text-neutral-600 hover:border-stone-300'
            )}
          >
            {filtersOpen ? 'Hide filters' : 'More filters'}
            {(offerFilter || verticalFilter || locationFilter || ctaTypeFilter) && !filtersOpen
              ? ` · ${[offerFilter, verticalFilter, locationFilter, ctaTypeFilter].filter(Boolean).length}`
              : ''}
          </button>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-medium text-[#c2410c] hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {filtersOpen ? (
          <div className="space-y-2 pt-0.5">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Offer</p>
              <div className="flex flex-wrap gap-1.5">
                {offerOptions.map((tag) => (
                  <FilterChip
                    key={tag}
                    label={tag}
                    active={offerFilter === tag}
                    onClick={() => setOfferFilter((v) => (v === tag ? '' : tag))}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Vertical / location
              </p>
              <div className="flex flex-wrap gap-1.5">
                {verticalOptions.map((tag) => (
                  <FilterChip
                    key={`v-${tag}`}
                    label={tag}
                    active={verticalFilter === tag}
                    onClick={() => setVerticalFilter((v) => (v === tag ? '' : tag))}
                  />
                ))}
                {locationOptions.map((tag) => (
                  <FilterChip
                    key={`l-${tag}`}
                    label={tag}
                    active={locationFilter === tag}
                    onClick={() => setLocationFilter((v) => (v === tag ? '' : tag))}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">CTA type</p>
              <div className="flex flex-wrap gap-1.5">
                {OUTBOUND_CTA_TYPES.map((tag) => (
                  <FilterChip
                    key={tag}
                    label={tag.replace(/_/g, ' ')}
                    active={ctaTypeFilter === tag}
                    onClick={() => setCtaTypeFilter((v) => (v === tag ? '' : tag))}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 pt-1">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const count = filtered[section.key].length
            const active = activeSection === section.key
            return (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition',
                  active
                    ? 'border-[#e85d2a]/40 bg-[#e85d2a]/10 shadow-soft'
                    : 'border-stone-200/80 bg-white hover:border-stone-300'
                )}
              >
                <div className={cn('rounded-lg p-1.5', section.bgColor, section.textColor)}>
                  <Icon className="size-3.5" size={14} />
                </div>
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold text-neutral-900">
                    {section.title}
                    <span className="ml-1 font-normal text-neutral-400">{count}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-3 flex items-end justify-between gap-3 px-0.5">
          <div>
            <h3 className="text-[14px] font-semibold text-neutral-900">{activeMeta.title}</h3>
            <p className="text-[12px] text-neutral-500">{activeMeta.subtitle}</p>
          </div>
          <p className="text-right text-[11px] text-neutral-400">
            {benchActive && filtered[activeSection].length > activeRows.length
              ? `Bench ${activeRows.length} of ${filtered[activeSection].length}`
              : `${activeRows.length} shown`}
          </p>
        </div>

        {activeRows.length === 0 ? (
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-8">
            <p className="flex items-center gap-2 text-[13px] text-neutral-500">
              <FileText className="size-4" />
              {libraryEmpty ? 'Library is empty — seed hasn’t loaded yet' : 'No matches for these filters'}
            </p>
            {!libraryEmpty && activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[12px] font-medium text-[#c2410c] hover:underline"
              >
                Clear extra filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">{activeRows}</div>
        )}
      </div>

      {detail ? (
        <LibraryItemDetailSheet
          kind={detail.kind}
          id={detail.id}
          onClose={() => setDetail(null)}
          onInsert={(payload) => {
            if (detail.kind === 'openers' && payload.kind === 'opener') {
              const row = bundle.openers.find((item) => item.id === payload.id)
              if (row && isDoctrineOpener(row)) return
            }
            onInsert(payload)
            setDetail(null)
          }}
          onSaved={() => setReloadToken((n) => n + 1)}
        />
      ) : null}
    </div>
  )
}
