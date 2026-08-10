'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LEAD_COLUMN_DEFS,
  loadVisibleLeadColumns,
  persistVisibleLeadColumns,
  type LeadColumnId
} from '@/lib/lead-columns'

export function LeadColumnPicker({
  phoneSparse,
  visible,
  onChange,
  /** compact = trailing table-header "+" control (Attio-style). */
  variant = 'button'
}: {
  phoneSparse: boolean
  visible: LeadColumnId[]
  onChange: (next: LeadColumnId[]) => void
  variant?: 'button' | 'header'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

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
    const def = LEAD_COLUMN_DEFS.find((c) => c.id === id)
    if (def?.required) return
    const next = visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]
    const ordered = LEAD_COLUMN_DEFS.map((c) => c.id).filter((c) => next.includes(c))
    onChange(ordered)
    persistVisibleLeadColumns(ordered)
  }

  const menu = open ? (
    <div
      role="menu"
      className={`absolute z-30 mt-1.5 w-60 rounded-xl border border-stone-200 bg-white p-2 shadow-soft ${
        variant === 'header' ? 'right-0' : 'right-0'
      }`}
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
        Visible columns
      </p>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {options.map((col) => {
          const checked = visible.includes(col.id)
          return (
            <li key={col.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-700 hover:bg-stone-50">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={Boolean(col.required)}
                  onChange={() => toggle(col.id)}
                  className="rounded border-stone-300"
                />
                <span>{col.label}</span>
                {col.required ? (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-neutral-400">
                    Required
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
          onClick={() => setOpen((v) => !v)}
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

export function useLeadColumnVisibility(phoneSparse: boolean) {
  const [visible, setVisible] = useState<LeadColumnId[]>(DEFAULT_SAFE)
  useEffect(() => {
    setVisible(loadVisibleLeadColumns())
  }, [])

  const effective = useMemo(() => {
    if (!phoneSparse) return visible
    return visible.filter((id) => id !== 'phone')
  }, [visible, phoneSparse])

  return { visible: effective, setVisible }
}

const DEFAULT_SAFE: LeadColumnId[] = LEAD_COLUMN_DEFS.filter((c) => c.defaultVisible).map(
  (c) => c.id
)
