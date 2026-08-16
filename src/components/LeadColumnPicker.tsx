'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LEAD_COLUMN_DEFS,
  loadHiddenLeadColumns,
  loadLeadColumnWidths,
  loadPinnedLeadColumns,
  persistHiddenLeadColumns,
  persistLeadColumnWidths,
  persistPinnedLeadColumns,
  requiredColumnsFor,
  resolveVisibleLeadColumns,
  type LeadColumnId,
  type LeadColumnPreset
} from '@/lib/lead-columns'
import { occupiedLeadColumns } from '@/lib/lead-records'
import type { LeadContact } from '@/lib/types'

export function LeadColumnPicker({
  phoneSparse,
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
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const required = requiredColumnsFor(preset)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return LEAD_COLUMN_DEFS.filter((c) => {
      if (c.id === 'phone' && phoneSparse) return false
      if (!q) return true
      return c.label.toLowerCase().includes(q) || c.id.includes(q)
    })
  }, [phoneSparse, query])

  function toggle(id: LeadColumnId) {
    if (required.includes(id)) return
    const next = visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]
    const ordered = LEAD_COLUMN_DEFS.map((c) => c.id).filter((c) => next.includes(c) || required.includes(c))
    onChange(ordered)
  }

  const menu = open ? (
    <div
      role="menu"
      className="absolute right-0 z-30 mt-1.5 w-60 rounded-xl border border-stone-200 bg-white p-2 shadow-soft"
    >
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search columns…"
        className="mb-1.5 w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm focus:border-sf-orange focus:outline-none"
        autoFocus
      />
      <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
        Instantly-aligned columns
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
          aria-haspopup="menu"
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
        aria-haspopup="menu"
      >
        + Columns
      </button>
      {menu}
    </div>
  )
}

export function useLeadGridColumns(preset: LeadColumnPreset, leads: LeadContact[]) {
  const occupied = useMemo(() => occupiedLeadColumns(leads), [leads])
  const [pinned, setPinned] = useState<LeadColumnId[]>([])
  const [hidden, setHidden] = useState<LeadColumnId[]>([])
  const [widths, setWidths] = useState<Partial<Record<LeadColumnId, number>>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setPinned(loadPinnedLeadColumns(preset))
    setHidden(loadHiddenLeadColumns(preset))
    setWidths(loadLeadColumnWidths())
    setReady(true)
  }, [preset])

  const visible = useMemo(
    () =>
      resolveVisibleLeadColumns({
        preset,
        occupied,
        pinned,
        hidden
      }),
    [preset, occupied, pinned, hidden]
  )

  function setVisible(next: LeadColumnId[]) {
    const required = requiredColumnsFor(preset)
    const added = next.filter((id) => !visible.includes(id))
    const removed = visible.filter((id) => !next.includes(id) && !required.includes(id))
    const nextPinned = Array.from(new Set([...pinned.filter((id) => !removed.includes(id)), ...added]))
    const nextHidden = Array.from(new Set([...hidden.filter((id) => !added.includes(id)), ...removed]))
    setPinned(nextPinned)
    setHidden(nextHidden)
    persistPinnedLeadColumns(nextPinned, preset)
    persistHiddenLeadColumns(nextHidden, preset)
  }

  function resizeColumn(id: LeadColumnId, width: number) {
    setWidths((current) => {
      const next = { ...current, [id]: width }
      persistLeadColumnWidths(next)
      return next
    })
  }

  return { visible, occupied, widths, resizeColumn, setVisible, ready }
}
