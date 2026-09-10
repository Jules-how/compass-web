'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  LEAD_COLUMN_DEFS,
  loadHiddenLeadColumns,
  loadLeadColumnOrder,
  loadLeadColumnWidths,
  loadPinnedLeadColumns,
  persistHiddenLeadColumns,
  persistLeadColumnOrder,
  persistLeadColumnWidths,
  persistPinnedLeadColumns,
  defaultColumnsFor,
  requiredColumnsFor,
  resolveVisibleLeadColumns,
  type LeadColumnId,
  type LeadColumnPreset
} from '@/lib/lead-columns'
import { occupiedLeadColumns } from '@/lib/lead-records'
import type { LeadContact } from '@/lib/types'
import { useUndo } from '@/components/UndoProvider'

export function LeadColumnPicker({
  visible,
  onChange,
  preset = 'crm',
  occupied = [],
  variant = 'button'
}: {
  phoneSparse: boolean
  visible: LeadColumnId[]
  onChange: (next: LeadColumnId[]) => void
  preset?: LeadColumnPreset
  occupied?: LeadColumnId[]
  variant?: 'button' | 'header'
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const required = requiredColumnsFor(preset)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); rootRef.current?.querySelector('button')?.focus() }
    }
    document.addEventListener('mousedown', onDoc)
    rootRef.current?.addEventListener('keydown', onKey)
    const root = rootRef.current
    return () => { document.removeEventListener('mousedown', onDoc); root?.removeEventListener('keydown', onKey) }
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return LEAD_COLUMN_DEFS.filter((c) => {
      if (!q) return true
      return c.label.toLowerCase().includes(q) || c.id.includes(q)
    })
  }, [query])

  function toggle(id: LeadColumnId) {
    if (required.includes(id)) return
    const next = visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]
    const withRequired = required.filter((id) => !next.includes(id))
    onChange([...next, ...withRequired])
  }

  const menu = open ? (
    <div
      id={panelId}
      className="crm-column-panel"
      aria-label="Visible columns"
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search columns"
        placeholder="Search columns…"
        className="mb-1.5 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
        autoFocus
      />
      <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        Visible columns
      </p>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {options.map((col) => {
          const checked = visible.includes(col.id)
          const hasData = occupied.includes(col.id)
          const locked = required.includes(col.id)
          return (
            <li key={col.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-700 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggle(col.id)}
                  className="rounded border-stone-300"
                />
                <span>{col.label}</span>
                {locked ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-neutral-400">
                    Required
                  </span>
                ) : hasData ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-neutral-400">
                    Has data
                  </span>
                ) : null}
              </label>
            </li>
          )
        })}
        {options.length === 0 ? (
          <li className="px-2 py-2 text-xs text-neutral-400">No matching columns</li>
        ) : null}
      </ul>
      <p className="crm-preference-scope">Column choices are saved in this browser.</p>
      <button type="button" className="crm-columns-done" onClick={() => { setOpen(false); rootRef.current?.querySelector('button')?.focus() }}>Done</button>
    </div>
  ) : null

  if (variant === 'header') {
    return (
      <div ref={rootRef} className="relative inline-flex">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setOpen((v) => !v)
          }}
          className="rounded-md px-1.5 py-0.5 text-xs font-medium text-neutral-500 transition hover:bg-stone-100 hover:text-neutral-800"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Choose visible columns"
          title="Add column"
        >
          +
        </button>
        {menu}
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-stone-50"
        aria-expanded={open}
        aria-controls={panelId}
      >
        Columns
      </button>
      {menu}
    </div>
  )
}

