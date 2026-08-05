'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CompassBusinessFunction } from '@/lib/types'
import { FunctionManager } from '@/components/FunctionManager'
import { LoadingBlock } from '@/components/LoadingBlock'

export function FunctionsPanel() {
  const [functions, setFunctions] = useState<CompassBusinessFunction[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/functions', { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`Failed to load functions (${res.status})`)
      const body = (await res.json()) as { functions: CompassBusinessFunction[] }
      setFunctions(body.functions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  }

  if (!functions) return <LoadingBlock label="Loading functions…" />

  return <FunctionManager functions={functions} onRefresh={load} />
}
