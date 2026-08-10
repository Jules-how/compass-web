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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import {
  type LibraryDragPayload,
  parseLibraryDrag
} from '@/components/outbound/LibraryPane'
import {
  LOCATION_TAG_HINTS,
  OUTBOUND_CTA_TYPES,
  OUTBOUND_OFFER_KEYS,
  VERTICAL_TAG_HINTS
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
  ensureOutboundLibrarySeeded,
  listLibraryItems
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
    key: 'offers',
    title: 'Offers',
    subtitle: 'Pack offer keys + summaries',
    icon: Package,
    textColor: 'text-[#e85d2a]',
    bgColor: 'bg-[#e85d2a]/10'
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
    key: 'structures',
    title: 'Structures',
    subtitle: 'Slot-order skeletons',
    icon: Layers,
    textColor: 'text-stone-600',
    bgColor: 'bg-stone-500/10'
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
    subtitle: 'Opener modes',
    icon: Sparkles,
    textColor: 'text-violet-700',
    bgColor: 'bg-violet-500/10'
  },
  {
    key: 'templates',
    title: 'Templates',
    subtitle: 'Multi-step sequence forks',
    icon: LayoutTemplate,
    textColor: 'text-rose-700',
    bgColor: 'bg-rose-500/10'
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

function matchesCampaign(
  row: {
    offer_key?: string | null
    vertical_tags?: string[]
    location_tags?: string[]
    structure_id?: string | null
  },
  ctx: CampaignLibraryContext
): boolean {
  if (ctx.offer_key && row.offer_key && row.offer_key === ctx.offer_key) return true
  if (ctx.structure_id && row.structure_id && row.structure_id === ctx.structure_id) return true
  const campaignVerticals = new Set(ctx.vertical_tags ?? [])
  const campaignLocations = new Set(ctx.location_tags ?? [])
  if ((row.vertical_tags ?? []).some((tag) => campaignVerticals.has(tag))) return true
  if ((row.location_tags ?? []).some((tag) => campaignLocations.has(tag))) return true
  return false
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
  payload,
  onInsert
}: {
  title: string
  body?: string
  chips: string[]
  matchCampaign?: boolean
  payload: LibraryDragPayload
  onInsert: (payload: LibraryDragPayload) => void
}) {
  const draggedRef = useRef(false)
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        draggedRef.current = true
        const raw = JSON.stringify(payload)
        e.dataTransfer.setData('application/x-outbound-library', raw)
        e.dataTransfer.setData('text/plain', raw)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => {
        window.setTimeout(() => {
          draggedRef.current = false
        }, 0)
      }}
      onClick={() => {
        if (draggedRef.current) return
        onInsert(payload)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onInsert(payload)
        }
      }}
      className={cn(
        'w-full cursor-grab rounded-xl border p-2.5 text-left transition active:cursor-grabbing',
        matchCampaign
          ? 'border-[#e85d2a]/35 bg-[#e85d2a]/5 hover:border-[#e85d2a]/50 hover:bg-white'
          : 'border-stone-200/80 bg-stone-50/50 hover:border-stone-300 hover:bg-white'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-semibold text-neutral-900">{title}</div>
        {matchCampaign ? (
          <span className="shrink-0 rounded-lg bg-[#e85d2a]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#c2410c]">
            Fits campaign
          </span>
        ) : null}
      </div>
      <ApplicabilityChips tags={chips} accent={matchCampaign} />
      {body ? (
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-neutral-600">{body}</p>
      ) : null}
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
  const [campaignOnly, setCampaignOnly] = useState(Boolean(campaignContext?.offer_key))
  const syncedOffer = useRef<string | null>(null)

  useEffect(() => {
    const offer = campaignContext?.offer_key || ''
    if (offer && syncedOffer.current !== offer) {
      syncedOffer.current = offer
      setOfferFilter(offer)
      setCampaignOnly(true)
    }
  }, [campaignContext?.offer_key])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        await ensureOutboundLibrarySeeded()
        const [offers, expressions, structures, ctas, subjects, openers, templates] =
          await Promise.all([
            listLibraryItems<OutboundOffer>('offers'),
            listLibraryItems<OutboundExpression>('expressions'),
            listLibraryItems<OutboundStructure>('structures'),
            listLibraryItems<OutboundCta>('ctas'),
            listLibraryItems<OutboundSubject>('subjects'),
            listLibraryItems<OutboundOpener>('openers'),
            listLibraryItems<OutboundTemplate>('templates')
          ])
        if (cancelled) return
        setLoadError(null)
        setBundle({ offers, expressions, structures, ctas, subjects, openers, templates })
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
  }, [])

  const ctx: CampaignLibraryContext = campaignContext ?? {}
  const query = q.trim().toLowerCase()

  const offerOptions = useMemo(() => {
    const fromRows = bundle.offers.map((row) => row.offer_key)
    return uniqueTags([...OUTBOUND_OFFER_KEYS, ...fromRows, ctx.offer_key])
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
    }

    function hasScope(row: Scoped) {
      return Boolean(
        row.offer_key || (row.vertical_tags ?? []).length || (row.location_tags ?? []).length
      )
    }

    function passScope(row: Scoped, opts?: { requireOffer?: boolean }) {
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
      if (campaignOnly && hasScope(row) && !matchesCampaign(row, ctx)) return false
      return true
    }

    const sortMatch = <T extends Scoped>(rows: T[]) =>
      [...rows].sort((a, b) => Number(matchesCampaign(b, ctx)) - Number(matchesCampaign(a, ctx)))

    return {
      offers: sortMatch(
        bundle.offers.filter(
          (row) =>
            passScope(row, { requireOffer: true }) &&
            (!query ||
              haystack(row.name, row.offer_key, row.pack_summary, row.vertical_tags, row.location_tags).includes(
                query
              ))
        )
      ),
      expressions: sortMatch(
        bundle.expressions.filter(
          (row) =>
            passScope(row, { requireOffer: true }) &&
            (!query ||
              haystack(
                row.label,
                row.offer_key,
                row.status,
                row.body,
                row.vertical_tags,
                row.location_tags
              ).includes(query))
        )
      ),
      structures: sortMatch(
        bundle.structures.filter(
          (row) =>
            !query || haystack(row.name, row.structure_id, row.description).includes(query)
        )
      ),
      ctas: sortMatch(
        bundle.ctas.filter(
          (row) =>
            (!ctaTypeFilter || row.cta_type === ctaTypeFilter) &&
            passScope(row) &&
            (!query ||
              haystack(row.label, row.cta_type, row.body, row.vertical_tags, row.location_tags).includes(
                query
              ))
        )
      ),
      subjects: sortMatch(
        bundle.subjects.filter(
          (row) =>
            passScope(row) &&
            (!query || haystack(row.label, row.pattern, row.notes, row.vertical_tags).includes(query))
        )
      ),
      openers: sortMatch(
        bundle.openers.filter(
          (row) =>
            passScope(row) &&
            (!query ||
              haystack(row.label, row.opener_mode, row.body, row.notes, row.vertical_tags).includes(query))
        )
      ),
      templates: sortMatch(
        bundle.templates.filter(
          (row) =>
            passScope(row) &&
            (!query ||
              haystack(row.name, row.offer_key, row.structure_id, row.vertical_tags, row.location_tags).includes(
                query
              ))
        )
      )
    }
  }, [
    bundle,
    campaignOnly,
    ctaTypeFilter,
    ctx,
    locationFilter,
    offerFilter,
    query,
    verticalFilter
  ])

  const activeFilterCount = [
    offerFilter,
    verticalFilter,
    locationFilter,
    ctaTypeFilter,
    campaignOnly ? 'campaign' : '',
    q.trim()
  ].filter(Boolean).length

  function clearFilters() {
    setQ('')
    setOfferFilter('')
    setVerticalFilter('')
    setLocationFilter('')
    setCtaTypeFilter('')
    setCampaignOnly(false)
  }

  function renderRows(key: SectionKey) {
    if (key === 'offers') {
      return filtered.offers.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.name}
          body={row.pack_summary}
          chips={uniqueTags([row.offer_key, ...(row.vertical_tags ?? []), ...(row.location_tags ?? [])])}
          matchCampaign={matchesCampaign(row, ctx)}
          payload={{ kind: 'offer', id: row.id, offer_key: row.offer_key, name: row.name }}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'expressions') {
      return filtered.expressions.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.body}
          chips={uniqueTags([
            row.offer_key,
            row.status,
            ...(row.vertical_tags ?? []),
            ...(row.location_tags ?? [])
          ])}
          matchCampaign={matchesCampaign(row, ctx)}
          payload={{
            kind: 'expression',
            id: row.id,
            offer_key: row.offer_key,
            body: row.body,
            label: row.label
          }}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'structures') {
      return filtered.structures.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.name}
          body={row.description ?? undefined}
          chips={uniqueTags([
            row.structure_id,
            row.is_default_candidate ? 'default pick' : null,
            ctx.structure_id === row.structure_id ? 'active' : null
          ])}
          matchCampaign={Boolean(ctx.structure_id && ctx.structure_id === row.structure_id)}
          payload={{
            kind: 'structure',
            id: row.id,
            structure_id: row.structure_id,
            name: row.name
          }}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'ctas') {
      return filtered.ctas.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.body}
          chips={uniqueTags([
            row.cta_type,
            row.is_default ? 'default' : null,
            ...(row.vertical_tags ?? []),
            ...(row.location_tags ?? [])
          ])}
          matchCampaign={matchesCampaign(row, ctx)}
          payload={{
            kind: 'cta',
            id: row.id,
            body: row.body,
            label: row.label,
            cta_type: row.cta_type
          }}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'subjects') {
      return filtered.subjects.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.notes ?? row.pattern}
          chips={uniqueTags([row.pattern, ...(row.vertical_tags ?? [])])}
          matchCampaign={matchesCampaign(row, ctx)}
          payload={{ kind: 'subject', id: row.id, pattern: row.pattern, label: row.label }}
          onInsert={onInsert}
        />
      ))
    }
    if (key === 'openers') {
      return filtered.openers.map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          body={row.body || row.notes || undefined}
          chips={uniqueTags([row.opener_mode, ...(row.vertical_tags ?? [])])}
          matchCampaign={matchesCampaign(row, ctx)}
          payload={{
            kind: 'opener',
            id: row.id,
            body: row.body,
            label: row.label,
            opener_mode: row.opener_mode
          }}
          onInsert={onInsert}
        />
      ))
    }
    return filtered.templates.map((row) => (
      <LibraryRow
        key={row.id}
        title={row.name}
        chips={uniqueTags([
          row.structure_id,
          row.offer_key,
          ...(row.vertical_tags ?? []),
          ...(row.location_tags ?? [])
        ])}
        matchCampaign={matchesCampaign(row, ctx)}
        payload={{ kind: 'template', id: row.id, name: row.name }}
        onInsert={onInsert}
      />
    ))
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-2 border-b border-stone-100 px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-neutral-900">Components</h2>
          <p className="text-[12px] text-neutral-500">Click or drag into the draft</p>
        </div>
        {loadError ? <p className="text-[11px] text-red-600">{loadError}</p> : null}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search components…"
          className="w-full rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-1.5 text-[12px] outline-none focus:border-[#e85d2a]/40"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            label={ctx.offer_key ? `This campaign` : 'Campaign match'}
            active={campaignOnly}
            onClick={() => setCampaignOnly((v) => !v)}
          />
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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Accordion className="w-full -space-y-px" defaultValue={['expressions', 'structures']} type="multiple">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const rows = renderRows(section.key)
            return (
              <AccordionItem
                key={section.key}
                value={section.key}
                className="border border-stone-200/80 bg-white px-3 first:rounded-t-2xl last:rounded-b-2xl last:border-b"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('rounded-xl p-2', section.bgColor, section.textColor)}>
                      <Icon className="size-4" size={16} />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-[14px] font-semibold text-neutral-900">
                        {section.title}
                        <span className="ml-1.5 text-[12px] font-normal text-neutral-400">
                          {rows.length}
                        </span>
                      </span>
                      <span className="text-[12px] font-normal text-neutral-500">
                        {section.subtitle}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pb-3">
                  {rows.length === 0 ? (
                    <p className="flex items-center gap-2 px-1 text-[11px] text-neutral-400">
                      <FileText className="size-3.5" />
                      No matches for these filters
                    </p>
                  ) : (
                    rows
                  )}
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </div>
    </div>
  )
}
