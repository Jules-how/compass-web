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
  onChange
}: {
  phoneSparse: boolean
  visible: LeadColumnId[]
  onChange: (next: LeadColumnId[]) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const options = useMemo(
    () =>
      LEAD_COLUMN_DEFS.filter((c) => {
        if (c.id === 'phone' && phoneSparse) return false
        return true
      }),
    [phoneSparse]
  )

  function toggle(id: LeadColumnId) {
    const def = LEAD_COLUMN_DEFS.find((c) => c.id === id)
    if (def?.required) return
    const next = visible.includes(id) ? visible.filter((v) => v !== id) : [...visible, id]
    // Keep registry order for stable table layout.
    const ordered = LEAD_COLUMN_DEFS.map((c) => c.id).filter((c) => next.includes(c))
    onChange(ordered)
    persistVisibleLeadColumns(ordered)
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
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-stone-200 bg-white p-2 shadow-soft"
        >
          <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
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
          </ul>
        </div>
      )}
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
