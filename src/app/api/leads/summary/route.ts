import { portalJson, portalJsonCached } from '@/lib/portal-http'
import { getPortalAdminClient } from '@/lib/portal-admin'
import { loadLeadSummaryCounts } from '@/lib/lead-search'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const admin = getPortalAdminClient()
    const summary = await loadLeadSummaryCounts(admin)
    return portalJsonCached({ summary }, {}, 10)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'summary_failed'
    return portalJson({ error: 'summary_failed', detail: message }, { status: 500 })
  }
}
