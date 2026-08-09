'use client'

import { useMemo, useState } from 'react'
import {
  listLocalCtas,
  listLocalExpressions,
  listLocalOffers,
  listLocalOpeners,
  listLocalStructures,
  listLocalSubjects,
  listLocalTemplates
} from '@/lib/outbound-local-store'
import { LOCATION_TAG_HINTS, VERTICAL_TAG_HINTS } from '@/lib/outbound-copy'
import { cn } from '@/lib/utils'

export type LibraryDragPayload =
  | { kind: 'offer'; id: string; offer_key: string; name: string }
  | { kind: 'expression'; id: string; offer_key: string; body: string; label: string }
  | { kind: 'structure'; id: string; structure_id: string; name: string }
  | { kind: 'cta'; id: string; body: string; label: string; cta_type: string }
  | { kind: 'subject'; id: string; pattern: string; label: string }
  | { kind: 'opener'; id: string; body: string; label: string; opener_mode: string }
  | { kind: 'template'; id: string; name: string }

const TABS = [
  'offers',
  'expressions',
  'structures',
  'ctas',
  'subjects',
  'openers',
  'templates'
] as const

type Tab = (typeof TABS)[number]

function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-2.5 py-1 text-[11px] font-medium transition',
        active
          ? 'border-[#e85d2a]/40 bg-[#e85d2a]/10 text-[#c2410c]'
          : 'border-stone-200/80 bg-white text-neutral-600 hover:bg-stone-50'
      )}
    >
      {label}
    </button>
  )
}

function DraggableCard({
  title,
  meta,
  body,
  payload
}: {
  title: string
  meta?: string
  body?: string
  payload: LibraryDragPayload
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-outbound-library', JSON.stringify(payload))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      className="cursor-grab rounded-xl border border-stone-200/80 bg-white p-3 shadow-soft active:cursor-grabbing"
    >
      <div className="text-[13px] font-semibold text-neutral-900">{title}</div>
      {meta ? <div className="mt-0.5 text-[11px] text-neutral-500">{meta}</div> : null}
      {body ? (
        <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-neutral-600">{body}</p>
      ) : null}
    </div>
  )
}

export function LibraryPane({
  offerKeyFilter,
  onOfferFilter
}: {
  offerKeyFilter?: string | null
  onOfferFilter?: (offerKey: string | null) => void
}) {
  const [tab, setTab] = useState<Tab>('offers')
  const [vertical, setVertical] = useState<string>('')
  const [location, setLocation] = useState<string>('')
  const [q, setQ] = useState('')

  const filters = useMemo(
    () => ({
      offer_key: offerKeyFilter || undefined,
      vertical: vertical || undefined,
      location: location || undefined,
      q: q || undefined
    }),
    [offerKeyFilter, vertical, location, q]
  )

  const items = useMemo(() => {
    switch (tab) {
      case 'offers':
        return listLocalOffers({ ...filters, offer_key: undefined }).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.name}
            meta={row.offer_key}
            body={row.pack_summary}
            payload={{ kind: 'offer', id: row.id, offer_key: row.offer_key, name: row.name }}
          />
        ))
      case 'expressions':
        return listLocalExpressions(filters).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.label}
            meta={`${row.offer_key} · ${row.status}`}
            body={row.body}
            payload={{
              kind: 'expression',
              id: row.id,
              offer_key: row.offer_key,
              body: row.body,
              label: row.label
            }}
          />
        ))
      case 'structures':
        return listLocalStructures(filters).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.name}
            meta={row.structure_id}
            body={row.description ?? undefined}
            payload={{
              kind: 'structure',
              id: row.id,
              structure_id: row.structure_id,
              name: row.name
            }}
          />
        ))
      case 'ctas':
        return listLocalCtas(filters).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.label}
            meta={row.cta_type + (row.is_default ? ' · default' : '')}
            body={row.body}
            payload={{ kind: 'cta', id: row.id, body: row.body, label: row.label, cta_type: row.cta_type }}
          />
        ))
      case 'subjects':
        return listLocalSubjects(filters).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.label}
            meta={row.pattern}
            body={row.notes ?? undefined}
            payload={{ kind: 'subject', id: row.id, pattern: row.pattern, label: row.label }}
          />
        ))
      case 'openers':
        return listLocalOpeners(filters).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.label}
            meta={row.opener_mode}
            body={row.body || row.notes || undefined}
            payload={{
              kind: 'opener',
              id: row.id,
              body: row.body,
              label: row.label,
              opener_mode: row.opener_mode
            }}
          />
        ))
      case 'templates':
        return listLocalTemplates(filters).map((row) => (
          <DraggableCard
            key={row.id}
            title={row.name}
            meta={`${row.structure_id}${row.offer_key ? ` · ${row.offer_key}` : ''}`}
            payload={{ kind: 'template', id: row.id, name: row.name }}
          />
        ))
    }
  }, [tab, filters])

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-stone-200/70 bg-white shadow-soft">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-neutral-900">Libraries</h2>
        <p className="mt-0.5 text-[11px] text-neutral-500">Drag to copy into the campaign draft</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search library…"
          className="mt-2 w-full rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-1.5 text-[12px] outline-none focus:border-[#e85d2a]/40"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VERTICAL_TAG_HINTS.map((tag) => (
            <TagChip
              key={tag}
              label={tag}
              active={vertical === tag}
              onClick={() => setVertical((v) => (v === tag ? '' : tag))}
            />
          ))}
          {LOCATION_TAG_HINTS.map((tag) => (
            <TagChip
              key={tag}
              label={tag}
              active={location === tag}
              onClick={() => setLocation((v) => (v === tag ? '' : tag))}
            />
          ))}
        </div>
        {offerKeyFilter ? (
          <button
            type="button"
            onClick={() => onOfferFilter?.(null)}
            className="mt-2 text-[11px] font-medium text-[#c2410c] hover:underline"
          >
            Clear offer filter ({offerKeyFilter})
          </button>
        ) : null}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-stone-100 px-2 py-2">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-medium capitalize',
              tab === key
                ? 'bg-white text-neutral-900 shadow-soft'
                : 'text-neutral-500 hover:bg-stone-50'
            )}
          >
            {key}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{items}</div>
    </div>
  )
}

export function parseLibraryDrag(dataTransfer: DataTransfer): LibraryDragPayload | null {
  const raw =
    dataTransfer.getData('application/x-outbound-library') || dataTransfer.getData('text/plain')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LibraryDragPayload
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return null
    return parsed
  } catch {
    return null
  }
}
