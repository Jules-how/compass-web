'use client'

import { useMemo, useRef } from 'react'
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
  listLocalCtas,
  listLocalExpressions,
  listLocalOffers,
  listLocalOpeners,
  listLocalStructures,
  listLocalSubjects,
  listLocalTemplates
} from '@/lib/outbound-local-store'
import { cn } from '@/lib/utils'

export { parseLibraryDrag }
export type { LibraryDragPayload }

const SECTIONS: {
  key: string
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

function LibraryRow({
  title,
  meta,
  body,
  payload,
  onInsert
}: {
  title: string
  meta?: string
  body?: string
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
        // Some browsers only expose text/plain during drop; keep a fallback.
        e.dataTransfer.setData('text/plain', raw)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => {
        // Allow click after a short delay so drop doesn't also insert twice.
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
      className="w-full cursor-grab rounded-xl border border-stone-200/80 bg-stone-50/50 p-2.5 text-left transition hover:border-stone-300 hover:bg-white active:cursor-grabbing"
    >
      <div className="text-[13px] font-semibold text-neutral-900">{title}</div>
      {meta ? <div className="mt-0.5 text-[11px] text-neutral-500">{meta}</div> : null}
      {body ? (
        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-neutral-600">{body}</p>
      ) : null}
    </div>
  )
}

export function EditorComponentsAccordion({
  onInsert,
  className
}: {
  onInsert: (payload: LibraryDragPayload) => void
  className?: string
}) {
  const lists = useMemo(() => {
    return {
      offers: listLocalOffers().map((row) => (
        <LibraryRow
          key={row.id}
          title={row.name}
          meta={row.offer_key}
          body={row.pack_summary}
          payload={{ kind: 'offer', id: row.id, offer_key: row.offer_key, name: row.name }}
          onInsert={onInsert}
        />
      )),
      expressions: listLocalExpressions().map((row) => (
        <LibraryRow
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
          onInsert={onInsert}
        />
      )),
      structures: listLocalStructures().map((row) => (
        <LibraryRow
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
          onInsert={onInsert}
        />
      )),
      ctas: listLocalCtas().map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          meta={row.cta_type}
          body={row.body}
          payload={{
            kind: 'cta',
            id: row.id,
            body: row.body,
            label: row.label,
            cta_type: row.cta_type
          }}
          onInsert={onInsert}
        />
      )),
      subjects: listLocalSubjects().map((row) => (
        <LibraryRow
          key={row.id}
          title={row.label}
          meta={row.pattern}
          body={row.notes ?? undefined}
          payload={{ kind: 'subject', id: row.id, pattern: row.pattern, label: row.label }}
          onInsert={onInsert}
        />
      )),
      openers: listLocalOpeners().map((row) => (
        <LibraryRow
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
          onInsert={onInsert}
        />
      )),
      templates: listLocalTemplates().map((row) => (
        <LibraryRow
          key={row.id}
          title={row.name}
          meta={`${row.structure_id}${row.offer_key ? ` · ${row.offer_key}` : ''}`}
          payload={{ kind: 'template', id: row.id, name: row.name }}
          onInsert={onInsert}
        />
      ))
    }
  }, [onInsert])

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-1 border-b border-stone-100 px-4 py-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">Components</h2>
        <p className="text-[12px] text-neutral-500">Click or drag into the draft</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Accordion className="w-full -space-y-px" defaultValue={['offers']} type="multiple">
          {SECTIONS.map((section) => {
            const Icon = section.icon
            const rows = lists[section.key as keyof typeof lists] ?? []
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
                      No items yet
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