export function useLeadGridColumns(preset: LeadColumnPreset, leads: LeadContact[]) {
  const [view, setViewState] = useState<'operating' | 'legacy'>('operating')
  const effectivePreset = preset === 'crm' && view === 'legacy' ? 'crm-legacy' : preset
  const activePresetRef = useRef(effectivePreset)
  activePresetRef.current = effectivePreset
  useEffect(() => {
    try { if (preset === 'crm' && window.localStorage.getItem('compass.crm.view.v1') === 'legacy') setViewState('legacy') } catch { /* Storage may be unavailable. */ }
  }, [preset])
  function setView(next: 'operating' | 'legacy') {
    setViewState(next)
    try { window.localStorage.setItem('compass.crm.view.v1', next) } catch { /* The view still works for this session. */ }
  }
  const occupied = useMemo(() => occupiedLeadColumns(leads), [leads])
  const [pinned, setPinned] = useState<LeadColumnId[]>([])
  const [hidden, setHidden] = useState<LeadColumnId[]>([])
  const [order, setOrder] = useState<LeadColumnId[]>(() => defaultColumnsFor(effectivePreset))
  const [widths, setWidths] = useState<Partial<Record<LeadColumnId, number>>>({})
  const [ready, setReady] = useState(false)
  const undo = useUndo()

  useEffect(() => {
    setPinned(loadPinnedLeadColumns(effectivePreset))
    setHidden(loadHiddenLeadColumns(effectivePreset))
    setOrder(loadLeadColumnOrder(effectivePreset))
    setWidths(loadLeadColumnWidths(effectivePreset))
    setReady(true)
  }, [effectivePreset])

  const visible = useMemo(
    () =>
      resolveVisibleLeadColumns({
        preset: effectivePreset,
        occupied,
        pinned,
        hidden,
        order
      }),
    [effectivePreset, occupied, pinned, hidden, order]
  )

  function applyVisible(
    next: LeadColumnId[],
    nextPinned: LeadColumnId[],
    nextHidden: LeadColumnId[]
  ) {
    if (activePresetRef.current === effectivePreset) {
      setPinned(nextPinned)
      setHidden(nextHidden)
      setOrder(next)
    }
    persistPinnedLeadColumns(nextPinned, effectivePreset)
    persistHiddenLeadColumns(nextHidden, effectivePreset)
    persistLeadColumnOrder(next, effectivePreset)
  }

  function setVisible(next: LeadColumnId[]) {
    const required = requiredColumnsFor(effectivePreset)
    const added = next.filter((id) => !visible.includes(id))
    const removed = visible.filter((id) => !next.includes(id) && !required.includes(id))
    const nextPinned = Array.from(new Set([...pinned.filter((id) => !removed.includes(id)), ...added]))
    const nextHidden = Array.from(new Set([...hidden.filter((id) => !added.includes(id)), ...removed]))
    const prev = { order: visible, pinned, hidden }
    applyVisible(next, nextPinned, nextHidden)
    undo.push({
      label: 'Column layout',
      undo: () => applyVisible(prev.order, prev.pinned, prev.hidden),
      redo: () => applyVisible(next, nextPinned, nextHidden)
    })
  }

  const applyWidths = useCallback((next: Partial<Record<LeadColumnId, number>>) => {
    if (activePresetRef.current === effectivePreset) setWidths(next)
    persistLeadColumnWidths(next, effectivePreset)
  }, [effectivePreset])

  function resizeColumn(id: LeadColumnId, width: number) {
    setWidths((current) => {
      const next = { ...current, [id]: width }
      persistLeadColumnWidths(next, effectivePreset)
      return next
    })
  }

  const resizeStarted = useRef<Partial<Record<LeadColumnId, number>> | null>(null)

  function resizeColumnTracked(id: LeadColumnId, width: number) {
    if (!resizeStarted.current) resizeStarted.current = widths
    resizeColumn(id, width)
  }

  useEffect(() => {
    function onUp() {
      const before = resizeStarted.current
      if (!before) return
      resizeStarted.current = null
      const after = loadLeadColumnWidths(effectivePreset)
      undo.push({
        label: 'Column width',
        undo: () => applyWidths(before),
        redo: () => applyWidths(after)
      })
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [undo, effectivePreset, applyWidths])

  return { view, setView, visible, occupied, widths, resizeColumn: resizeColumnTracked, setVisible, ready }
}
