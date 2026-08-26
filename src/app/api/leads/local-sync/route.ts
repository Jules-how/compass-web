import { portalJson, requireSameOrigin } from '@/lib/portal-http'
import { syncLocalCsvFiles, getLeadSummaryCounts } from '@/lib/local-db'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const originError = requireSameOrigin(request)
  if (originError) return originError

  try {
    const result = syncLocalCsvFiles()
    const summary = getLeadSummaryCounts()
    return portalJson({
      ok: true,
      imported: result.imported,
      updated: result.updated,
      total: result.total,
      summary
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync_failed'
    return portalJson({ error: 'sync_failed', detail: message }, { status: 500 })
  }
}
