'use client'

import type { CompassClientCard } from '@/lib/types'
import { ClientDirectory } from '@/components/clients/ClientDirectory'
import { LoadingBlock } from '@/components/LoadingBlock'
import { useCachedJson } from '@/lib/use-cached-json'

export function ClientsPanel({ initialClientId = null }: { initialClientId?: string | null }) {
  const { data, error, loading, reload } = useCachedJson<{ clients: CompassClientCard[] }>(
    '/api/clients',
    '/api/clients'
  )

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

  if (loading || !data) return <LoadingBlock label="Loading clients…" />

  return (
    <ClientDirectory
      clients={data.clients ?? []}
      initialClientId={initialClientId}
      onRefresh={async () => {
        await reload(true)
      }}
    />
  )
}
