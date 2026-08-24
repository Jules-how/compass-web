'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_CADENCE,
  cadenceWeekLoad,
  readCadencePrefs,
  writeCadencePrefs,
  type CadencePrefs
} from '@/lib/outbound-cadence'

function fieldValue(n: number | null): string {
  return n == null ? '' : String(n)
}

function parseField(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

export function useCadencePrefs(): [CadencePrefs, (next: CadencePrefs) => void] {
  const [prefs, setPrefs] = useState<CadencePrefs>(EMPTY_CADENCE)

  useEffect(() => {
    setPrefs(readCadencePrefs())
  }, [])

  const save = useCallback((next: CadencePrefs) => {
    setPrefs(writeCadencePrefs(next))
  }, [])

  return [prefs, save]
}

export function CadenceControl({
  slots,
  prefs,
  onChange
}: {
  slots: number
  prefs: CadencePrefs
  onChange: (next: CadencePrefs) => void
}) {
  const load = cadenceWeekLoad(slots, prefs)
  const [targetDraft, setTargetDraft] = useState(fieldValue(prefs.target))
  const [capDraft, setCapDraft] = useState(fieldValue(prefs.cap))

  useEffect(() => {
    setTargetDraft(fieldValue(prefs.target))
    setCapDraft(fieldValue(prefs.cap))
  }, [prefs.target, prefs.cap])

  function commit() {
    onChange({ target: parseField(targetDraft), cap: parseField(capDraft) })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <p
        className={`pb-2 text-[12px] font-medium ${
          load.overCapacity ? 'text-rose-700' : load.underTarget ? 'text-amber-700' : 'text-neutral-500'
        }`}
      >
        {load.label}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Target</span>
        <input
          inputMode="numeric"
          value={targetDraft}
          placeholder="none"
          onChange={(e) => setTargetDraft(e.target.value)}
          onBlur={commit}
          className="compass-input h-8 w-16 px-2 py-1 text-[12px]"
          aria-label="This week launch target"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Cap</span>
        <input
          inputMode="numeric"
          value={capDraft}
          placeholder="none"
          onChange={(e) => setCapDraft(e.target.value)}
          onBlur={commit}
          className="compass-input h-8 w-16 px-2 py-1 text-[12px]"
          aria-label="This week launch cap"
        />
      </label>
    </div>
  )
}
