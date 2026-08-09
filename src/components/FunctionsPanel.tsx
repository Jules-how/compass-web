'use client'

import type { CompassBusinessFunctionWithStats } from '@/lib/types'
import { FunctionManager } from '@/components/FunctionManager'
import { LoadingBlock } from '@/components/LoadingBlock'
import { useCachedJson } from '@/lib/use-cached-json'

export function FunctionsPanel() {
  const { data, error, loading, reload } = useCachedJson<{
    functions: CompassBusinessFunctionWithStats[]
  }>('/api/functions', '/api/functions')

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => void reload(true)}>
          Retry
        </button>
      </div>
    )
  }

  if (loading || !data) return <LoadingBlock label="Loading functions…" />

  return (
    <FunctionManager
      functions={data.functions ?? []}
      onRefresh={async () => {
        await reload(true)
      }}
    />
  )
}
