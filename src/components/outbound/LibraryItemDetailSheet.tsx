'use client'

import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  OUTBOUND_CTA_TYPES,
  OUTBOUND_EXPRESSION_STATUSES,
  OUTBOUND_OPENER_MODES,
  provenanceBadgeLabel,
  type OutboundCta,
  type OutboundExpression,
  type OutboundOffer,
  type OutboundOpener,
  type OutboundSequence,
  type OutboundSlot,
  type OutboundStructure,
  type OutboundSubject,
  type OutboundTemplate
} from '@/lib/outbound-copy'
import { isDoctrineOpener } from '@/lib/outbound-library-filter'
import { ensureLibraryMutationUnlocked } from '@/lib/outbound-library-lock'
import {
  getLibraryItem,
  listLibraryItems,
  patchLibraryItem,
  type LibraryKind
} from '@/lib/outbound-library-client'
import type { LibraryDragPayload } from '@/components/outbound/LibraryPane'
import { cn } from '@/lib/utils'

const easeOut = [0.22, 1, 0.36, 1] as const

const KIND_TITLE: Record<LibraryKind, string> = {
  offers: 'Offer',
  expressions: 'Expression',
  structures: 'Structure',
  ctas: 'CTA',
  subjects: 'Subject',
  openers: 'Opener',
  templates: 'Template'
}

type AnyItem =
  | OutboundOffer
  | OutboundExpression
  | OutboundStructure
  | OutboundCta
  | OutboundSubject
  | OutboundOpener
  | OutboundTemplate

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
      {children}
    </label>
  )
}

function TextInput({
  value,
  onChange,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { value: string; onChange: (v: string) => void }) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-neutral-900 shadow-soft outline-none focus:border-[#e85d2a]/40',
        className
      )}
    />
  )
}

function TextArea({
  value,
  onChange,
  rows = 6,
  className
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] leading-relaxed text-neutral-900 shadow-soft outline-none focus:border-[#e85d2a]/40',
        className
      )}
    />
  )
}

function SelectField({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: readonly string[] | string[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-[13px] text-neutral-900 shadow-soft outline-none focus:border-[#e85d2a]/40"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  )
}

function tagsToString(tags: string[] | undefined): string {
  return (tags ?? []).join(', ')
}

function stringToTags(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function itemTitle(kind: LibraryKind, item: AnyItem): string {
  if (kind === 'offers') return (item as OutboundOffer).name
  if (kind === 'templates') return (item as OutboundTemplate).name
  if (kind === 'structures') return (item as OutboundStructure).name
  return (item as OutboundExpression | OutboundCta | OutboundSubject | OutboundOpener).label
}

function SequenceView({ sequence }: { sequence: OutboundSequence }) {
  return (
    <div className="space-y-3">
      {sequence.steps.map((step, index) => (
        <div
          key={step.id}
          className="rounded-2xl border border-stone-200/80 bg-stone-50/70 p-4 shadow-soft"
        >
          <div className="text-[13px] font-semibold text-neutral-900">
            {step.label || `Step ${index + 1}`}
            {typeof step.delay_days === 'number' ? (
              <span className="ml-2 text-[11px] font-normal text-neutral-500">
                +{step.delay_days}d
              </span>
            ) : null}
          </div>
          {step.subject ? (
            <p className="mt-1 text-[12px] text-neutral-500">
              Subject: <span className="text-neutral-800">{step.subject}</span>
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {step.slots.map((slot) => (
              <div key={`${step.id}-${slot.key}`}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                  {slot.label || slot.key}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700">
                  {slot.body || '—'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SlotsView({ slots }: { slots: OutboundSlot[] }) {
  if (!slots.length) return <p className="text-[13px] text-neutral-500">No slots</p>
  return (
    <div className="space-y-2">
      {slots.map((slot) => (
        <div key={slot.key} className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-3">
          <div className="text-[11px] font-semibold text-neutral-800">
            {slot.label || slot.key}
            {slot.required ? <span className="ml-1 text-neutral-400">required</span> : null}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-700">
            {slot.body || '—'}
          </p>
        </div>
      ))}
    </div>
  )
}

function buildInsertPayload(kind: LibraryKind, item: AnyItem): LibraryDragPayload | null {
  if (kind === 'offers') {
    const row = item as OutboundOffer
    return { kind: 'offer', id: row.id, offer_key: row.offer_key, name: row.name }
  }
  if (kind === 'expressions') {
    const row = item as OutboundExpression
    return {
      kind: 'expression',
      id: row.id,
      offer_key: row.offer_key,
      body: row.body,
      label: row.label
    }
  }
  if (kind === 'structures') {
    const row = item as OutboundStructure
    return {
      kind: 'structure',
      id: row.id,
      structure_id: row.structure_id,
      name: row.name
    }
  }
  if (kind === 'ctas') {
    const row = item as OutboundCta
    return {
      kind: 'cta',
      id: row.id,
      body: row.body,
      label: row.label,
      cta_type: row.cta_type
    }
  }
  if (kind === 'subjects') {
    const row = item as OutboundSubject
    return { kind: 'subject', id: row.id, pattern: row.pattern, label: row.label }
  }
  if (kind === 'openers') {
    const row = item as OutboundOpener
    return {
      kind: 'opener',
      id: row.id,
      body: row.body,
      label: row.label,
      opener_mode: row.opener_mode
    }
  }
  if (kind === 'templates') {
    const row = item as OutboundTemplate
    return { kind: 'template', id: row.id, name: row.name }
  }
  return null
}

type DraftState = Record<string, unknown>

function draftFromItem(kind: LibraryKind, item: AnyItem): DraftState {
  if (kind === 'offers') {
    const row = item as OutboundOffer
    return {
      offer_key: row.offer_key,
      name: row.name,
      pack_summary: row.pack_summary,
      positioning_line: row.positioning_line ?? '',
      vertical_tags: tagsToString(row.vertical_tags),
      location_tags: tagsToString(row.location_tags)
    }
  }
  if (kind === 'expressions') {
    const row = item as OutboundExpression
    return {
      offer_key: row.offer_key ?? '',
      label: row.label,
      body: row.body,
      status: row.status,
      notes: row.notes ?? '',
      vertical_tags: tagsToString(row.vertical_tags),
      location_tags: tagsToString(row.location_tags)
    }
  }
  if (kind === 'structures') {
    const row = item as OutboundStructure
    return {
      structure_id: row.structure_id,
      name: row.name,
      description: row.description ?? '',
      slots: row.slots.map((s) => ({ ...s }))
    }
  }
  if (kind === 'ctas') {
    const row = item as OutboundCta
    return {
      label: row.label,
      body: row.body,
      cta_type: row.cta_type,
      vertical_tags: tagsToString(row.vertical_tags),
      location_tags: tagsToString(row.location_tags)
    }
  }
  if (kind === 'subjects') {
    const row = item as OutboundSubject
    return {
      label: row.label,
      pattern: row.pattern,
      notes: row.notes ?? '',
      vertical_tags: tagsToString(row.vertical_tags)
    }
  }
  if (kind === 'openers') {
    const row = item as OutboundOpener
    return {
      label: row.label,
      opener_mode: row.opener_mode,
      body: row.body,
      notes: row.notes ?? '',
      vertical_tags: tagsToString(row.vertical_tags)
    }
  }
  const row = item as OutboundTemplate
  return {
    name: row.name,
    offer_key: row.offer_key ?? '',
    structure_id: row.structure_id,
    vertical_tags: tagsToString(row.vertical_tags),
    location_tags: tagsToString(row.location_tags),
    sequence: JSON.parse(JSON.stringify(row.sequence)) as OutboundSequence
  }
}

function patchFromDraft(kind: LibraryKind, draft: DraftState): Record<string, unknown> {
  if (kind === 'offers') {
    return {
      offer_key: String(draft.offer_key ?? ''),
      name: String(draft.name ?? ''),
      pack_summary: String(draft.pack_summary ?? ''),
      positioning_line: String(draft.positioning_line ?? '').trim() || null,
      vertical_tags: stringToTags(String(draft.vertical_tags ?? '')),
      location_tags: stringToTags(String(draft.location_tags ?? ''))
    }
  }
  if (kind === 'expressions') {
    return {
      offer_key: String(draft.offer_key ?? ''),
      label: String(draft.label ?? ''),
      body: String(draft.body ?? ''),
      status: String(draft.status ?? 'draft'),
      notes: String(draft.notes ?? '').trim() || null,
      vertical_tags: stringToTags(String(draft.vertical_tags ?? '')),
      location_tags: stringToTags(String(draft.location_tags ?? ''))
    }
  }
  if (kind === 'structures') {
    return {
      structure_id: String(draft.structure_id ?? ''),
      name: String(draft.name ?? ''),
      description: String(draft.description ?? '').trim() || null,
      slots: draft.slots
    }
  }
  if (kind === 'ctas') {
    return {
      label: String(draft.label ?? ''),
      body: String(draft.body ?? ''),
      cta_type: String(draft.cta_type ?? 'permission'),
      vertical_tags: stringToTags(String(draft.vertical_tags ?? '')),
      location_tags: stringToTags(String(draft.location_tags ?? ''))
    }
  }
  if (kind === 'subjects') {
    return {
      label: String(draft.label ?? ''),
      pattern: String(draft.pattern ?? ''),
      notes: String(draft.notes ?? '').trim() || null,
      vertical_tags: stringToTags(String(draft.vertical_tags ?? ''))
    }
  }
  if (kind === 'openers') {
    return {
      label: String(draft.label ?? ''),
      opener_mode: String(draft.opener_mode ?? 'custom'),
      body: String(draft.body ?? ''),
      notes: String(draft.notes ?? '').trim() || null,
      vertical_tags: stringToTags(String(draft.vertical_tags ?? ''))
    }
  }
  return {
    name: String(draft.name ?? ''),
    offer_key: String(draft.offer_key ?? '').trim() || null,
    structure_id: String(draft.structure_id ?? ''),
    vertical_tags: stringToTags(String(draft.vertical_tags ?? '')),
    location_tags: stringToTags(String(draft.location_tags ?? '')),
    sequence: draft.sequence
  }
}

export function LibraryItemDetailSheet({
  kind,
  id,
  onClose,
  onInsert,
  onSaved
}: {
  kind: LibraryKind
  id: string
  onClose: () => void
  onInsert?: (payload: LibraryDragPayload) => void
  onSaved?: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [item, setItem] = useState<AnyItem | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftState>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [structureExamples, setStructureExamples] = useState<OutboundTemplate[]>([])
  const [examplesLoading, setExamplesLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (editing) {
          setEditing(false)
          setSaveError(null)
          if (item) setDraft(draftFromItem(kind, item))
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [editing, item, kind, onClose])

  useEffect(() => {
    let cancelled = false
    setItem(null)
    setEditing(false)
    setSaveError(null)
    setLoadError(null)
    setStructureExamples([])
    void (async () => {
      try {
        const row = await getLibraryItem<AnyItem>(kind, id)
        if (cancelled) return
        setItem(row)
        setDraft(draftFromItem(kind, row))
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kind, id])

  useEffect(() => {
    if (kind !== 'structures' || !item) {
      setStructureExamples([])
      setExamplesLoading(false)
      return
    }
    const structureId = (item as OutboundStructure).structure_id
    if (!structureId) return

    let cancelled = false
    setExamplesLoading(true)
    void (async () => {
      try {
        const templates = await listLibraryItems<OutboundTemplate>('templates')
        if (cancelled) return
        const matched = templates
          .filter((tmpl) => tmpl.structure_id === structureId && !tmpl.archived)
          .filter((tmpl) =>
            tmpl.sequence?.steps?.some((step) =>
              step.slots.some((slot) => (slot.body || '').trim().length > 0)
            )
          )
          .slice(0, 4)
        setStructureExamples(matched)
      } catch {
        if (!cancelled) setStructureExamples([])
      } finally {
        if (!cancelled) setExamplesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [kind, item])

  function setDraftField(key: string, value: unknown) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  async function startEdit() {
    if (!(await ensureLibraryMutationUnlocked('edit'))) return
    if (item) setDraft(draftFromItem(kind, item))
    setEditing(true)
    setSaveError(null)
  }

  async function save() {
    if (!(await ensureLibraryMutationUnlocked('edit'))) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await patchLibraryItem<AnyItem>(kind, id, patchFromDraft(kind, draft))
      setItem(updated)
      setDraft(draftFromItem(kind, updated))
      setEditing(false)
      onSaved?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    if (item) setDraft(draftFromItem(kind, item))
    setEditing(false)
    setSaveError(null)
  }

  function handleInsert() {
    if (!item || !onInsert) return
    if (kind === 'openers' && isDoctrineOpener(item as OutboundOpener)) return
    const payload = buildInsertPayload(kind, item)
    if (payload) onInsert(payload)
  }

  const canInsert =
    Boolean(onInsert) && !(kind === 'openers' && item && isDoctrineOpener(item as OutboundOpener))

  if (!mounted) return null

  const title = item ? itemTitle(kind, item) : KIND_TITLE[kind]
  const provenanceLabel = item ? provenanceBadgeLabel(item) : null

  const wideSheet = kind === 'structures' || kind === 'templates'

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={`${kind}-${id}`}
        className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:justify-end sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
      >
        <button
          type="button"
          className="absolute inset-0 bg-neutral-950/20"
          aria-label="Close component detail"
          onClick={onClose}
        />
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-item-detail-title"
          className={cn(
            'relative z-10 flex w-full max-h-[min(86dvh,640px)] flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-lift',
            wideSheet ? 'max-w-xl' : 'max-w-[26rem]'
          )}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.22, ease: easeOut }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {KIND_TITLE[kind]}
              </p>
              <h2
                id="library-item-detail-title"
                className="mt-0.5 text-[16px] font-semibold leading-snug text-neutral-900"
              >
                {title}
              </h2>
              {provenanceLabel ? (
                <span
                  className={cn(
                    'mt-1.5 inline-flex rounded-lg px-1.5 py-0.5 text-[10px] font-semibold',
                    provenanceLabel.startsWith('Source')
                      ? 'bg-stone-900/90 text-white'
                      : 'bg-stone-100 text-neutral-600'
                  )}
                >
                  {provenanceLabel}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-2.5 py-1.5 text-xs text-neutral-600 transition hover:bg-stone-50"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
            {!item && !loadError ? (
              <p className="text-[13px] text-neutral-500">Loading…</p>
            ) : null}

            {item && !editing ? (
              <ViewBody
                kind={kind}
                item={item}
                examples={structureExamples}
                examplesLoading={examplesLoading}
              />
            ) : null}

            {item && editing ? (
              <EditBody kind={kind} draft={draft} setDraftField={setDraftField} />
            ) : null}

            {saveError ? <p className="mt-3 text-sm text-red-600">{saveError}</p> : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-[var(--compass-wash)] px-5 py-3">
            {editing ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={cancelEdit}
                  className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-medium text-neutral-600 shadow-soft hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void startEdit()}
                  className="rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-[12px] font-medium text-neutral-700 shadow-soft hover:bg-stone-50"
                >
                  Edit
                </button>
                {canInsert ? (
                  <button
                    type="button"
                    onClick={handleInsert}
                    className="rounded-xl bg-[#e85d2a] px-3.5 py-2 text-[12px] font-semibold text-white shadow-soft"
                  >
                    Use in draft
                  </button>
                ) : null}
              </>
            )}
          </div>
        </motion.aside>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

function ViewBody({
  kind,
  item,
  examples = [],
  examplesLoading = false
}: {
  kind: LibraryKind
  item: AnyItem
  examples?: OutboundTemplate[]
  examplesLoading?: boolean
}) {
  if (kind === 'offers') {
    const row = item as OutboundOffer
    return (
      <div className="space-y-4">
        <MetaLine label="Offer key" value={row.offer_key} />
        <Block label="Pack summary" body={row.pack_summary} />
        {row.positioning_line ? <Block label="Positioning" body={row.positioning_line} /> : null}
        <TagRow tags={[...(row.vertical_tags ?? []), ...(row.location_tags ?? [])]} />
        {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
      </div>
    )
  }
  if (kind === 'expressions') {
    const row = item as OutboundExpression
    return (
      <div className="space-y-4">
        <MetaLine label="Offer / status" value={`${row.offer_key ?? 'pattern'} · ${row.status}`} />
        <Block label="Body" body={row.body} />
        {row.notes ? <Block label="Notes" body={row.notes} /> : null}
        <TagRow tags={[...(row.vertical_tags ?? []), ...(row.location_tags ?? [])]} />
        {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
      </div>
    )
  }
  if (kind === 'structures') {
    const row = item as OutboundStructure
    return (
      <div className="space-y-4">
        <MetaLine label="Structure id" value={row.structure_id} />
        {row.description ? <Block label="Description" body={row.description} /> : null}
        <div>
          <FieldLabel>Slots</FieldLabel>
          <SlotsView slots={row.slots} />
        </div>
        <div>
          <FieldLabel>Example emails</FieldLabel>
          {examplesLoading ? (
            <p className="text-[13px] text-neutral-500">Loading examples…</p>
          ) : examples.length === 0 ? (
            <p className="text-[13px] text-neutral-500">
              No templates use this structure yet. Open Templates for full sequences, or Use this
              skeleton in the draft.
            </p>
          ) : (
            <div className="space-y-4">
              {examples.map((tmpl) => (
                <div key={tmpl.id} className="space-y-2">
                  <div className="text-[13px] font-semibold text-neutral-900">{tmpl.name}</div>
                  {tmpl.source_file || tmpl.source_creator ? (
                    <p className="text-[11px] text-neutral-500">
                      {[
                        tmpl.source_creator ? `Source · ${tmpl.source_creator}` : null,
                        tmpl.source_file
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  <SequenceView sequence={tmpl.sequence} />
                </div>
              ))}
            </div>
          )}
        </div>
        {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
      </div>
    )
  }
  if (kind === 'ctas') {
    const row = item as OutboundCta
    return (
      <div className="space-y-4">
        <MetaLine
          label="Type"
          value={`${row.cta_type}${row.is_default ? ' · default' : ''}`}
        />
        <Block label="Body" body={row.body} />
        <TagRow tags={[...(row.vertical_tags ?? []), ...(row.location_tags ?? [])]} />
        {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
      </div>
    )
  }
  if (kind === 'subjects') {
    const row = item as OutboundSubject
    return (
      <div className="space-y-4">
        <Block label="Pattern" body={row.pattern} />
        {row.notes ? <Block label="Notes" body={row.notes} /> : null}
        <TagRow tags={row.vertical_tags ?? []} />
        {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
      </div>
    )
  }
  if (kind === 'openers') {
    const row = item as OutboundOpener
    return (
      <div className="space-y-4">
        <MetaLine label="Mode" value={row.opener_mode} />
        <Block label="Body" body={row.body || '—'} />
        {row.notes ? <Block label="Notes" body={row.notes} /> : null}
        <TagRow tags={row.vertical_tags ?? []} />
        {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
      </div>
    )
  }
  const row = item as OutboundTemplate
  return (
    <div className="space-y-4">
      <MetaLine
        label="Meta"
        value={`${row.structure_id}${row.offer_key ? ` · ${row.offer_key}` : ''}`}
      />
      <TagRow tags={[...(row.vertical_tags ?? []), ...(row.location_tags ?? [])]} />
      <div>
        <FieldLabel>Sequence</FieldLabel>
        <SequenceView sequence={row.sequence} />
      </div>
      {row.source_file ? <MetaLine label="Source file" value={row.source_file} /> : null}
    </div>
  )
}

function EditBody({
  kind,
  draft,
  setDraftField
}: {
  kind: LibraryKind
  draft: DraftState
  setDraftField: (key: string, value: unknown) => void
}) {
  if (kind === 'offers') {
    return (
      <div className="space-y-3">
        <div>
          <FieldLabel>Name</FieldLabel>
          <TextInput value={String(draft.name ?? '')} onChange={(v) => setDraftField('name', v)} />
        </div>
        <div>
          <FieldLabel>Offer key</FieldLabel>
          <TextInput
            value={String(draft.offer_key ?? '')}
            onChange={(v) => setDraftField('offer_key', v)}
          />
        </div>
        <div>
          <FieldLabel>Pack summary</FieldLabel>
          <TextArea
            value={String(draft.pack_summary ?? '')}
            onChange={(v) => setDraftField('pack_summary', v)}
            rows={8}
          />
        </div>
        <div>
          <FieldLabel>Positioning line</FieldLabel>
          <TextArea
            value={String(draft.positioning_line ?? '')}
            onChange={(v) => setDraftField('positioning_line', v)}
            rows={3}
          />
        </div>
        <TagsEditors draft={draft} setDraftField={setDraftField} location />
      </div>
    )
  }
  if (kind === 'expressions') {
    return (
      <div className="space-y-3">
        <div>
          <FieldLabel>Label</FieldLabel>
          <TextInput value={String(draft.label ?? '')} onChange={(v) => setDraftField('label', v)} />
        </div>
        <div>
          <FieldLabel>Offer key</FieldLabel>
          <TextInput
            value={String(draft.offer_key ?? '')}
            onChange={(v) => setDraftField('offer_key', v)}
          />
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <SelectField
            value={String(draft.status ?? 'draft')}
            onChange={(v) => setDraftField('status', v)}
            options={OUTBOUND_EXPRESSION_STATUSES}
          />
        </div>
        <div>
          <FieldLabel>Body</FieldLabel>
          <TextArea
            value={String(draft.body ?? '')}
            onChange={(v) => setDraftField('body', v)}
            rows={10}
          />
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={String(draft.notes ?? '')}
            onChange={(v) => setDraftField('notes', v)}
            rows={3}
          />
        </div>
        <TagsEditors draft={draft} setDraftField={setDraftField} location />
      </div>
    )
  }
  if (kind === 'structures') {
    const slots = (draft.slots as OutboundSlot[]) ?? []
    return (
      <div className="space-y-3">
        <div>
          <FieldLabel>Name</FieldLabel>
          <TextInput value={String(draft.name ?? '')} onChange={(v) => setDraftField('name', v)} />
        </div>
        <div>
          <FieldLabel>Structure id</FieldLabel>
          <TextInput
            value={String(draft.structure_id ?? '')}
            onChange={(v) => setDraftField('structure_id', v)}
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <TextArea
            value={String(draft.description ?? '')}
            onChange={(v) => setDraftField('description', v)}
            rows={4}
          />
        </div>
        <div className="space-y-2">
          <FieldLabel>Slots</FieldLabel>
          {slots.map((slot, index) => (
            <div key={slot.key} className="rounded-xl border border-stone-200 p-3">
              <div className="mb-1 text-[12px] font-medium text-neutral-700">
                {slot.label || slot.key}
              </div>
              <TextArea
                value={slot.body}
                rows={3}
                onChange={(v) => {
                  const next = slots.map((s, i) => (i === index ? { ...s, body: v } : s))
                  setDraftField('slots', next)
                }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (kind === 'ctas') {
    return (
      <div className="space-y-3">
        <div>
          <FieldLabel>Label</FieldLabel>
          <TextInput value={String(draft.label ?? '')} onChange={(v) => setDraftField('label', v)} />
        </div>
        <div>
          <FieldLabel>CTA type</FieldLabel>
          <SelectField
            value={String(draft.cta_type ?? 'permission')}
            onChange={(v) => setDraftField('cta_type', v)}
            options={OUTBOUND_CTA_TYPES}
          />
        </div>
        <div>
          <FieldLabel>Body</FieldLabel>
          <TextArea
            value={String(draft.body ?? '')}
            onChange={(v) => setDraftField('body', v)}
            rows={8}
          />
        </div>
        <TagsEditors draft={draft} setDraftField={setDraftField} location />
      </div>
    )
  }
  if (kind === 'subjects') {
    return (
      <div className="space-y-3">
        <div>
          <FieldLabel>Label</FieldLabel>
          <TextInput value={String(draft.label ?? '')} onChange={(v) => setDraftField('label', v)} />
        </div>
        <div>
          <FieldLabel>Pattern</FieldLabel>
          <TextArea
            value={String(draft.pattern ?? '')}
            onChange={(v) => setDraftField('pattern', v)}
            rows={4}
          />
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={String(draft.notes ?? '')}
            onChange={(v) => setDraftField('notes', v)}
            rows={3}
          />
        </div>
        <TagsEditors draft={draft} setDraftField={setDraftField} />
      </div>
    )
  }
  if (kind === 'openers') {
    return (
      <div className="space-y-3">
        <div>
          <FieldLabel>Label</FieldLabel>
          <TextInput value={String(draft.label ?? '')} onChange={(v) => setDraftField('label', v)} />
        </div>
        <div>
          <FieldLabel>Opener mode</FieldLabel>
          <SelectField
            value={String(draft.opener_mode ?? 'custom')}
            onChange={(v) => setDraftField('opener_mode', v)}
            options={OUTBOUND_OPENER_MODES}
          />
        </div>
        <div>
          <FieldLabel>Body</FieldLabel>
          <TextArea
            value={String(draft.body ?? '')}
            onChange={(v) => setDraftField('body', v)}
            rows={10}
          />
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <TextArea
            value={String(draft.notes ?? '')}
            onChange={(v) => setDraftField('notes', v)}
            rows={3}
          />
        </div>
        <TagsEditors draft={draft} setDraftField={setDraftField} />
      </div>
    )
  }

  const sequence = draft.sequence as OutboundSequence
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel>Name</FieldLabel>
        <TextInput value={String(draft.name ?? '')} onChange={(v) => setDraftField('name', v)} />
      </div>
      <div>
        <FieldLabel>Structure id</FieldLabel>
        <TextInput
          value={String(draft.structure_id ?? '')}
          onChange={(v) => setDraftField('structure_id', v)}
        />
      </div>
      <div>
        <FieldLabel>Offer key</FieldLabel>
        <TextInput
          value={String(draft.offer_key ?? '')}
          onChange={(v) => setDraftField('offer_key', v)}
        />
      </div>
      <TagsEditors draft={draft} setDraftField={setDraftField} location />
      <div className="space-y-3">
        <FieldLabel>Sequence</FieldLabel>
        {sequence.steps.map((step, stepIndex) => (
          <div key={step.id} className="rounded-2xl border border-stone-200 p-3 space-y-2">
            <div className="text-[13px] font-semibold text-neutral-900">
              {step.label || `Step ${stepIndex + 1}`}
            </div>
            <div>
              <FieldLabel>Subject</FieldLabel>
              <TextInput
                value={step.subject}
                onChange={(v) => {
                  const next = {
                    ...sequence,
                    steps: sequence.steps.map((s, i) =>
                      i === stepIndex ? { ...s, subject: v } : s
                    )
                  }
                  setDraftField('sequence', next)
                }}
              />
            </div>
            {step.slots.map((slot, slotIndex) => (
              <div key={`${step.id}-${slot.key}`}>
                <FieldLabel>{slot.label || slot.key}</FieldLabel>
                <TextArea
                  value={slot.body}
                  rows={3}
                  onChange={(v) => {
                    const next = {
                      ...sequence,
                      steps: sequence.steps.map((s, i) => {
                        if (i !== stepIndex) return s
                        return {
                          ...s,
                          slots: s.slots.map((sl, j) =>
                            j === slotIndex ? { ...sl, body: v } : sl
                          )
                        }
                      })
                    }
                    setDraftField('sequence', next)
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TagsEditors({
  draft,
  setDraftField,
  location
}: {
  draft: DraftState
  setDraftField: (key: string, value: unknown) => void
  location?: boolean
}) {
  return (
    <>
      <div>
        <FieldLabel>Vertical tags (comma-separated)</FieldLabel>
        <TextInput
          value={String(draft.vertical_tags ?? '')}
          onChange={(v) => setDraftField('vertical_tags', v)}
        />
      </div>
      {location ? (
        <div>
          <FieldLabel>Location tags (comma-separated)</FieldLabel>
          <TextInput
            value={String(draft.location_tags ?? '')}
            onChange={(v) => setDraftField('location_tags', v)}
          />
        </div>
      ) : null}
    </>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-[13px] text-neutral-800">{value}</p>
    </div>
  )
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="whitespace-pre-wrap rounded-2xl border border-stone-200/80 bg-stone-50/70 p-4 text-[14px] leading-relaxed text-neutral-800 shadow-soft">
        {body}
      </p>
    </div>
  )
}

function TagRow({ tags }: { tags: string[] }) {
  const cleaned = tags.filter(Boolean)
  if (!cleaned.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {cleaned.map((tag) => (
        <span
          key={tag}
          className="rounded-xl border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-neutral-600"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}
